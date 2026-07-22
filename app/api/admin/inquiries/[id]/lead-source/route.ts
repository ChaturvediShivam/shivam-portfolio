import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/server";
import { updateLeadSource } from "@/lib/inquiries";
import { LEAD_SOURCES, type LeadSource } from "@/types/inquiry";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const leadSource = body.leadSource as LeadSource | undefined;

  if (!leadSource || !LEAD_SOURCES.includes(leadSource)) {
    return NextResponse.json({ error: "Invalid lead source." }, { status: 400 });
  }

  try {
    const inquiry = await updateLeadSource(supabase, id, leadSource);
    return NextResponse.json({ inquiry });
  } catch (err) {
    console.error("Update lead source error:", err);
    return NextResponse.json({ error: "Failed to update lead source." }, { status: 500 });
  }
}
