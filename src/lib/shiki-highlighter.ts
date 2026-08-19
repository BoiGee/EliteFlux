// Shared curated Shiki setup for the two places EliteFlux highlights code
// client-side: the tool-call JSON viewer (code-block.tsx) and the AI coach's
// markdown code fences (code-highlighter-plugin.ts).
//
// Shiki's convenience `createHighlighter` (from the top-level "shiki"
// package) statically pulls in every bundled language and theme it knows —
// about 180 languages — because it has to be able to resolve any runtime
// language string. On a Cloudflare Worker that whole catalog gets inlined
// into the single server script (there's no separate lazy-loaded chunk the
// way a browser build would have), which alone pushed the Worker past
// Cloudflare's size limit. This loads only a fixed, curated set of languages
// through `createHighlighterCore` instead — anything outside that set falls
// back to plain, unhighlighted text.
import type { BundledLanguage, BundledTheme, HighlighterGeneric } from "shiki";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

const LANG_LOADERS: Record<string, () => Promise<unknown>> = {
  javascript: () => import("@shikijs/langs/javascript"),
  jsx: () => import("@shikijs/langs/jsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  python: () => import("@shikijs/langs/python"),
  bash: () => import("@shikijs/langs/bash"),
  shell: () => import("@shikijs/langs/shell"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
  yaml: () => import("@shikijs/langs/yaml"),
  markdown: () => import("@shikijs/langs/markdown"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  diff: () => import("@shikijs/langs/diff"),
  toml: () => import("@shikijs/langs/toml"),
  rust: () => import("@shikijs/langs/rust"),
  go: () => import("@shikijs/langs/go"),
  solidity: () => import("@shikijs/langs/solidity"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
};

/** Short forms authors commonly type in fenced code blocks. */
const LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  rs: "rust",
  dockerfile: "dockerfile",
};

export const SUPPORTED_LANGUAGES = Object.keys(LANG_LOADERS) as BundledLanguage[];

export const resolveLanguage = (language: string): string => {
  const normalized = language.trim().toLowerCase();
  return LANG_ALIASES[normalized] ?? normalized;
};

export const isSupportedLanguage = (language: string): boolean =>
  resolveLanguage(language) in LANG_LOADERS;

// Shared by every language's highlighter instance so the wasm regex engine
// is only instantiated once.
const enginePromise = createOnigurumaEngine(import("shiki/wasm"));

const highlighterCache = new Map<
  string,
  Promise<HighlighterGeneric<BundledLanguage, BundledTheme>>
>();

export const getHighlighter = (
  language: string
): Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> => {
  const resolved = resolveLanguage(language);
  const cached = highlighterCache.get(resolved);
  if (cached) {
    return cached;
  }

  const loadLang = LANG_LOADERS[resolved];

  const highlighterPromise = createHighlighterCore({
    langs: loadLang ? [loadLang() as never] : [],
    themes: [githubLight, githubDark],
    engine: enginePromise,
  }) as unknown as Promise<HighlighterGeneric<BundledLanguage, BundledTheme>>;

  highlighterCache.set(resolved, highlighterPromise);
  return highlighterPromise;
};
