// Drop-in replacement for @streamdown/code's "shiki" plugin.
//
// @streamdown/code imports the full "shiki" package (createHighlighter +
// bundledLanguages), which statically bundles every language Shiki knows —
// about 180 of them — because it has to resolve any runtime language string
// against that catalog. On a Cloudflare Worker that whole catalog gets
// inlined into the single server script and blew the Worker past
// Cloudflare's size limit. This implements the same
// `CodeHighlighterPlugin` contract Streamdown expects, but backed by the
// curated, small language set in `@/lib/shiki-highlighter` — anything
// outside that set renders as plain, unhighlighted text instead of failing.
import {
  getHighlighter,
  isSupportedLanguage,
  resolveLanguage,
  SUPPORTED_LANGUAGES,
} from "@/lib/shiki-highlighter";
import type { ComponentProps } from "react";
import type { BundledLanguage, BundledTheme, ThemeRegistrationAny } from "shiki";
import type { Streamdown } from "streamdown";

type ThemeInput = BundledTheme | ThemeRegistrationAny;
type PluginConfig = NonNullable<ComponentProps<typeof Streamdown>["plugins"]>;
type CodeHighlighterPlugin = NonNullable<PluginConfig["code"]>;
type HighlightResult = ReturnType<CodeHighlighterPlugin["highlight"]>;

const THEMES: [ThemeInput, ThemeInput] = ["github-light", "github-dark"];

const themeName = (theme: ThemeInput) =>
  typeof theme === "string" ? theme : (theme.name ?? "custom");

const resultCache = new Map<string, NonNullable<HighlightResult>>();
const pendingSubscribers = new Map<
  string,
  Set<(result: NonNullable<HighlightResult>) => void>
>();

const cacheKey = (code: string, language: string, themes: [ThemeInput, ThemeInput]) => {
  const start = code.slice(0, 100);
  const end = code.length > 100 ? code.slice(-100) : "";
  return `${language}:${themeName(themes[0])}:${themeName(themes[1])}:${code.length}:${start}:${end}`;
};

export const curatedCodePlugin: CodeHighlighterPlugin = {
  name: "shiki",
  type: "code-highlighter",
  getSupportedLanguages: () => SUPPORTED_LANGUAGES,
  getThemes: () => THEMES,
  supportsLanguage: (language: BundledLanguage) => isSupportedLanguage(language),
  highlight: (options, callback) => {
    const { code, language, themes } = options;
    const key = cacheKey(code, language, themes);

    const cached = resultCache.get(key);
    if (cached) {
      return cached;
    }

    if (callback) {
      if (!pendingSubscribers.has(key)) {
        pendingSubscribers.set(key, new Set());
      }
      pendingSubscribers.get(key)?.add(callback);
    }

    const resolved = resolveLanguage(language);
    const langToRequest = isSupportedLanguage(resolved) ? resolved : "text";

    getHighlighter(langToRequest)
      // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then)
      .then((highlighter) => {
        const loaded = highlighter.getLoadedLanguages();
        const langToUse = loaded.includes(langToRequest) ? langToRequest : "text";

        const tokenized = highlighter.codeToTokens(code, {
          lang: langToUse as BundledLanguage,
          themes: { light: themeName(themes[0]), dark: themeName(themes[1]) },
        });

        const result = {
          bg: tokenized.bg,
          fg: tokenized.fg,
          rootStyle: tokenized.rootStyle,
          tokens: tokenized.tokens,
        } as NonNullable<HighlightResult>;

        resultCache.set(key, result);

        const subs = pendingSubscribers.get(key);
        if (subs) {
          for (const sub of subs) {
            sub(result);
          }
          pendingSubscribers.delete(key);
        }
      })
      // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then), eslint-plugin-promise(prefer-await-to-callbacks)
      .catch((error) => {
        console.error("[EliteFlux] Failed to highlight code:", error);
        pendingSubscribers.delete(key);
      });

    return null;
  },
};
