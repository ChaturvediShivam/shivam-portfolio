import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/server";
import { addNote } from "@/lib/inquiries";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const rawBody = await request.json().catch(() => ({}));
  const body = typeof rawBody.body === "string" ? rawBody.body.trim().slice(0, 2000) : "";

  if (!body) {
    return NextResponse.json({ error: "Note text is required." }, { status: 400 });
  }

  try {
    const note = await addNote(supabase, id, body);
    return NextResponse.json({ note });
  } catch (err) {
    console.error("Add note error:", err);
    return NextResponse.json({ error: "Failed to add note." }, { status: 500 });
  }
}
