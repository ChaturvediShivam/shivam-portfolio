import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

// Environment configuration
const TURNSTILE_SECRET = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "portfolio@shivamchaturvedi.com";
const CONTACT_RECIPIENT = process.env.CONTACT_RECIPIENT_EMAIL;

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

interface ContactPayload {
  name: string;
  email: string;
  organization?: string;
  message: string;
  token: string;
}

function sanitize(input: unknown, maxLength = 4000): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, maxLength);
}

async function verifyTurnstile(token: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) {
    console.warn("CLOUDFLARE_TURNSTILE_SECRET_KEY is not set; skipping Turnstile verification.");
    return true;
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: TURNSTILE_SECRET,
          response: token,
        }),
      }
    );

    const data = await response.json();
    return data.success === true;
  } catch (err) {
    console.error("Turnstile verification error:", err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<ContactPayload>;

    const name = sanitize(body.name, 200);
    const email = sanitize(body.email, 320).toLowerCase();
    const organization = sanitize(body.organization, 200);
    const message = sanitize(body.message, 4000);
    const token = sanitize(body.token, 1000);

    // Basic validation
    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email, and message are required." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    // Turnstile is optional when the secret key is not configured
    if (TURNSTILE_SECRET) {
      if (!token) {
        return NextResponse.json(
          { error: "Security verification is required." },
          { status: 400 }
        );
      }

      const isHuman = await verifyTurnstile(token);
      if (!isHuman) {
        return NextResponse.json(
          { error: "Security verification failed. Please try again." },
          { status: 403 }
        );
      }
    }

    // Build email content
    const subject = `New inquiry from ${name}`;
    const textBody = [
      `Name: ${name}`,
      `Email: ${email}`,
      organization ? `Organization: ${organization}` : "",
      "",
      "Message:",
      message,
    ].join("\n");

    const htmlBody = `
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      ${organization ? `<p><strong>Organization:</strong> ${escapeHtml(organization)}</p>` : ""}
      <hr />
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>
    `;

    if (resend && CONTACT_RECIPIENT) {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: CONTACT_RECIPIENT,
        replyTo: email,
        subject,
        text: textBody,
        html: htmlBody,
      });

      if (error) {
        console.error("Resend error:", error);
        return NextResponse.json(
          { error: "Failed to deliver the message. Please try again later." },
          { status: 500 }
        );
      }
    } else {
      // Development / not-yet-configured fallback: log securely server-side
      console.log("[CONTACT FORM SUBMISSION]", {
        name,
        email,
        organization,
        messageLength: message.length,
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("Contact API error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
