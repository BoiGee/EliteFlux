// Server-only: the actual bodies of the three background jobs, decoupled from
// HTTP so both the public cron routes (/api/public/*) and the in-process
// scheduler (scheduler.server.ts) can run them directly. Behavior here must
// stay identical to what the routes used to do inline — only the transport
// (Response vs plain object, thrown vs returned) changed.
import { beginRun, finishRun } from "./system-runs.server";

type Admin = { from: (t: string) => any };

// ---------------------------------------------------------------------------
// evaluate-alerts
// ---------------------------------------------------------------------------

export type EvaluateAlertsResult =
  | { ok: true; skipped: string; reason?: string }
  | {
      ok: true;
      evaluated: number;
      fired: number;
      graded: number;
      nudged: number;
      autopilot: { users: number; proposed: number; executed: number; blocked: number; halted: boolean };
      learning: {
        recorded: number;
        resolved: number;
        closed: number;
        weightSamples: number;
        drifting: string[];
        modelsTrained: string[];
      };
      errors: number;
      ts: string;
    };

export async function runEvaluateAlertsJob(admin: Admin): Promise<EvaluateAlertsResult> {
  const { getBrainSnapshotCached, buildAlertMetrics } = await import("./brain-server");
  const { evaluateAlert, isCoolingDown } = await import("./alerts-engine");

  const run = await beginRun(admin, "evaluate-alerts");
  if (!run) return { ok: true, skipped: "another run is in progress" };

  let errors = 0;
  let evaluated = 0;
  let fired = 0;

  try {
    let metrics;
    let brainResult;
    try {
      brainResult = await getBrainSnapshotCached();
      metrics = buildAlertMetrics(brainResult);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      await finishRun(admin, run, { status: "skipped", detail: { msg } });
      return { ok: true, skipped: "no fresh market data", reason: msg };
    }

    const { persistSnapshot } = await import("./market-history.server");
    const coins: Record<string, { price: number; change24h: number; quoteVolume: number }> = {};
    for (const [symbol, p] of Object.entries(metrics.priceBySymbol)) {
      coins[symbol] = { price: p.price, change24h: p.change24h, quoteVolume: brainResult.volumes[symbol] ?? 0 };
    }
    await persistSnapshot(admin, {
      flux_score: metrics.fluxScore,
      regime: metrics.regime,
      whale_score: metrics.whaleScore,
      sentiment_score: metrics.sentimentScore,
      exit_pressure: metrics.exitPressure,
      ignition_score: metrics.ignitionScore,
      coins,
    });

    const learning = { recorded: 0, resolved: 0, closed: 0, weightSamples: 0, drifting: [] as string[], modelsTrained: [] as string[] };
    let recWeights: Record<string, number> | undefined;
    try {
      const { buildSignalEvents } = await import("./brain-server");
      const { recordSignalEvents, resolveSignalOutcomes, recomputeRecommendationWeights, recomputeEliteBrainWeights } =
        await import("./signal-tracking.server");

      learning.recorded = await recordSignalEvents(admin as never, buildSignalEvents(brainResult));
      const r = await resolveSignalOutcomes(admin as never, metrics.priceBySymbol);
      learning.resolved = r.resolved;
      learning.closed = r.closed;

      const calib = await recomputeRecommendationWeights(admin as never);
      // A regime-specific blend beats the global one once it has enough evidence.
      recWeights = calib.byRegime[metrics.regime]?.weights ?? calib.weights;
      learning.weightSamples = calib.sampleSize;
      learning.drifting = calib.drifting;

      // Closes the loop on the flagship flux_score — it's always been graded,
      // this is what lets that grade change the formula. Slow-burn: takes
      // real time to accumulate enough samples per layer to move anything.
      await recomputeEliteBrainWeights(admin as never).catch((e) => console.error("elite-brain weight recompute failed", e));

      // Real trained model (logistic regression, gradient descent) alongside
      // the linear blend — cheap at today's data volume; move to a slower
      // cadence than every 5 minutes if the outcome table grows very large.
      const { trainSignalCalibrationModels } = await import("./ml-model.server");
      const trainResult = await trainSignalCalibrationModels(admin as never);
      learning.modelsTrained = trainResult.trained;
    } catch (e) {
      console.error("signal learning cycle failed", e);
    }

    let graded = 0;
    let nudged = 0;
    try {
      const { data: prev } = await admin
        .from("market_snapshots")
        .select("regime")
        .order("captured_at", { ascending: false })
        .range(1, 1)
        .maybeSingle();
      const { gradeDueCalls } = await import("./coach.server");
      graded = await gradeDueCalls(admin as never, metrics.priceBySymbol);
      const { sendCoachNudges } = await import("./coach-nudges.server");
      const topNarrative = brainResult.narrative?.topEmerging?.[0];
      nudged = await sendCoachNudges(admin as never, {
        regime: metrics.regime,
        previousRegime: (prev as { regime: string | null } | null)?.regime ?? null,
        fluxScore: metrics.fluxScore,
        exitPressure: metrics.exitPressure,
        whalePhase: metrics.whaleScore >= 60 ? "accumulating" : metrics.whaleScore <= 40 ? "distributing" : "neutral",
        leadingNarrative:
          (topNarrative as { name?: string; theme?: string } | undefined)?.name ??
          (topNarrative as { theme?: string } | undefined)?.theme ??
          null,
      });
      const { sendReengagementNudges } = await import("./reengagement-nudges.server");
      nudged += await sendReengagementNudges(admin as never);
    } catch (e) {
      errors++;
      console.error("coach upkeep failed", e);
    }

    const autopilot = { users: 0, proposed: 0, executed: 0, blocked: 0, halted: false };
    try {
      const { data: ks } = await admin
        .from("platform_settings")
        .select("value")
        .eq("key", "autopilot_kill_switch")
        .maybeSingle();
      if ((ks as { value: unknown } | null)?.value === true) {
        autopilot.halted = true;
      } else {
        const { computeRecommendations } = await import("./recommendation-engine");
        const { loadCrowdIntel } = await import("./crowd-intel");
        const { loadScoreBands, recordSignalEvents } = await import("./signal-tracking.server");
        const [crowd, scoreBands] = await Promise.all([
          loadCrowdIntel(admin as never),
          loadScoreBands(admin as never, "recommendation"),
        ]);
        const recs = computeRecommendations(
          brainResult.snapshot,
          brainResult.whale,
          brainResult.sentiment,
          brainResult.narrative,
          brainResult.pressure,
          brainResult.smartMoney,
          brainResult.onchain,
          recWeights,
          brainResult.derivatives,
          brainResult.orderbook,
          brainResult.social,
          crowd,
          brainResult.stablecoin,
          brainResult.confluence,
          brainResult.options,
          brainResult.macro,
          brainResult.volatility,
          brainResult.crossExchange,
          brainResult.communityTrust,
          scoreBands,
          { perAsset: Object.fromEntries(brainResult.ignition.signals.map((s) => [s.symbol, { score: s.score }])) },
        );
        // Feeds loadScoreBands above on future cycles — the recommendation
        // engine's own per-coin output wasn't previously tracked at all,
        // only its input layers were, so it could never calibrate itself.
        await recordSignalEvents(
          admin as never,
          recs.opportunities.map((o) => ({
            signal_type: "recommendation",
            symbol: o.symbol,
            score: o.score,
            band: o.band,
            regime: metrics.regime,
            reference_price: o.price,
          })),
        );
        const { activeAutopilotUsers, runAutopilotForUser } = await import("./autopilot.server");
        const users = await activeAutopilotUsers(admin as never);
        autopilot.users = users.length;
        const CONCURRENCY = 5;
        for (let i = 0; i < users.length; i += CONCURRENCY) {
          const slice = users.slice(i, i + CONCURRENCY);
          await Promise.all(
            slice.map(async (uid) => {
              try {
                const s = await runAutopilotForUser(admin as never, uid, recs.opportunities, brainResult.exit.perAsset, metrics.regime);
                autopilot.proposed += s.proposed;
                autopilot.executed += s.executed;
                autopilot.blocked += s.blocked;
              } catch (e) {
                errors++;
                console.error("autopilot run failed", uid, e);
              }
            }),
          );
        }
      }
    } catch (e) {
      errors++;
      console.error("autopilot cycle failed", e);
    }

    const { deliverFiredAlerts } = await import("./alert-delivery.server");
    const firedItems: import("./alert-delivery.server").FiredAlertItem[] = [];
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const PAGE = 500;
    for (let page = 0; ; page++) {
      const { data: alertRows, error: pageErr } = await admin
        .from("alerts")
        .select("id,user_id,name,trigger_type,symbol,threshold,direction,enabled,last_triggered_at,channels")
        .eq("enabled", true)
        .order("created_at", { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (pageErr) {
        errors++;
        break;
      }
      const alerts = alertRows ?? [];
      if (!alerts.length) break;
      evaluated += alerts.length;

      for (const raw of alerts) {
        const alert = raw as unknown as Record<string, unknown> & {
          id: string;
          user_id: string;
          name: string;
          channels?: string[];
        };
        if (isCoolingDown(alert as never, now)) continue;
        const result = evaluateAlert(alert as never, metrics);
        if (!result.fired) continue;

        const payload = {
          name: alert.name,
          trigger: alert["trigger_type"],
          symbol: alert["symbol"],
          threshold: alert["threshold"],
          direction: alert["direction"],
          value: result.value,
          message: result.message,
          ...(result.detail ?? {}),
        };

        const { data: inserted, error: insErr } = await admin
          .from("alert_history")
          .insert({ alert_id: alert.id, user_id: alert.user_id, fired_at: nowIso, payload })
          .select("id")
          .maybeSingle();
        if (insErr) {
          errors++;
          continue;
        }

        await admin.from("alerts").update({ last_triggered_at: nowIso }).eq("id", alert.id);
        fired++;

        firedItems.push({
          userId: alert.user_id,
          alertId: alert.id,
          historyId: inserted?.id ?? null,
          channels: ((alert.channels as never) ?? ["in_app"]) as never,
          title: alert.name,
          message: result.message ?? "Condition met.",
          payload,
        });
      }

      if (alerts.length < PAGE) break;
    }

    const { errors: deliveryErrors } = await deliverFiredAlerts(admin as never, firedItems);
    errors += deliveryErrors;

    await finishRun(admin, run, {
      status: errors ? "failed" : "ok",
      evaluated,
      fired,
      errors,
      detail: { graded, nudged, autopilot, learning },
    });

    return { ok: true, evaluated, fired, graded, nudged, autopilot, learning, errors, ts: nowIso };
  } catch (e) {
    await finishRun(admin, run, {
      status: "failed",
      evaluated,
      fired,
      errors: errors + 1,
      detail: { msg: e instanceof Error ? e.message : "unknown" },
    });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// expire-subs
// ---------------------------------------------------------------------------

export type ExpireSubsResult =
  | { ok: true; skipped: string }
  | { ok: true; checked: number; downgraded: number; errors: number; ts: string };

export async function runExpireSubsJob(admin: Admin): Promise<ExpireSubsResult> {
  const run = await beginRun(admin, "expire-subs");
  if (!run) return { ok: true, skipped: "another run is in progress" };

  const now = new Date().toISOString();
  let checked = 0;
  let downgraded = 0;
  let errors = 0;

  try {
    const { data: expired, error: selErr } = await admin
      .from("subscriptions")
      .select("id,user_id,tier,current_period_end")
      .in("status", ["active", "trialing"])
      .neq("tier", "free")
      .lt("current_period_end", now);

    if (selErr) throw new Error(selErr.message);

    checked = expired?.length ?? 0;

    for (const sub of expired ?? []) {
      const { error } = await admin
        .from("subscriptions")
        .update({ status: "expired", tier: "free", updated_at: now })
        .eq("id", (sub as { id: string }).id);
      if (error) errors++;
      else downgraded++;
    }

    await finishRun(admin, run, {
      status: errors > 0 && downgraded === 0 && checked > 0 ? "failed" : "ok",
      evaluated: checked,
      fired: downgraded,
      errors,
      detail: { checked, downgraded, errors },
    });

    return { ok: true, checked, downgraded, errors, ts: now };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await finishRun(admin, run, { status: "failed", errors: 1, detail: { msg } });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// settle-payments
// ---------------------------------------------------------------------------

export type SettlePaymentsResult =
  | { ok: true; skipped: string }
  | { ok: true; evaluated: number; activated: number; errors: number };

export async function runSettlePaymentsJob(admin: Admin): Promise<SettlePaymentsResult> {
  const { settlePayment } = await import("./payments.server");

  const run = await beginRun(admin, "settle-payments");
  if (!run) return { ok: true, skipped: "another run is in progress" };

  let evaluated = 0;
  let fired = 0;
  let errors = 0;

  try {
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data: pending } = await admin
      .from("payment_transactions")
      .select("id")
      .eq("status", "pending")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(50);

    for (const row of (pending ?? []) as Array<{ id: string }>) {
      evaluated++;
      try {
        const result = await settlePayment(admin as never, row.id);
        if (result.ok) fired++;
      } catch {
        errors++;
      }
    }

    const stale = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    await admin
      .from("payment_transactions")
      .update({ status: "expired", notes: "No confirmation found within 7 days." })
      .eq("status", "pending")
      .lt("created_at", stale);

    await finishRun(admin, run, {
      status: errors > 0 && fired === 0 ? "failed" : "ok",
      evaluated,
      fired,
      errors,
    });
    return { ok: true, evaluated, activated: fired, errors };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    await finishRun(admin, run, { status: "failed", evaluated, fired, errors: errors + 1, detail: { msg } });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// evaluate-alerts-fast — a lightweight lane for the alert triggers where a
// 5-minute delay actually costs something (a fast-moving momentum ignition,
// an exit-pressure spike, a price crossing a threshold). Reuses the same
// cached brain snapshot the main cycle uses (45s TTL), so this doesn't add
// upstream provider load — it just checks a narrower slice of alerts more
// often. Deliberately skips the learning/autopilot/coach machinery that
// makes the main cycle heavier than it needs to be for this.
// ---------------------------------------------------------------------------

const FAST_TRIGGER_TYPES = new Set(["momentum_change", "exit_pressure", "price_threshold"]);

export type FastAlertsResult =
  | { ok: true; skipped: string }
  | { ok: true; evaluated: number; fired: number; errors: number; deferredToMainCycle: number };

export async function runFastAlertsJob(admin: Admin): Promise<FastAlertsResult> {
  const { getBrainSnapshotCached, buildAlertMetrics } = await import("./brain-server");
  const { evaluateAlert, isCoolingDown } = await import("./alerts-engine");
  const { deliverFiredAlerts } = await import("./alert-delivery.server");

  const run = await beginRun(admin, "evaluate-alerts-fast");
  if (!run) return { ok: true, skipped: "another run is in progress" };

  let evaluated = 0;
  let fired = 0;
  let errors = 0;

  try {
    let metrics;
    try {
      metrics = buildAlertMetrics(await getBrainSnapshotCached());
    } catch (e) {
      await finishRun(admin, run, { status: "skipped", detail: { msg: e instanceof Error ? e.message : "unknown" } });
      return { ok: true, skipped: "no fresh market data" };
    }

    const { data: alertRows } = await admin
      .from("alerts")
      .select("id,user_id,name,trigger_type,symbol,threshold,direction,enabled,last_triggered_at,channels")
      .eq("enabled", true)
      .in("trigger_type", [...FAST_TRIGGER_TYPES])
      .limit(1000);

    // Speed is a paid lever: only pro/elite get sub-minute delivery here. Free-tier
    // alerts on the same trigger types still fire — just on the 5-minute main cycle,
    // which evaluates every enabled alert regardless of trigger type.
    const { data: fastLaneSubs } = await admin
      .from("subscriptions")
      .select("user_id,tier")
      .in("status", ["active", "trialing"])
      .in("tier", ["pro", "elite"]);
    const fastLaneUsers = new Set(
      ((fastLaneSubs ?? []) as { user_id: string; tier: string }[]).map((s) => s.user_id),
    );

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    let deferredToMainCycle = 0;
    const firedItems: import("./alert-delivery.server").FiredAlertItem[] = [];

    for (const raw of alertRows ?? []) {
      const alert = raw as unknown as Record<string, unknown> & {
        id: string;
        user_id: string;
        name: string;
        channels?: string[];
      };
      if (!fastLaneUsers.has(alert.user_id)) {
        deferredToMainCycle++;
        continue;
      }
      evaluated++;
      if (isCoolingDown(alert as never, now)) continue;
      const result = evaluateAlert(alert as never, metrics);
      if (!result.fired) continue;

      const payload = {
        name: alert.name,
        trigger: alert["trigger_type"],
        symbol: alert["symbol"],
        threshold: alert["threshold"],
        direction: alert["direction"],
        value: result.value,
        message: result.message,
        ...(result.detail ?? {}),
      };

      const { data: inserted, error: insErr } = await admin
        .from("alert_history")
        .insert({ alert_id: alert.id, user_id: alert.user_id, fired_at: nowIso, payload })
        .select("id")
        .maybeSingle();
      if (insErr) {
        errors++;
        continue;
      }
      await admin.from("alerts").update({ last_triggered_at: nowIso }).eq("id", alert.id);
      fired++;

      firedItems.push({
        userId: alert.user_id,
        alertId: alert.id,
        historyId: inserted?.id ?? null,
        channels: ((alert.channels as never) ?? ["in_app"]) as never,
        title: alert.name,
        message: result.message ?? "Condition met.",
        payload,
      });
    }

    const { errors: deliveryErrors } = await deliverFiredAlerts(admin as never, firedItems);
    errors += deliveryErrors;

    await finishRun(admin, run, {
      status: errors ? "failed" : "ok",
      evaluated,
      fired,
      errors,
      detail: { deferredToMainCycle },
    });
    return { ok: true, evaluated, fired, errors, deferredToMainCycle };
  } catch (e) {
    await finishRun(admin, run, {
      status: "failed",
      evaluated,
      fired,
      errors: errors + 1,
      detail: { msg: e instanceof Error ? e.message : "unknown" },
    });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// retention-cleanup — several global (not per-user) tables grow unbounded:
// raw market snapshots, resolved signal events, and the history tables the
// volatility/stablecoin layers persist into. Nothing has ever pruned them.
// Retention windows here are set with real margin over the longest lookback
// any engine actually reads (walk-forward validation's ~74 days is the
// longest), so this can never quietly invalidate a live calculation.
// ---------------------------------------------------------------------------

export type RetentionCleanupResult =
  | { ok: true; skipped: string }
  | { ok: true; deleted: Record<string, number>; errors: number; ts: string };

/** Count then delete rows in `table` older than `days` on `column`. Returns rows removed. */
async function purgeOlderThan(admin: Admin, table: string, column: string, days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const { count } = await admin.from(table).select("*", { count: "exact", head: true }).lt(column, cutoff);
  if (!count) return 0;
  const { error } = await admin.from(table).delete().lt(column, cutoff);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count;
}

/** Resolved signal_events are redundant once their outcome is recorded in signal_outcomes. */
async function purgeResolvedEventsOlderThan(admin: Admin, days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const { count } = await admin
    .from("signal_events")
    .select("*", { count: "exact", head: true })
    .not("resolved_at", "is", null)
    .lt("resolved_at", cutoff);
  if (!count) return 0;
  const { error } = await admin.from("signal_events").delete().not("resolved_at", "is", null).lt("resolved_at", cutoff);
  if (error) throw new Error(`signal_events: ${error.message}`);
  return count;
}

export async function runRetentionCleanupJob(admin: Admin): Promise<RetentionCleanupResult> {
  const run = await beginRun(admin, "retention-cleanup");
  if (!run) return { ok: true, skipped: "another run is in progress" };

  const deleted: Record<string, number> = {};
  let errors = 0;

  try {
    const cleanupJobs: [string, () => Promise<number>][] = [
      ["market_snapshots", () => purgeOlderThan(admin, "market_snapshots", "captured_at", 14)],
      ["signal_events", () => purgeResolvedEventsOlderThan(admin, 14)],
      ["signal_outcomes", () => purgeOlderThan(admin, "signal_outcomes", "resolved_at", 120)],
      ["volatility_history", () => purgeOlderThan(admin, "volatility_history", "captured_at", 45)],
      ["stablecoin_supply_history", () => purgeOlderThan(admin, "stablecoin_supply_history", "captured_at", 30)],
      ["telegram_login_attempts", () => purgeOlderThan(admin, "telegram_login_attempts", "created_at", 1)],
    ];

    for (const [table, runCleanup] of cleanupJobs) {
      try {
        deleted[table] = await runCleanup();
      } catch (e) {
        errors++;
        deleted[table] = 0;
        console.error(`retention cleanup failed for ${table}`, e);
      }
    }

    await finishRun(admin, run, { status: errors ? "failed" : "ok", errors, detail: { deleted } });
    return { ok: true, deleted, errors, ts: new Date().toISOString() };
  } catch (e) {
    await finishRun(admin, run, { status: "failed", errors: errors + 1, detail: { msg: e instanceof Error ? e.message : "unknown" } });
    throw e;
  }
}
