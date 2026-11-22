"use client";

import { ChevronRight, Minus, Moon, Phone, Sun } from "lucide-react";
import Link from "next/link";
import { useNow, useTanod } from "@/hooks/use-live";
import { FIELD_RESULT, FIELD_STATUS, SHIFT, type DutyShift, type Lang } from "@/lib/domain";
import { addDays, manilaDate, shiftWindow, weekStart } from "@/lib/duty";
import { dur, fmtDate, rel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTL } from "./lang";
import { FieldChip } from "./ui";

const SHIFT_ICON = { day: Sun, night: Moon } as const;
const SHIFT_TONE = { day: "bg-gold-soft text-[#7a4c00]", night: "bg-fill text-foreground/75" } as const;
/** The roster window the server sends: this week and the next two. */
const WEEKS = 3;

type Timed = DutyShift & { start: number; end: number };

/** Noon in Manila on a YYYY-MM-DD date, for formatting the date itself. */
const noon = (date: string) => Date.parse(`${date}T04:00:00Z`);

function ShiftIcon({ shift, className }: { shift: DutyShift["shift"]; className?: string }) {
  const Icon = SHIFT_ICON[shift];
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-xl", SHIFT_TONE[shift], className)} aria-hidden>
      <Icon className="size-[55%]" />
    </span>
  );
}

/** What a tanod needs first: the shift they're on, or the next one and how soon. */
function NextShift({ current, next, today, lang, now }: { current?: Timed; next?: Timed; today: string; lang: Lang; now: number }) {
  const { t } = useTL();
  const shift = current ?? next;
  if (!shift) return <p className="rounded-[24px] bg-fill px-6 py-8 text-center text-[14.5px] text-muted-foreground">{t("sched.none")}</p>;
  const day = shift.date === today
    ? t("sched.today")
    : shift.date === addDays(today, 1)
      ? t("sched.tomorrow")
      : fmtDate(noon(shift.date), lang, { weekday: "long", month: "short", day: "numeric" });
  return (
    <section aria-labelledby="shift-summary" className="rounded-[20px] bg-card p-4 shadow-sheet">
      <div className="flex items-start gap-3">
        <ShiftIcon shift={shift.shift} className="size-10" />
        <div className="min-w-0">
          <h2 id="shift-summary" className="text-[13px] font-bold text-brand-deep">{t(current ? "sched.current" : "sched.next")}</h2>
          <p className="mt-0.5 text-[16px] leading-snug font-bold">
            {SHIFT[shift.shift][lang]} <span className="font-normal text-muted-foreground">· {SHIFT[shift.shift].label}</span>
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {(!current || shift.date !== today) && <>{day} · </>}
            {t(current ? "sched.endsIn" : "sched.startsIn", { when: rel(current ? shift.end : shift.start, lang, now) })}
          </p>
        </div>
      </div>
      {current && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-fill" aria-hidden>
          <div className="h-full rounded-full bg-primary/75" style={{ width: `${((now - current.start) / (current.end - current.start)) * 100}%` }} />
        </div>
      )}
    </section>
  );
}

