import "server-only";

/**
 * Gmail REST adapter (Phase 3 · M3).
 *
 * Thin wrapper over the Gmail API behind the integration layer. All calls are
 * server-side and take a decrypted access token (never stored/logged here).
 * Errors are classified so the sync engine can retry (auth/rate/transient) or
 * fall back (history expired). Message parsing is pure and exported for tests.
 */

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class GmailAuthError extends Error {}
export class GmailHistoryExpiredError extends Error {}
export class GmailRateLimitError extends Error {}
export class GmailApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function gmailFetch<T>(
  accessToken: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${GMAIL_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.ok) return (await res.json()) as T;

  if (res.status === 401) throw new GmailAuthError("Gmail access token rejected (401).");
  if (res.status === 429 || res.status === 403) throw new GmailRateLimitError(`Gmail rate/quota (${res.status}).`);
  throw new GmailApiError(`Gmail API error (${res.status}).`, res.status);
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export interface GmailProfile {
  emailAddress: string;
  historyId: string;
}

export async function getProfile(accessToken: string): Promise<GmailProfile> {
  return gmailFetch<GmailProfile>(accessToken, "/profile");
}

/** Bounded initial backfill: the most recent message ids. */
export async function listRecentMessageIds(
  accessToken: string,
  maxResults: number,
): Promise<string[]> {
  const data = await gmailFetch<{ messages?: { id: string }[] }>(accessToken, "/messages", {
    maxResults,
  });
  return (data.messages ?? []).map((m) => m.id);
}

export interface HistoryResult {
  messageIds: string[];
  historyId: string | null;
}

/**
 * Incremental changes since `startHistoryId`. Returns newly-added message ids
 * and the latest historyId. Throws GmailHistoryExpiredError on 404 (the cursor
 * is too old) so the caller can fall back to a bounded backfill.
 */
export async function listHistory(
  accessToken: string,
  startHistoryId: string,
  maxPages = 5,
): Promise<HistoryResult> {
  const ids = new Set<string>();
  let historyId: string | null = null;
  let pageToken: string | undefined;
  let pages = 0;

  try {
    do {
      const data = await gmailFetch<{
        history?: { messagesAdded?: { message: { id: string } }[] }[];
        historyId?: string;
        nextPageToken?: string;
      }>(accessToken, "/history", {
        startHistoryId,
        historyTypes: "messageAdded",
        pageToken,
      });

      for (const h of data.history ?? []) {
        for (const added of h.messagesAdded ?? []) ids.add(added.message.id);
      }
      if (data.historyId) historyId = data.historyId;
      pageToken = data.nextPageToken;
      pages += 1;
    } while (pageToken && pages < maxPages);
  } catch (err) {
    if (err instanceof GmailApiError && err.status === 404) {
      throw new GmailHistoryExpiredError("Gmail historyId is too old (404).");
    }
    throw err;
  }

  return { messageIds: [...ids], historyId };
}

/** Fetch a full message (headers + body + parts). */
export async function getMessage(accessToken: string, id: string): Promise<GmailRawMessage> {
  return gmailFetch<GmailRawMessage>(accessToken, `/messages/${id}`, { format: "full" });
}

// ---------------------------------------------------------------------------
// Sending (M9)
// ---------------------------------------------------------------------------

export interface OutgoingMessage {
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  /** Gmail thread to reply within, so the reply lands in the right conversation. */
  threadId?: string | null;
  /** RFC 5322 Message-ID of the message being answered. */
  inReplyTo?: string | null;
}

export interface SentMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
}

/**
 * Strip anything that could inject an extra header.
 *
 * A subject or address carrying CR/LF would end the current header and begin
 * one the caller never wrote — the email equivalent of SQL injection, and the
 * classic way a "reply" becomes a Bcc to somewhere else. Header values are
 * single-line by definition, so folding is discarded rather than escaped.
 */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Encode a header value that may contain non-ASCII.
 *
 * RFC 2047 base64 ("encoded-word") rather than raw UTF-8, because a bare
 * high-byte subject is not legal in a header and is mangled by some receivers.
 * Pure ASCII is passed through so the common case stays readable on the wire.
 */
