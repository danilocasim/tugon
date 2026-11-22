"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/domain";
import { translate, type Key } from "./i18n";

interface LangValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
}

const LangContext = createContext<LangValue | null>(null);
const STORAGE = "tugon.tanod.lang";

/** Filipino by default; the choice stays on this device. */
export function TanodLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fil");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE);
    if (stored === "en" || stored === "fil") setLangState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "fil" ? "fil" : "en";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE, l);
  }, []);

  const t = useCallback((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useTL() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useTL must be used inside <TanodLangProvider>");
  return ctx;
}
