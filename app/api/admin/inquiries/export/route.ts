import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/supabase/server";
import { getInquiries, toCsv } from "@/lib/inquiries";
import type { DateRangeFilter } from "@/types/inquiry";

export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAdminSession();
  if (error) return error;

  const params = request.nextUrl.searchParams;

  try {
    const inquiries = await getInquiries(supabase, {
      search: params.get("q") ?? undefined,
      range: (params.get("range") as DateRangeFilter) ?? null,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    });

    const csv = toCsv(inquiries);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="inquiries-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    console.error("CSV export error:", err);
    return NextResponse.json({ error: "Failed to export inquiries." }, { status: 500 });
  }
}
