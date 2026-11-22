"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/domain";
import { useResident } from "@/hooks/use-live";
import { updateResidentPrefs } from "@/server/actions";
import { translate, type Key } from "./i18n";

export type Translate = (key: Key, vars?: Record<string, string | number>) => string;

interface LangValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translate;
}

const LangContext = createContext<LangValue | null>(null);

/** Signed-in residents keep their saved language; guests keep a device preference. */
export function LangProvider({ children }: { children: ReactNode }) {
  const { data, refresh } = useResident();
  const saved = data?.me?.lang;
  const [lang, setLangState] = useState<Lang>("fil");

  useEffect(() => {
    const stored = localStorage.getItem("tugon.lang");
    if (saved) setLangState(saved);
    else if (stored === "en" || stored === "fil") setLangState(stored);
  }, [saved]);

  useEffect(() => {
    document.documentElement.lang = lang === "fil" ? "fil" : "en";
  }, [lang]);

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      localStorage.setItem("tugon.lang", l);
      if (saved) void updateResidentPrefs({ lang: l }).then(refresh);
    },
    [saved, refresh],
  );

  const t = useCallback((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useT() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useT must be used inside <LangProvider>");
  return ctx;
}
