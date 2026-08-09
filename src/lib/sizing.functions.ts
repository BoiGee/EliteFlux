// App-internal server function for Kelly-criterion position sizing guidance.
// Client-safe module: every server-only import lives inside the handler.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getSuggestedSizing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ score: z.number().min(0).max(100) }).parse(i))
  .handler(async ({ data, context }) => {
    const [{ supabaseAdmin }, { getBrainSnapshotCached }, { computeSuggestedSizing }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./brain-server"),
      import("./kelly-sizing.server"),
    ]);
    const snap = await getBrainSnapshotCached();
    return computeSuggestedSizing(supabaseAdmin as never, { score: data.score, regime: snap.brain.regime, userId: context.userId });
  });
