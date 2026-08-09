import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BrandLockup } from "./BrandLogo";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background py-10 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link to="/">
            <BrandLockup size="sm" />
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
        </div>
        <h1 className="text-3xl font-bold mb-2">{title}</h1>
        <p className="text-xs text-muted-foreground mb-8">Last updated: {updated}</p>
        <article className="prose prose-invert max-w-none text-sm leading-relaxed text-foreground/85 space-y-4 [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-2 [&_a]:text-primary">
          {children}
        </article>
      </div>
    </div>
  );
}
