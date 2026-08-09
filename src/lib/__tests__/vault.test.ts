import { beforeAll, describe, expect, it } from "vitest";

let seal: (s: string) => string;
let open: (s: string) => string;
let keyHint: (s: string) => string;

beforeAll(async () => {
  process.env["PORTFOLIO_VAULT_SECRET"] = "test-vault-secret-for-unit-tests";
  const mod = await import("../vault.server");
  seal = mod.seal;
  open = mod.open;
  keyHint = mod.keyHint;
});

describe("credential vault", () => {
  it("round-trips a secret", () => {
    const secret = "sk_live_abcdef1234567890";
    expect(open(seal(secret))).toBe(secret);
  });

  it("never stores the plaintext", () => {
    const secret = "super-secret-api-key";
    expect(seal(secret)).not.toContain(secret);
  });

  it("produces a different ciphertext every time (random IV)", () => {
    expect(seal("same-input")).not.toBe(seal("same-input"));
  });

  it("rejects tampered ciphertext", () => {
    const sealed = seal("do-not-touch");
    const buf = Buffer.from(sealed, "base64");
    buf[buf.length - 1] = buf[buf.length - 1]! ^ 0xff;
    expect(() => open(buf.toString("base64"))).toThrow();
  });

  it("handles unicode and long values", () => {
    const value = "🔐-" + "x".repeat(4096);
    expect(open(seal(value))).toBe(value);
  });

  it("shows only the last four characters as a hint", () => {
    expect(keyHint("  abcdefgh9012  ")).toBe("9012");
  });
});
