"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { Lang } from "@/lib/domain";
import { translate, type Key } from "./i18n";

interface LangValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
}

const LangContext = createContext<LangValue | null>(null);
const STORAGE = "tugon.tanod.lang";
const UPDATE = "tugon:tanod-language";
const getLanguage = (): Lang => localStorage.getItem(STORAGE) === "en" ? "en" : "fil";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(UPDATE, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(UPDATE, callback);
  };
}

/** Filipino by default; the choice stays on this device. */
export function TanodLangProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getLanguage, () => "fil" as Lang);

  useEffect(() => {
    document.documentElement.lang = lang === "fil" ? "fil" : "en";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE, l);
    window.dispatchEvent(new Event(UPDATE));
  }, []);

  const t = useCallback((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useTL() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useTL must be used inside <TanodLangProvider>");
  return ctx;
}
