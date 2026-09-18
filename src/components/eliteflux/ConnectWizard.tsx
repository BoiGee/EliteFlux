import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ShieldOff, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Term } from "./Term";
import { Steps } from "./Steps";
import { setCoachPrefill } from "@/lib/coach-prefill";

export type Venue = "binance" | "bybit" | "okx" | "gateio" | "kucoin" | "mexc";
export type Permission = "read_only" | "read_trade";

/** Venues with no order-placement integration — read-only here for a reason unrelated to Binance's IP constraint (see PERMS below). */
const READ_ONLY_VENUES = new Set<Venue>(["gateio", "kucoin"]);

const VENUE_LABEL: Record<Venue, string> = {
  binance: "Binance",
  bybit: "Bybit",
  okx: "OKX",
  gateio: "Gate.io",
  kucoin: "KuCoin",
  mexc: "MEXC",
};

const WHERE: Record<Venue, string[]> = {
  binance: [
    "Open binance.com in a new tab and sign in as normal.",
    "Click your profile picture in the top right corner.",
    "Choose “Account” and then “API Management” in the menu that appears.",
  ],
  bybit: [
    "Open bybit.com in a new tab and sign in as normal.",
    "Hover over your profile icon in the top right corner.",
    "Choose “API” from the dropdown.",
  ],
  okx: [
    "Open okx.com in a new tab and sign in as normal.",
    "Click your profile icon in the top right corner.",
    "Choose “API” and then the trading API section.",
  ],
  gateio: [
    "Open gate.io in a new tab and sign in as normal.",
    "Click your profile icon in the top right corner.",
    "Choose “API Management”.",
  ],
  kucoin: [
    "Open kucoin.com in a new tab and sign in as normal.",
    "Click your avatar in the top right corner.",
    "Choose “API Management”.",
  ],
  mexc: [
    "Open mexc.com in a new tab and sign in as normal.",
    "Click your avatar in the top right corner.",
    "Choose “API Management”.",
  ],
};

const CREATE: Record<Venue, string[]> = {
  binance: [
    "Press “Create API key” and pick “System generated”.",
    "Give it a name you will recognise later, such as EliteFlux.",
    "Confirm with the security codes your exchange asks for (email, phone or authenticator).",
  ],
  bybit: [
    "Press “Create New Key” and pick “System-generated API Keys”.",
    "Name it EliteFlux so you know what it is for.",
    "Confirm with your security codes.",
  ],
  okx: [
    "Press “Create V5 API key”.",
    "Name it EliteFlux and choose a passphrase you write down — you will need it here.",
    "Confirm with your security codes.",
  ],
  gateio: [
    "Press “Create API Key”.",
    "Name it EliteFlux so you know what it is for.",
    "Confirm with your security codes.",
  ],
  kucoin: [
    "Press “Create API”.",
    "Name it EliteFlux and choose a passphrase you write down — you will need it here.",
    "Confirm with your security codes.",
  ],
  mexc: [
    "Press “Create API Key”.",
    "Name it EliteFlux so you know what it is for.",
    "Confirm with your security codes.",
  ],
};

const PERMS: Record<Venue, { on: string; trade: string; off: string }> = {
  binance: {
    on: "Tick “Enable Reading”.",
    trade:
      "Leave “Enable Spot & Margin Trading” OFF — Binance requires a whitelisted IP for any key with trading enabled, and EliteFlux has no fixed outbound IP to give it, so a trading-enabled Binance key can never connect here. Use Bybit or OKX instead if you want Flux to place orders for you.",
    off: "Leave “Enable Withdrawals” switched OFF.",
  },
  bybit: {
    on: "Choose “Read-Only” permissions.",
    trade: "If you want automation, choose Read-Write but tick Spot Trading only.",
    off: "Never tick Withdraw. Never tick Transfer.",
  },
  okx: {
    on: "Choose the “Read” permission.",
    trade: "Add “Trade” only if you want Flux to place orders for you.",
    off: "Leave “Withdraw” unticked.",
  },
  gateio: {
    on: "Choose “Read Only” permissions.",
    trade: "EliteFlux only reads balances on Gate.io today — there is no trading option here, regardless of what you tick.",
    off: "Never tick Withdraw.",
  },
  kucoin: {
    on: "Choose “General” (read) permissions.",
    trade: "EliteFlux only reads balances on KuCoin today — there is no trading option here, regardless of what you tick.",
    off: "Never tick Transfer or Withdraw.",
  },
  mexc: {
    on: "Choose “Read” permissions.",
    trade: "Add “Spot Trading” only if you want Flux to place orders for you.",
    off: "Never tick Withdraw.",
  },
};

type Values = { venue: Venue; permission: Permission; apiKey: string; apiSecret: string; passphrase: string };

const STEP_TITLES = [
  "Which exchange do you use?",
  "Find the API page",
  "Create the key",
  "Set the permissions",
  "Copy your key and secret",
  "Paste it here",
];

