import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Compass, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TopBar } from "@/components/eliteflux/TopBar";
import { SiteFooter } from "@/components/eliteflux/SiteFooter";
import { KeySafety } from "@/components/eliteflux/KeySafety";
import { ConnectWizard } from "@/components/eliteflux/ConnectWizard";
import { Term } from "@/components/eliteflux/Term";
import { friendlyConnectError } from "@/lib/portfolio.schemas";
import {
  addWallet,
  connectExchange,
  getKeyPolicy,
  listConnections,
  refreshPortfolio,
  removeConnection,
  setKeyPolicy,
} from "@/lib/portfolio.functions";


export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — Connect Your Holdings to EliteFlux" },
      {
        name: "description",
        content:
          "Link exchange accounts read-only and track public wallet addresses so EliteFlux intelligence reads your actual book.",
      },
      { property: "og:title", content: "EliteFlux Portfolio" },
      {
        property: "og:description",
        content: "One merged view of your exchange balances and on-chain wallets, scored by EliteFlux intelligence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortfolioPage,
});

const VENUES = [
  { key: "binance", label: "Binance" },
  { key: "bybit", label: "Bybit" },
  { key: "okx", label: "OKX" },
] as const;

type Venue = (typeof VENUES)[number]["key"];

const money = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function PortfolioPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const fetchAll = useServerFn(listConnections);
  const connect = useServerFn(connectExchange);
  const wallet = useServerFn(addWallet);
  const remove = useServerFn(removeConnection);
  const refresh = useServerFn(refreshPortfolio);
  const readPolicy = useServerFn(getKeyPolicy);
  const writePolicy = useServerFn(setKeyPolicy);

  const q = useQuery({ queryKey: ["portfolio"], queryFn: () => fetchAll(), enabled: !!user });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["portfolio"] });

  const policyQ = useQuery({ queryKey: ["key-policy"], queryFn: () => readPolicy(), enabled: !!user });
  const readonlyOnly = policyQ.data?.readonlyOnly ?? false;
  const policyM = useMutation({
    mutationFn: (next: boolean) => writePolicy({ data: { readonlyOnly: next } }),
    onSuccess: (r) => {
      qc.setQueryData(["key-policy"], r);
      toast.success(r.readonlyOnly ? "Account locked to read-only keys." : "Trading-permission keys allowed again.");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const [venue, setVenue] = useState<Venue>("binance");
  const [permission, setPermission] = useState<"read_only" | "read_trade">("read_only");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [chain, setChain] = useState<"evm" | "solana">("evm");
  const [address, setAddress] = useState("");
  const [noWithdrawAck, setNoWithdrawAck] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [expert, setExpert] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);

  const connectM = useMutation({
    mutationFn: (v?: {
      venue: Venue;
      permission: "read_only" | "read_trade";
      apiKey: string;
      apiSecret: string;
      passphrase: string;
    }) => {
      const p = v ?? { venue, permission, apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), passphrase: passphrase.trim() };
      return connect({
        data: {
          venue: p.venue,
          permission: p.venue === "binance" ? "read_only" : p.permission,
          apiKey: p.apiKey,
          apiSecret: p.apiSecret,
          ...(p.passphrase ? { passphrase: p.passphrase } : {}),
        },
      });
    },
    onSuccess: (r) => {
      setApiKey("");
      setApiSecret("");
      setPassphrase("");
      setConnectError(null);
      setRawError(null);
      setWizardOpen(false);
      if (r.errors.length) {
        toast.error(`Exchange connected. ${r.errors.length} source(s) failed to sync: ${r.errors.map((e) => `${e.source} (${e.message})`).join("; ")}`);
      } else {
        toast.success("Exchange connected and balances synced.");
      }
      invalidate();
    },
    onError: (e: Error) => {
      const friendly = friendlyConnectError(e.message);
      setConnectError(friendly ?? e.message);
      setRawError(friendly ? e.message : null);
      toast.error(friendly ?? e.message);
    },
  });


  const walletM = useMutation({
    mutationFn: () => wallet({ data: { chain, address: address.trim() } }),
    onSuccess: (r) => {
      setAddress("");
      if (r.errors.length) {
        // syncPortfolio re-reads every connected source, not just the one just
        // added — an error here may belong to an existing wallet/exchange.
        toast.error(`Wallet added. ${r.errors.length} source(s) failed to sync: ${r.errors.map((e) => `${e.source} (${e.message})`).join("; ")}`);
      } else {
        toast.success("Wallet added.");
      }
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshM = useMutation({
    mutationFn: () => refresh({}),
    onSuccess: (r) => {
      if (r.errors.length) {
        toast.error(`Synced ${r.holdings} holdings, but ${r.errors.length} source(s) failed: ${r.errors.map((e) => `${e.source} (${e.message})`).join("; ")}`);
      } else {
        toast.success(`Synced ${r.holdings} holdings.`);
      }
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const holdings = q.data?.holdings ?? [];
  const total = holdings.reduce((s, h) => s + (Number(h.usd_value) || 0), 0);

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="p-4 sm:p-5 lg:p-7 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Your <span className="text-gradient">Portfolio</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Connect what you actually hold so Flux reads your real book, not a generic market.
            </p>
          </div>
          <Button variant="outline" onClick={() => refreshM.mutate()} disabled={refreshM.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshM.isPending ? "animate-spin" : ""}`} /> Sync now
          </Button>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-baseline gap-3">
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total tracked</span>
            <span className="text-3xl font-bold">{money(total)}</span>
          </div>
          {holdings.length === 0 ? (
            <div className="mt-3 grid sm:grid-cols-3 gap-2">
              {[
                {
                  title: "Track a wallet",
                  body: "Easiest start. Paste a public address — no key, nothing to set up. You see the balances, we see nothing else.",
                },
                {
                  title: "Connect read-only",
                  body: "Your exchange balances appear here automatically, and Flux starts talking about your actual coins.",
                },
                {
                  title: "Connect with trading",
                  body: "Everything above, plus Flux can place spot orders for you inside the limits you set on Autopilot.",
                },
              ].map((c) => (
                <div key={c.title} className="rounded-lg bg-surface-2/40 p-3">
                  <p className="text-xs font-semibold">{c.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{c.body}</p>
                </div>
              ))}
            </div>
          ) : (

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground text-left">
                    <th className="py-2">Asset</th>
                    <th className="py-2">Source</th>
                    <th className="py-2 text-right">Amount</th>
                    <th className="py-2 text-right">Price</th>
                    <th className="py-2 text-right">Value</th>
                    <th className="py-2 text-right">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.id} className="border-t border-border/40">
                      <td className="py-2 font-semibold">{h.symbol}</td>
                      <td className="py-2 text-muted-foreground">{h.source_label}</td>
                      <td className="py-2 text-right tabular-nums">{Number(h.amount).toLocaleString("en-US", { maximumFractionDigits: 6 })}</td>
                      <td className="py-2 text-right tabular-nums">{money(h.price as number | null)}</td>
                      <td className="py-2 text-right tabular-nums">{money(h.usd_value as number | null)}</td>
                      <td className="py-2 text-right tabular-nums">{h.weight ? `${Number(h.weight).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <KeySafety />

        <section className="glass-panel rounded-xl p-4 flex items-start gap-3">
          <input
            id="ro-only"
            type="checkbox"
            checked={readonlyOnly}
            disabled={policyM.isPending}
            onChange={(e) => {
              const next = e.target.checked;
              if (next) setPermission("read_only");
              policyM.mutate(next);
            }}
            className="mt-0.5 accent-[var(--primary)]"
          />
          <label htmlFor="ro-only" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
            <span className="font-semibold text-foreground">Lock my account to read-only keys.</span> With this on,
            EliteFlux refuses any key that can place an order — even if you paste one by mistake. Watching, scoring and
            coaching all keep working; only automated trading is switched off.
          </label>
        </section>


        <div className="grid lg:grid-cols-2 gap-5">
          {/* Exchange */}
          <section className="glass-panel rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Exchange account</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              An <Term word="API key">API key</Term> is a viewing pass your exchange creates for you — a window into your
              balances, not a door to your money. It is not your password, we never ask for{" "}
              <Term word="withdrawal permission">withdrawal permission</Term>, and you can cancel it on your exchange
              whenever you want.
            </p>

            <div className="rounded-lg bg-surface-2/40 p-3 space-y-2">
              <p className="text-xs font-semibold">Never done this before?</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setWizardOpen(true)}>
                  <Compass className="w-3.5 h-3.5 mr-1.5" /> Walk me through it
                </Button>
                <Button size="sm" variant="outline" onClick={() => setExpert((v) => !v)}>
                  {expert ? "Hide the form" : "I know what I'm doing"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    document.getElementById("wallet-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  Just track a wallet instead
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The walkthrough takes you screen by screen on Binance, Bybit or OKX and ends with the boxes to paste
                into — you never have to guess which button to press.
              </p>
            </div>

            {expert && (
              <>
            <div className="grid grid-cols-3 gap-2">

              {VENUES.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setVenue(v.key)}
                  className={`py-2 rounded-lg text-sm font-semibold transition ${
                    venue === v.key ? "bg-gradient-primary text-white" : "bg-surface-2/60 text-foreground/80 hover:bg-surface-2"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["read_only", "read_trade"] as const).map((p) => (
                <button
                  key={p}
                  disabled={(readonlyOnly || venue === "binance") && p === "read_trade"}
                  title={
                    readonlyOnly && p === "read_trade"
                      ? "Your account is locked to read-only keys."
                      : venue === "binance" && p === "read_trade"
                        ? "Binance requires a whitelisted IP for trading-enabled keys, and EliteFlux has no fixed outbound IP to give it. Use Bybit or OKX for Autopilot instead."
                        : undefined
                  }
                  onClick={() => setPermission(p)}
                  className={`py-2 rounded-lg text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                    permission === p ? "bg-primary/20 ring-1 ring-primary text-foreground" : "bg-surface-2/60 text-muted-foreground"
                  }`}
                >
                  {p === "read_only" ? "Read-only" : "Read + spot trade"}
                </button>
              ))}
            </div>
            {venue === "binance" && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Binance won't allow trading permission on an unrestricted-IP key, and EliteFlux has no fixed outbound
                IP to whitelist — so Binance connections here are read-only (tracking and coaching). For Autopilot to
                place trades, connect Bybit or OKX instead.
              </p>
            )}


            <div className="space-y-2">
              <Label htmlFor="api-key">API key</Label>
              <Input id="api-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
              <Label htmlFor="api-secret">API secret</Label>
              <Input id="api-secret" type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} autoComplete="off" />
              {venue === "okx" && (
                <>
                  <Label htmlFor="passphrase">Passphrase</Label>
                  <Input id="passphrase" type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="off" />
                </>
              )}
            </div>

            <label className="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed cursor-pointer">
              <input
                type="checkbox"
                checked={noWithdrawAck}
                onChange={(e) => setNoWithdrawAck(e.target.checked)}
                className="mt-0.5 accent-[var(--primary)]"
              />
              <span>
                I created this key with <strong>withdrawal permission disabled</strong>. I understand EliteFlux can never
                move funds off my exchange, and that I can revoke this key at any time.
              </span>
            </label>

            {connectError && (
              <div className="rounded-lg bg-bear/10 p-3 space-y-1">
                <p className="text-[11px] text-bear leading-relaxed">{connectError}</p>
                {rawError && (
                  <details className="text-[10px] text-muted-foreground">
                    <summary className="cursor-pointer select-none">Technical detail</summary>
                    <p className="mt-1 break-words">{rawError}</p>
                  </details>
                )}
              </div>
            )}

            <Button
              className="w-full"
              disabled={connectM.isPending || apiKey.length < 8 || apiSecret.length < 8 || !noWithdrawAck}
              onClick={() => connectM.mutate(undefined)}
            >
              <Plus className="w-4 h-4 mr-2" /> {connectM.isPending ? "Verifying…" : "Connect exchange"}
            </Button>
              </>
            )}





            <div className="space-y-2">
              {(q.data?.exchanges ?? []).map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg bg-surface-2/50 px-3 py-2">
                  <ShieldCheck className={`w-4 h-4 ${c.status === "connected" ? "text-bull" : "text-bear"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold capitalize">
                      {c.venue} <span className="text-muted-foreground font-normal">••••{c.key_hint}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.permission === "read_trade" ? "Read + spot trade" : "Read-only"}
                      {c.last_error ? ` · ${c.last_error}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove this ${c.venue} connection?\n\nThe encrypted key and secret are erased immediately and its balances leave your portfolio. Revoke the key on ${c.venue} too if you want to be certain.`,
                        )
                      )
                        removeM.mutate(c.id);
                    }}
                    aria-label="Remove connection"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-bear" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Wallets */}
          <section id="wallet-panel" className="glass-panel rounded-xl p-5 space-y-4">

            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Wallet address</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Public addresses only — read-only balances. EliteFlux never asks for a seed phrase or private key and can
              never move funds from a wallet.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {(["evm", "solana"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setChain(c)}
                  className={`py-2 rounded-lg text-sm font-semibold transition ${
                    chain === c ? "bg-gradient-primary text-white" : "bg-surface-2/60 text-foreground/80 hover:bg-surface-2"
                  }`}
                >
                  {c === "evm" ? "Ethereum" : "Solana"}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={chain === "evm" ? "0x…" : "Base58 address"}
              />
            </div>

            <Button className="w-full" variant="outline" disabled={walletM.isPending || address.trim().length < 26} onClick={() => walletM.mutate()}>
              <Plus className="w-4 h-4 mr-2" /> {walletM.isPending ? "Reading chain…" : "Track wallet"}
            </Button>

            <div className="space-y-2">
              {(q.data?.wallets ?? []).map((w) => (
                <div key={w.id} className="flex items-center gap-3 rounded-lg bg-surface-2/50 px-3 py-2">
                  <Wallet
                    className={`w-4 h-4 ${w.status === "connected" ? "text-bull" : w.status === "error" ? "text-bear" : "text-muted-foreground"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold uppercase">{w.chain}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {w.address}
                      {w.last_error ? ` · ${w.last_error}` : ""}
                    </p>
                  </div>
                  <button onClick={() => removeM.mutate(w.id)} aria-label="Remove wallet">
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-bear" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <ConnectWizard
          open={wizardOpen}
          onOpenChange={(v) => {
            setWizardOpen(v);
            if (!v) {
              setConnectError(null);
              setRawError(null);
            }
          }}
          readonlyOnly={readonlyOnly}
          pending={connectM.isPending}
          errorText={connectError}
          onSubmit={(v) => connectM.mutate(v)}
        />

        <div className="text-center">
          <Link to="/autopilot" className="text-sm text-primary hover:underline">
            Set how much Flux may do for you →
          </Link>
        </div>


        <SiteFooter contained={false} />
      </main>
    </div>
  );
}
