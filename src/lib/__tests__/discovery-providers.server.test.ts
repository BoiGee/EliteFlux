import { describe, expect, it } from "vitest";
import { decodeMintAuthorities } from "../discovery-providers.server";

// SPL Token Mint account: 82-byte fixed C-style layout —
// u32 mintAuthorityOption (4) + pubkey (32) + u64 supply (8) + decimals (1)
// + isInitialized (1) + u32 freezeAuthorityOption (4) + pubkey (32) = 82.
// A wrong byte offset here would silently misreport a real token's mint/
// freeze authority as revoked when it isn't (or vice versa) — this is the
// one piece of discovery-providers.server.ts that's pure enough to test
// without mocking a network response, and the one most worth getting right.
function buildMintAccountBytes(mintAuthorityOption: number, freezeAuthorityOption: number): Uint8Array {
  const bytes = new Uint8Array(82);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, mintAuthorityOption, true);
  // bytes 4..44 (pubkey + supply) left as zero — irrelevant to the decode
  bytes[44] = 9; // decimals, irrelevant
  bytes[45] = 1; // isInitialized, irrelevant
  view.setUint32(46, freezeAuthorityOption, true);
  return bytes;
}

describe("decodeMintAuthorities", () => {
  it("reports both authorities revoked when both option tags are 0 (None)", () => {
    const result = decodeMintAuthorities(buildMintAccountBytes(0, 0));
    expect(result.mintAuthorityRevoked).toBe(true);
    expect(result.freezeAuthorityRevoked).toBe(true);
  });

  it("reports both authorities still active when both option tags are 1 (Some)", () => {
    const result = decodeMintAuthorities(buildMintAccountBytes(1, 1));
    expect(result.mintAuthorityRevoked).toBe(false);
    expect(result.freezeAuthorityRevoked).toBe(false);
  });

  it("reads mint and freeze authority independently, not as one combined flag", () => {
    const result = decodeMintAuthorities(buildMintAccountBytes(0, 1));
    expect(result.mintAuthorityRevoked).toBe(true);
    expect(result.freezeAuthorityRevoked).toBe(false);

    const flipped = decodeMintAuthorities(buildMintAccountBytes(1, 0));
    expect(flipped.mintAuthorityRevoked).toBe(false);
    expect(flipped.freezeAuthorityRevoked).toBe(true);
  });

  it("returns null for both when the account data is shorter than a real mint layout, rather than misreading garbage", () => {
    const result = decodeMintAuthorities(new Uint8Array(10));
    expect(result.mintAuthorityRevoked).toBeNull();
    expect(result.freezeAuthorityRevoked).toBeNull();
  });
});
