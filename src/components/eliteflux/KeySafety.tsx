import { KeyRound, Lock, ShieldCheck, ShieldOff, Trash2, Wallet } from "lucide-react";

const POINTS = [
  {
    icon: Lock,
    title: "Encrypted before storage",
    body: "Your key and secret are encrypted the moment they arrive and only ever unlocked inside our server for the split second a balance read or an order needs them. Nobody browsing the database sees anything readable.",
  },
  {
    icon: KeyRound,
    title: "Never shown again",
    body: "After you save a key it is never sent back to your browser. The app only ever displays the last four characters, so a stolen screen or session cannot reveal it.",
  },
  {
    icon: ShieldCheck,
    title: "Read-only is the default",
    body: "By default EliteFlux can only look at your balances. Trading permission is a separate, deliberate choice you make — and you can drop back to read-only any time.",
  },
  {
    icon: ShieldOff,
    title: "Withdrawal permission is never accepted",
    body: "We never ask for it and the app has no code path that could move money off your exchange. Create the key with withdrawals disabled — if you enable it by mistake, delete the key and make a new one.",
  },
  {
    icon: Trash2,
    title: "Delete and it is gone",
    body: "Removing a connection erases the encrypted credentials immediately. Revoking the key on your exchange side kills access instantly too — you always hold the off switch.",
  },
  {
    icon: Wallet,
    title: "Wallets are addresses only",
    body: "For on-chain wallets we take the public address and nothing else. No seed phrase, no private key, no signing. Reading a public address cannot move a single coin.",
  },
];

const STEPS: { venue: string; steps: string[] }[] = [
  {
    venue: "Binance",
    steps: [
      "Account → API Management → Create API key (System generated).",
      "Enable 'Enable Reading'. Leave 'Enable Withdrawals' OFF.",
      "Only tick 'Enable Spot & Margin Trading' if you want Autopilot to act for you.",
      "Restrict access to trusted IPs if you can.",
    ],
  },
  {
    venue: "Bybit",
    steps: [
      "Account → API → Create New Key → System-generated.",
      "Permissions: Read-Only for tracking, or Read-Write limited to Spot Trading for Autopilot.",
      "Never grant Withdraw. Never grant Transfer.",
      "Copy the key and secret once — Bybit shows the secret a single time.",
    ],
  },
  {
    venue: "OKX",
    steps: [
      "Profile → API → Create V5 API key. You will set a passphrase — keep it with the key.",
      "Permission: Read for tracking, or Read + Trade for Autopilot.",
      "Leave Withdraw unchecked.",
      "Add an IP whitelist if the option is offered to you.",
    ],
  },
  {
    venue: "MEXC",
    steps: [
      "Account → API Management → Create API Key.",
      "Grant Read. Only add Spot Trading if you want Autopilot to act for you.",
      "Never grant Withdraw.",
      "Restrict access to trusted IPs if you can.",
    ],
  },
  {
    venue: "KuCoin",
    steps: [
      "Account → API Management → Create API. You will set a passphrase — keep it with the key.",
      "Permission: General (read) only — EliteFlux doesn't place trades on KuCoin yet.",
      "Never grant Transfer or Withdraw.",
      "Copy the key, secret and passphrase once — KuCoin shows the secret a single time.",
    ],
  },
  {
    venue: "Gate.io",
    steps: [
      "Account → API Management → Create API Key.",
      "Permission: Read Only — EliteFlux doesn't place trades on Gate.io yet.",
      "Never grant Withdraw.",
      "Restrict access to trusted IPs if you can.",
    ],
  },
];

/** Plain-language explanation of exactly what happens to a pasted API key. */
export function KeySafety({ compact = false }: { compact?: boolean }) {
  return (
    <section className="glass-panel rounded-xl p-5 space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">How safe is this, really?</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mt-2">
          Straight answer: yes, we do keep your exchange key — we have to, otherwise your portfolio could never refresh
          on its own and Autopilot could never act. What matters is <em>how</em> it is kept, and what it can and cannot
          do. Here is all of it, with nothing dressed up.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {POINTS.map((p) => (
          <div key={p.title} className="rounded-lg bg-surface-2/50 p-3">
            <div className="flex items-center gap-2">
              <p.icon className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-xs font-semibold">{p.title}</p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5">{p.body}</p>
          </div>
        ))}
      </div>

      {!compact && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Creating a safe key</p>
          <div className="grid md:grid-cols-3 gap-3">
            {STEPS.map((s) => (
              <div key={s.venue} className="rounded-lg bg-surface-2/40 p-3">
                <p className="text-xs font-bold">{s.venue}</p>
                <ol className="mt-2 space-y-1.5 list-decimal list-inside">
                  {s.steps.map((step) => (
                    <li key={step} className="text-[11px] text-muted-foreground leading-relaxed">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Rule of thumb: if a platform ever asks for a seed phrase, a private key, or a key with withdrawal rights,
            walk away. EliteFlux asks for none of those, and never will.
          </p>
        </div>
      )}
    </section>
  );
}
