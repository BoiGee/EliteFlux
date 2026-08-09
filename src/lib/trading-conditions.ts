// Pure "should I be trading right now?" traffic light.
// Shared by the coach's server tool and the client stand-down banner so the
// number the user reads and the verdict the coach gives can never disagree.

export type ConditionLight = "green" | "amber" | "red";

export interface ConditionInput {
  fluxScore: number;
  regime: string;
  exitPressure: number;
  pumpPressureScore: number;
  pumpPressureBand: string;
  cognitionConfidence: number;
  sentimentScore: number;
  /** From the event-risk scanner. Optional — omitted callers see no behavior change. */
  eventRiskLevel?: "low" | "elevated" | "high";
}

export interface ConditionVerdict {
  light: ConditionLight;
  headline: string;
  plain: string;
  reasons: string[];
  flipCondition: string;
}

const HEADLINE: Record<ConditionLight, string> = {
  green: "Conditions favour acting",
  amber: "Be selective",
  red: "Stand down",
};

const PLAIN: Record<ConditionLight, string> = {
  green:
    "The market is behaving in a way that usually rewards patience-plus-action. If you have a plan, this is a normal time to follow it.",
  amber:
    "The market is mixed. Some signals say go, others say wait. Do less than usual, and only where your reason is strong.",
  red: "The market is in a state where most trades go badly. The best move right now is usually no move at all.",
};

/** Traffic light plus the two or three reasons behind it. */
export function evaluateTradingConditions(i: ConditionInput): ConditionVerdict {
  const reasons: string[] = [];
  let risk = 0;

  if (i.exitPressure >= 65) {
    risk += 2;
    reasons.push(`Exit pressure is elevated at ${Math.round(i.exitPressure)}/100 — holders are heading for the door.`);
  } else if (i.exitPressure >= 50) {
    risk += 1;
    reasons.push(`Exit pressure is building at ${Math.round(i.exitPressure)}/100.`);
  }

  if (i.pumpPressureBand === "Extreme") {
    risk += 2;
    reasons.push("Pressure is in the extreme band — moves at this stage are usually the last ones, not the first.");
  } else if (i.pumpPressureBand === "High") {
    risk += 1;
    reasons.push("Pressure is high — late-cycle behaviour, entries here carry poor reward for the risk.");
  }

  const r = i.regime.toLowerCase();
  if (r.includes("risk-off") || r.includes("de-risk") || r.includes("distribution") || r.includes("exit")) {
    risk += 2;
    reasons.push(`The regime reads "${i.regime}" — the tide is going out.`);
  } else if (r.includes("accumulation") || r.includes("early expansion")) {
    risk -= 1;
    reasons.push(`The regime reads "${i.regime}" — historically the friendlier side of the cycle.`);
  }

  if (i.fluxScore <= 30) {
    risk += 1;
    reasons.push(`The overall read is weak at ${Math.round(i.fluxScore)}/100.`);
  } else if (i.fluxScore >= 61 && i.fluxScore <= 85) {
    risk -= 1;
    reasons.push(`The overall read is constructive at ${Math.round(i.fluxScore)}/100.`);
  } else if (i.fluxScore > 85) {
    risk += 1;
    reasons.push(`The overall read is very hot at ${Math.round(i.fluxScore)}/100 — that is usually late, not early.`);
  }

  if (i.cognitionConfidence < 40) {
    risk += 1;
    reasons.push(`Signal agreement is low (${Math.round(i.cognitionConfidence)}% confidence) — the picture is noisy.`);
  }

  if (i.sentimentScore >= 80) {
    risk += 1;
    reasons.push("Crowd sentiment is euphoric, which historically precedes sharp air pockets.");
  } else if (i.sentimentScore <= 20) {
    reasons.push("Crowd sentiment is fearful — painful, but often where the better entries hide.");
  }

  if (i.eventRiskLevel === "high") {
    risk += 1;
    reasons.push("A high-risk scheduled event is on the radar — see the event radar for details.");
  } else if (i.eventRiskLevel === "elevated") {
    reasons.push("A market-moving event is on the radar this week — see the event radar for details.");
  }

  const light: ConditionLight = risk >= 3 ? "red" : risk >= 1 ? "amber" : "green";

  const flipCondition =
    light === "red"
      ? "This turns amber when exit pressure falls back under 50 and the regime leaves its risk-off state."
      : light === "amber"
        ? "This turns green when exit pressure eases, pressure leaves the high band and signal agreement climbs above 40%."
        : "This turns amber if exit pressure pushes past 50 or pressure enters the high band.";

  return {
    light,
    headline: HEADLINE[light],
    plain: PLAIN[light],
    reasons: reasons.slice(0, 4),
    flipCondition,
  };
}
