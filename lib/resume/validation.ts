/**
 * Document validation (Resume AI · Step 1).
 *
 * Pure, dependency-free, and NOT `server-only`: the dropzone validates on drop
 * so the operator is told immediately, and a later step will revalidate on the
 * server, where the real trust boundary is. Client-side validation here is a
 * courtesy, never a guarantee.
 *
 * Extension and MIME are both checked, and neither alone is trusted:
 *
 *   • `File.type` is derived from the extension on most platforms and is
 *     frequently the empty string — for a `.docx` on a machine with no Office
 *     install, for anything dragged from certain archive tools. Requiring a
 *     MIME match would reject legitimate files.
 *   • An extension alone is trivially wrong — `payload.exe` renamed to
 *     `resume.pdf` passes any extension check.
 *
 * So: the extension must be one we accept, and the MIME must either agree or be
 * absent. That rejects both the mislabelled-extension case and the
 * wrong-format-correct-extension case as far as the browser can see, and leaves
 * content sniffing to the server step that will actually read the bytes.
 */

import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  MAX_FILE_BYTES,
  type AcceptedDocumentType,
  type UploadRejection,
  type UploadedDocument,
} from "@/types/upload";

/** Formats explicitly named as rejected, so each can be refused in its own words. */
const NAMED_REJECTIONS: { test: (name: string, mime: string) => boolean; message: string }[] = [
  {
    test: (name, mime) =>
      /\.(exe|msi|bat|cmd|sh|app|dmg|jar|com|scr|ps1)$/i.test(name) ||
      mime.startsWith("application/x-msdownload") ||
      mime === "application/x-executable",
    message: "Executable files are not accepted. Upload a PDF or DOCX.",
  },
  {
    test: (name, mime) => /\.(png|jpe?g|gif|webp|heic|bmp|tiff?|svg)$/i.test(name) || mime.startsWith("image/"),
    message: "Images are not accepted — text cannot be read from them. Upload a PDF or DOCX.",
  },
  {
    test: (name, mime) =>
      /\.(zip|rar|7z|tar|gz)$/i.test(name) ||
      mime === "application/zip" ||
      mime === "application/x-zip-compressed",
    message: "Archives are not accepted. Upload the PDF or DOCX itself.",
  },
  {
    test: (name, mime) => /\.csv$/i.test(name) || mime === "text/csv",
    message: "CSV files are not accepted. Upload a PDF or DOCX.",
  },
  {
    test: (name, mime) => /\.te?xt$/i.test(name) || mime === "text/plain",
    message: "Plain text files are not accepted. Upload a PDF or DOCX.",
  },
  {
    test: (name) => /\.docx?$/i.test(name) && !/\.docx$/i.test(name),
    message: "Legacy .doc files are not accepted. Save as .docx or PDF and try again.",
  },
];

/** Lowercased extension including the dot, or "" when there is none. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot).toLowerCase() : "";
}

/** The accepted format an extension maps to, or null. */
function typeForExtension(extension: string): AcceptedDocumentType | null {
  for (const [type, accepted] of Object.entries(ACCEPTED_EXTENSIONS)) {
    if (accepted === extension) return type as AcceptedDocumentType;
  }
  return null;
}

/**
 * Human-readable size.
 *
 * Binary units with a decimal only below 10 MB, because "9.4 MB" is meaningful
 * next to a 10 MB limit and "9.43 MB" is noise.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

export type ValidationOutcome =
  | { ok: true; type: AcceptedDocumentType }
  | { ok: false; rejection: UploadRejection };

/**
 * A selection's outcome, carrying the file on success.
 *
 * A discriminated union rather than `ValidationOutcome & { file?: File }`: an
 * intersection does not narrow on `ok`, and it would leave callers checking for
 * a file that is always present on the success branch.
 */
export type SelectionOutcome =
  | { ok: true; type: AcceptedDocumentType; file: File }
  | { ok: false; rejection: UploadRejection };

/** Validate one file against the accepted formats and the size ceiling. */
export function validateDocument(file: File): ValidationOutcome {
  const name = file.name ?? "";
  const mime = (file.type ?? "").toLowerCase();
  const extension = extensionOf(name);

  // Named rejections first: a specific "images are not accepted" is far more
  // useful than a generic "unsupported type", and this is the only place that
  // distinction can be made.
  for (const rule of NAMED_REJECTIONS) {
    if (rule.test(name, mime)) {
      return { ok: false, rejection: { reason: "unsupported_type", message: rule.message, fileName: name } };
    }
  }

  const type = typeForExtension(extension);
  if (!type) {
    return {
      ok: false,
      rejection: {
        reason: "unsupported_type",
        message: extension
          ? `${extension} files are not accepted. Upload a PDF or DOCX.`
          : "That file has no extension. Upload a PDF or DOCX.",
        fileName: name,
      },
    };
  }

  // An empty MIME is normal and not disqualifying; a contradictory one is.
  if (mime && !ACCEPTED_MIME_TYPES[type].includes(mime)) {
    return {
      ok: false,
      rejection: {
        reason: "unsupported_type",
        message: `That file is named ${extension} but is not a valid ${type.toUpperCase()}.`,
        fileName: name,
      },
    };
  }

  if (file.size <= 0) {
    return {
      ok: false,
      rejection: { reason: "empty_file", message: "That file is empty.", fileName: name },
    };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      rejection: {
        reason: "too_large",
        message: `That file is ${formatFileSize(file.size)}. The limit is ${formatFileSize(MAX_FILE_BYTES)}.`,
        fileName: name,
      },
    };
  }

  return { ok: true, type };
}

/**
 * Validate a drop or file-input selection.
 *
 * More than one file is refused outright rather than silently taking the first:
 * the operator dropped two things and deserves to know only one was wanted.
 */
export function validateSelection(files: FileList | File[]): SelectionOutcome {
  const list = Array.from(files);

  if (list.length === 0) {
    return {
      ok: false,
      rejection: { reason: "unsupported_type", message: "No file was received. Try again." },
    };
  }

  if (list.length > 1) {
    return {
      ok: false,
      rejection: {
        reason: "too_many_files",
        message: `Drop one file at a time — ${list.length} were received.`,
      },
    };
  }

  const outcome = validateDocument(list[0]);
  if (outcome.ok === false) return outcome;
  return { ok: true, type: outcome.type, file: list[0] };
}

/** Promote a validated file to the shape the rest of the module consumes. */
export function toUploadedDocument(file: File, type: AcceptedDocumentType): UploadedDocument {
  return {
    // `crypto.randomUUID` is available in every browser this admin supports and
    // in Node 18+, so no polyfill and no id library.
    id: crypto.randomUUID(),
    file,
    name: file.name,
    sizeBytes: file.size,
    type,
    addedAt: Date.now(),
  };
}
