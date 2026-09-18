import { describe, expect, it } from "vitest";
import { rankBaselineSymbols } from "../baseline-universe.server";

function ticker(symbol: string, quoteVolume: string, overrides: Partial<Record<string, string>> = {}) {
  return {
    symbol,
    lastPrice: overrides.lastPrice ?? "1.5",
    priceChangePercent: overrides.priceChangePercent ?? "2.1",
    volume: overrides.volume ?? "1000",
    quoteVolume,
    highPrice: overrides.highPrice ?? "1.6",
    lowPrice: overrides.lowPrice ?? "1.4",
  };
}

describe("rankBaselineSymbols", () => {
  it("drops symbols not in the tradeable set", () => {
    const tradeable = new Set(["BTCUSDT"]);
    const arr = [ticker("BTCUSDT", "1000000"), ticker("SOMESHITCOINUSDT", "999999999")];
    const out = rankBaselineSymbols(arr, tradeable, 300);
    expect(out.map((r) => r.symbol)).toEqual(["BTCUSDT"]);
  });

  it("does not false-positive-exclude a real coin whose symbol contains a leveraged-token substring", () => {
    // JUP (Jupiter) ends in "UP" — a naive /UP|DOWN|BULL|BEAR/ suffix regex
    // would wrongly treat it as a leveraged token. The tradeable set here
    // stands in for exchangeInfo's real `permissions` flag, which correctly
    // includes JUP.
    const tradeable = new Set(["JUPUSDT", "BTCUPUSDT"]); // BTCUPUSDT excluded by the caller building `tradeable`, not by this function
    const arr = [ticker("JUPUSDT", "5000000")];
    const out = rankBaselineSymbols(arr, tradeable, 300);
    expect(out.map((r) => r.symbol)).toEqual(["JUPUSDT"]);
  });

  it("ranks by quoteVolume descending", () => {
    const tradeable = new Set(["AUSDT", "BUSDT", "CUSDT"]);
    const arr = [ticker("AUSDT", "100"), ticker("BUSDT", "300"), ticker("CUSDT", "200")];
    const out = rankBaselineSymbols(arr, tradeable, 300);
    expect(out.map((r) => r.symbol)).toEqual(["BUSDT", "CUSDT", "AUSDT"]);
  });

  it("caps at the given limit", () => {
    const tradeable = new Set(["AUSDT", "BUSDT", "CUSDT"]);
    const arr = [ticker("AUSDT", "100"), ticker("BUSDT", "300"), ticker("CUSDT", "200")];
    const out = rankBaselineSymbols(arr, tradeable, 2);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.symbol)).toEqual(["BUSDT", "CUSDT"]);
  });

  it("drops non-finite or non-positive prices", () => {
    const tradeable = new Set(["AUSDT", "BUSDT"]);
    const arr = [ticker("AUSDT", "100", { lastPrice: "0" }), ticker("BUSDT", "100", { lastPrice: "not-a-number" })];
    const out = rankBaselineSymbols(arr, tradeable, 300);
    expect(out).toHaveLength(0);
  });
});
