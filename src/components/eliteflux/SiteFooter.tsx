import { Link } from "@tanstack/react-router";
import { BrandLockup } from "./BrandLogo";

const PRODUCT = [
  { to: "/", label: "Dashboard" },
  { to: "/why-eliteflux", label: "Why EliteFlux" },
  { to: "/pricing", label: "Pricing" },
  { to: "/alerts", label: "Alerts" },
  { to: "/account", label: "Account" },
];

const LEGAL = [
  { to: "/security", label: "Key safety" },
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/refunds", label: "Refunds" },
];

export function SiteFooter({ contained = true }: { contained?: boolean }) {
  return (
    <footer className="mt-10 border-t border-border/50">
      <div className={`${contained ? "max-w-6xl mx-auto" : ""} px-5 py-10`}>
        <div className="grid gap-8 md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <BrandLockup size="sm" />
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Decision intelligence for crypto markets — opportunity scores, rotation signals and
              real-time alerts, in one cockpit.
            </p>
          </div>

          <nav aria-label="Product" className="text-xs">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-foreground/80">Product</h2>
            <ul className="mt-3 space-y-2">
              {PRODUCT.map((l) => (
                <li key={l.label}>
                  <Link to={l.to} className="text-muted-foreground hover:text-foreground transition">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal" className="text-xs">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-foreground/80">Legal</h2>
            <ul className="mt-3 space-y-2">
              {LEGAL.map((l) => (
                <li key={l.label}>
                  <Link to={l.to} className="text-muted-foreground hover:text-foreground transition">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-8 pt-5 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>© {new Date().getFullYear()} EliteFlux. All rights reserved.</span>
          <span>Market intelligence only — not financial advice.</span>
        </div>
      </div>
    </footer>
  );
}
