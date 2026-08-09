import { describe, expect, it } from "vitest";
import {
  CHANGELOG,
  FEATURES,
  GLOSSARY,
  HOW_TO,
  PLANS,
  knowledgeOverview,
  searchKnowledge,
} from "../coach-knowledge";
import { COACH_TOOLS_BY_TIER, COACH_UNIVERSAL_TOOLS } from "../coach-shared";

// Provider / implementation words that must never leak to a user through the coach.
const FORBIDDEN = [
  "binance api",
  "coingecko",
  "coinpaprika",
  "kraken",
  "trongrid",
  "supabase",
  "openai",
  "anthropic",
  "claude",
  "websocket",
  "postgres",
];

function corpus(): string {
  return JSON.stringify([FEATURES, HOW_TO, GLOSSARY, PLANS, CHANGELOG]).toLowerCase();
}

describe("coach knowledge base", () => {
  it("never names a data provider or internal technology", () => {
    const text = corpus();
    for (const word of FORBIDDEN) expect(text).not.toContain(word);
  });

  it("gives every feature a place, a plain description and an ELI5 line", () => {
    for (const f of FEATURES) {
      expect(f.where.length).toBeGreaterThan(3);
      expect(f.what.length).toBeGreaterThan(20);
      expect(f.eli5.length).toBeGreaterThan(10);
      expect(["free", "pro", "elite"]).toContain(f.plan);
    }
  });

  it("resolves every feature, how-to and glossary term by its own title", () => {
    for (const f of FEATURES) expect(searchKnowledge(f.title).length).toBeGreaterThan(0);
    for (const h of HOW_TO) expect(searchKnowledge(h.title).length).toBeGreaterThan(0);
    for (const g of GLOSSARY) expect(searchKnowledge(g.term).length).toBeGreaterThan(0);
  });

  it("answers the questions users actually ask", () => {
    const asks = [
      "how do I connect binance",
      "what does exit pressure mean",
      "how do I pay with a card",
      "what is the kill switch",
      "how accurate are you",
      "create an alert",
      "sign in with telegram",
    ];
    for (const q of asks) {
      const hits = searchKnowledge(q);
      expect(hits.length, q).toBeGreaterThan(0);
      expect(hits[0]!.eli5.length).toBeGreaterThan(5);
    }
  });

  it("falls back to a full overview when nothing matches", () => {
    const hits = searchKnowledge("zzzz nonsense query");
    expect(hits).toHaveLength(0);
    const o = knowledgeOverview();
    expect(o.features.length).toBe(FEATURES.length);
    expect(o.plans).toHaveLength(3);
  });

  it("keeps the changelog newest-first with valid dates", () => {
    const times = CHANGELOG.map((c) => new Date(c.date).getTime());
    expect(times.every((t) => Number.isFinite(t))).toBe(true);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});

describe("coach tool access", () => {
  it("gives product, account and accuracy tools to every plan", () => {
    for (const tier of ["free", "pro", "elite"] as const) {
      for (const t of COACH_UNIVERSAL_TOOLS) expect(COACH_TOOLS_BY_TIER[tier]).toContain(t);
    }
  });

  it("keeps market-depth tools gated", () => {
    expect(COACH_TOOLS_BY_TIER.free).not.toContain("get_coin_intel");
    expect(COACH_TOOLS_BY_TIER.pro).not.toContain("simulate_scenario");
    expect(COACH_TOOLS_BY_TIER.elite).toContain("get_deep_cognition");
  });
});
