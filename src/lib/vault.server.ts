// Server-only: AES-256-GCM envelope for exchange credentials.
// Plaintext keys never leave this module and are never returned to the browser.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function vaultKey(): Buffer {
  const raw = process.env["PORTFOLIO_VAULT_SECRET"];
  if (!raw) throw new Error("PORTFOLIO_VAULT_SECRET is not configured");
  // The stored secret is a random ASCII string; derive a fixed 32-byte key.
  return createHash("sha256").update(raw, "utf8").digest();
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function open(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Last 4 characters of the API key — safe to show and to de-duplicate on. */
export function keyHint(apiKey: string): string {
  return apiKey.trim().slice(-4);
}
