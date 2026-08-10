import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

let seal: (s: string) => Promise<string>;
let open: (s: string) => Promise<string>;
let keyHint: (s: string) => string;

const VAULT_SECRET = "test-vault-secret-for-unit-tests";

/** Builds a ciphertext the *old* (pre-KDF-upgrade) seal() would have produced. */
function legacySeal(plaintext: string): string {
  const key = createHash("sha256").update(VAULT_SECRET, "utf8").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

beforeAll(async () => {
  process.env["PORTFOLIO_VAULT_SECRET"] = VAULT_SECRET;
  const mod = await import("../vault.server");
  seal = mod.seal;
  open = mod.open;
  keyHint = mod.keyHint;
});

describe("credential vault", () => {
  it("round-trips a secret", async () => {
    const secret = "sk_live_abcdef1234567890";
    expect(await open(await seal(secret))).toBe(secret);
  });

  it("never stores the plaintext", async () => {
    const secret = "super-secret-api-key";
    expect(await seal(secret)).not.toContain(secret);
  });

  it("produces a different ciphertext every time (random salt + IV)", async () => {
    expect(await seal("same-input")).not.toBe(await seal("same-input"));
  });

  it("rejects tampered ciphertext", async () => {
    const sealed = await seal("do-not-touch");
    const buf = Buffer.from(sealed, "base64");
    buf[buf.length - 1] = buf[buf.length - 1]! ^ 0xff;
    await expect(open(buf.toString("base64"))).rejects.toThrow();
  });

  it("handles unicode and long values", async () => {
    const value = "🔐-" + "x".repeat(4096);
    expect(await open(await seal(value))).toBe(value);
  });

  it("shows only the last four characters as a hint", () => {
    expect(keyHint("  abcdefgh9012  ")).toBe("9012");
  });

  it("still decrypts credentials sealed before the KDF upgrade", async () => {
    // Real stored ciphertexts predate the PBKDF2 upgrade and have no MAGIC
    // prefix — open() must keep decrypting them via the legacy path forever,
    // since there's no bulk re-encryption migration for already-sealed
    // credentials (see vault.server.ts's module comment for why).
    const secret = "sk_live_legacy_credential_9999";
    expect(await open(legacySeal(secret))).toBe(secret);
  });

  it("new ciphertexts are tagged and don't collide with the legacy format", async () => {
    const sealed = await seal("anything");
    const buf = Buffer.from(sealed, "base64");
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x45, 0x46, 0x56, 0x02]));
  });
});
