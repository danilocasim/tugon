/** Tanod duty math. Shifts are Manila wall-clock times; Manila has no daylight saving. */
import { SHIFT, type DutyShift, type Shift } from "./domain";
import { DAY, HOUR } from "./format";

const MANILA = 8 * HOUR;

/** Manila calendar date (YYYY-MM-DD) for an instant. */
export const manilaDate = (ts: number) => new Date(ts + MANILA).toISOString().slice(0, 10);

/** Add whole days to a YYYY-MM-DD date. */
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

export const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export function shiftWindow(date: string, shift: Shift) {
  const start = Date.parse(`${date}T00:00:00Z`) - MANILA + SHIFT[shift].startHour * HOUR;
  return { start, end: start + SHIFT[shift].hours * HOUR };
}

/** The shift slot covering an instant: before 6 AM still belongs to the previous date's night. */
export function slotAt(ts: number): { date: string; shift: Shift } {
  const hour = new Date(ts + MANILA).getUTCHours();
  const today = manilaDate(ts);
  if (hour < SHIFT.day.startHour) return { date: addDays(today, -1), shift: "night" };
  return { date: today, shift: hour < SHIFT.night.startHour ? "day" : "night" };
}

export function isOnDuty(s: Pick<DutyShift, "date" | "shift">, now: number) {
  const w = shiftWindow(s.date, s.shift);
  return w.start <= now && now < w.end;
}

/** Monday of the Manila week containing a date. */
export function weekStart(date: string) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

/** Accepts 09XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX with any spacing; returns 09XXXXXXXXX or null. */
export function normalizeMobile(v: unknown) {
  const digits = String(v ?? "").replace(/[^\d]/g, "");
  const local = digits.startsWith("63") ? `0${digits.slice(2)}` : digits;
  return /^09\d{9}$/.test(local) ? local : null;
}

export const formatMobile = (v: string | null | undefined) => (v && /^09\d{9}$/.test(v) ? `${v.slice(0, 4)} ${v.slice(4, 7)} ${v.slice(7)}` : (v ?? ""));