function encodeHeaderValue(value: string): string {
  const clean = sanitizeHeaderValue(value);
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/** Keep only well-formed addresses; a malformed one would break the header. */
function sanitizeAddressList(addresses: string[]): string[] {
  return addresses
    .map((address) => sanitizeHeaderValue(address).toLowerCase())
    .filter((address) => EMAIL_RE.test(address));
}

/**
 * Build an RFC 5322 message.
 *
 * Pure and exported for tests: this is the exact byte sequence that reaches a
 * real inbox, so it is worth asserting on directly rather than through a mock.
 */
export function buildRawMessage(message: OutgoingMessage): string {
  const to = sanitizeAddressList(message.to);
  const cc = sanitizeAddressList(message.cc ?? []);
  if (to.length === 0) throw new GmailApiError("Refusing to send with no valid recipient.", 400);

  const headers = [
    `To: ${to.join(", ")}`,
    ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
    `Subject: ${encodeHeaderValue(message.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];

  // Threading headers. `References` carries the same id, which is what most
  // clients actually use to group a conversation.
  if (message.inReplyTo) {
    const parent = sanitizeHeaderValue(message.inReplyTo);
    headers.push(`In-Reply-To: ${parent}`, `References: ${parent}`);
  }

  // The body is base64'd rather than inlined so a line of arbitrary length, a
  // lone "." or a stray CRLF in the model's prose cannot alter the structure.
  const body = Buffer.from(message.bodyText, "utf8").toString("base64");

  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

/**
 * Send a message.
 *
 * The one irreversible call in the integration layer. It performs no gating of
 * its own — the caller must already hold an approval claim (see
 * `lib/approvals.ts`), because a send cannot be undone by anything downstream.
 */
export async function sendMessage(
  accessToken: string,
  message: OutgoingMessage,
): Promise<SentMessage> {
  const raw = Buffer.from(buildRawMessage(message), "utf8").toString("base64url");

  const res = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw,
      ...(message.threadId ? { threadId: message.threadId } : {}),
    }),
  });

  if (res.ok) return (await res.json()) as SentMessage;

  // A missing send scope arrives as 403, which the read path treats as a quota
  // problem. Here it almost always means the operator has not reconnected since
  // M9, so it is surfaced as an auth error the UI can act on.
  if (res.status === 401) throw new GmailAuthError("Gmail access token rejected (401).");
  if (res.status === 403) {
    throw new GmailAuthError("Gmail refused the send (403) — reconnect to grant send access.");
  }
  if (res.status === 429) throw new GmailRateLimitError("Gmail rate/quota (429).");
  throw new GmailApiError(`Gmail send failed (${res.status}).`, res.status);
}

// ---------------------------------------------------------------------------
// Pure parsing (exported for tests)
// ---------------------------------------------------------------------------

export interface GmailHeader {
  name: string;
  value: string;
}
export interface GmailPayloadPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPayloadPart[];
}
export interface GmailRawMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayloadPart;
}

export interface ParsedAttachment {
  externalAttachmentId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  isInline: boolean;
}

export interface ParsedMessage {
  externalMessageId: string;
  threadId: string;
  subject: string | null;
  snippet: string | null;
  fromName: string | null;
  fromAddress: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  inReplyTo: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  direction: "inbound" | "outbound";
  isRead: boolean;
  sentAt: string | null;
  receivedAt: string | null;
  labelIds: string[];
  attachments: ParsedAttachment[];
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string | null {
  if (!headers) return null;
  const lower = name.toLowerCase();
  const found = headers.find((h) => h.name.toLowerCase() === lower);
  return found ? found.value : null;
}

function decodeBase64Url(data?: string): string {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

/** Parse a single RFC 5322 address ("Ada <ada@x.com>" or "ada@x.com"). */
export function parseAddress(value: string | null): { name: string | null; address: string | null } {
  if (!value) return { name: null, address: null };
  const v = value.trim();

  // "Display Name <addr@host>" form.
  const angle = v.match(/^(.*)<([^<>]+)>[^<>]*$/);
  if (angle) {
    const name = angle[1].trim().replace(/^"(.*)"$/, "$1").trim() || null;
    const address = angle[2].trim().toLowerCase();
    return { name, address: EMAIL_RE.test(address) ? address : null };
  }

  // Bare address.
  const address = v.toLowerCase();
  return { name: null, address: EMAIL_RE.test(address) ? address : null };
}

/** Parse a comma-separated address list into lowercased addresses. */
export function parseAddressList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => parseAddress(part).address)
    .filter((a): a is string => Boolean(a));
}

/** Lowercased domain of an email address, or null. */
export function extractEmailDomain(address: string | null): string | null {
  if (!address) return null;
  const at = address.lastIndexOf("@");
  if (at < 0) return null;
  const domain = address.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

function collectParts(
  part: GmailPayloadPart | undefined,
  acc: { text: string | null; html: string | null; attachments: ParsedAttachment[] },
): void {
  if (!part) return;

  const filename = part.filename?.trim();
  if (filename && part.body?.attachmentId) {
    acc.attachments.push({
      externalAttachmentId: part.body.attachmentId,
      fileName: filename,
      mimeType: part.mimeType ?? null,
      sizeBytes: typeof part.body.size === "number" ? part.body.size : null,
      isInline: (headerValue(part.headers, "Content-Disposition") ?? "").toLowerCase().startsWith("inline"),
    });
  } else if (part.mimeType === "text/plain" && acc.text === null && part.body?.data) {
    acc.text = decodeBase64Url(part.body.data);
  } else if (part.mimeType === "text/html" && acc.html === null && part.body?.data) {
    acc.html = decodeBase64Url(part.body.data);
  }

  for (const child of part.parts ?? []) collectParts(child, acc);
}

/** Normalize a raw Gmail message into the CRM `messages` shape. */
export function parseGmailMessage(raw: GmailRawMessage): ParsedMessage {
  const headers = raw.payload?.headers;
  const from = parseAddress(headerValue(headers, "From"));
  const labelIds = raw.labelIds ?? [];
  const direction: "inbound" | "outbound" = labelIds.includes("SENT") ? "outbound" : "inbound";

  const acc = { text: null as string | null, html: null as string | null, attachments: [] as ParsedAttachment[] };
  collectParts(raw.payload, acc);

  const internalMs = raw.internalDate ? Number(raw.internalDate) : NaN;
  const timestamp = Number.isFinite(internalMs) ? new Date(internalMs).toISOString() : null;

  return {
    externalMessageId: raw.id,
    threadId: raw.threadId,
    subject: headerValue(headers, "Subject"),
    snippet: raw.snippet ?? null,
    fromName: from.name,
    fromAddress: from.address,
    toAddresses: parseAddressList(headerValue(headers, "To")),
    ccAddresses: parseAddressList(headerValue(headers, "Cc")),
    inReplyTo: headerValue(headers, "In-Reply-To"),
    bodyText: acc.text,
    bodyHtml: acc.html,
    direction,
    isRead: !labelIds.includes("UNREAD"),
    sentAt: direction === "outbound" ? timestamp : null,
    receivedAt: direction === "inbound" ? timestamp : null,
    labelIds,
    attachments: acc.attachments,
  };
}
