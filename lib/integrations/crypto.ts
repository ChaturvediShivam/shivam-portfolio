import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-layer secret encryption (Phase 3 · M1).
 *
 * Freeze-review decision H3: encrypt OAuth tokens (M2+) with AES-256-GCM using
 * a key held only in the server environment (`TOKEN_ENCRYPTION_KEY`). This is a
 * dependency-free, portable default (Node's built-in `crypto`) that does not
 * depend on Supabase Vault/pgsodium availability, and is swappable later behind
 * this module — the ONLY place in the codebase that encrypts or decrypts.
 *
 * `server-only` makes importing this into a client bundle a build-time error,
 * so the key and plaintext can never reach the browser.
 *
 * Wire format (versioned so the scheme can evolve / rotate):
 *   "v1:<ivBase64>:<authTagBase64>:<ciphertextBase64>"
 * A random 12-byte IV is generated per call, so encrypting the same value twice
 * yields different ciphertexts.
 */

const SCHEME = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length
const KEY_BYTES = 32; // AES-256

/**
 * Load and validate the 32-byte key from `TOKEN_ENCRYPTION_KEY`. Accepts the
 * key encoded as base64, hex, or raw UTF-8 — whichever decodes to exactly 32
 * bytes. Returns null when unset so callers can degrade gracefully.
 */
function loadKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;

  const candidates: Buffer[] = [];
  try {
    candidates.push(Buffer.from(raw, "base64"));
  } catch {
    /* ignore */
  }
  if (/^[0-9a-fA-F]+$/.test(raw)) candidates.push(Buffer.from(raw, "hex"));
  candidates.push(Buffer.from(raw, "utf8"));

  const key = candidates.find((b) => b.length === KEY_BYTES);
  if (!key) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must decode to 32 bytes (base64, hex, or raw). " +
        "Generate one with: openssl rand -base64 32",
    );
  }
  return key;
}

/** True when a valid encryption key is configured. */
export function isEncryptionConfigured(): boolean {
  try {
    return loadKey() !== null;
  } catch {
    // A key is present but malformed — treat as configured-but-broken so the
    // caller surfaces the error rather than silently skipping encryption.
    return true;
  }
}

function requireKey(): Buffer {
  const key = loadKey();
  if (!key) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set — refusing to handle secrets without encryption.",
    );
  }
  return key;
}

/** Encrypt a UTF-8 string. Returns the versioned wire format. */
export function encryptSecret(plaintext: string): string {
  const key = requireKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    SCHEME,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Decrypt a value produced by {@link encryptSecret}. Throws if tampered. */
export function decryptSecret(payload: string): string {
  const key = requireKey();
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== SCHEME) {
    throw new Error("Malformed encrypted payload.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
