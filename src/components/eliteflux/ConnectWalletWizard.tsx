import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Term } from "./Term";
import { Steps } from "./Steps";
import { setCoachPrefill } from "@/lib/coach-prefill";

// Deliberately NOT imported from wallets.server.ts — that file is
// server-only, and this is a client component. "evm"/"solana" is a stable,
// tiny contract duplicated here on purpose (same pattern src/routes/portfolio.tsx
// already uses for its own plain wallet form).
export type Chain = "evm" | "solana";
export type WalletApp = "metamask" | "trust" | "phantom" | "coinbase" | "ledger" | "exodus";

const WALLET_APP_LABEL: Record<WalletApp, string> = {
  metamask: "MetaMask",
  trust: "Trust Wallet",
  phantom: "Phantom",
  coinbase: "Coinbase Wallet",
  ledger: "Ledger Live",
  exodus: "Exodus",
};

// Every EliteFlux wallet read is either an EVM or a Solana public address —
// this only ever tracks balances, it never asks for a seed phrase or private
// key, so there is nothing here for any of these apps to "connect" to in the
// usual sense. Ledger and Exodus both have first-class Solana support in
// reality, modeled here; the others are kept single-chain for this pass, not
// because they technically can't hold other chains, but to keep the wizard
// short — widen later by adding a chain to the array below.
const SUPPORTED_CHAINS: Record<WalletApp, Chain[]> = {
  metamask: ["evm"],
  trust: ["evm"],
  coinbase: ["evm"],
  phantom: ["solana"],
  ledger: ["evm", "solana"],
  exodus: ["evm", "solana"],
};

const FIND_ADDRESS_STEPS: Record<WalletApp, string[]> = {
  metamask: [
    "Open the MetaMask extension or app and make sure the right account is selected at the top.",
    "Click the account name (or the ⋯ menu) — this copies your address. It starts with 0x.",
  ],
  trust: [
    "Open Trust Wallet and go to the Wallet tab.",
    "Tap Receive, then pick the network (e.g. Ethereum) if asked.",
    "Tap the copy icon under the QR code.",
  ],
  phantom: [
    "Open Phantom and make sure your Solana wallet is selected at the top.",
    "Tap your wallet name at the top — this copies your address, or opens a Receive screen with a copy button.",
  ],
  coinbase: [
    "Open Coinbase Wallet — the separate self-custody app, not the main Coinbase app — and go to Assets.",
    "Tap Receive and choose Ethereum (or the network you use).",
    "Tap the copy icon.",
  ],
  ledger: [
    "Open Ledger Live and connect your Ledger device.",
    "Go to Accounts and pick the account for the chain you want.",
    "Click Receive, confirm on your device, then copy the address shown.",
  ],
  exodus: [
    "Open Exodus and click the wallet for the chain you want in the left-hand list.",
    "Click Receive, then click the copy icon next to the address.",
  ],
};

type Values = { app: WalletApp; chain: Chain; address: string; label: string };

const TITLES = {
  app: "Which wallet app do you use?",
  chain: "Which chain?",
  find: "Find your address",
  paste: "Paste it here",
};

export function ConnectWalletWizard({
  open,
  onOpenChange,
  pending,
  errorText,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: boolean;
  errorText?: string | null;
  onSubmit: (v: Values) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [app, setApp] = useState<WalletApp>("metamask");
  const [chain, setChain] = useState<Chain>("evm");
  const [address, setAddress] = useState("");

  const appLabel = WALLET_APP_LABEL[app];
  const chains = SUPPORTED_CHAINS[app];
  const needsChainStep = chains.length > 1;

  // Fixed step keys, with "chain" skipped for single-chain apps — computed
  // fresh each render rather than stored in state, so switching apps can
  // never leave `step` pointing at a skipped step.
  const stepKeys = needsChainStep ? (["app", "chain", "find", "paste"] as const) : (["app", "find", "paste"] as const);
  const last = stepKeys.length - 1;
  const current = stepKeys[Math.min(step, last)];

  const askCoach = (question: string) => {
    setCoachPrefill(question);
    navigate({ to: "/coach" });
  };

  const selectApp = (a: WalletApp) => {
    setApp(a);
    setChain(SUPPORTED_CHAINS[a][0]);
  };

  // Mirrors wallets.server.ts's isValidAddress exactly (server-only, not
  // importable here) — previously a flat length check (>= 26) was looser
  // than the server's real per-chain format, so a malformed address could
  // pass this wizard and only bounce after a round trip to the server.
  const isValidAddress = chain === "evm" ? /^0x[a-fA-F0-9]{40}$/.test(address.trim()) : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
  const canFinish = isValidAddress && !pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{TITLES[current]}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1.5">
          {stepKeys.map((k, i) => (
            <span key={k} className={`h-1 flex-1 rounded-full transition ${i <= step ? "bg-primary" : "bg-surface-2"}`} />
          ))}
        </div>

        <div className="min-h-[220px] text-sm space-y-3">
          {current === "app" && (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pick the app your wallet lives in. This only ever reads a public address — never a seed phrase or
                private key, and nothing can ever be moved or traded through it.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(WALLET_APP_LABEL) as WalletApp[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => selectApp(a)}
                    className={`py-2.5 rounded-lg text-sm font-semibold transition ${
                      app === a ? "bg-gradient-primary text-white" : "bg-surface-2/60 hover:bg-surface-2"
                    }`}
                  >
                    {WALLET_APP_LABEL[a]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Not here? Any Ethereum/EVM or Solana address works — close this and paste it directly below.
              </p>
            </>
          )}

          {current === "chain" && (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {appLabel} can hold coins on more than one chain here. Pick the one you want to track first — you can
                add the other as a second wallet afterwards.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {chains.map((c) => (
                  <button
                    key={c}
                    onClick={() => setChain(c)}
                    className={`py-2.5 rounded-lg text-sm font-semibold transition ${
                      chain === c ? "bg-gradient-primary text-white" : "bg-surface-2/60 hover:bg-surface-2"
                    }`}
                  >
                    {c === "evm" ? "Ethereum" : "Solana"}
                  </button>
                ))}
              </div>
            </>
          )}

          {current === "find" && (
            <Steps
              items={FIND_ADDRESS_STEPS[app]}
              note={`Keep the ${appLabel} ${chain === "evm" ? "address" : "wallet"} handy — you will paste it on the next screen.`}
            />
          )}

          {current === "paste" && (
            <div className="space-y-2">
              <Label htmlFor="w-address">
                <Term word="wallet address">Wallet address</Term>
              </Label>
              <Input
                id="w-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={chain === "evm" ? "0x…" : "Base58 address"}
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                This is public information — anyone can already see it on the {chain === "evm" ? "Ethereum" : "Solana"}{" "}
                blockchain. Sharing it here only lets EliteFlux read balances, never move anything.
              </p>
              {errorText && <p className="text-[11px] text-bear leading-relaxed">{errorText}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={() =>
              askCoach(
                `I'm connecting my ${appLabel} wallet to EliteFlux and I'm stuck on this step: "${TITLES[current]}". Explain it to me like I'm five, one idea per sentence.`,
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
                onClick={() => onSubmit({ app, chain, address: address.trim(), label: appLabel })}
              >
                {pending ? "Checking…" : "Track wallet"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
