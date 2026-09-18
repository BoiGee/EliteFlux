import { describe, expect, it } from "vitest";
import { rankBaselineSymbols, rankBaselineSymbolsOkx, rankBaselineSymbolsBybit } from "../baseline-universe.server";

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

function okxTicker(instId: string, volCcy24h: string, overrides: Partial<Record<string, string>> = {}) {
  return {
    instId,
    last: overrides.last ?? "1.5",
    open24h: overrides.open24h ?? "1.4",
    high24h: overrides.high24h ?? "1.6",
    low24h: overrides.low24h ?? "1.4",
    vol24h: overrides.vol24h ?? "1000",
    volCcy24h,
  };
}

describe("rankBaselineSymbolsOkx", () => {
  it("only keeps USDT-quoted instruments and reshapes the key to a Binance-style pair", () => {
    const out = rankBaselineSymbolsOkx([okxTicker("BTC-USDT", "1000000"), okxTicker("BTC-USDC", "999999999")], 300);
    expect(out.map((r) => r.symbol)).toEqual(["BTCUSDT"]);
  });

  it("excludes stablecoin base assets", () => {
    const out = rankBaselineSymbolsOkx([okxTicker("USDC-USDT", "5000000")], 300);
    expect(out).toHaveLength(0);
  });

  it("excludes OKX's historical leveraged-token suffixes without false-positiving a real coin", () => {
    const out = rankBaselineSymbolsOkx(
      [okxTicker("BTC3L-USDT", "5000000"), okxTicker("JUP-USDT", "4000000")],
      300,
    );
    expect(out.map((r) => r.symbol)).toEqual(["JUPUSDT"]);
  });

  it("ranks by quote volume descending and caps at the limit", () => {
    const out = rankBaselineSymbolsOkx(
      [okxTicker("A-USDT", "100"), okxTicker("B-USDT", "300"), okxTicker("C-USDT", "200")],
      2,
    );
    expect(out.map((r) => r.symbol)).toEqual(["BUSDT", "CUSDT"]);
  });
});

function bybitTicker(symbol: string, turnover24h: string, overrides: Partial<Record<string, string>> = {}) {
  return {
    symbol,
    lastPrice: overrides.lastPrice ?? "1.5",
    price24hPcnt: overrides.price24hPcnt ?? "0.021",
    highPrice24h: overrides.highPrice24h ?? "1.6",
    lowPrice24h: overrides.lowPrice24h ?? "1.4",
    volume24h: overrides.volume24h ?? "1000",
    turnover24h,
  };
}

describe("rankBaselineSymbolsBybit", () => {
  it("only keeps USDT-suffixed symbols and excludes stablecoins/leveraged suffixes", () => {
    const out = rankBaselineSymbolsBybit(
      [bybitTicker("BTCUSDT", "1000000"), bybitTicker("USDCUSDT", "999999999"), bybitTicker("BTC3LUSDT", "888888888")],
      300,
    );
    expect(out.map((r) => r.symbol)).toEqual(["BTCUSDT"]);
  });

  it("ranks by turnover descending and caps at the limit", () => {
    const out = rankBaselineSymbolsBybit(
      [bybitTicker("AUSDT", "100"), bybitTicker("BUSDT", "300"), bybitTicker("CUSDT", "200")],
      2,
    );
    expect(out.map((r) => r.symbol)).toEqual(["BUSDT", "CUSDT"]);
  });
});
