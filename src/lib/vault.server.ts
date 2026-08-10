// Server-only: AES-256-GCM envelope for exchange credentials.
// Plaintext keys never leave this module and are never returned to the browser.
import { createDecipheriv, createHash, randomBytes } from "node:crypto";

// New ciphertexts (anything sealed from now on) are tagged with MAGIC and use
// a proper KDF (PBKDF2, 100k iterations, random salt per secret) via the Web
// Crypto API instead of a bare unsalted SHA-256 hash of the vault secret.
// Existing stored ciphertexts (no MAGIC prefix — a random 12-byte IV starting
// with these exact 4 bytes is a ~1-in-4-billion coincidence, and a collision
// would just fail the GCM auth tag rather than silently misdecrypt) keep
// decrypting through the legacy path below. There's no bulk migration of
// already-sealed credentials — each one naturally rotates onto the stronger
// format the next time a user reconnects that key, which avoids the risk of
// a migration bug bricking live exchange connections.
const MAGIC = Buffer.from([0x45, 0x46, 0x56, 0x02]); // "EFV" + format version
const PBKDF2_ITERATIONS = 100_000;
const SALT_LEN = 16;
const IV_LEN = 12;

function legacyVaultKey(): Buffer {
  const raw = process.env["PORTFOLIO_VAULT_SECRET"];
  if (!raw) throw new Error("PORTFOLIO_VAULT_SECRET is not configured");
  return createHash("sha256").update(raw, "utf8").digest();
}

// crypto.subtle's TS types want a plain ArrayBuffer-backed view, not the
// wider ArrayBufferLike that Buffer/randomBytes() carry in their type
// (in practice never a SharedArrayBuffer here, but the type doesn't know
// that, and even Uint8Array.from() keeps the generic) — copying through
// ArrayBuffer.prototype.slice, which always returns a concrete ArrayBuffer,
// sidesteps the mismatch.
function toBufferSource(b: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}

async function derivedVaultKey(salt: Uint8Array): Promise<CryptoKey> {
  const raw = process.env["PORTFOLIO_VAULT_SECRET"];
  if (!raw) throw new Error("PORTFOLIO_VAULT_SECRET is not configured");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(raw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toBufferSource(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(plaintext: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = await derivedVaultKey(salt);
  // Web Crypto's AES-GCM ciphertext already has the 16-byte auth tag appended.
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: toBufferSource(iv) }, key, new TextEncoder().encode(plaintext)),
  );
  return Buffer.concat([MAGIC, salt, iv, Buffer.from(ct)]).toString("base64");
}

export async function open(stored: string): Promise<string> {
  const buf = Buffer.from(stored, "base64");

  if (buf.length >= MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    const salt = buf.subarray(MAGIC.length, MAGIC.length + SALT_LEN);
    const iv = buf.subarray(MAGIC.length + SALT_LEN, MAGIC.length + SALT_LEN + IV_LEN);
    const ciphertextAndTag = buf.subarray(MAGIC.length + SALT_LEN + IV_LEN);
    const key = await derivedVaultKey(salt);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toBufferSource(iv) },
      key,
      toBufferSource(ciphertextAndTag),
    );
    return new TextDecoder().decode(pt);
  }

  // Legacy format: iv[12] || tag[16] || ciphertext, unsalted SHA-256 key.
  const decipher = createDecipheriv("aes-256-gcm", legacyVaultKey(), buf.subarray(0, IV_LEN));
  decipher.setAuthTag(buf.subarray(IV_LEN, IV_LEN + 16));
  return Buffer.concat([decipher.update(buf.subarray(IV_LEN + 16)), decipher.final()]).toString("utf8");
}

/** Last 4 characters of the API key — safe to show and to de-duplicate on. */
export function keyHint(apiKey: string): string {
  return apiKey.trim().slice(-4);
}
