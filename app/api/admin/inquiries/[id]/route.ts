import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/server";
import { deleteInquiry } from "@/lib/inquiries";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;

  try {
    await deleteInquiry(supabase, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete inquiry error:", err);
    return NextResponse.json({ error: "Failed to delete inquiry." }, { status: 500 });
  }
}
