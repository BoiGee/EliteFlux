import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";

/** One consistent frame for every admin section: title, actions, states. */
export function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="glass-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SectionState({
  isLoading,
  isError,
  isEmpty,
  emptyText = "Nothing here yet.",
  onRetry,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty?: boolean;
  emptyText?: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (isError) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bear/40 bg-bear/10 px-4 py-3 text-xs">
        <span className="text-bear font-semibold">This section failed to load.</span>
        <button
          onClick={onRetry}
          className="h-7 px-3 rounded-md bg-bear/20 text-bear font-bold hover:bg-bear/30 inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 rounded-md bg-surface/60 animate-pulse" />
        ))}
      </div>
    );
  }
  if (isEmpty) return <p className="text-xs text-muted-foreground py-2">{emptyText}</p>;
  return <>{children}</>;
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "bull" | "bear" | "warn" }) {
  const toneClass = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-base font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}
