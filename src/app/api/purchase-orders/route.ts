import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const dataStr = formData.get("data") as string | null
    if (!dataStr) {
      return NextResponse.json({ success: false, error: "Missing PO data" }, { status: 400 })
    }

    const { company_id, supplier_id, date, expected_delivery, notes, items } = JSON.parse(dataStr)

    if (!company_id || !supplier_id || !date || !items || items.length === 0) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Generate PO number
    const { data: lastPO } = await supabase
      .from("purchase_orders")
      .select("po_no")
      .eq("company_id", company_id)
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
        company_id,
        supplier_id,
        po_no: poNo,
        date,
        expected_delivery: expected_delivery || null,
        notes,
        status: "Draft",
        created_by: "system",
      })
      .select()
      .single()

    if (poError || !newPO) {
      return NextResponse.json({ success: false, error: poError?.message || "Failed to create PO" }, { status: 500 })
    }

    // Insert items
    const poItems = items.map((item: any) => ({
      po_id: newPO.id,
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
      const filePath = `purchase-orders/${company_id}/${newPO.id}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: false,
        })

      if (!uploadError) {
        await supabase.from("attachments").insert({
          company_id,
          owner_type: "purchase_order",
          owner_id: newPO.id,
          file_name: file.name,
          file_path: filePath,
          uploaded_by: "system",
        })
      }
    }

    return NextResponse.json({ success: true, id: newPO.id, po_no: poNo })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
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

    const { company_id, supplier_id, date, expected_delivery, notes, items } = JSON.parse(dataStr)

    if (!company_id) {
      return NextResponse.json({ success: false, error: "Missing company_id" }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Update header
    const { error: poError } = await supabase
      .from("purchase_orders")
      .update({
        supplier_id,
        date,
        expected_delivery: expected_delivery || null,
        notes,
        updated_by: "system",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", company_id)

    if (poError) {
      return NextResponse.json({ success: false, error: poError.message }, { status: 500 })
    }

    // Delete old items and re-insert
    await supabase.from("purchase_order_items").delete().eq("po_id", id)

    if (items && items.length > 0) {
      const poItems = items.map((item: any) => ({
        po_id: Number(id),
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
      const filePath = `purchase-orders/${company_id}/${id}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: false,
        })

      if (!uploadError) {
        await supabase.from("attachments").insert({
          company_id,
          owner_type: "purchase_order",
          owner_id: Number(id),
          file_name: file.name,
          file_path: filePath,
          uploaded_by: "system",
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Internal server error" }, { status: 500 })
  }
}