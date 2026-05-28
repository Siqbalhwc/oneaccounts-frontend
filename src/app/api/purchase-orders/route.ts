import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from "next/server"
import { logDataChange } from "@/lib/audit"

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate and get company from session – ignore client‑sent company_id
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = (user?.app_metadata as any)?.company_id
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const formData = await request.formData()
    const dataStr = formData.get("data") as string | null
    if (!dataStr) {
      return NextResponse.json({ success: false, error: "Missing PO data" }, { status: 400 })
    }

    const { supplier_id, date, expected_delivery, notes, items } = JSON.parse(dataStr)

    if (!supplier_id || !date || !items || items.length === 0) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    // Generate PO number
    const { data: lastPO } = await supabase
      .from("purchase_orders")
      .select("po_no")
      .eq("company_id", companyId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    let nextNum = 1
    if (lastPO?.po_no) {
      const match = lastPO.po_no.match(/PO-(\d+)/)
      if (match) nextNum = parseInt(match[1], 10) + 1
    }
    const poNo = `PO-${String(nextNum).padStart(4, "0")}`

    // Insert PO header
    const { data: newPO, error: poError } = await supabase
      .from("purchase_orders")
      .insert({
        company_id: companyId,
        supplier_id,
        po_no: poNo,
        date,
        expected_delivery: expected_delivery || null,
        notes,
        status: "Draft",
        created_by: user.email || "system",
      })
      .select()
      .single()

    if (poError || !newPO) {
      return NextResponse.json({ success: false, error: poError?.message || "Failed to create PO" }, { status: 500 })
    }

    // Insert items with company_id
    const poItems = items.map((item: any) => ({
      po_id: newPO.id,
      company_id: companyId,
      product_id: item.product_id || null,
      description: item.description,
      qty: item.qty,
      unit_price: item.unit_price,
      total: item.total || item.qty * item.unit_price,
    }))

    const { error: itemsError } = await supabase.from("purchase_order_items").insert(poItems)
    if (itemsError) {
      return NextResponse.json({ success: false, error: itemsError.message }, { status: 500 })
    }

    // Upload attachments
    const files = formData.getAll("files") as File[]
    for (const file of files) {
      if (!file || !file.name) continue
      const buffer = Buffer.from(await file.arrayBuffer())
      const filePath = `purchase-orders/${companyId}/${newPO.id}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: false,
        })

      if (!uploadError) {
        await supabase.from("attachments").insert({
          company_id: companyId,
          owner_type: "purchase_order",
          owner_id: newPO.id,
          file_name: file.name,
          file_path: filePath,
          uploaded_by: user.email || "system",
        })
      }
    }

    // Audit log
    await logDataChange(
      "purchase_orders",
      String(newPO.id),
      "INSERT",
      { po_no: poNo, supplier_id, date, status: "Draft" },
      user.email || "system"
    )

    return NextResponse.json({ success: true, id: newPO.id, po_no: poNo })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = (user?.app_metadata as any)?.company_id
    if (!companyId) return NextResponse.json({ error: 'No company linked' }, { status: 400 })

    const url = new URL(request.url)
    const id = url.searchParams.get("id")
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 })
    }

    const formData = await request.formData()
    const dataStr = formData.get("data") as string | null
    if (!dataStr) {
      return NextResponse.json({ success: false, error: "Missing PO data" }, { status: 400 })
    }

    const { supplier_id, date, expected_delivery, notes, items } = JSON.parse(dataStr)

    // Update header
    const { error: poError } = await supabase
      .from("purchase_orders")
      .update({
        supplier_id,
        date,
        expected_delivery: expected_delivery || null,
        notes,
        updated_by: user.email || "system",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", companyId)

    if (poError) {
      return NextResponse.json({ success: false, error: poError.message }, { status: 500 })
    }

    // Delete old items and re-insert with company_id
    await supabase.from("purchase_order_items").delete().eq("po_id", id)

    if (items && items.length > 0) {
      const poItems = items.map((item: any) => ({
        po_id: Number(id),
        company_id: companyId,
        product_id: item.product_id || null,
        description: item.description,
        qty: item.qty,
        unit_price: item.unit_price,
        total: item.total || item.qty * item.unit_price,
      }))
      const { error: itemsError } = await supabase.from("purchase_order_items").insert(poItems)
      if (itemsError) {
        return NextResponse.json({ success: false, error: itemsError.message }, { status: 500 })
      }
    }

    // Handle new attachments
    const files = formData.getAll("files") as File[]
    for (const file of files) {
      if (!file || !file.name) continue
      const buffer = Buffer.from(await file.arrayBuffer())
      const filePath = `purchase-orders/${companyId}/${id}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: false,
        })

      if (!uploadError) {
        await supabase.from("attachments").insert({
          company_id: companyId,
          owner_type: "purchase_order",
          owner_id: Number(id),
          file_name: file.name,
          file_path: filePath,
          uploaded_by: user.email || "system",
        })
      }
    }

    // Audit log
    await logDataChange(
      "purchase_orders",
      id,
      "UPDATE",
      { supplier_id, date, notes },
      user.email || "system"
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Internal server error" }, { status: 500 })
  }
}