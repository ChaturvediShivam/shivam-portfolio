import { describe, it, expect } from "vitest";
import { buildRawMessage } from "@/lib/integrations/google/gmail";

/**
 * Outgoing MIME construction (Phase 3 · M9).
 *
 * `buildRawMessage` produces the exact bytes that reach a real inbox, so it is
 * asserted directly rather than through a mock. The header-injection cases are
 * the reason this file exists: the subject and recipients originate from model
 * output, and a value carrying CRLF would end the current header and start one
 * the caller never wrote.
 */

function headersOf(raw: string): string[] {
  return raw.split("\r\n\r\n")[0].split("\r\n");
}

function bodyOf(raw: string): string {
  return Buffer.from(raw.split("\r\n\r\n").slice(1).join("\r\n\r\n"), "base64").toString("utf8");
}

describe("buildRawMessage", () => {
  it("writes the standard headers and a base64 body", () => {
    const raw = buildRawMessage({
      to: ["Recruiter@Example.com"],
      subject: "Re: Staff Engineer",
      bodyText: "Thanks — Thursday works.",
    });

    const headers = headersOf(raw);
    expect(headers).toContain("To: recruiter@example.com");
    expect(headers).toContain("Subject: Re: Staff Engineer");
    expect(headers).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(bodyOf(raw)).toBe("Thanks — Thursday works.");
  });

  it("adds threading headers when replying", () => {
    const raw = buildRawMessage({
      to: ["a@b.com"],
      subject: "Re: hello",
      bodyText: "hi",
      inReplyTo: "<abc@mail.example.com>",
    });

    const headers = headersOf(raw);
    expect(headers).toContain("In-Reply-To: <abc@mail.example.com>");
    expect(headers).toContain("References: <abc@mail.example.com>");
  });

  it("omits threading headers when there is nothing to reply to", () => {
    const raw = buildRawMessage({ to: ["a@b.com"], subject: "New", bodyText: "hi" });

    expect(raw).not.toContain("In-Reply-To:");
    expect(raw).not.toContain("References:");
  });

  it("strips CRLF from the subject so it cannot forge a header", () => {
    const raw = buildRawMessage({
      to: ["a@b.com"],
      subject: "Hello\r\nBcc: attacker@evil.com",
      bodyText: "hi",
    });

    const headers = headersOf(raw);
    expect(headers.some((h) => h.toLowerCase().startsWith("bcc:"))).toBe(false);
    expect(headers).toContain("Subject: Hello Bcc: attacker@evil.com");
  });

  it("strips CRLF from an address so it cannot forge a header", () => {
    const raw = buildRawMessage({
      to: ["a@b.com", "victim@x.com\r\nBcc: attacker@evil.com"],
      subject: "s",
      bodyText: "hi",
    });

    const headers = headersOf(raw);
    expect(headers.some((h) => h.toLowerCase().startsWith("bcc:"))).toBe(false);
    // The mangled address fails validation and is dropped rather than sent to.
    expect(headers[0]).toBe("To: a@b.com");
  });

  it("drops malformed recipients instead of writing them", () => {
    const raw = buildRawMessage({
      to: ["good@example.com", "not-an-address", ""],
      cc: ["cc@example.com", "also bad"],
      subject: "s",
      bodyText: "hi",
    });

    const headers = headersOf(raw);
    expect(headers).toContain("To: good@example.com");
    expect(headers).toContain("Cc: cc@example.com");
  });

  it("refuses to build a message with no valid recipient", () => {
    expect(() => buildRawMessage({ to: ["nope"], subject: "s", bodyText: "hi" })).toThrow(
      /no valid recipient/i,
    );
  });

  it("RFC 2047 encodes a non-ASCII subject", () => {
    const raw = buildRawMessage({ to: ["a@b.com"], subject: "Grüße — Café", bodyText: "hi" });

    const subject = headersOf(raw).find((h) => h.startsWith("Subject:")) as string;
    expect(subject).toMatch(/^Subject: =\?UTF-8\?B\?/);
    const encoded = subject.slice("Subject: =?UTF-8?B?".length, -2);
    expect(Buffer.from(encoded, "base64").toString("utf8")).toBe("Grüße — Café");
  });

  it("keeps a body with CRLF and lone dots intact through base64", () => {
    // Inlined, any of these could alter the message structure; base64 makes the
    // body opaque to the parser.
    const body = "Line one\r\n.\r\nContent-Type: text/html\r\n\r\n<b>not a header</b>";
    const raw = buildRawMessage({ to: ["a@b.com"], subject: "s", bodyText: body });

    expect(headersOf(raw).some((h) => h.startsWith("Content-Type: text/html"))).toBe(false);
    expect(bodyOf(raw)).toBe(body);
  });
});
