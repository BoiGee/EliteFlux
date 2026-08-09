import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Plain-language definitions for the words a first-timer trips over. */
export const GLOSSARY: Record<string, string> = {
  "API key":
    "A long code your exchange gives you that lets another app look at your account. It is like a spare viewing pass — it is not your password, and you can cancel it whenever you like.",
  secret:
    "The second half of the pass. The key says who is asking, the secret proves it is really you. Your exchange shows it once, so copy it straight away.",
  passphrase:
    "An extra word you choose when making the key on some exchanges. You need it alongside the key and secret, so keep all three together.",
  "read-only":
    "The app can look but cannot touch. It sees your balances and nothing else — no buying, no selling, no moving money.",
  "withdrawal permission":
    "The setting that would let an app send coins out of your account. Leave it switched off. We never ask for it and cannot use it.",
  "IP whitelist":
    "A rule that says only certain computers may use the key. Nice extra lock if your exchange offers it, but not required.",
  "spot trading":
    "Plain buying and selling of coins with money you already have — no borrowing, no leverage. Only needed if you want Flux to place orders for you.",
  "wallet address":
    "The public name of your on-chain wallet, like a bank account number. Anyone can look at it, nobody can spend from it just by knowing it.",
};

/** Underlined term that reveals a one-sentence, jargon-free definition on tap. */
export function Term({ children, word }: { children?: React.ReactNode; word: keyof typeof GLOSSARY | string }) {
  const definition = GLOSSARY[word];
  if (!definition) return <>{children ?? word}</>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-baseline gap-0.5 underline decoration-dotted underline-offset-2 text-foreground/90 hover:text-primary transition"
        >
          {children ?? word}
          <HelpCircle className="w-3 h-3 shrink-0 translate-y-[1px] opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-[11px] leading-relaxed">
        <p className="font-semibold text-xs mb-1 capitalize">{word}</p>
        {definition}
      </PopoverContent>
    </Popover>
  );
}
