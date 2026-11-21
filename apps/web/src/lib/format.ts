import type { Lang } from "./domain";

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

const LOCALE: Record<Lang, string> = { fil: "fil-PH", en: "en-PH" };

export function fmtDate(ts: number, lang: Lang = "en", opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) {
  return new Intl.DateTimeFormat(LOCALE[lang], { timeZone: "Asia/Manila", ...opts }).format(ts);
}

/** "12 minutes ago" / "12 minuto ang nakalipas". */
export function rel(ts: number, lang: Lang = "en", now = Date.now()) {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: "auto" });
  if (abs < MIN) return lang === "fil" ? "ngayon lang" : "just now";
  if (abs < HOUR) return rtf.format(Math.round(diff / MIN), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
  // Calendar days in Manila, so Monday 9 AM seen on Saturday night reads "in 2 days", not "tomorrow".
  const manilaDay = (t: number) => Math.floor((t + 8 * HOUR) / DAY);
  if (abs < 7 * DAY) return rtf.format(manilaDay(ts) - manilaDay(now), "day");
  return fmtDate(ts, lang, { month: "short", day: "numeric" });
}

/** Compact operational duration: "48m", "3h 05m", "2d 4h". */
export function dur(ms: number) {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user[0]}${"•".repeat(Math.max(2, Math.min(5, user.length - 1)))}@${domain}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((p) => /^[A-Za-z]/.test(p) && !p.endsWith("."))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

export function greeting(lang: Lang, now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-PH", { hour: "numeric", hour12: false, timeZone: "Asia/Manila" }).format(now));
  if (lang === "en") return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return h < 12 ? "Magandang umaga" : h < 18 ? "Magandang hapon" : "Magandang gabi";
}
