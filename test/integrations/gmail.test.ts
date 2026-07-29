import { describe, it, expect } from "vitest";
import {
  parseAddress,
  parseAddressList,
  extractEmailDomain,
  parseGmailMessage,
  type GmailRawMessage,
} from "@/lib/integrations/google/gmail";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("gmail parseAddress / parseAddressList / extractEmailDomain", () => {
  it("parses a display-name address", () => {
    expect(parseAddress("Ada Lovelace <Ada@Example.com>")).toEqual({ name: "Ada Lovelace", address: "ada@example.com" });
  });
  it("parses a bare address", () => {
    expect(parseAddress("bob@x.io")).toEqual({ name: null, address: "bob@x.io" });
  });
  it("returns nulls for junk", () => {
    expect(parseAddress("not-an-email")).toEqual({ name: null, address: null });
    expect(parseAddress(null)).toEqual({ name: null, address: null });
  });
  it("splits + lowercases an address list", () => {
    expect(parseAddressList("A@X.com, Bee <b@y.com>")).toEqual(["a@x.com", "b@y.com"]);
  });
  it("extracts the domain", () => {
    expect(extractEmailDomain("a@Sub.Example.COM")).toBe("sub.example.com");
    expect(extractEmailDomain("bogus")).toBeNull();
    expect(extractEmailDomain(null)).toBeNull();
  });
});

describe("gmail parseGmailMessage", () => {
  const raw: GmailRawMessage = {
    id: "m1",
    threadId: "t1",
    labelIds: ["INBOX", "UNREAD"],
    snippet: "hello there",
    internalDate: "1700000000000",
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "Ada <ada@work.com>" },
        { name: "To", value: "me@crm.com, other@x.com" },
        { name: "Cc", value: "cc@x.com" },
        { name: "Subject", value: "Interview" },
        { name: "In-Reply-To", value: "<prev@mail>" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: b64url("plain body") } },
        { mimeType: "text/html", body: { data: b64url("<p>html body</p>") } },
        {
          mimeType: "application/pdf",
          filename: "resume.pdf",
          body: { attachmentId: "att-1", size: 2048 },
          headers: [{ name: "Content-Disposition", value: "attachment; filename=resume.pdf" }],
        },
      ],
    },
  };

  it("normalizes headers, body, direction, read-state, and attachments", () => {
    const p = parseGmailMessage(raw);
    expect(p.externalMessageId).toBe("m1");
    expect(p.threadId).toBe("t1");
    expect(p.subject).toBe("Interview");
    expect(p.fromName).toBe("Ada");
    expect(p.fromAddress).toBe("ada@work.com");
    expect(p.toAddresses).toEqual(["me@crm.com", "other@x.com"]);
    expect(p.ccAddresses).toEqual(["cc@x.com"]);
    expect(p.inReplyTo).toBe("<prev@mail>");
    expect(p.bodyText).toBe("plain body");
    expect(p.bodyHtml).toBe("<p>html body</p>");
    expect(p.direction).toBe("inbound");
    expect(p.isRead).toBe(false); // UNREAD label present
    expect(p.receivedAt).toBe(new Date(1700000000000).toISOString());
    expect(p.sentAt).toBeNull();
    expect(p.attachments).toEqual([
      { externalAttachmentId: "att-1", fileName: "resume.pdf", mimeType: "application/pdf", sizeBytes: 2048, isInline: false },
    ]);
  });

  it("marks SENT messages outbound and read", () => {
    const sent = parseGmailMessage({ ...raw, labelIds: ["SENT"] });
    expect(sent.direction).toBe("outbound");
    expect(sent.isRead).toBe(true);
    expect(sent.sentAt).toBe(new Date(1700000000000).toISOString());
    expect(sent.receivedAt).toBeNull();
  });
});
