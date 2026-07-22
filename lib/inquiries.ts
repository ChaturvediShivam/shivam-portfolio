import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActivityEventType,
  DateRangeFilter,
  Inquiry,
  InquiryActivity,
  InquiryListFilters,
  InquiryMetrics,
  InquiryNote,
  InquiryStatus,
  LeadSource,
} from "@/types/inquiry";

/**
 * Every query and mutation the admin dashboard (and the contact form) needs
 * lives here, in one place, accepting whichever Supabase client the caller
 * already has (service-role for the public contact route, session-bound for
 * everything under /admin) — so the filtering/logging logic is never
 * duplicated between routes.
 */

function resolveDateRange(filters: InquiryListFilters): { from?: string; to?: string } {
  const range: DateRangeFilter = filters.range ?? null;
  if (!range) return {};

  const now = new Date();

  if (range === "custom") {
    return { from: filters.from, to: filters.to };
  }

  const start = new Date(now);
  if (range === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (range === "7d") {
    start.setDate(start.getDate() - 7);
  } else if (range === "30d") {
    start.setDate(start.getDate() - 30);
  }

  return { from: start.toISOString(), to: now.toISOString() };
}

export async function getInquiries(
  supabase: SupabaseClient,
  filters: InquiryListFilters = {}
): Promise<Inquiry[]> {
  const { from, to } = resolveDateRange(filters);

  const { data, error } = await supabase.rpc("search_inquiries", {
    search_term: filters.search ?? null,
    from_date: from ?? null,
    to_date: to ?? null,
  });

  if (error) throw error;
  return (data ?? []) as Inquiry[];
}

export async function getInquiryById(
  supabase: SupabaseClient,
  id: string
): Promise<Inquiry | null> {
  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as Inquiry | null;
}

export async function getNotes(
  supabase: SupabaseClient,
  inquiryId: string
): Promise<InquiryNote[]> {
  const { data, error } = await supabase
    .from("inquiry_notes")
    .select("*")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as InquiryNote[];
}

export async function getActivity(
  supabase: SupabaseClient,
  inquiryId: string
): Promise<InquiryActivity[]> {
  const { data, error } = await supabase
    .from("inquiry_activity")
    .select("*")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as InquiryActivity[];
}

export async function getMetrics(supabase: SupabaseClient): Promise<InquiryMetrics> {
  const { data, error } = await supabase.from("inquiries").select("status");
  if (error) throw error;

  const rows = (data ?? []) as { status: InquiryStatus }[];
  const count = (status: InquiryStatus) => rows.filter((r) => r.status === status).length;

  return {
    total: rows.length,
    new: count("New"),
    inProgress: count("In Progress"),
    followUp: count("Follow Up"),
    converted: count("Converted"),
    closed: count("Closed"),
  };
}

export async function logActivity(
  supabase: SupabaseClient,
  inquiryId: string,
  eventType: ActivityEventType,
  detail?: string
): Promise<void> {
  const { error } = await supabase
    .from("inquiry_activity")
    .insert({ inquiry_id: inquiryId, event_type: eventType, detail: detail ?? null });

  if (error) throw error;
}

export async function addNote(
  supabase: SupabaseClient,
  inquiryId: string,
  body: string
): Promise<InquiryNote> {
  const { data, error } = await supabase
    .from("inquiry_notes")
    .insert({ inquiry_id: inquiryId, body })
    .select()
    .single();

  if (error) throw error;

  const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
  await logActivity(supabase, inquiryId, "note_added", preview);

  return data as InquiryNote;
}

export async function updateStatus(
  supabase: SupabaseClient,
  inquiryId: string,
  newStatus: InquiryStatus
): Promise<Inquiry> {
  const current = await getInquiryById(supabase, inquiryId);
  if (!current) throw new Error("Inquiry not found.");

  const { data, error } = await supabase
    .from("inquiries")
    .update({ status: newStatus })
    .eq("id", inquiryId)
    .select()
    .single();

  if (error) throw error;

  if (current.status !== newStatus) {
    await logActivity(supabase, inquiryId, "status_changed", `${current.status} → ${newStatus}`);
  }

  return data as Inquiry;
}

export async function updateLeadSource(
  supabase: SupabaseClient,
  inquiryId: string,
  newSource: LeadSource
): Promise<Inquiry> {
  const current = await getInquiryById(supabase, inquiryId);
  if (!current) throw new Error("Inquiry not found.");

  const { data, error } = await supabase
    .from("inquiries")
    .update({ lead_source: newSource })
    .eq("id", inquiryId)
    .select()
    .single();

  if (error) throw error;

  if (current.lead_source !== newSource) {
    await logActivity(
      supabase,
      inquiryId,
      "lead_source_changed",
      `${current.lead_source} → ${newSource}`
    );
  }

  return data as Inquiry;
}

export async function deleteInquiry(supabase: SupabaseClient, inquiryId: string): Promise<void> {
  const { error } = await supabase.from("inquiries").delete().eq("id", inquiryId);
  if (error) throw error;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(inquiries: Inquiry[]): string {
  const headers = [
    "id",
    "name",
    "email",
    "organization",
    "message",
    "status",
    "lead_source",
    "created_at",
  ];

  const rows = inquiries.map((inquiry) =>
    [
      inquiry.id,
      inquiry.name,
      inquiry.email,
      inquiry.organization ?? "",
      inquiry.message,
      inquiry.status,
      inquiry.lead_source,
      inquiry.created_at,
    ]
      .map((field) => csvEscape(String(field)))
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}
