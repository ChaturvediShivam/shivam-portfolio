import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/server";
import { updateStatus } from "@/lib/inquiries";
import { INQUIRY_STATUSES, type InquiryStatus } from "@/types/inquiry";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = body.status as InquiryStatus | undefined;

  if (!status || !INQUIRY_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  try {
    const inquiry = await updateStatus(supabase, id, status);
    return NextResponse.json({ inquiry });
  } catch (err) {
    console.error("Update status error:", err);
    return NextResponse.json({ error: "Failed to update status." }, { status: 500 });
  }
}
