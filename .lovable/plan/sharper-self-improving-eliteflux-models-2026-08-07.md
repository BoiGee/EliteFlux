# Sharper, self-improving EliteFlux models

Yes — there is real headroom. Today every intelligence layer scores the market from a
short, in-memory view of recent prices, and the weights that combine those layers are
fixed numbers chosen by hand. Nothing in the system ever checks whether a signal was
right afterwards, so the models cannot get better over time.

Confirmed by reading the code: history used for scoring is capped at 12 samples over a
6-hour window (`src/lib/market-history.server.ts`), the composite scores use hardcoded
weights (e.g. the recommendation blend in `src/lib/recommendation-engine.ts`), and there
is no outcome, accuracy, calibration or backtest code anywhere in `src/`.

## What we build

### 1. Signal outcome tracking (the foundation)
Every time the engine produces a score — Elite Flux Score, per-coin opportunity score,
whale phase, exit pressure, trading-condition verdict — record it with a timestamp.
Then, on a schedule, look back and record what actually happened to that asset over the
next 1h / 4h / 24h / 7d. This turns opinions into a scoreboard.

### 2. Accuracy dashboard
A new "Model Accuracy" view (admin first, then a trimmed public version) showing per
signal type: hit rate, average forward return when the signal fired, false-positive
rate, and how those numbers trend. Users trust what they can verify, and we finally get
an honest answer to "is this signal actually working?".

### 3. Calibration instead of guessed weights
Once outcomes exist, replace the hardcoded blend weights with weights derived from
measured performance, recomputed periodically and bounded so no single layer can
dominate. Scores also get calibrated so that "80" genuinely means roughly the historical
hit rate of an 80 — not just a big number.

### 4. Confidence and regime awareness
Each signal carries an explicit confidence based on data freshness, provider agreement
and how many layers agree. Low-confidence output is visibly labelled instead of shown
with the same authority as a strong read. Accuracy is also tracked per market regime, so
the engine can lean on the layers that historically work in the current regime.

### 5. Deeper, longer history
Extend snapshot retention and sampling so engines score against days/weeks of observed
data rather than hours. This alone materially sharpens volatility compression, whale
volume-spike detection and narrative rotation, which currently work on very few points.

### 6. Disagreement and drift guards
Flag when providers disagree on price/volume beyond a tolerance, and when a layer's
recent accuracy drops well below its long-run average, so a degraded signal is
downweighted automatically instead of silently polluting the composite.

## Technical notes

- New tables: `signal_events` (signal type, symbol, score, context, fired_at) and
  `signal_outcomes` (forward returns per horizon, resolved_at), with RLS and grants;
  reads for the accuracy views go through a server function.
- New scheduled endpoint under `src/routes/api/public/` (following the existing
  `evaluate-alerts` pattern, with `beginRun`/`finishRun` bookkeeping) to resolve matured
  signals and refresh accuracy aggregates.
- Emission hooks added where scores are produced in `src/lib/brain-server.ts` and the
  recommendation/exit/ignition engines; the engines stay pure, the server layer records.
- Weight calibration lives in a new pure module with unit tests, consumed by
  `recommendation-engine.ts` and `elite-brain.ts` in place of literal weights.
- Confidence and provenance fields flow through existing API routes and UI cards.
- All framing stays outcome/benefit-first — no exposure of data sources or methodology.

## Suggested order

Phase 1: outcome tracking + longer history (no visible change, unlocks everything).
Phase 2: admin accuracy dashboard + drift guards.
Phase 3: calibrated weights + confidence surfaced in the product UI.
