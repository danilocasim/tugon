"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Lang } from "@/lib/domain";
import { useResident } from "@/hooks/use-live";
import { updateResidentLanguage } from "@/server/resident-auth";
import { translate, type Key } from "./i18n";

export type Translate = (key: Key, vars?: Record<string, string | number>) => string;

interface LangValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translate;
}

const LangContext = createContext<LangValue | null>(null);
const STORAGE_KEY = "tugon.lang";
const LANGUAGE_EVENT = "tugon:resident-language";
const guestLanguage = (): Lang => window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "fil";
const initialLanguage = (): Lang => "fil";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(LANGUAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LANGUAGE_EVENT, callback);
  };
}

/** Signed-in residents keep their saved language; guests keep a device preference. */
export function LangProvider({ children }: { children: ReactNode }) {
  const { data, refresh } = useResident();
  const saved = data?.me?.lang;
  const stored = useSyncExternalStore(subscribe, guestLanguage, initialLanguage);
  const [choice, setChoice] = useState<{ before: Lang; lang: Lang }>();
  const lang = (choice?.before === saved ? choice?.lang : undefined) ?? saved ?? stored;

  useEffect(() => {
    document.documentElement.lang = lang === "fil" ? "fil" : "en";
  }, [lang]);

  const setLang = useCallback(
    (l: Lang) => {
      window.localStorage.setItem(STORAGE_KEY, l);
      window.dispatchEvent(new Event(LANGUAGE_EVENT));
      if (saved && saved !== l) {
        setChoice({ before: saved, lang: l });
        void updateResidentLanguage(l).then((result) => result.ok ? refresh() : setChoice(undefined));
      }
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
