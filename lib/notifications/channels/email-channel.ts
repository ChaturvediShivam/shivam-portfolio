import "server-only";
import { Resend } from "resend";
import { escapeHtml, type DeliveryResult, type NotificationChannel } from "./channel";
import type { NotificationView } from "@/types/notification";

/**
 * EmailChannel (Phase 3 · M5). Delivers a notification to the OWNER'S OWN email
 * via Resend (reused from Phase 0). Recipient is never an arbitrary address.
 * Bodies are HTML-escaped. The Resend key is server-only.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "portfolio@shivamchaturvedi.com";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/** Pure email body renderer (exported for tests). */
export function renderNotificationHtml(notification: NotificationView): string {
  const title = escapeHtml(notification.title);
  const body = notification.body ? `<p>${escapeHtml(notification.body)}</p>` : "";
  return `<h2 style="margin:0 0 8px">${title}</h2>${body}<hr style="border:none;border-top:1px solid #eee;margin:16px 0" /><p style="color:#888;font-size:12px;margin:0">Career CRM notification</p>`;
}

export class EmailChannel implements NotificationChannel {
  readonly name = "email";

  async deliver(notification: NotificationView, recipient: { email: string | null }): Promise<DeliveryResult> {
    if (!recipient.email) return { delivered: false, reason: "no_recipient" };
    if (!resend) return { delivered: false, reason: "resend_unconfigured" };

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipient.email,
      subject: notification.title,
      text: notification.body ?? notification.title,
      html: renderNotificationHtml(notification),
    });
    if (error) {
      console.error("[notifications] email send failed:", error);
      return { delivered: false, reason: "send_failed" };
    }
    return { delivered: true };
  }
}
