/**
 * Minimal ZIP reader (Resume AI · Phase 2).
 *
 * A DOCX is a ZIP archive, and the only entry that matters is
 * `word/document.xml`. Reading it needs a central-directory walk and an inflate
 * — both of which the platform now provides: `DecompressionStream("deflate-raw")`
 * exists in every browser this admin supports and in Node 18+.
 *
 * So no ZIP dependency. That is not minimalism for its own sake: `jszip` and
 * friends are ~100 KB of client bundle to read one file out of one archive, and
 * this module is ~100 lines that does exactly that and nothing else.
 *
 * ponytail: reads the central directory only, handles STORE (0) and DEFLATE (8),
 * and does not implement ZIP64, encryption, or multi-disk archives. A DOCX
 * produced by Word, Google Docs, LibreOffice or Pages uses none of those. If a
 * real file ever fails here, reach for a library rather than growing this.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Largest trailing window scanned for the end-of-central-directory record. */
const EOCD_SEARCH_BYTES = 66_000;

export class ZipFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipFormatError";
  }
}

interface CentralEntry {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/**
 * Locate the end-of-central-directory record.
 *
 * Scanned backwards because it sits at the very end, after a variable-length
 * comment. The window is bounded so a corrupt file cannot turn this into a scan
 * of the whole buffer.
 */
function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - EOCD_SEARCH_BYTES);

  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }

  throw new ZipFormatError("Not a ZIP archive — no end-of-central-directory record.");
}

/** Walk the central directory, returning one record per archive entry. */
function readCentralDirectory(view: DataView, bytes: Uint8Array): CentralEntry[] {
  const eocd = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  const entries: CentralEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new ZipFormatError("Corrupt ZIP central directory.");
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const fileName = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    entries.push({ fileName, compressionMethod, compressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Byte range of an entry's payload.
 *
 * The local header repeats the name and extra fields with *different* lengths
 * than the central directory's, so the offset has to be recomputed from the
 * local header rather than reused. Getting this wrong yields data that inflates
 * to garbage rather than failing loudly, which is why it is stated here.
 */
function payloadRange(view: DataView, entry: CentralEntry): { start: number; end: number } {
  const header = entry.localHeaderOffset;
  if (view.getUint32(header, true) !== LOCAL_SIGNATURE) {
    throw new ZipFormatError("Corrupt ZIP local header.");
  }

  const nameLength = view.getUint16(header + 26, true);
  const extraLength = view.getUint16(header + 28, true);
  const start = header + 30 + nameLength + extraLength;

  return { start, end: start + entry.compressedSize };
}

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Read one entry out of a ZIP archive as UTF-8 text.
 *
 * Returns null when the archive does not contain that entry, so a caller can
 * distinguish "not a DOCX" from "unreadable".
 */
export async function readZipEntryText(
  buffer: ArrayBuffer,
  entryName: string,
): Promise<string | null> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const entry = readCentralDirectory(view, bytes).find((candidate) => candidate.fileName === entryName);
  if (!entry) return null;

  const { start, end } = payloadRange(view, entry);
  const payload = bytes.subarray(start, end);

  if (entry.compressionMethod === 0) {
    return new TextDecoder().decode(payload);
  }

  if (entry.compressionMethod === 8) {
    return new TextDecoder().decode(await inflateRaw(payload));
  }

  throw new ZipFormatError(`Unsupported ZIP compression method ${entry.compressionMethod}.`);
}
