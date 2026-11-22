"use client";

/**
 * Staff portal language. Copy is written in English in the components; `t`
 * looks the English text up in the Filipino dictionary (`./fil`) when the user
 * picked Filipino, falling back to English for anything not yet translated.
 * `{name}` placeholders are filled from `vars`. The choice is per device.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/domain";
import { FIL } from "./fil";

const KEY = "tugon.staff.lang";
const listeners = new Set<() => void>();

const read = (): Lang => (localStorage.getItem(KEY) === "fil" ? "fil" : "en");

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function setStaffLang(lang: Lang) {
  localStorage.setItem(KEY, lang);
  for (const l of listeners) l();
}

export type Vars = Record<string, string | number>;

export function translate(lang: Lang, message: string, vars?: Vars) {
  const text = lang === "fil" ? (FIL[message] ?? message) : message;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

// Dictionary keys with placeholders, as anchored patterns, for messages the server builds itself.
const PATTERNS = Object.entries(FIL)
  .filter(([k]) => k.includes("{"))
  .map(([k, v]) => ({ re: new RegExp(`^${k.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, "(?<$1>.+?)")}$`), v }));

/**
 * Toast text from `useAct`: success copy and server messages. Server messages
 * may be interpolated ("Outcome needs at least 10 characters."), so after an
 * exact lookup this matches placeholder keys and translates the filled-in parts.
 */
export function localizeMessage(lang: Lang, message: string) {
  if (lang !== "fil" || FIL[message]) return translate(lang, message);
  for (const { re, v } of PATTERNS) {
    const groups = re.exec(message)?.groups;
    if (groups) return v.replace(/\{(\w+)\}/g, (m, k: string) => (k in groups ? (FIL[groups[k]] ?? groups[k]) : m));
  }
  return message;
}

export function useStaffLang() {
  const lang = useSyncExternalStore(subscribe, read, () => "en" as Lang);
  const t = useCallback((message: string, vars?: Vars) => translate(lang, message, vars), [lang]);
  const localize = useCallback((message: string) => localizeMessage(lang, message), [lang]);
  return { lang, t, localize };
}
