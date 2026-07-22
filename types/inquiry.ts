export const INQUIRY_STATUSES = [
  "New",
  "In Progress",
  "Follow Up",
  "Converted",
  "Closed",
  "Spam",
] as const;

export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const LEAD_SOURCES = [
  "Website",
  "LinkedIn",
  "Referral",
  "Email",
  "Manual",
  "Other",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export const ACTIVITY_EVENT_TYPES = [
  "created",
  "status_changed",
  "lead_source_changed",
  "note_added",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export interface Inquiry {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  message: string;
  status: InquiryStatus;
  lead_source: LeadSource;
  created_at: string;
  updated_at: string;
}

export interface InquiryNote {
  id: string;
  inquiry_id: string;
  body: string;
  created_at: string;
}

export interface InquiryActivity {
  id: string;
  inquiry_id: string;
  event_type: ActivityEventType;
  detail: string | null;
  created_at: string;
}

export interface InquiryMetrics {
  total: number;
  new: number;
  inProgress: number;
  followUp: number;
  converted: number;
  closed: number;
}

export type DateRangeFilter = "today" | "7d" | "30d" | "custom" | null;

export interface InquiryListFilters {
  search?: string;
  from?: string; // ISO date, used when range === "custom"
  to?: string; // ISO date, used when range === "custom"
  range?: DateRangeFilter;
}
