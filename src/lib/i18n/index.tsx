"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setDateLocale } from "@/lib/hr/rules";
import { MS_COMMON } from "./ms-common";
import { MS_HR } from "./ms-hr";
import { MS_HR_ADMIN } from "./ms-hr-admin";
import { MS_LOGISTICS } from "./ms-logistics";

export type Lang = "en" | "ms";
const KEY = "cssb-lang";

/** English text is the key. Anything not in the dictionary simply stays in English. */
const MS: Record<string, string> = { ...MS_COMMON, ...MS_HR, ...MS_HR_ADMIN, ...MS_LOGISTICS };

export type Vars = Record<string, string | number>;
/** Messages built elsewhere in English ("Sent to Ali for approval.") are matched against dictionary keys that have {holes}. */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATTERNS: { re: RegExp; ms: string; names: string[] }[] = Object.keys(MS).filter((k) => k.includes("{")).map((k) => {
  const names: string[] = [];
  const src = k.split(/\{(\w+)\}/).map((part, i) => (i % 2 ? (names.push(part), "(.+?)") : esc(part))).join("");
  return { re: new RegExp(`^${src}$`), ms: MS[k], names };
});
const viaPattern = (en: string) => {
  for (const p of PATTERNS) { const m = p.re.exec(en); if (m) return fill(p.ms, Object.fromEntries(p.names.map((n, i) => [n, MS[m[i + 1]] ?? m[i + 1]]))); }
  return en;
};
const fill = (s: string, v?: Vars) => (v ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m)) : s);

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (en: string, vars?: Vars) => string; locale: string };
const I18n = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (en, v) => fill(en, v), locale: "en-MY" });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    // Read the saved choice after hydration so the server and browser render the same first page.
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "ms") setLangState("ms");
    } catch {}
  }, []);
  useEffect(() => { document.documentElement.lang = lang === "ms" ? "ms" : "en"; }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch {}
  }, []);
  const t = useCallback((en: string, vars?: Vars) => fill(lang === "ms" ? (MS[en] ?? viaPattern(en)) : en, vars), [lang]);
  // set before the screens below draw, so every date they format uses the chosen language
  setDateLocale(dateLocale(lang));
  const value = useMemo(() => ({ lang, setLang, t, locale: dateLocale(lang) }), [lang, setLang, t]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export const useT = () => useContext(I18n);

/** Month and weekday names follow the chosen language. */
function dateLocale(lang: Lang) { return lang === "ms" ? "ms-MY" : "en-MY"; }
