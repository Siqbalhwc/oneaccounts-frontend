import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// ─── Get merchant credentials from DB ─────────────────────
async function getCredentials(companyId: string) {
  const { data } = await supabaseAdmin
    .from('payment_settings')
    .select('merchant_id, password, integrity_salt, sandbox_mode')
    .eq('company_id', companyId)
    .maybeSingle()

  if (!data || !data.merchant_id || !data.password || !data.integrity_salt) {
    throw new Error('Payment gateway not configured. Please set up JazzCash credentials in Settings.')
  }

  return data
}

// ─── JazzCash HMAC-SHA256 signature ───────────────────────
export function generateSignature(params: Record<string, string>, salt: string): string {
  // JazzCash expects sorted parameters concatenated, then HMAC-SHA256 with integrity salt
  const sortedKeys = Object.keys(params).sort()
  let concatenated = ''
  sortedKeys.forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      concatenated += params[key] + '&'
    }
  })
  concatenated = concatenated.slice(0, -1) // remove trailing &

  const hmac = crypto.createHmac('sha256', salt)
  hmac.update(concatenated)
  return hmac.digest('hex').toUpperCase()
}

// ─── Get the appropriate JazzCash endpoint ────────────────
function getEndpoint(sandbox: boolean): string {
  return sandbox
    ? 'https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction'
    : 'https://payments.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction'
}

// ─── Create a payment request & get redirect URL ──────────
export async function createPaymentRequest(params: {
  companyId: string
  amount: number
  paymentType: 'plan_upgrade' | 'add_user'
  metadata?: Record<string, any>
}) {
  const { companyId, amount, paymentType, metadata } = params
  const creds = await getCredentials(companyId)

  const txnRef = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  const returnUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/payments/jazzcash/callback`
  const cancelUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/upgrade`

  // Build JazzCash request parameters
  const pp_Amount = (amount * 100).toString() // JazzCash expects amount in paisa (multiply by 100)
  const today = new Date()
  const pp_TxnDateTime = today.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14) // YYYYMMDDHHMMSS

  const requestParams: Record<string, string> = {
    pp_Version: '2.0',
    pp_TxnType: 'MPAY',
    pp_Language: 'EN',
    pp_MerchantID: creds.merchant_id,
    pp_Password: creds.password,
    pp_TxnRefNo: txnRef,
    pp_Amount: pp_Amount,
    pp_TxnCurrency: 'PKR',
    pp_TxnDateTime: pp_TxnDateTime,
    pp_BillReference: `INV-${Date.now()}`,
    pp_Description: paymentType === 'plan_upgrade' ? 'Plan Upgrade' : 'Additional User',
    pp_ReturnURL: returnUrl,
    pp_CancelURL: cancelUrl,
    pp_SecureHash: '', // Will be set below
    ppmpf_1: companyId,
    ppmpf_2: paymentType,
    ppmpf_3: JSON.stringify(metadata || {}),
    ppmpf_4: '',
    ppmpf_5: '',
  }

  // Generate signature
  requestParams.pp_SecureHash = generateSignature(requestParams, creds.integrity_salt)

  // Save pending payment record
  const { data: payment } = await supabaseAdmin
    .from('payment_history')
    .insert({
      company_id: companyId,
      payment_type: paymentType,
      amount,
      jazzcash_txn_ref: txnRef,
      status: 'pending',
      metadata,
    })
    .select('id')
    .single()

  return {
    redirectUrl: getEndpoint(creds.sandbox_mode),
    params: requestParams,
    paymentId: payment?.id,
    txnRef,
  }
}

// ─── Verify JazzCash callback ─────────────────────────────
export async function verifyCallback(body: Record<string, string>) {
  // Extract the secure hash from the callback
  const receivedHash = body.pp_SecureHash

  // Rebuild params for verification
  const verifyParams: Record<string, string> = { ...body }
  delete verifyParams.pp_SecureHash

  // Get credentials from the company ID stored in custom fields
  const companyId = body.ppmpf_1
  const creds = await getCredentials(companyId)

  const computedHash = generateSignature(verifyParams, creds.integrity_salt)

  const isValid = computedHash === receivedHash

  // Update payment history
  const txnRef = body.pp_TxnRefNo
  const responseCode = body.pp_ResponseCode
  const responseMsg = body.pp_ResponseMessage || ''
  const isSuccess = responseCode === '000'

  await supabaseAdmin
    .from('payment_history')
    .update({
      status: isSuccess ? 'completed' : 'failed',
      jazzcash_response_code: responseCode,
      jazzcash_response_msg: responseMsg,
      completed_at: isSuccess ? new Date().toISOString() : null,
    })
    .eq('jazzcash_txn_ref', txnRef)

  return {
    isValid,
    isSuccess,
    txnRef,
    companyId,
    paymentType: body.ppmpf_2 as string,
    metadata: JSON.parse(body.ppmpf_3 || '{}'),
    responseCode,
    responseMsg,
  }
}