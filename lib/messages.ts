import "server-only";
import sanitizeHtml from "sanitize-html";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MESSAGE_SORT_FIELDS,
  type Message,
  type MessageAttachment,
  type MessageLinkInput,
  type MessageListFilters,
  type MessageListResult,
  type ThreadMessage,
} from "@/types/message";

/**
 * Messages data layer (server-only, read-first). HTML sanitization happens here
 * (server-side) so client components only ever receive a safe string. Reuses
 * the active company/contact/opportunity searches for the link picker.
 */
export { searchActiveCompanies, searchActiveContacts, searchActiveOpportunities } from "@/lib/tasks";

const DEFAULT_PAGE_SIZE = 25;
const SELECT =
  "*, opportunity:opportunities(id, title), contact:contacts(id, full_name), company:companies(id, name), integration_account:integration_accounts(id, provider, email_address)";

/**
 * Sanitize message HTML to a safe subset. No script/style/iframe/event handlers;
 * links are forced to open safely; only http(s)/mailto schemes allowed.
 */
export function sanitizeMessageHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "a", "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "sub", "sup",
      "ul", "ol", "li", "blockquote", "pre", "code",
      "h1", "h2", "h3", "h4", "h5", "h6", "hr",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th",
      "img",
    ],
    allowedAttributes: {
      a: ["href", "name", "title"],
      img: ["src", "alt", "title", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    disallowedTagsMode: "discard",
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
    },
  });
}

export async function listMessages(supabase: SupabaseClient, filters: MessageListFilters = {}): Promise<MessageListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("messages").select(SELECT, { count: "exact" });
  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.direction) query = query.eq("direction", filters.direction);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.unreadOnly) query = query.eq("is_read", false);
  if (filters.unlinkedOnly) query = query.is("opportunity_id", null).is("contact_id", null).is("company_id", null);
  const searchTerm = filters.search?.trim();
  if (searchTerm) query = query.textSearch("search_vector", searchTerm, { type: "websearch", config: "english" });

  const sort = MESSAGE_SORT_FIELDS.includes(filters.sort as never) ? filters.sort! : "received_at";
  const ascending = filters.dir === "asc";
  query = query.order(sort, { ascending, nullsFirst: false }).order("id", { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Message[], total: count ?? 0, page, pageSize };
}

export async function getMessage(supabase: SupabaseClient, id: string): Promise<Message | null> {
  const { data, error } = await supabase.from("messages").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as Message) ?? null;
}

export async function getMessageAttachments(supabase: SupabaseClient, id: string): Promise<MessageAttachment[]> {
  const { data, error } = await supabase
    .from("message_attachments")
    .select("id, file_name, file_url, mime_type, file_size_bytes, is_inline")
    .eq("message_id", id)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MessageAttachment[];
}

export async function getThreadMessages(
  supabase: SupabaseClient,
  threadId: string,
  excludeId: string,
): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, subject, from_name, from_address, direction, is_read, received_at, sent_at")
    .eq("thread_id", threadId)
    .neq("id", excludeId)
    .order("received_at", { ascending: true, nullsFirst: true })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ThreadMessage[];
}

export async function setMessageRead(supabase: SupabaseClient, id: string, read: boolean): Promise<void> {
  const { error } = await supabase.from("messages").update({ is_read: read }).eq("id", id);
  if (error) throw error;
}

export async function setMessageArchived(supabase: SupabaseClient, id: string, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function linkMessage(supabase: SupabaseClient, id: string, links: MessageLinkInput): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({
      opportunity_id: links.opportunity_id || null,
      contact_id: links.contact_id || null,
      company_id: links.company_id || null,
    })
    .eq("id", id);
  if (error) throw error;
}
