CREATE OR REPLACE FUNCTION public.create_vendor_payment(p_company_id uuid, p_party_id integer, p_payment_date date, p_amount numeric, p_payment_method text, p_bank_account_id integer, p_allocations jsonb, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_user_email text DEFAULT 'system'::text, p_opening_allocation numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_pay_no text;
  v_payment_id integer;
  v_bank_gl_id integer;
  v_ap_account_id integer;
  v_alloc jsonb;
  v_invoice_id integer;
  v_alloc_amount numeric;
  v_gross_allocated numeric := 0;
  v_total_wht_deducted numeric := 0;
  v_bill record;
  v_wht record;
  v_wht_tax_account_id integer;
  v_wht_amount numeric;
  v_proportion numeric;
  v_bank_credit numeric;
  v_je_id integer;
  v_je_lines jsonb[];
  v_result jsonb;
  v_next_num integer;

  -- Temporary storage for batch operations
  v_invoice_updates jsonb[] := '{}';
  v_alloc_inserts jsonb[] := '{}';
BEGIN
  -- 1. Generate payment number
  SELECT COALESCE(MAX(SUBSTRING(payment_no FROM '/(\d+)$')::int), 0) + 1
  INTO v_next_num
  FROM payments
  WHERE company_id = p_company_id
    AND payment_no LIKE 'PAY/' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '/%';

  v_pay_no := 'PAY/' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '/' || LPAD(v_next_num::text, 4, '0');

  -- 2. Get bank GL account
  SELECT account_id INTO v_bank_gl_id
  FROM bank_accounts
  WHERE id = p_bank_account_id AND company_id = p_company_id;
  IF v_bank_gl_id IS NULL THEN
    SELECT id INTO v_bank_gl_id FROM accounts WHERE code = '1000' AND company_id = p_company_id;
  END IF;

  -- 3. Get AP account (2000)
  SELECT id INTO v_ap_account_id FROM accounts WHERE code = '2000' AND company_id = p_company_id;
  IF v_ap_account_id IS NULL THEN
    RAISE EXCEPTION 'Accounts Payable (2000) not found for company %', p_company_id;
  END IF;

  -- 4. Insert payment header
  INSERT INTO payments (
    company_id, payment_no, payment_type, party_type, party_id,
    payment_date, amount, payment_method, bank_account_id,
    reference, notes, created_by, updated_by, gross_amount
  ) VALUES (
    p_company_id, v_pay_no, 'supplier_payment', 'supplier', p_party_id,
    p_payment_date, p_amount, p_payment_method, p_bank_account_id,
    p_reference, p_notes, p_user_email, p_user_email, 0
  ) RETURNING id INTO v_payment_id;

  -- 5. Process allocations if any (bill payments)
  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      v_invoice_id := (v_alloc->>'invoice_id')::integer;
      v_alloc_amount := (v_alloc->>'allocated_amount')::numeric;

      -- Validate bill
      SELECT id, paid, total INTO v_bill
      FROM invoices
      WHERE id = v_invoice_id AND company_id = p_company_id AND type = 'purchase';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill ID % not found or not a purchase bill', v_invoice_id;
      END IF;

      v_gross_allocated := v_gross_allocated + v_alloc_amount;

      v_invoice_updates := array_append(v_invoice_updates, jsonb_build_object(
        'invoice_id', v_invoice_id,
        'amount', v_alloc_amount
      ));

      v_alloc_inserts := array_append(v_alloc_inserts, jsonb_build_object(
        'invoice_id', v_invoice_id,
        'amount', v_alloc_amount
      ));

      -- WHT handling
      SELECT bw.wht_amount, bw.wht_tax_code_id
      INTO v_wht
      FROM bill_withholding bw
      WHERE bw.bill_id = v_invoice_id AND bw.company_id = p_company_id;

      IF v_wht.wht_amount > 0 AND v_wht.wht_tax_code_id IS NOT NULL THEN
        SELECT tax_account_id INTO v_wht_tax_account_id
        FROM tax_codes
        WHERE id = v_wht.wht_tax_code_id AND company_id = p_company_id;

        IF v_wht_tax_account_id IS NOT NULL THEN
          v_proportion := v_alloc_amount / v_bill.total;
          v_wht_amount := ROUND(v_wht.wht_amount * v_proportion);
          v_total_wht_deducted := v_total_wht_deducted + v_wht_amount;

          v_je_lines := array_append(v_je_lines, jsonb_build_object(
            'account_id', v_wht_tax_account_id,
            'debit', 0,
            'credit', v_wht_amount
          ));
        END IF;
      END IF;
    END LOOP;

    -- Batch update invoices
    WITH updates AS (
      SELECT (j->>'invoice_id')::integer AS invoice_id,
             (j->>'amount')::numeric AS amount
      FROM unnest(v_invoice_updates) j
    )
    UPDATE invoices i
    SET paid = i.paid + u.amount,
        status = CASE
                   WHEN i.paid + u.amount >= i.total THEN 'Paid'
                   WHEN i.paid + u.amount > 0 THEN 'Partial'
                   ELSE 'Unpaid'
                 END
    FROM updates u
    WHERE i.id = u.invoice_id AND i.company_id = p_company_id;

    -- Batch insert allocations
    INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount, company_id)
    SELECT v_payment_id, (j->>'invoice_id')::integer, (j->>'amount')::numeric, p_company_id
    FROM unnest(v_alloc_inserts) j;
  END IF;

  -- 5b. Opening balance allocation
  IF p_opening_allocation > 0 THEN
    INSERT INTO supplier_opening_allocations (payment_id, supplier_id, company_id, amount)
    VALUES (v_payment_id, p_party_id, p_company_id, p_opening_allocation);
    v_gross_allocated := v_gross_allocated + p_opening_allocation;
  END IF;

  -- 6. Update supplier balance: subtract the FULL payment amount (advance + bill payments)
  UPDATE suppliers
  SET balance = COALESCE(balance, 0) - p_amount
  WHERE id = p_party_id AND company_id = p_company_id;

  -- 7. Build journal entry
  -- Debit: AP (full amount, regardless of allocations)
  v_je_lines := array_prepend(jsonb_build_object(
    'account_id', v_ap_account_id,
    'debit', p_amount,
    'credit', 0
  ), v_je_lines);

  -- Credit: Bank (net of WHT)
  v_bank_credit := p_amount - v_total_wht_deducted;
  v_je_lines := array_append(v_je_lines, jsonb_build_object(
    'account_id', v_bank_gl_id,
    'debit', 0,
    'credit', v_bank_credit
  ));

  -- 8. Update payment gross_amount (allocated amount for record)
  UPDATE payments SET gross_amount = v_gross_allocated WHERE id = v_payment_id AND company_id = p_company_id;

  -- 9. Insert journal entry and lines
  INSERT INTO journal_entries (company_id, entry_no, date, description)
  VALUES (p_company_id, 'JE-PAY-' || v_pay_no, p_payment_date, 'Payment - ' || v_pay_no)
  RETURNING id INTO v_je_id;

  INSERT INTO journal_lines (entry_id, company_id, account_id, debit, credit, source_type, source_id)
  SELECT v_je_id, p_company_id,
         (l->>'account_id')::integer,
         (l->>'debit')::numeric,
         (l->>'credit')::numeric,
         'payment', v_payment_id
  FROM unnest(v_je_lines) l;

  -- 10. Update account balances
  WITH balance_updates AS (
    SELECT account_id, SUM(debit - credit) AS delta
    FROM journal_lines
    WHERE entry_id = v_je_id
    GROUP BY account_id
  )
  UPDATE accounts SET balance = COALESCE(balance, 0) + delta
  FROM balance_updates
  WHERE accounts.id = balance_updates.account_id AND accounts.company_id = p_company_id;

  v_result := jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'payment_no', v_pay_no,
    'gross_amount', v_gross_allocated,
    'wht_deducted', v_total_wht_deducted,
    'net_bank_credit', v_bank_credit
  );

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Payment failed: %', SQLERRM;
END;
$function$;