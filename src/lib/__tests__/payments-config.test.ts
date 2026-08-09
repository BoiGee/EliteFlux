import { describe, expect, it } from "vitest";
import { CYCLE_DAYS, priceFor } from "../payments.config";

describe("plan pricing", () => {
  it("prices yearly below twelve months of monthly", () => {
    expect(priceFor("pro", "yearly")).toBeLessThan(priceFor("pro", "monthly") * 12);
    expect(priceFor("elite", "yearly")).toBeLessThan(priceFor("elite", "monthly") * 12);
  });

  it("maps billing cycles to the right subscription length", () => {
    expect(CYCLE_DAYS.monthly).toBe(30);
    expect(CYCLE_DAYS.yearly).toBe(365);
  });
});