export function ConnectWizard({
  open,
  onOpenChange,
  readonlyOnly,
  pending,
  errorText,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  readonlyOnly: boolean;
  pending: boolean;
  errorText?: string | null;
  onSubmit: (v: Values) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [venue, setVenue] = useState<Venue>("binance");
  const [permission, setPermission] = useState<Permission>("read_only");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [ack, setAck] = useState(false);

  const label = VENUE_LABEL[venue];
  const last = STEP_TITLES.length - 1;

  const askCoach = (question: string) => {
    setCoachPrefill(question);
    navigate({ to: "/coach" });
  };

  const canFinish = apiKey.trim().length >= 8 && apiSecret.trim().length >= 8 && ack && !pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{STEP_TITLES[step]}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1.5">
          {STEP_TITLES.map((t, i) => (
            <span
              key={t}
              className={`h-1 flex-1 rounded-full transition ${i <= step ? "bg-primary" : "bg-surface-2"}`}
            />
          ))}
        </div>

        <div className="min-h-[220px] text-sm space-y-3">
          {step === 0 && (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pick the exchange where your coins actually sit. If you hold coins in more than one place, start with
                one — you can add the others afterwards.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(VENUE_LABEL) as Venue[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVenue(v)}
                    className={`py-2.5 rounded-lg text-sm font-semibold transition ${
                      venue === v ? "bg-gradient-primary text-white" : "bg-surface-2/60 hover:bg-surface-2"
                    }`}
                  >
                    {VENUE_LABEL[v]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Not on any of these? Close this and track a <Term word="wallet address">wallet address</Term> instead —
                no keys needed at all.
              </p>
            </>
          )}

          {step === 1 && <Steps items={WHERE[venue]} note={`Keep the ${label} tab open — you will come back to it.`} />}

          {step === 2 && (
            <Steps
              items={CREATE[venue]}
              note="“System generated” simply means the exchange makes the code for you. That is the one you want."
            />
          )}

          {step === 3 && (
            <>
              <div className="rounded-lg bg-surface-2/50 p-3 space-y-2">
                <p className="text-xs flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-bull mt-0.5 shrink-0" />
                  <span>
                    {PERMS[venue].on} This is <Term word="read-only">read-only</Term> — it lets us see your balances and
                    nothing else.
                  </span>
                </p>
                <p className="text-xs flex items-start gap-2">
                  <ShieldOff className="w-3.5 h-3.5 text-bear mt-0.5 shrink-0" />
                  <span>
                    <strong>{PERMS[venue].off}</strong> This is the one setting that matters most.{" "}
                    <Term word="withdrawal permission">Withdrawal permission</Term> is never needed here, and we could
                    not use it even if you granted it.
                  </span>
                </p>
                <p className="text-xs flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                  <span>
                    {PERMS[venue].trade} That is <Term word="spot trading">spot trading</Term>. Skip it and you still
                    get every score, alert and coaching answer — you just place the orders yourself.
                  </span>
                </p>
              </div>
              <p className="text-[11px] text-bear/90 leading-relaxed flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Say it once more: withdrawals stay OFF. If you ticked it by accident, delete the key and make a new one.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(["read_only", "read_trade"] as Permission[]).map((p) => (
                  <button
                    key={p}
                    disabled={(readonlyOnly || venue === "binance" || READ_ONLY_VENUES.has(venue)) && p === "read_trade"}
                    title={
                      p === "read_trade" && venue === "binance"
                        ? "Binance won't allow this combination — see above."
                        : p === "read_trade" && READ_ONLY_VENUES.has(venue)
                          ? "Trading isn't offered on this exchange yet — see above."
                          : undefined
                    }
                    onClick={() => setPermission(p)}
                    className={`py-2 rounded-lg text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                      permission === p ? "bg-primary/20 ring-1 ring-primary" : "bg-surface-2/60 text-muted-foreground"
                    }`}
                  >
                    {p === "read_only" ? "I chose read-only" : "I added spot trading"}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <Steps
              items={[
                "Your exchange now shows two long codes: the key and the secret.",
                "Copy both into a safe place right now — the secret is shown only once.",
                venue === "okx" || venue === "kucoin"
                  ? "You also need the passphrase you chose a moment ago."
                  : "There is no passphrase on this exchange — key and secret are enough.",
                "Lost the secret already? No problem: delete that key and create a fresh one.",
              ]}
              note="Never send these codes to anyone in chat, email or social media. Paste them only on the next screen."
            />
          )}

          {step === last && (
            <div className="space-y-2">
              <Label htmlFor="w-key">
                <Term word="API key">API key</Term>
              </Label>
              <Input id="w-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
              <Label htmlFor="w-secret">
                <Term word="secret">API secret</Term>
              </Label>
              <Input
                id="w-secret"
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                autoComplete="off"
              />
              {(venue === "okx" || venue === "kucoin") && (
                <>
                  <Label htmlFor="w-pass">
                    <Term word="passphrase">Passphrase</Term>
                  </Label>
                  <Input
                    id="w-pass"
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    autoComplete="off"
                  />
                </>
              )}
              <label className="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5 accent-[var(--primary)]"
                />
                <span>
                  I created this key with <strong>withdrawal permission disabled</strong>, and I can delete it on my
                  exchange at any time.
                </span>
              </label>
              {errorText && <p className="text-[11px] text-bear leading-relaxed">{errorText}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={() =>
              askCoach(
                `I'm connecting my ${label} account to EliteFlux and I'm stuck on this step: "${STEP_TITLES[step]}". Explain it to me like I'm five, one idea per sentence.`,
              )
            }
            className="text-[11px] text-muted-foreground hover:text-primary transition"
          >
            What does this mean?
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
            )}
            {step < last ? (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Next <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!canFinish}
                onClick={() =>
                  onSubmit({
                    venue,
                    permission: readonlyOnly || venue === "binance" || READ_ONLY_VENUES.has(venue) ? "read_only" : permission,
                    apiKey: apiKey.trim(),
                    apiSecret: apiSecret.trim(),
                    passphrase: passphrase.trim(),
                  })
                }
              >
                {pending ? "Checking…" : "Connect"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