export function TanodSchedule() {
  const { data } = useTanod();
  const { t, lang } = useTL();
  const now = useNow(60_000);
  if (!data?.me) return null;
  const today = manilaDate(now);
  const timed: Timed[] = data.shifts.map((s) => ({ ...s, ...shiftWindow(s.date, s.shift) }));
  const current = timed.find((s) => s.start <= now && now < s.end);
  const next = timed.filter((s) => s.start > now).sort((a, b) => a.start - b.start)[0];
  const monday = weekStart(today);
  const weeks = Array.from({ length: WEEKS }, (_, w) => {
    const days = Array.from({ length: 7 }, (_, d) => addDays(monday, w * 7 + d));
    return { days, shifts: timed.filter((s) => s.date >= days[0] && s.date <= days[6]) };
  });
  const hall = `tel:${data.settings.hotline.replace(/[^\d+]/g, "")}`;

  return (
    <div className="grid gap-6">
      <h1 className="text-[26px] font-bold tracking-tight">{t("sched.title")}</h1>
      <NextShift current={current} next={next} today={today} lang={lang} now={now} />

      {weeks.map(({ days, shifts }, w) => {
        const hours = shifts.reduce((sum, s) => sum + SHIFT[s.shift].hours, 0);
        const range = `${fmtDate(noon(days[0]), lang, { month: "short", day: "numeric" })} – ${fmtDate(noon(days[6]), lang, { month: "short", day: "numeric" })}`;
        return (
          <section key={days[0]} className="grid gap-2.5" aria-labelledby={`week-${days[0]}`}>
            <div className="flex items-end justify-between gap-3 px-1">
              <div className="min-w-0">
                <h2 id={`week-${days[0]}`} className="text-[17px] leading-snug font-bold">
                  {t(w === 0 ? "sched.thisWeek" : w === 1 ? "sched.nextWeek" : "sched.followingWeek")}
                </h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{range}</p>
              </div>
              {shifts.length > 0 && (
                <p className="shrink-0 text-right text-[12px] font-semibold text-muted-foreground tabular">
                  {t(shifts.length === 1 ? "sched.weekOne" : "sched.week", { n: shifts.length, h: hours })}
                </p>
              )}
            </div>
            {shifts.length ? (
              <ol className="divide-y divide-hairline overflow-hidden rounded-[20px] bg-card shadow-sheet">
                {days.map((date) => {
                  const own = shifts.filter((s) => s.date === date);
                  const isToday = date === today;
                  return (
                    <li key={date} aria-current={isToday ? "date" : undefined} className={cn("grid min-h-14 grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 px-3.5 py-2.5 sm:px-4", isToday && "bg-brand-soft/55")}>
                      <time dateTime={date} className={cn("grid justify-items-center gap-0.5 leading-none", isToday && "text-brand-deep")}>
                        <span className={cn("text-[11px] font-bold", !isToday && "text-muted-foreground")}>
                          {isToday ? t("sched.todayShort") : fmtDate(noon(date), lang, { weekday: "short" })}
                        </span>
                        <span className="text-[17px] font-bold tabular">{fmtDate(noon(date), lang, { day: "numeric" })}</span>
                      </time>
                      <div className="grid min-w-0 gap-2.5">
                        {own.length ? (
                          own.map((s) => {
                            const status = s === current ? "live" : s === next ? "next" : s.end <= now ? "done" : null;
                            return (
                              <div key={s.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                                <ShiftIcon shift={s.shift} className="size-7 rounded-lg" />
                                <div className="min-w-0 leading-tight">
                                  <p className={cn("text-[14px] font-bold", status === "done" && "text-muted-foreground")}>{SHIFT[s.shift][lang]}</p>
                                  <p className="mt-0.5 text-[12px] text-muted-foreground tabular">{SHIFT[s.shift].label}</p>
                                </div>
                                {status && (
                                  <span className={cn("flex items-center gap-1.5 text-right text-[11.5px] font-bold", status === "done" ? "text-muted-foreground" : "text-brand-deep")}>
                                    {status === "live" && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
                                    {t(status === "live" ? "sched.live" : status === "next" ? "sched.upNext" : "sched.done")}
                                  </span>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="grid size-7 shrink-0 place-items-center" aria-hidden><Minus className="size-3.5" /></span>
                            <span className="text-[14px]">{t("sched.off")}</span>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="rounded-[24px] bg-fill px-5 py-4 text-[14px] text-muted-foreground">{t("sched.unpublished")}</p>
            )}
          </section>
        );
      })}

      <section className="flex flex-wrap items-center gap-3 rounded-[24px] bg-fill p-4">
        <p className="min-w-[200px] flex-1 text-[13.5px] text-muted-foreground">{t("sched.note")}</p>
        <a href={hall} className="inline-flex h-11 items-center gap-2 rounded-full bg-card px-4 text-[14px] font-semibold shadow-sheet">
          <Phone className="size-4 text-primary" /> {t("sched.callHall")}
        </a>
      </section>
    </div>
  );
}

export function TanodHistory() {
  const { data } = useTanod();
  const { t, lang } = useTL();
  const now = useNow(60_000);
  if (!data?.me) return null;
  const closed = data.assignments.filter((a) => !FIELD_STATUS[a.status].open).sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">{t("hist.title")}</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">{t("hist.sub")}</p>
      </div>
      {closed.length ? (
        <ul className="overflow-hidden rounded-[24px] bg-card shadow-sheet">
          {closed.map((a) => (
            <li key={a.id} className="border-b border-hairline last:border-0">
              <Link href={`/tanod/a/${a.id}`} className="flex items-center gap-3 px-4 py-3.5 transition active:bg-fill/60">
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-3">
                    <span className="shrink-0 font-mono whitespace-nowrap">{a.case.ref}</span>
                    <span className="truncate">{rel(a.closedAt ?? a.assignedAt, lang, now)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[15px] font-semibold">{a.case.text}</span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">
                    {a.result ? FIELD_RESULT[a.result][lang] : (a.closeReason ?? "")}
                    {a.status === "done" && a.arrivedAt && a.closedAt && ` · ${t("hist.onScene", { dur: dur(a.closedAt - a.arrivedAt) })}`}
                  </span>
                </span>
                <FieldChip status={a.status} className="h-6 px-2.5 text-[11.5px]" />
                <ChevronRight className="size-4 shrink-0 text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[24px] bg-fill px-6 py-10 text-center text-[14.5px] text-muted-foreground">{t("hist.empty")}</p>
      )}
    </div>
  );
}
