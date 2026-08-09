import { createFileRoute } from "@tanstack/react-router";
import { TrackRecord } from "@/components/eliteflux/TrackRecord";

export const Route = createFileRoute("/track-record")({
  head: () => ({
    meta: [
      { title: "Track Record — EliteFlux" },
      {
        name: "description",
        content: "EliteFlux's measured, timestamped accuracy — every signal graded against what actually happened, updated continuously.",
      },
    ],
  }),
  component: TrackRecord,
});
