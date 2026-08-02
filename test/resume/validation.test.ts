import { describe, it, expect } from "vitest";
import {
  extensionOf,
  formatFileSize,
  validateDocument,
  validateSelection,
} from "@/lib/resume/validation";
import { MAX_FILE_BYTES } from "@/types/upload";

/**
 * Document validation (Resume AI · Step 1).
 *
 * Mostly rejection cases, because the failure that matters is not "a good file
 * was refused" — the operator sees that immediately — but "a file we cannot
 * read was accepted", which surfaces later as a confusing parse failure.
 *
 * `File` is constructed directly; it exists in Node 18+ and needs no DOM.
 */

function file(name: string, type = "", size = 1024): File {
  const blob = new File([new Uint8Array(Math.max(0, size))], name, { type });
  // `File` derives size from content, which is what we want, but the oversize
  // case would need a 10 MB allocation — so it is overridden instead.
  Object.defineProperty(blob, "size", { value: size });
  return blob;
}

describe("extensionOf", () => {
  it("lowercases and includes the dot", () => {
    expect(extensionOf("Resume.PDF")).toBe(".pdf");
    expect(extensionOf("a.b.docx")).toBe(".docx");
  });

  it("returns empty for a dotfile or no extension", () => {
    expect(extensionOf("resume")).toBe("");
    expect(extensionOf(".gitignore")).toBe("");
  });
});

describe("formatFileSize", () => {
  it("scales units and keeps a decimal only where it means something", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe("2.5 MB");
    expect(formatFileSize(MAX_FILE_BYTES)).toBe("10 MB");
  });
});

describe("validateDocument — accepted", () => {
  it("accepts a PDF with the right MIME", () => {
    expect(validateDocument(file("resume.pdf", "application/pdf"))).toEqual({ ok: true, type: "pdf" });
  });

  it("accepts a DOCX with the right MIME", () => {
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect(validateDocument(file("resume.docx", docx))).toEqual({ ok: true, type: "docx" });
  });

  it("accepts a file whose MIME the browser did not report", () => {
    // Empty `File.type` is common and must not be treated as a rejection.
    expect(validateDocument(file("resume.docx", ""))).toEqual({ ok: true, type: "docx" });
  });

  it("is case-insensitive about the extension", () => {
    expect(validateDocument(file("RESUME.PDF", "application/pdf")).ok).toBe(true);
  });
});

describe("validateDocument — rejected formats", () => {
  const cases: [string, string, RegExp][] = [
    ["malware.exe", "application/x-msdownload", /executable/i],
    ["script.sh", "", /executable/i],
    ["headshot.png", "image/png", /image/i],
    ["scan.jpeg", "image/jpeg", /image/i],
    ["bundle.zip", "application/zip", /archive/i],
    ["data.csv", "text/csv", /csv/i],
    ["resume.txt", "text/plain", /text/i],
    ["resume.doc", "application/msword", /legacy \.doc/i],
    ["notes.md", "", /not accepted/i],
  ];

  for (const [name, mime, expected] of cases) {
    it(`rejects ${name}`, () => {
      const outcome = validateDocument(file(name, mime));
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.rejection.reason).toBe("unsupported_type");
      expect(outcome.rejection.message).toMatch(expected);
    });
  }

  it("rejects a file with no extension", () => {
    const outcome = validateDocument(file("resume", ""));
    expect(outcome.ok).toBe(false);
  });

  it("rejects a PDF extension carrying a contradictory MIME", () => {
    // `payload.exe` renamed to `resume.pdf` keeps its real MIME on most
    // platforms — an extension check alone would let it through.
    const outcome = validateDocument(file("resume.pdf", "application/zip"));
    expect(outcome.ok).toBe(false);
  });
});

describe("validateDocument — size", () => {
  it("rejects an empty file", () => {
    const outcome = validateDocument(file("resume.pdf", "application/pdf", 0));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.rejection.reason).toBe("empty_file");
  });

  it("accepts a file exactly at the limit", () => {
    expect(validateDocument(file("resume.pdf", "application/pdf", MAX_FILE_BYTES)).ok).toBe(true);
  });

  it("rejects one byte over the limit, and says both sizes", () => {
    const outcome = validateDocument(file("resume.pdf", "application/pdf", MAX_FILE_BYTES + 1));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.rejection.reason).toBe("too_large");
    expect(outcome.rejection.message).toMatch(/10 MB/);
  });
});

describe("validateSelection", () => {
  it("returns the file alongside a successful outcome", () => {
    const input = file("resume.pdf", "application/pdf");
    const outcome = validateSelection([input]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.file).toBe(input);
    expect(outcome.type).toBe("pdf");
  });

  it("refuses several files rather than silently taking the first", () => {
    const outcome = validateSelection([
      file("a.pdf", "application/pdf"),
      file("b.pdf", "application/pdf"),
    ]);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.rejection.reason).toBe("too_many_files");
  });

  it("handles an empty selection", () => {
    expect(validateSelection([]).ok).toBe(false);
  });

  it("names the offending file so the message is actionable", () => {
    const outcome = validateSelection([file("headshot.png", "image/png")]);
    if (outcome.ok) return;
    expect(outcome.rejection.fileName).toBe("headshot.png");
  });
});
