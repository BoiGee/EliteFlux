import { describe, expect, it } from "vitest";
import {
  canAccess,
  canUseChannel,
  meetsTier,
  requiredTierFor,
  sanitizeChannels,
  TIER_RANK,
} from "../tier-matrix";

describe("tier access matrix", () => {
  it("keeps the free tier down to recommendations only", () => {
    expect(canAccess("free", "recommendations")).toBe(true);
    expect(canAccess("free", "heatmap")).toBe(false);
    expect(canAccess("free", "elite-brain")).toBe(false);
    expect(canAccess("free", "onchain")).toBe(false);
  });

  it("lets pro reach pro modules but not elite-exclusive ones", () => {
    expect(canAccess("pro", "exit")).toBe(true);
    expect(canAccess("pro", "sentiment")).toBe(true);
    expect(canAccess("pro", "elite-brain")).toBe(false);
    expect(canAccess("pro", "narrative-detect")).toBe(false);
    expect(canAccess("pro", "smart-money")).toBe(false);
    expect(canAccess("pro", "brain-v3")).toBe(false);
  });

  it("gives elite every module the platform has", () => {
    for (const key of ["recommendations", "heatmap", "elite-brain", "narrative-detect", "brain-v3", "onchain", "whale"]) {
      expect(canAccess("elite", key)).toBe(true);
    }
  });

  it("treats unknown modules as elite-only", () => {
    expect(requiredTierFor("some-future-module")).toBe("elite");
    expect(canAccess("free", "some-future-module")).toBe(false);
    expect(canAccess("pro", "some-future-module")).toBe(false);
  });

  it("reports the minimum tier for each module", () => {
    expect(requiredTierFor("recommendations")).toBe("free");
    expect(requiredTierFor("heatmap")).toBe("pro");
    expect(requiredTierFor("sentiment")).toBe("pro");
    expect(requiredTierFor("elite-brain")).toBe("elite");
    expect(requiredTierFor("narrative-detect")).toBe("elite");
    expect(requiredTierFor("whale")).toBe("elite");
  });

  it("ranks tiers monotonically", () => {
    expect(TIER_RANK.free).toBeLessThan(TIER_RANK.pro);
    expect(TIER_RANK.pro).toBeLessThan(TIER_RANK.elite);
    expect(meetsTier("pro", "free")).toBe(true);
    expect(meetsTier("pro", "elite")).toBe(false);
    expect(meetsTier("elite", "elite")).toBe(true);
  });
});

describe("alert channel gating", () => {
  it("limits channels by tier", () => {
    expect(canUseChannel("free", "in_app")).toBe(true);
    expect(canUseChannel("free", "email")).toBe(false);
    expect(canUseChannel("pro", "email")).toBe(true);
    expect(canUseChannel("pro", "telegram")).toBe(false);
    expect(canUseChannel("elite", "webhook")).toBe(true);
  });

  it("strips channels the tier cannot use", () => {
    expect(sanitizeChannels("free", ["in_app", "email", "webhook"])).toEqual(["in_app"]);
    expect(sanitizeChannels("pro", ["email", "telegram"])).toEqual(["in_app", "email"]);
  });

  it("never leaves a user with zero channels", () => {
    expect(sanitizeChannels("free", ["webhook"])).toContain("in_app");
    expect(sanitizeChannels("elite", [])).toEqual(["in_app"]);
  });
});
