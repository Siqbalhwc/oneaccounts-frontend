import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value },
      },
    }
  )

  const { id } = await params
  const structureId = Number(id)
  const { name } = await request.json()

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  // Get original structure with components
  const { data: structure, error: structErr } = await supabase
    .from("salary_structures")
    .select("*")
    .eq("id", structureId)
    .single()

  if (structErr || !structure) {
    return NextResponse.json({ error: "Structure not found" }, { status: 404 })
  }

  const { data: components, error: compErr } = await supabase
    .from("salary_structure_components")
    .select("*")
    .eq("salary_structure_id", structureId)

  if (compErr) {
    return NextResponse.json({ error: "Failed to fetch components" }, { status: 500 })
  }

  // Insert new structure
  const { data: newStructure, error: insertErr } = await supabase
    .from("salary_structures")
    .insert({
      company_id: structure.company_id,
      name,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (insertErr || !newStructure) {
    return NextResponse.json({ error: insertErr?.message || "Failed to duplicate structure" }, { status: 500 })
  }

  // Insert components
  if (components && components.length > 0) {
    const newComponents = components.map(c => ({
      salary_structure_id: newStructure.id,
      salary_component_id: c.salary_component_id,
      calculation_type: c.calculation_type,
      value: c.value,
    }))

    const { error: compInsertErr } = await supabase
      .from("salary_structure_components")
      .insert(newComponents)

    if (compInsertErr) {
      return NextResponse.json({ error: "Structure duplicated but component copy failed: " + compInsertErr.message }, { status: 500 })
    }
  }

  return NextResponse.json(newStructure)
}