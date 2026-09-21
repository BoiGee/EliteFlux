// Client-safe knowledge base of the EliteFlux product itself.
// The AI Coach reads this so it can answer "what does this app do / how do I
// use it" without improvising, and the UI can reuse it for help surfaces.
//
// RULE: describe WHAT a feature does and WHY it helps. Never describe how the
// intelligence is computed, and never name a data provider.

export interface FeatureDoc {
  key: string;
  title: string;
  where: string;
  what: string;
  eli5: string;
  plan: "free" | "pro" | "elite";
  keywords: string[];
}

export interface HowToDoc {
  key: string;
  title: string;
  steps: string[];
  eli5: string;
  keywords: string[];
}

export interface GlossaryDoc {
  term: string;
  eli5: string;
  keywords?: string[];
}

export interface ChangeDoc {
  date: string; // YYYY-MM-DD
  title: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

export const FEATURES: FeatureDoc[] = [
  {
    key: "dashboard",
    title: "Live dashboard",
    where: "Home page, after you sign in",
    what: "One screen with tabs across the top for the modules your plan unlocks — the EliteFlux score, the heatmap, meme radar, event signals, per-asset intelligence and more on Operator and Elite. Free is Recommendations only; the rest of the tabs prompt to upgrade.",
    eli5: "It is the dashboard of a car for the crypto market. One look tells you if the road is clear or messy.",
    plan: "free",
    keywords: ["dashboard", "home", "modules", "tabs", "overview"],
  },
  {
    key: "elite-brain",
    title: "Elite Brain score",
    where: "Dashboard, Elite Brain tab",
    what: "A single 0-100 reading of how favourable the whole market looks right now, plus the regime label and a confidence gauge showing how much the engine trusts its own read at this moment.",
    eli5: "One number for the whole market's mood. High means the crowd is leaning in, low means it is backing away.",
    plan: "elite",
    keywords: ["brain", "flux score", "score", "regime", "confidence"],
  },
  {
    key: "recommendations",
    title: "Elite Recommendations",
    where: "Dashboard, Recommendations tab",
    what: "A ranked list of the assets that currently look most interesting, each with a stance, a conviction level and the reasons behind it. High-conviction ideas are highlighted. The score blends whale activity, sentiment, narrative strength, on-chain flow, funding, order-book depth, social attention, momentum ignition and more — not any single signal alone.",
    eli5: "A shortlist of coins worth looking at today, sorted best first, with a short reason for each.",
    plan: "free",
    keywords: ["recommendations", "opportunities", "ranked", "ideas", "conviction"],
  },
  {
    key: "exit",
    title: "Exit Intelligence",
    where: "Dashboard, Exit tab",
    what: "How much pressure is building for people to sell, for the market overall and per asset. High exit pressure means a move is more fragile than it looks.",
    eli5: "It shows how many people look ready to head for the door. A crowded exit is a risky room.",
    plan: "pro",
    keywords: ["exit", "sell pressure", "fragile", "distribution", "risk"],
  },
  {
    key: "momentum",
    title: "Momentum Ignition",
    where: "Dashboard, Momentum tab",
    what: "Flags assets that are coiled and could start moving sharply, before the move is obvious on a chart. Early ignition also lifts that asset's own Recommendations score, not just its own tab.",
    eli5: "It spots the kettle just before it whistles.",
    plan: "pro",
    keywords: ["momentum", "ignition", "breakout", "coiled", "pre-move"],
  },
  {
    key: "narrative",
    title: "Narrative Detection",
    where: "Dashboard, Narrative tab",
    what: "Detects which themes money is rotating into — for example AI, gaming, real-world assets or memes — and how strong each theme is right now.",
    eli5: "It notices which story the crowd is excited about this week.",
    plan: "elite",
    keywords: ["narrative", "theme", "rotation", "sector", "story"],
  },
  {
    key: "whale",
    title: "Whale Activity",
    where: "Dashboard, Whale tab",
    what: "Flags coordinated volume-and-price patterns consistent with large-player buying or selling, and labels the phase: accumulating, distributing or quiet. This reads exchange price/volume patterns, not wallet addresses — for direct on-chain wallet tracking see the separate On-Chain feature. The overall market score weighs the highest-volume few hundred coins, not only the ones with their own tab here.",
    eli5: "It watches for the market's footprints of big spenders moving — not the spenders themselves.",
    plan: "elite",
    keywords: ["whale", "big players", "accumulation", "distribution"],
  },
  {
    key: "smart-money",
    title: "Smart Money clustering",
    where: "Dashboard, Smart Money tab",
    what: "Groups coins showing similar whale-activity patterns into clusters and shows a Smart Money Confidence Index and a Market Conviction Score. Built on the same price/volume-pattern read as Whale Activity above, not a separate wallet-tracking data source.",
    eli5: "It checks whether several coins are showing the same 'big money moving' pattern at once, and how confident that read is.",
    plan: "elite",
    keywords: ["smart money", "institutional", "conviction", "cluster"],
  },
  {
    key: "onchain-flow",
    title: "Real on-chain wallet tracking",
    where: "Dashboard, On-Chain tab; feeds Coin Intel",
    what: "Tracks real exchange wallet deposits and withdrawals directly on-chain, plus flags single large transfers the moment they happen. Money moving onto an exchange usually means selling is coming; money moving off usually means someone is settling in to hold.",
    eli5: "It watches the big wallets' front doors — cash walking in usually means a sale is coming, cash walking out usually means someone's holding.",
    plan: "elite",
    keywords: ["on-chain", "wallet", "whale alert", "exchange flow", "large transfer"],
  },
  {
    key: "brain-v3",
    title: "Brain AI v3",
    where: "Dashboard, Brain AI v3 tab",
    what: "A separate, newer regime engine from Elite Brain above — reads pump/dump pressure building under the surface and classifies the market into one of its own phase labels (for example accumulation, risk-off, or extreme pressure). Runs alongside Elite Brain rather than replacing it; the two can occasionally disagree, which is itself a useful signal that the read is less clear-cut than usual.",
    eli5: "A second opinion on the market's mood, built differently from Elite Brain, that's especially tuned to spot pressure building before a sharp move.",
    plan: "elite",
    keywords: ["brain v3", "pump pressure", "regime v3", "phase"],
  },
  {
    key: "sentiment",
    title: "Sentiment Engine",
    where: "Dashboard, Sentiment tab",
    what: "Reads the crowd's current mood — bullish, bearish or neutral — across several underlying gauges, not just one headline number.",
    eli5: "A weather report for how the crowd is feeling about the market right now.",
    plan: "pro",
    keywords: ["sentiment", "mood", "bullish", "bearish", "crowd"],
  },
  {
    key: "events",
    title: "Event Signals",
    where: "Dashboard, Event Signals tab",
    what: "A live feed of signals the engine has just flagged, each tagged by severity (critical, warning, info) with a timestamp — the running record of what the intelligence layers are noticing in real time. Distinct from Flux's own news-scanning calendar (ask Flux 'what's coming up') — this tab shows the engine's live signal feed, not scheduled external events.",
    eli5: "A live ticker of everything the engine just noticed, most important first.",
    plan: "pro",
    keywords: ["events", "event signals", "feed", "severity", "live"],
  },
  {
    key: "market-flow",
    title: "Market Flow overview",
    where: "Dashboard, Market Flow tab",
    what: "The market's vital signs in one place: total market cap, BTC dominance, 24h volume and where liquidity is moving, so you can see the broader tide before judging any one coin's move.",
    eli5: "The big picture — is money flooding into crypto overall, or draining out — before you zoom into any one coin.",
    plan: "pro",
    keywords: ["market flow", "overview", "market cap", "dominance", "liquidity"],
  },
  {
    key: "heatmap",
    title: "Altcoin Flow Heatmap",
    where: "Dashboard, Altcoin Heatmap tab",
    what: "Shows which altcoin categories (like AI, gaming, L1s, RWA) are seeing money flow in or out right now, with a risk read per category.",
    eli5: "A color-coded map of which coin categories are heating up or cooling off.",
    plan: "pro",
    keywords: ["heatmap", "altcoin", "category flow", "sectors", "rotation"],
  },
  {
    key: "meme",
    title: "Meme Radar",
    where: "Dashboard, Meme Radar tab",
    what: "Tracks meme-coin specific activity — hype-driven moves, whale-controlled names, and volatility spikes — a genuinely different risk profile from the rest of the market, watched separately.",
    eli5: "A dedicated radar for meme coins, since they move on hype and whales in a way the rest of the market usually doesn't.",
    plan: "pro",
    keywords: ["meme", "meme coin", "hype", "whale-controlled", "radar"],
  },
  {
    key: "risk",
    title: "Risk Index",
    where: "Dashboard, Risk Index tab",
    what: "A single 0-100 gauge of how risky current conditions look market-wide, with a plain-language label and description alongside it.",
    eli5: "A speedometer for how much danger is in the room right now.",
    plan: "pro",
    keywords: ["risk index", "risk gauge", "danger", "conditions"],
  },
  {
    key: "coin-intel",
    title: "Coin Intel grid",
    where: "Dashboard, Coin Intel tab",
    what: "A per-coin grid combining category tags (AI, Meme, L1, RWA, etc.), a risk level, and on-chain signal pulses in one scannable view — the most detail-dense single-screen look at the coin universe.",
    eli5: "One big table with everything worth knowing about each coin, side by side.",
    plan: "pro",
    keywords: ["coin intel", "grid", "category", "per-coin", "table"],
  },
  {
    key: "market-microstructure",
    title: "Funding, order book & social attention",
    where: "Feeds every asset's opportunity score and Coin Intel",
    what: "Three extra checks most tools skip: funding-rate crowding (are too many traders leaning the same way on leverage), order-book imbalance (more buying or selling stacked up right now), and social attention (what's actually trending).",
    eli5: "It checks who's over-leaning on borrowed money, how thin the buy/sell queue is, and what people are buzzing about.",
    plan: "pro",
    keywords: ["funding rate", "order book", "imbalance", "social", "trending", "leverage", "crowding"],
  },
  {
    key: "stablecoin-supply",
    title: "Stablecoin supply signal",
    where: "Feeds the market pulse",
    what: "Tracks USDT/USDC being minted or burned on-chain. Net minting means fresh dollars are entering the system, usually bullish; net burning means dollars are leaving.",
    eli5: "New stablecoins being created is like more cash showing up at the casino — it usually gets spent.",
    plan: "pro",
    keywords: ["stablecoin", "usdt", "usdc", "mint", "burn", "liquidity"],
  },
  {
    key: "confluence",
    title: "Multi-timeframe confluence",
    where: "Feeds Coin Intel and the market pulse",
    what: "Checks whether an asset's 1-hour, 4-hour, 24-hour and 7-day moves all agree on direction. Agreement across timeframes is a real trend; disagreement is usually just noise on one of them.",
    eli5: "One clock saying 'up' means little. Four clocks all saying 'up' means something.",
    plan: "pro",
    keywords: ["confluence", "timeframe", "alignment", "trend", "noise"],
  },
  {
    key: "options-market",
    title: "Options market read",
    where: "Feeds the market pulse (BTC/ETH)",
    what: "Reads the live BTC and ETH options market: the put/call ratio, implied volatility and 'max pain' (the price where the most option holders would lose the most). Below 50 = put-heavy positioning (fear/hedging); above 50 = call-heavy (greed).",
    eli5: "It listens to what professional options traders are actually betting on BTC and ETH, not just spot traders.",
    plan: "elite",
    keywords: ["options", "put call ratio", "max pain", "implied volatility", "iv", "deribit"],
  },
  {
    key: "macro-correlation",
    title: "Macro correlation",
    where: "Feeds the market pulse",
    what: "Tracks how closely BTC is currently trading with the US dollar, the S&P 500 and gold. High correlation with stocks means crypto is moving on macro news right now, not its own fundamentals.",
    eli5: "It checks whether crypto is dancing to its own tune or just following the stock market and the dollar today.",
    plan: "elite",
    keywords: ["macro", "correlation", "dxy", "dollar", "s&p 500", "gold", "risk-on", "risk-off"],
  },
  {
    key: "volatility-regime",
    title: "Volatility regime",
    where: "Feeds Coin Intel",
    what: "Ranks how tightly or wildly an asset is trading right now against its own recent history. A compressed (quiet) reading has historically preceded bigger moves; an expanded (already wild) reading is a chase-risk warning. Tracked for a few hundred coins by trading volume, not only the ones shown in Coin Intel.",
    eli5: "A coiled spring or an already-sprung one — this tells you which kind you're looking at.",
    plan: "pro",
    keywords: ["volatility", "compression", "expansion", "regime", "range"],
  },
  {
    key: "cross-exchange",
    title: "Cross-exchange divergence",
    where: "Feeds Coin Intel and the market pulse",
    what: "Compares an asset's price on Binance against OKX. A sustained premium on one venue means real demand is concentrated there, faster than arbitrage can close the gap.",
    eli5: "Same coin, two shops, two price tags — a lasting gap tells you where the real buying pressure is.",
    plan: "pro",
    keywords: ["cross exchange", "divergence", "binance", "okx", "premium", "arbitrage"],
  },
  {
    key: "event-risk",
    title: "Event risk radar",
    where: "Ask Flux — try 'what's coming up'",
    what: "Flux actively scans the news for scheduled or credibly imminent market-moving events — rate decisions, major token unlocks, ETF rulings, exchange or protocol incidents — refreshed every few hours.",
    eli5: "Flux keeps one eye on the calendar for things that could shake the market, so you don't have to.",
    plan: "free",
    keywords: ["event risk", "calendar", "fomc", "unlock", "etf", "news", "upcoming"],
  },
  {
    key: "position-sizing",
    title: "Position-size guidance",
    where: "Recommendations list (the scale icon) and Ask Flux",
    what: "Given an opportunity's score, shows a disciplined position-size suggestion derived from EliteFlux's own measured hit rate and win/loss size at that score — half of the mathematically 'full' size, capped, never a guess. On Pro/Elite it also shows your own personal track record once you've logged enough graded calls.",
    eli5: "Instead of guessing how much to put in, it shows you what the actual math says — and keeps it conservative on purpose.",
    plan: "pro",
    keywords: ["position size", "sizing", "kelly", "risk", "how much", "bet size"],
  },
  {
    key: "community-trust",
    title: "Community trust",
    where: "Feeds Coin Intel and the opportunity score",
    what: "When enough EliteFlux users rate an opportunity (thumbs up or down), that rating becomes a small input into the score — catching things the engine's own numbers can't, like a token the community already knows is compromised.",
    eli5: "If enough real users say 'don't trust this one', that opinion counts too, not just the machine's.",
    plan: "free",
    keywords: ["community", "trust", "feedback", "rating", "thumbs up", "thumbs down"],
  },
  {
    key: "track-record",
    title: "Public track record page",
    where: "/track-record",
    what: "A public page showing EliteFlux's own measured accuracy — not a marketing number, the same walk-forward-validated figures the engine calibrates against internally. Anyone can check it, signed in or not.",
    eli5: "The receipts, in public, updated live — you don't have to take our word for any of this.",
    plan: "free",
    keywords: ["track record", "accuracy page", "public", "proof", "verified"],
  },
  {
    key: "trading-conditions",
    title: "Trade / stand-down light",
    where: "The conditions strip on the dashboard (every plan); Coach answers on Operator and Elite",
    what: "A traffic light for whether conditions favour acting at all: GREEN act selectively, AMBER be picky, RED stand down. It comes with the reasons and what would flip it. Free sees the banner on the dashboard but Flux can't discuss it in chat below Operator.",
    eli5: "Green, amber or red — like crossing a road. Red means wait, and waiting is allowed.",
    plan: "free",
    keywords: ["traffic light", "green", "amber", "red", "should i trade", "stop trading"],
  },
  {
    key: "alerts",
    title: "Alerts",
    where: "/alerts",
    what: "Rules you set once that watch the market for you and notify you when something crosses your line — a score level, a price, a sentiment shift, a whale spike or an exit-pressure jump. Free gets in-app alerts, Pro adds email, Elite adds Telegram and webhooks.",
    eli5: "A friend you ask to tap you on the shoulder when something specific happens, so you do not have to keep staring at the screen.",
    plan: "free",
    keywords: ["alerts", "notifications", "telegram", "email", "webhook", "trigger"],
  },
  {
    key: "coach",
    title: "Flux the AI Coach",
    where: "/coach",
    what: "A personal mentor that reads the live intelligence for you, explains it at your chosen experience level, tells you when to trade and when to stand down, grades the calls you log, and answers anything about the platform itself. Free gets 1 message a day and product/account questions only — live market reads and the trade/stand-down verdict need Operator or Elite.",
    eli5: "A patient teacher who reads all the dials for you and says, in plain words, what to do and what to avoid.",
    plan: "free",
    keywords: ["coach", "ai", "mentor", "chat", "assistant", "briefing"],
  },
  {
    key: "journal",
    title: "Call journal & grading",
    where: "Coach workspace, Journal tab",
    what: "Log a view ('I think SOL goes up over 3 days') and EliteFlux grades it later against what actually happened, then shows patterns in your behaviour like chasing or selling into weakness.",
    eli5: "A diary of your guesses that marks its own homework, so you can see which habits cost you money.",
    plan: "pro",
    keywords: ["journal", "calls", "grade", "hit rate", "behaviour", "discipline"],
  },
  {
    key: "portfolio",
    title: "Portfolio",
    where: "/portfolio",
    what: "Connect exchange accounts or paste public wallet addresses (Ethereum/EVM and Solana supported) to see all your holdings in one place, with weights and value. Connections can be locked to read-only so nothing can ever be traded. Bybit, OKX and MEXC connections can be given spot-trading permission for Autopilot; Binance, Gate.io and KuCoin connections here are read-only (Binance specifically can't offer trading permission at all — it requires a whitelisted IP for trading-enabled keys, and EliteFlux has no fixed outbound IP to give it). Wallet tracking also has a guided, app-by-app walkthrough for popular wallet apps like MetaMask, Trust Wallet, Phantom, Coinbase Wallet, Ledger Live and Exodus — it just reads the same public EVM or Solana address either way.",
    eli5: "One page that shows everything you own across your different apps and wallets.",
    plan: "pro",
    keywords: ["portfolio", "holdings", "exchange", "wallet", "binance", "bybit", "okx", "gateio", "kucoin", "mexc", "metamask", "trust wallet", "phantom", "connect"],
  },
  {
    key: "autopilot",
    title: "Autopilot & the autonomy dial",
    where: "/autopilot",
    what: "You choose how much the Coach may do for you: Observe (it only watches), Advise (it suggests), Approve (it prepares actions you tap to approve) and Autopilot (it acts inside the limits you set). Guardrails cap trade size, daily count, minimum conviction and drawdown, plus a kill switch that stops everything instantly. The drawdown guardrail only ever blocks new buys — it never blocks Autopilot's own protective exits or trims, so a bad stretch can't trap you in a losing position. Paper mode lets you run it with no real money. Beyond your guardrails, Autopilot also watches Exit Intelligence on positions you hold: elevated exit pressure alone can trigger a partial trim, and a high exit-pressure reading can trigger a full exit — rotating the position to your stable symbol — even if nothing else about the position looks wrong yet. The most urgent case (High Exit Pressure) is checked every minute, not just every 5 minutes, so a fast-forming exit signal doesn't sit unacted-on. Buy sizing also gets measured-edge Kelly sizing, capped at 10% of your portfolio regardless of edge strength — on accounts under roughly $60, that can land below the exchange's minimum order size, so Autopilot rounds a positive-edge trade up to the minimum instead of skipping it, never past your own max-size-per-trade guardrail. Live execution needs a trading-enabled Bybit, OKX or MEXC connection — Binance can't be used for Autopilot execution since it requires a whitelisted IP for trading keys and EliteFlux has no fixed outbound IP to give it.",
    eli5: "A dial from 'just tell me' to 'do it for me', with a big red stop button you control.",
    plan: "elite",
    keywords: ["autopilot", "autonomy", "automation", "guardrails", "kill switch", "paper mode", "approve"],
  },
  {
    key: "security",
    title: "Security & key safety",
    where: "/security",
    what: "Explains exactly how connection keys are protected, that withdrawal permission is never needed or used, and how to keep an account read-only. Keys are encrypted before storage and never shown back to anyone.",
    eli5: "The page that explains why giving EliteFlux a look-only pass is safe, and how to keep it look-only.",
    plan: "free",
    keywords: ["security", "safety", "keys", "api key", "read only", "withdrawal", "privacy"],
  },
  {
    key: "accuracy",
    title: "Accuracy scoreboard & confidence",
    where: "Behind every read; summarised for the Coach",
    what: "EliteFlux records its own calls and grades them against what really happened at 1h, 4h, 24h and 7 days. Signal families that keep being right get more weight; families that drift get less. Every live read also carries a confidence score.",
    eli5: "The system keeps a report card on itself, and tells you how sure it is this time.",
    plan: "free",
    keywords: ["accuracy", "hit rate", "confidence", "track record", "calibration", "drift", "self-learning"],
  },
  {
    key: "plans",
    title: "Plans & billing",
    where: "/pricing and /account",
    what: "Every account starts with a 7-day free Elite trial. After that, choose Operator or Elite — paid by card through Paystack, billed automatically each cycle until you cancel — or drop to a limited Free plan.",
    eli5: "Try everything free for a week. If you like it, pay by card and it renews itself. If not, you land on a smaller free plan — nothing is ever charged without you choosing to pay.",
    plan: "free",
    keywords: ["pricing", "plan", "upgrade", "billing", "paystack", "card", "subscription", "trial"],
  },
  {
    key: "onboarding",
    title: "Onboarding & experience level",
    where: "First sign-in, and /account",
    what: "You tell EliteFlux your experience level and risk sensitivity. Everything — the Coach's language, the alerts it suggests, the caution in its verdicts — adapts to that setting. You can change it any time.",
    eli5: "You say how much you already know, and the app changes how it talks to you.",
    plan: "free",
    keywords: ["onboarding", "experience level", "beginner", "risk", "settings", "profile"],
  },
  {
    key: "telegram",
    title: "Telegram sign-in and alerts",
    where: "Sign-in page and /account",
    what: "You can create an account or sign in with Telegram in one tap, and on Elite you can receive your alerts straight into Telegram.",
    eli5: "Log in with Telegram instead of a password, and get your nudges there too.",
    plan: "free",
    keywords: ["telegram", "sign in", "login", "signup", "notifications"],
  },
];

// ---------------------------------------------------------------------------
// How-to guides
// ---------------------------------------------------------------------------

export const HOW_TO: HowToDoc[] = [
  {
    key: "connect-exchange",
    title: "Connect an exchange account safely",
    steps: [
      "Open /portfolio and press Connect, then pick your exchange.",
      "In your exchange app, create a new API key. Give it a name you will recognise, like 'EliteFlux read'.",
      "Turn ON read / view permission only. Turn OFF withdrawals. Leave trading OFF unless you intend to use Autopilot later — and note Binance, Gate.io and KuCoin can't be used for Autopilot (Binance requires a whitelisted IP for trading keys, which EliteFlux can't provide; Gate.io and KuCoin are tracking-only here), so use Bybit, OKX or MEXC if you want live execution.",
      "Copy the key and the secret, paste them into the EliteFlux wizard, and save.",
      "Leave the read-only lock switched on in Portfolio. With it on, no trade can ever be placed, even by mistake.",
      "If anything ever feels wrong, delete the key in your exchange app — that instantly cuts the connection.",
    ],
    eli5: "You are making a spare key that can only look at the house, never open the safe, and you can throw it away whenever you like.",
    keywords: ["connect", "exchange", "api key", "binance", "bybit", "okx", "read only", "wizard"],
  },
  {
    key: "connect-wallet",
    title: "Track a wallet without any keys",
    steps: [
      "Open /portfolio and press 'Walk me through it' under Wallet address for a guided, app-by-app walkthrough (MetaMask, Trust Wallet, Phantom, Coinbase Wallet, Ledger Live, Exodus) — or pick the chain and paste an address directly if you already know it.",
      "The chain is Ethereum (and other EVM-compatible addresses) or Solana — supported today. A Bitcoin or other non-EVM/non-Solana address won't be recognized.",
      "Paste your public address (the one you give people to receive funds).",
      "Save. EliteFlux reads balances only — a public address cannot move anything.",
    ],
    eli5: "You are sharing your house number, not your keys. People can see the door, not walk in.",
    keywords: [
      "wallet", "address", "evm", "ethereum", "solana", "bitcoin", "public address", "track", "chain",
      "metamask", "trust wallet", "phantom", "coinbase wallet", "ledger", "exodus",
    ],
  },
  {
    key: "create-alert",
    title: "Create your first alert",
    steps: [
      "Open /alerts and press New alert.",
      "Pick what to watch: a price level, the market score, a sentiment shift, whale activity or exit pressure.",
      "Choose the asset (if the trigger needs one) and the level that matters to you.",
      "Pick where it should reach you. In-app works on every plan; email, Telegram and webhooks unlock on higher plans.",
      "Save. It runs on its own and appears in your alert history when it fires.",
    ],
    eli5: "You are leaving a note that says 'shout if this happens', and the app shouts.",
    keywords: ["alert", "create", "notification", "threshold", "price alert"],
  },
  {
    key: "upgrade",
    title: "Upgrade with a card",
    steps: [
      "Open /pricing and choose the plan and billing cycle.",
      "Click Upgrade — you're redirected to Paystack's secure checkout to enter your card.",
      "After paying, you're sent back to EliteFlux and your plan activates automatically, usually within a few seconds.",
      "Your card is billed again automatically at the start of each cycle. Cancel any time from /account — you keep access until the current period ends.",
    ],
    eli5: "Pick a plan, pay with your card on a secure page, and it turns on by itself. It renews on its own until you tell it to stop.",
    keywords: ["upgrade", "pay", "paystack", "card", "billing", "subscription", "cancel"],
  },
  {
    key: "set-autonomy",
    title: "Set how much the Coach may do for you",
    steps: [
      "Open /autopilot and read the disclosure, then choose your level: Observe, Advise, Approve or Autopilot.",
      "Set your guardrails: maximum size per trade, maximum trades per day, maximum spend per day, minimum conviction and cooldown.",
      "Leave Paper mode on to watch it work with no real money until you trust it.",
      "Arm it. Nothing runs until it is armed.",
      "Use the kill switch at any time to stop everything immediately.",
    ],
    eli5: "You decide how much the helper may do, write down the limits, and keep a big stop button in your hand.",
    keywords: ["autopilot", "autonomy", "arm", "guardrail", "kill switch", "paper"],
  },
  {
    key: "approve-action",
    title: "Approve or reject a proposed action",
    steps: [
      "Proposed actions appear on /autopilot with the asset, the size, the reasoning and a conviction score.",
      "Read the reason. If it does not match your own view, reject it — rejecting is free and teaches the system nothing bad about you.",
      "Approve to let it execute inside your limits. Proposals expire on their own if you do nothing.",
    ],
    eli5: "The helper asks 'may I?', you say yes or no, and silence means no.",
    keywords: ["approve", "reject", "proposal", "pending", "action"],
  },
  {
    key: "link-telegram",
    title: "Sign in with Telegram or get alerts there",
    steps: [
      "On the sign-in page, press Continue with Telegram and confirm in Telegram.",
      "For alerts, open /account and connect Telegram, then choose Telegram as a channel on any alert (Elite plan).",
    ],
    eli5: "Tap once in Telegram instead of remembering a password.",
    keywords: ["telegram", "login", "sign in", "link", "alerts"],
  },
  {
    key: "stay-safe",
    title: "Stay safe with keys",
    steps: [
      "Never enable withdrawal permission on a key you paste anywhere — EliteFlux never needs it.",
      "Keep the read-only lock on in Portfolio unless you deliberately want Autopilot to trade.",
      "Use a separate key for EliteFlux so you can revoke it without affecting anything else.",
      "Keys are encrypted before they are stored and are never displayed back to anyone, including support.",
      "Revoke the key in your exchange app the moment you stop using EliteFlux.",
    ],
    eli5: "Give a look-only pass, keep the pass separate, and take it back whenever you want.",
    keywords: ["safe", "security", "withdrawal", "revoke", "encrypted", "privacy"],
  },
];

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export const PLANS = [
  {
    key: "free",
    name: "Free",
    includes: [
      "Recommendations only — the ranked opportunity list, nothing else on the dashboard",
      "1 Flux the AI Coach message per day",
      "In-app alerts (up to 3)",
    ],
    eli5: "Every new account starts on a 7-day full-Elite trial, not this plan. This is what's left afterward if you don't continue — just the ranked list and one question a day, enough to see there's a real platform here.",
  },
  {
    key: "pro",
    name: "Operator",
    includes: [
      "Everything in Free",
      "Per-asset intelligence, exit pressure, momentum and sentiment, plus your own risk read on each coin",
      "Funding/order-book/social microstructure, stablecoin supply, multi-timeframe confluence, volatility regime and cross-exchange divergence",
      "Disciplined position-size guidance, sub-minute fast-lane alerts (up to 15)",
      "Portfolio connections and the call journal with grading",
      "Email alerts and 30 Flux the AI Coach messages per day",
    ],
    eli5: "You see each coin's own dials, not just the market's, and get told how much to size it. Narrative detection and the Elite Brain flagship score are Elite-only.",
  },
  {
    key: "elite",
    name: "Elite",
    includes: [
      "Everything in Operator, plus every intelligence layer EliteFlux has — nothing held back",
      "The Elite Brain flagship score and regime, and narrative detection (rotation between market themes)",
      "Whale activity, smart money clustering, real on-chain wallet tracking, options market read, macro correlation and deep cognition",
      "Scenario stress-testing on your own holdings",
      "Autopilot with the full autonomy dial and guardrails",
      "Telegram and webhook alerts (up to 100), and 45 Flux the AI Coach messages per day",
    ],
    eli5: "The full cockpit, every layer switched on, plus a helper that can act for you within your rules — and what every new account gets to try free for 7 days.",
  },
] as const;

// ---------------------------------------------------------------------------
// Glossary
// ---------------------------------------------------------------------------

export const GLOSSARY: GlossaryDoc[] = [
  { term: "EliteFlux score", eli5: "One number from 0 to 100 for how friendly the whole market looks right now." },
  { term: "Regime", eli5: "The market's current mood-phase, like 'money moving into big coins' or 'everyone getting cautious'." },
  { term: "Confidence", eli5: "How sure the engine is about today's read. Low confidence means treat it as a hint, not a plan." },
  { term: "Exit pressure", eli5: "How many people look ready to sell. Crowded exits make prices fall faster." },
  { term: "Whale", eli5: "A very large holder whose buying or selling moves the price." },
  { term: "Accumulation", eli5: "Big players quietly buying." },
  { term: "Distribution", eli5: "Big players quietly selling into other people's buying." },
  { term: "Liquidity", eli5: "How easily you can buy or sell without moving the price." },
  { term: "Momentum", eli5: "Whether a price is speeding up or slowing down." },
  { term: "Ignition", eli5: "A quiet coin that looks about to start moving fast." },
  { term: "Narrative", eli5: "The story the crowd is currently excited about, like AI coins or gaming coins." },
  { term: "BTC dominance", eli5: "How much of all crypto money is sitting in Bitcoin. Rising means people want safety." },
  { term: "Volatility", eli5: "How wildly a price swings around." },
  { term: "Drawdown", eli5: "How far you are down from your best point." },
  { term: "Conviction", eli5: "How strongly the engine believes an idea, on a simple scale." },
  { term: "Hit rate", eli5: "Out of all the times a signal said something, how often it turned out right." },
  { term: "Drift", eli5: "A signal that used to work well and has recently stopped working as well." },
  { term: "Stablecoin", eli5: "A crypto coin designed to always stay worth about one dollar." },
  { term: "Auto-renewal", eli5: "Your card is charged automatically at the start of each billing cycle until you cancel." },
  { term: "API key", eli5: "A pass that lets one app read another app. Ours only needs the look-only kind." },
  { term: "Read-only", eli5: "Can look, cannot touch. No trading, no withdrawals." },
  { term: "Paper mode", eli5: "Practice mode. Everything runs, but with pretend money." },
  { term: "Kill switch", eli5: "A single button that stops all automated activity at once." },
  { term: "Guardrail", eli5: "A limit you set that the helper is never allowed to cross." },
  { term: "Invalidation", eli5: "The one thing that, if it happens, proves the current read was wrong." },
  { term: "Horizon", eli5: "How far ahead a call is meant to apply, like the next day or the next week." },
  { term: "Funding rate", eli5: "A fee traders pay each other in perpetual futures. When it's very positive, too many people are betting on the price going up — that's 'crowded long'." },
  { term: "Order book imbalance", eli5: "Whether there's more buying interest or selling interest stacked up right now, just below and above the current price." },
  { term: "Put/call ratio", eli5: "How many traders are betting the price falls (puts) versus rises (calls). A high ratio leans fearful." },
  { term: "Max pain", eli5: "The options price where the most traders would lose the most money if the market settled there today." },
  { term: "Implied volatility", eli5: "How wild options traders expect the price to swing, priced into the options themselves." },
  { term: "Confluence", eli5: "When an asset's short-term and long-term price moves all agree on the same direction." },
  { term: "Macro correlation", eli5: "How closely crypto is currently moving in step with stocks, the dollar or gold." },
  { term: "Kelly criterion", eli5: "A math formula for how much to bet given your real edge. EliteFlux only ever suggests a conservative fraction of it." },
  { term: "Community trust", eli5: "What EliteFlux's own users think of a pick, based on their thumbs up / thumbs down ratings." },
  { term: "Crowd positioning", eli5: "What EliteFlux's own users are actually doing with a coin — accumulating, reducing, watching or avoiding — based on their logged journal calls, not ratings." },
  { term: "Concentration risk", eli5: "Having too much of your portfolio riding on a single asset." },
];

// ---------------------------------------------------------------------------
// What's new
// ---------------------------------------------------------------------------

export const CHANGELOG: ChangeDoc[] = [
  {
    date: "2026-09-21",
    title: "Small accounts can now actually clear Autopilot's minimum order size",
    detail:
      "Kelly sizing (the part of Autopilot that scales a position to the platform's own measured track record) caps itself at 10% of your portfolio no matter how strong the edge is. For any account under roughly $60, 10% lands below the exchange minimum on its own — meaning a genuinely good, measured signal could never actually place a trade, no matter what. Autopilot now rounds a positive-edge proposal up to the minimum order size instead of leaving it stuck below it, capped at whatever your own max-size-per-trade guardrail already allows — it will never bet more than you've told it it's allowed to. This doesn't help every case: if even your own guardrail ceiling can't reach the minimum order size, or the signal's measured edge isn't positive, the trade still correctly won't go through.",
  },
  {
    date: "2026-09-21",
    title: "Autopilot's minimum order size lowered from $10 to $6",
    detail:
      "Every Autopilot buy or sell needs to clear a minimum dollar size before it's placed — otherwise it's rejected before it ever reaches the exchange. That floor was a flat $10 with no real backing; checking the actual exchanges EliteFlux connects to, Bybit's own minimum is $5, so $10 was blocking trades that would have gone through fine. It's now $6, a small buffer above the strictest connected exchange. Note this doesn't help every case — a proposal sized just above the exchange's real minimum (say $5) still won't clear $6, since there's too little room to safely guarantee it won't be rejected at the exchange itself.",
  },
  {
    date: "2026-09-21",
    title: "Autopilot's max trade size can now go up to 40% of your portfolio",
    detail:
      "The ceiling on the \"max size per trade\" guardrail was 25% of your portfolio per position. It's now 40%. This only raises what you're allowed to configure — it doesn't change anyone's actual setting, which stays wherever you already had it (5% by default).",
  },
  {
    date: "2026-09-19",
    title: "Pricing page now states real numbers, not just \"more\"",
    detail:
      "The Operator and Elite plan cards said things like \"a much larger Coach allowance\" and \"the largest Coach allowance\" without ever saying what that actually was. It's now spelled out: Free gets 1 Flux the AI Coach message a day, Operator gets 30, Elite gets 45. Alert caps are stated the same way — Free 3, Operator 15, Elite 100 — instead of being left out entirely on the paid tiers.",
  },
  {
    date: "2026-09-19",
    title: "Autopilot's drawdown limit could block its own protective exits — fixed",
    detail:
      "The drawdown guardrail was meant to stop new buying once your account had drawn down past your set limit, but it was actually checked against every action type — including the exit and trim orders Autopilot itself proposes to cut a losing position. In a real drawdown, that meant the guardrail could silently block the very sell that would have reduced it. It now only ever applies to new buys. Autopilot's fastest exit case — a position hitting High Exit Pressure — is also now checked every minute instead of every 5, so it doesn't sit waiting on the slower cycle.",
  },
  {
    date: "2026-09-19",
    title: "The accuracy self-learning loop is grading calls again",
    detail:
      "The part of EliteFlux that matches its own past calls against what actually happened, so it can weight signal families up or down, had a bug: closing out a large batch of matured calls in one go could silently fail, which left the same weeks-old backlog stuck at the front of the queue instead of the loop ever reaching more recent calls. The accuracy scoreboard and confidence scores kept showing numbers throughout, so this wasn't visible from the outside — but the self-learning part of it had effectively stalled. It's fixed now and confirmed working again; weighting will keep adjusting gradually as newly-graded calls accumulate, not instantly.",
  },
  {
    date: "2026-09-18",
    title: "More exchanges to connect, a steadier market feed, and guided wallet-app tutorials",
    detail:
      "Three more exchanges can now be connected read-only: Gate.io, KuCoin and MEXC, alongside the existing Binance, Bybit and OKX. MEXC also supports Autopilot's trading permission, joining Bybit and OKX (Binance still can't — see the Portfolio note). The background market feed is also more resilient now: it checks two independent exchanges before ever falling back toward Binance, keeping snapshots quick even when one exchange is temporarily unreachable — and Portfolio's own pricing got the same fix, so holdings no longer go unpriced when that happens. Wallet tracking on Portfolio now has a guided, screen-by-screen walkthrough for six popular wallet apps — MetaMask, Trust Wallet, Phantom, Coinbase Wallet, Ledger Live and Exodus — so finding the address to paste is no longer a guessing game.",
  },
  {
    date: "2026-09-18",
    title: "Whale Activity and Volatility now read a few hundred coins, not just the flagship list",
    detail:
      "Whale Activity's overall market score and the Volatility regime read now weigh the highest-volume few hundred coins by trading activity, not only the flagship coins shown in their own tabs. A loud move on a coin outside that flagship list can now move the overall Whale score and gets logged so Flux's own accuracy tracking learns from more of the market. The flagship list is still the only place you get a full per-coin breakdown, order book depth, and on-chain flow.",
  },
  {
    date: "2026-08-20",
    title: "Binance no longer offered for Autopilot trading — read-only only",
    detail:
      "Binance requires a whitelisted IP on any key with Spot & Margin Trading enabled, and won't let you save such a key as Unrestricted. EliteFlux has no fixed outbound IP to give it, so a trading-enabled Binance key could never actually connect — it just failed with a confusing error. The connect flow now only offers read-only for Binance (tracking, coaching, everything except Autopilot execution) and explains why. If you want Autopilot to place trades for you, connect Bybit or OKX instead — neither forces IP restriction on trading keys.",
  },
  {
    date: "2026-08-19",
    title: "Clearer message when an exchange connection is rejected for IP reasons",
    detail:
      "Binance (and others) return one bundled error for a bad key, an IP restriction, or a missing permission, and EliteFlux used to always blame missing read permission. It now recognizes the IP-restriction case and tells you to set the key to Unrestricted access — EliteFlux runs on cloud infrastructure with no fixed outbound IP, so an IP allowlist on the key will always fail here even with reading enabled.",
  },
  {
    date: "2026-08-10",
    title: "EliteFlux now runs on Cloudflare",
    detail:
      "The whole platform moved to Cloudflare's global network, live at elite-flux.com. Faster loads worldwide, same account, same data — nothing you do changes.",
  },
  {
    date: "2026-08-10",
    title: "Autopilot's drawdown safety limit is now real",
    detail:
      "The drawdown guardrail now genuinely tracks your portfolio's high-water mark and can halt new trades if you draw down past your own set limit — it's a live measurement now, not just a number you set.",
  },
  {
    date: "2026-08-10",
    title: "Exit and trim orders reprice at the moment they execute",
    detail:
      "A sell order built from a price that was current when it was proposed, not when it actually executes minutes or hours later, could under- or over-sell. Sell-side sizing now always uses the price at execution time.",
  },
  {
    date: "2026-08-10",
    title: "Position-size math now applies inside Autopilot, not just the dashboard suggestion",
    detail:
      "The same measured-hit-rate sizing shown in Recommendations now also tightens (or, on a measured negative edge, skips) Autopilot's own buy sizing automatically.",
  },
  {
    date: "2026-08-10",
    title: "Confidence readings reflect real data freshness",
    detail:
      "Confidence now genuinely accounts for how old the underlying market read actually is, and clearly flags the (rare) moments a read is built on synthesized rather than real observed history.",
  },
  {
    date: "2026-08-10",
    title: "Whale Activity and Smart Money relabeled honestly",
    detail:
      "Both are built on exchange price/volume patterns, not wallet-address tracking — the feature descriptions and Flux's own answers now say so plainly. Real on-chain wallet tracking is the separate On-Chain feature.",
  },
  {
    date: "2026-08-10",
    title: "Alerts page shows when a delivery actually failed",
    detail:
      "A new Delivery issues panel on /alerts surfaces failed or skipped email, Telegram and webhook sends, so a broken alert channel doesn't just go silently unnoticed.",
  },
  {
    date: "2026-08-10",
    title: "EVM wallet tracking is upfront about its coverage",
    detail:
      "Ethereum/EVM wallets now clearly note that only ETH, USDT and USDC are tracked there — Solana wallets already showed this kind of coverage note for unrecognized tokens.",
  },
  {
    date: "2026-08-09",
    title: "Track wallets, not just exchanges",
    detail:
      "Add a public Ethereum/EVM or Solana address in Portfolio to see its balances alongside your connected exchanges — no keys, nothing that can ever move funds.",
  },
  {
    date: "2026-08-09",
    title: "Autopilot now reacts to exit pressure directly",
    detail:
      "Beyond your guardrails, Autopilot watches Exit Intelligence on positions you hold: elevated pressure can trigger a partial trim, and a high reading can trigger a full exit — even if nothing else about the position looks wrong yet.",
  },
  {
    date: "2026-08-09",
    title: "Early momentum now moves the Recommendations score",
    detail:
      "Momentum Ignition isn't just its own tab anymore — an asset showing early breakout signs now gets a lift in its own Recommendations score too.",
  },
  {
    date: "2026-08-09",
    title: "Flux can see what EliteFlux's users are actually doing",
    detail:
      "Ask about a coin and Flux can now tell you the aggregated accumulate/reduce/watch/avoid lean from other users' logged calls — proprietary data nobody outside EliteFlux has.",
  },
  {
    date: "2026-08-08",
    title: "Nine new intelligence layers",
    detail:
      "The engine now also reads options positioning, macro correlation, multi-timeframe confluence, real on-chain wallet flow, stablecoin mint/burn, volatility compression, cross-exchange divergence, and what other users are rating — all feeding straight into your recommendations and Coach answers.",
  },
  {
    date: "2026-08-08",
    title: "Position-size guidance, not guesswork",
    detail:
      "Every high-scoring opportunity can now show a disciplined position-size suggestion, built from EliteFlux's own measured hit rate — capped and conservative on purpose. Pro/Elite also see their own personal track record once they've logged enough graded calls.",
  },
  {
    date: "2026-08-08",
    title: "Flux now watches the calendar too",
    detail:
      "Ask Flux 'what's coming up' — it actively scans for FOMC dates, major unlocks, ETF rulings and other market-moving events, refreshed every few hours.",
  },
  {
    date: "2026-08-08",
    title: "Card payments with Paystack",
    detail: "Upgrades now go through Paystack's secure checkout and renew automatically each cycle — no more manual crypto transfers.",
  },
  {
    date: "2026-08-07",
    title: "Flux now knows the whole platform",
    detail:
      "The Coach can explain any EliteFlux feature, walk you through connecting accounts, see your own setup (plan, alerts, portfolio, autopilot) and report how accurate the engine has actually been.",
  },
  {
    date: "2026-08-05",
    title: "Self-learning accuracy loop",
    detail:
      "EliteFlux now grades its own reads at 1h, 4h, 24h and 7 days, gives more weight to the signals that keep being right, and shows a confidence score on every read.",
  },
  {
    date: "2026-08-02",
    title: "Sign in with Telegram",
    detail: "You can create an account or sign in with one tap in Telegram, and Elite members can receive alerts there.",
  },
  {
    date: "2026-07-26",
    title: "Tell me when to stop",
    detail: "Every action question now answers with a green / amber / red condition light, including when the best move is no move.",
  },
  {
    date: "2026-07-20",
    title: "Guided connection wizard",
    detail: "Step-by-step help for connecting an exchange or wallet read-only, with plain-language explanations of every term.",
  },
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export interface KnowledgeHit {
  kind: "feature" | "how_to" | "glossary" | "plan";
  title: string;
  body: string;
  eli5: string;
  where?: string;
  plan?: string;
}

function score(haystack: string[], needle: string): number {
  const q = needle.toLowerCase().trim();
  if (!q) return 0;
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  let s = 0;
  for (const h of haystack) {
    const t = h.toLowerCase();
    if (t === q) s += 10;
    if (t.includes(q)) s += 5;
    for (const w of words) if (t.includes(w)) s += 1;
  }
  return s;
}

/** Keyword search across features, how-tos, glossary and plans. */
export function searchKnowledge(query: string, limit = 5): KnowledgeHit[] {
  const hits: { hit: KnowledgeHit; s: number }[] = [];

  for (const f of FEATURES) {
    const s = score([f.title, f.key, f.what, ...f.keywords], query);
    if (s > 0)
      hits.push({
        s,
        hit: { kind: "feature", title: f.title, body: f.what, eli5: f.eli5, where: f.where, plan: f.plan },
      });
  }
  for (const h of HOW_TO) {
    const s = score([h.title, h.key, ...h.steps, ...h.keywords], query);
    if (s > 0)
      hits.push({
        s,
        hit: { kind: "how_to", title: h.title, body: h.steps.map((x, i) => `${i + 1}. ${x}`).join(" "), eli5: h.eli5 },
      });
  }
  for (const g of GLOSSARY) {
    const s = score([g.term, g.eli5, ...(g.keywords ?? [])], query);
    if (s > 0) hits.push({ s, hit: { kind: "glossary", title: g.term, body: g.eli5, eli5: g.eli5 } });
  }
  for (const p of PLANS) {
    const s = score([p.name, p.key, ...p.includes], query);
    if (s > 0)
      hits.push({ s, hit: { kind: "plan", title: `${p.name} plan`, body: p.includes.join("; "), eli5: p.eli5, plan: p.key } });
  }

  return hits
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.hit);
}

/** Everything the platform can do, condensed — used when nothing matches. */
export function knowledgeOverview() {
  return {
    product:
      "EliteFlux is a crypto market intelligence platform: it fuses whale flow, smart money, derivatives, options, real on-chain wallets, macro correlation, multi-timeframe confluence and more into one live read, tells you when conditions favour acting and when to stand down, watches your assets with alerts, tracks your holdings, suggests disciplined position sizes, grades your decisions, and can act inside limits you set — with every claim checkable against a public, measured track record.",
    features: FEATURES.map((f) => ({ title: f.title, where: f.where, what: f.what, plan: f.plan })),
    howTo: HOW_TO.map((h) => h.title),
    plans: PLANS.map((p) => ({ name: p.name, includes: p.includes })),
  };
}
