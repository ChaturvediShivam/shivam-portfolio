import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, isEncryptionConfigured } from "@/lib/integrations/crypto";

describe("integrations/crypto (AES-256-GCM)", () => {
  beforeAll(() => {
    // Deterministic 32-byte test key (base64).
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("round-trips a secret and never leaks plaintext", () => {
    const plain = "ya29.a0AfB_byС-oauth-refresh-token";
    const enc = encryptSecret(plain);

    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("uses a random IV (distinct ciphertexts for identical input)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("detects tampering via the GCM auth tag", () => {
    const parts = encryptSecret("secret").split(":");
    const ciphertext = Buffer.from(parts[3], "base64");
    ciphertext[0] ^= 0xff; // flip a byte
    parts[3] = ciphertext.toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decryptSecret("not-a-valid-payload")).toThrow();
  });

  it("reports encryption as configured when a valid key is present", () => {
    expect(isEncryptionConfigured()).toBe(true);
  });
});
