"use client";

import { ChevronLeft, ChevronRight, Copy, Loader2, Moon, Phone, Plus, ShieldUser, Sun, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAct, useNow, useStaff } from "@/hooks/use-live";
import { SHIFT, SHIFTS, type DutyShift, type Shift, type Staff } from "@/lib/domain";
import { addDays, formatMobile, manilaDate, slotAt, weekStart } from "@/lib/duty";
import { dur, fmtDate, rel } from "@/lib/format";
import { PUROKS, PUROK_NAME } from "@/lib/geo";
import { canAccess, canManageTanods } from "@/lib/policy";
import { cn } from "@/lib/utils";
import { addTanod, copyPreviousWeek, setDuty, setStaffActive } from "@/server/actions";
import { CallTanod, FieldStatusPill, dutyLabel, isOpenField, tanodBoard } from "./field";
import { useStaffLang } from "./i18n";
import { Avatar, Empty, NoAccess, PageHeader } from "./ui";

const SHIFT_ICON = { day: Sun, night: Moon } as const;
const SHIFT_ON: Record<Shift, string> = { day: "bg-gold-soft text-[#7a4c00]", night: "bg-[#26314d] text-white" };

function AddTanodDialog() {
  const { act, pending } = useAct();
  const { t } = useStaffLang();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [zone, setZone] = useState("P1");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[13.5px] font-bold text-primary-foreground shadow-press">
          <UserPlus className="size-4" /> {t("Add tanod")}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Add a tanod")}</DialogTitle>
          <DialogDescription>{t("They sign in to the Tanod app with this mobile number and a one-time code. Put them on the roster next.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold">{t("Full name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="field h-11 rounded-xl px-3.5 text-[14px]" autoComplete="off" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold">{t("Mobile number")}</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0917 123 4567" className="field h-11 rounded-xl px-3.5 text-[14px] tabular" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold">{t("Usual purok")}</span>
            <select value={zone} onChange={(e) => setZone(e.target.value)} className="field h-11 rounded-xl px-3 text-[14px]">
              {PUROKS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DialogFooter>
          <button
            type="button"
            disabled={pending === "add-tanod" || name.trim().length < 2 || phone.replace(/\D/g, "").length < 10}
            onClick={async () => {
              const r = await act("add-tanod", () => addTanod({ name, phone, zone }), { success: t("{name} added · they can sign in to the Tanod app now", { name: name.trim() }) });
              if (r.ok) {
                setOpen(false);
                setName("");
                setPhone("");
              }
            }}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
          >
            {pending === "add-tanod" && <Loader2 className="size-4 animate-spin" />} {t("Add tanod")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActiveToggle({ s }: { s: Staff }) {
  const { act, pending } = useAct();
  const { t } = useStaffLang();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className={cn("min-h-11 rounded-full px-2.5 text-[12px] font-semibold transition-colors", s.active ? "text-high hover:bg-high-soft" : "bg-fill hover:bg-fill-strong")}
        >
          {s.active ? t("Deactivate") : t("Reactivate")}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{s.active ? t("Deactivate {name}?", { name: s.name }) : t("Reactivate {name}?", { name: s.name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {s.active ? t("They're signed out of the Tanod app, taken off the roster from today, and pulled off open assignments.") : t("They can sign in again. Add them back to the roster.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending === s.id}
            className={s.active ? "bg-high text-white hover:bg-[#a12d17]" : undefined}
            onClick={() => void act(s.id, () => setStaffActive({ id: s.id, active: !s.active }), { success: s.active ? "Deactivated" : "Reactivated" })}
          >
            {s.active ? t("Deactivate") : t("Reactivate")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Roster({ tanods, roster, editable }: { tanods: Staff[]; roster: DutyShift[]; editable: boolean }) {
  const now = useNow(60_000);
  const { act, pending } = useAct();
  const { lang, t } = useStaffLang();
  const today = manilaDate(now);
  const [selectedDate, setSelectedDate] = useState(() => manilaDate(Date.now()));
  const week = weekStart(selectedDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const on = new Set(roster.map((d) => d.id));
  const live = slotAt(now);
  const canEdit = (date: string) => editable && date >= addDays(today, -1);
  const noon = (date: string) => Date.parse(`${date}T04:00:00Z`);
  const dateLabel = (date: string) => fmtDate(noon(date), lang, { weekday: "long", month: "short", day: "numeric" });
  const changeShift = (id: string, tanodId: string, date: string, shift: Shift) =>
    act(id, () => setDuty({ tanodId, date, shift, on: !on.has(id) }));

  return (
    <section aria-labelledby="roster-title" className="@container grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="roster-title" className="mr-auto text-[18px] font-bold tracking-[-0.01em]">
          {t("Duty roster")}
          <span className="ml-2 text-[14px] font-semibold text-ink-3">
            {fmtDate(noon(days[0]), lang, { month: "short", day: "numeric" })} – {fmtDate(noon(days[6]), lang, { month: "short", day: "numeric" })}
          </span>
        </h2>
        <div className="inline-flex rounded-full bg-fill p-[3px]">
          <button type="button" aria-label={t("Previous week")} onClick={() => setSelectedDate((d) => addDays(d, -7))} className="grid size-11 place-items-center rounded-full transition hover:bg-card">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => setSelectedDate(today)} className="h-11 rounded-full px-3 text-[13px] font-semibold transition hover:bg-card">
            {t("This week")}
          </button>
          <button type="button" aria-label={t("Next week")} onClick={() => setSelectedDate((d) => addDays(d, 7))} className="grid size-11 place-items-center rounded-full transition hover:bg-card">
            <ChevronRight className="size-4" />
          </button>
        </div>
        {editable && days[6] >= today && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={async () => {
              const r = await act("copy-week", () => copyPreviousWeek({ weekStart: week }));
              if (r.ok) toast.success(r.data.added ? t("Copied {n} shifts from last week", { n: r.data.added }) : t("Nothing to copy: this week already matches last week"));
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[13px] font-semibold transition hover:bg-fill-strong disabled:opacity-60"
          >
            {pending === "copy-week" ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />} {t("Copy last week")}
          </button>
        )}
      </div>

      <div className="grid gap-3 @4xl:hidden">
        <div role="group" aria-label={t("Roster date")} className="grid grid-cols-7 gap-0.5 rounded-2xl bg-fill p-1">
          {days.map((date) => (
            <button
              key={date}
              type="button"
              aria-label={dateLabel(date)}
              aria-current={date === today ? "date" : undefined}
              aria-pressed={date === selectedDate}
              onClick={() => setSelectedDate(date)}
              className={cn(
                "relative flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 leading-none transition-colors",
                date === selectedDate ? "bg-brand-deep text-white" : "text-muted-foreground hover:bg-card",
              )}
            >
              <span className="max-w-full truncate text-[11px] font-semibold">{fmtDate(noon(date), lang, { weekday: "short" })}</span>
              <span className="text-[15px] font-bold tabular">{fmtDate(noon(date), lang, { day: "numeric" })}</span>
              {date === today && <span className="absolute bottom-1 size-1 rounded-full bg-current" aria-hidden />}
            </button>
          ))}
        </div>
        <h3 aria-live="polite" className="text-[14px] font-bold">
          {dateLabel(selectedDate)}{selectedDate === today ? ` · ${t("Today")}` : ""}
        </h3>
        <div className="grid gap-3 @2xl:grid-cols-2">
          {SHIFTS.map((shift) => {
            const Icon = SHIFT_ICON[shift];
            const assigned = tanods.filter((s) => on.has(`d_${selectedDate}_${shift}_${s.id}`));
            const liveShift = live.date === selectedDate && live.shift === shift;
            const editLabel = t("Edit {shift} shift", { shift: SHIFT[shift][lang] });
            return (
              <section key={shift} aria-labelledby={`roster-${shift}`} className="min-w-0 rounded-[20px] bg-card px-3.5 shadow-sheet">
                <div className="flex min-h-16 flex-wrap items-center gap-2.5 py-2">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", SHIFT_ON[shift])} aria-hidden>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 id={`roster-${shift}`} className="text-[14px] leading-tight font-bold">{SHIFT[shift][lang]}</h4>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{SHIFT[shift].label}</p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-1 text-[11.5px] font-semibold", !assigned.length ? "bg-high-soft text-high" : liveShift ? "bg-brand-soft text-brand-deep" : "bg-fill text-muted-foreground")}>
                    {!assigned.length ? t("No coverage") : liveShift ? t("{n} on duty now", { n: assigned.length }) : t("{n} scheduled", { n: assigned.length })}
                  </span>
                </div>
                {assigned.length > 0 && (
                  <ul className="divide-y divide-hairline border-t border-hairline">
                    {assigned.map((s) => (
                      <li key={s.id} className="flex min-h-10 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                        <span className="text-[13.5px] font-semibold">{s.name}</span>
                        <span className="text-[12px] text-muted-foreground">{s.zone ? PUROK_NAME[s.zone] : t("Any purok")}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit(selectedDate) && tanods.length > 0 && (
                  <div className="flex justify-end border-t border-hairline py-0.5">
                    <Dialog>
                      <DialogTrigger asChild>
                        <button type="button" aria-label={editLabel} className="min-h-11 rounded-full px-3 text-[13px] font-bold text-primary hover:bg-brand-soft">
                          {t("Edit shift")}
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-h-[85dvh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{editLabel}</DialogTitle>
                          <DialogDescription>{dateLabel(selectedDate)} · {SHIFT[shift].label}. {t("Changes save as you select officers.")}</DialogDescription>
                        </DialogHeader>
                        <ul className="divide-y divide-hairline">
                          {tanods.map((s) => {
                            const id = `d_${selectedDate}_${shift}_${s.id}`;
                            return (
                              <li key={s.id}>
                                <label className="flex min-h-12 items-center gap-3 py-2 text-[14px] font-semibold has-[:disabled]:opacity-60">
                                  <input
                                    type="checkbox"
                                    checked={on.has(id)}
                                    disabled={pending !== null}
                                    onChange={() => void changeShift(id, s.id, selectedDate, shift)}
                                    className="size-5 shrink-0 accent-primary"
                                  />
                                  <span className="flex-1">{s.name}</span>
                                  {pending === id && <Loader2 className="size-4 animate-spin" aria-hidden />}
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </section>
            );
          })}
        </div>
        {!editable && <p className="text-[12px] text-muted-foreground">{t("Supervisors and administrators edit the roster.")}</p>}
      </div>

      <div className="hidden overflow-x-auto rounded-[24px] bg-card shadow-sheet @4xl:block">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-4 py-3 text-[12px] font-medium text-ink-3">{t("Tanod")}</th>
              {days.map((d) => (
                <th key={d} className="px-1.5 py-3 text-center text-[12px] font-medium text-ink-3">
                  <span className={cn("inline-flex flex-col items-center rounded-xl px-2.5 py-1 leading-tight", d === today && "bg-brand-soft text-brand-deep")}>
                    <span>{fmtDate(noon(d), lang, { weekday: "short" })}</span>
                    <span className="text-[14px] font-bold text-foreground tabular">{fmtDate(noon(d), lang, { day: "numeric" })}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tanods.map((s) => (
              <tr key={s.id}>
                <th scope="row" className="sticky left-0 z-10 border-t border-hairline bg-card px-4 py-2.5 font-normal">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={s.name} className="size-8 text-[11px]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold">{s.name}</span>
                      <span className="block text-[11.5px] text-ink-3">{s.zone ? PUROK_NAME[s.zone] : t("Any purok")}</span>
                    </span>
                  </span>
                </th>
                {days.map((d) => (
                  <td key={d} className="border-t border-hairline px-1 py-2 text-center">
                    <span className="inline-flex gap-1">
                      {SHIFTS.map((shift) => {
                        const id = `d_${d}_${shift}_${s.id}`;
                        const isOn = on.has(id);
                        const Icon = SHIFT_ICON[shift];
                        const isLive = isOn && live.date === d && live.shift === shift;
                        const label = t("{name}, {date}, {shift} shift {hours}: {state}", {
                          name: s.name,
                          date: dateLabel(d),
                          shift: SHIFT[shift][lang],
                          hours: SHIFT[shift].label,
                          state: isOn ? t("on duty") : t("off"),
                        });
                        return canEdit(d) ? (
                          <button
                            key={shift}
                            type="button"
                            aria-pressed={isOn}
                            aria-label={label}
                            title={`${SHIFT[shift][lang]} · ${SHIFT[shift].label}`}
                            disabled={pending !== null}
                            onClick={() => void changeShift(id, s.id, d, shift)}
                            className={cn(
                              "relative grid size-8 place-items-center rounded-lg transition active:scale-95",
                              isOn ? SHIFT_ON[shift] : "bg-fill/60 text-ink-3/50 hover:bg-fill-strong hover:text-ink-3",
                            )}
                          >
                            {pending === id ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
                            {isLive && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary shadow-[0_0_0_2px_white]" />}
                          </button>
                        ) : (
                          <span
                            key={shift}
                            aria-label={label}
                            title={`${SHIFT[shift][lang]} · ${SHIFT[shift].label}`}
                            className={cn("relative grid size-8 place-items-center rounded-lg", isOn ? SHIFT_ON[shift] : "text-ink-3/25", d < today && "opacity-60")}
                          >
                            <Icon className="size-3.5" />
                            {isLive && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary shadow-[0_0_0_2px_white]" />}
                          </span>
                        );
                      })}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="sticky left-0 z-10 border-t border-hairline bg-card px-4 py-2.5 text-[12px] font-medium text-ink-3">
                {t("Coverage")}
              </th>
              {days.map((d) => (
                <td key={d} className="border-t border-hairline px-1 py-2.5 text-center text-[12px] tabular">
                  {SHIFTS.map((shift) => {
                    const n = tanods.filter((s) => on.has(`d_${d}_${shift}_${s.id}`)).length;
                    return (
                      <span key={shift} className={cn("mx-0.5 inline-flex w-8 items-center justify-center gap-0.5 font-semibold", n === 0 ? "text-high" : n < 2 ? "text-medium" : "text-ink-3")} title={t("{shift}: {n} on duty", { shift: SHIFT[shift][lang], n })}>
                        {n}
                      </span>
                    );
                  })}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground @4xl:flex">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("grid size-5 place-items-center rounded-md", SHIFT_ON.day)}>
            <Sun className="size-3" />
          </span>
          {SHIFT.day[lang]} {SHIFT.day.label}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("grid size-5 place-items-center rounded-md", SHIFT_ON.night)}>
            <Moon className="size-3" />
          </span>
          {SHIFT.night[lang]} {SHIFT.night.label}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" /> {t("on duty now")}
        </span>
        {editable ? <span>{t("Tap a shift to add or remove it. Coverage turns red when a shift has no one.")}</span> : <span>{t("Supervisors and administrators edit the roster.")}</span>}
      </p>
    </section>
  );
}

export function TanodsPage() {
  const { data } = useStaff();
  const now = useNow(30_000);
  const { lang, t } = useStaffLang();
  if (!data?.me) return null;
  if (!canAccess(data.me, "tanods")) return <NoAccess title={t("The tanod roster isn't part of your role")} role={data.me.role} />;
  const manage = canManageTanods(data.me);
  const board = tanodBoard(data, now);
  const onDuty = board.filter((t) => t.duty);
  const slot = slotAt(now);
  const open = data.assignments.filter(isOpenField).sort((a, b) => a.assignedAt - b.assignedAt);
  const tanods = data.staff.filter((s) => s.role === "tanod");
  const active = tanods.filter((s) => s.active).sort((a, b) => (a.zone ?? "").localeCompare(b.zone ?? "") || a.name.localeCompare(b.name));
  const officerGroups = [
    { key: "on", title: t("On duty now"), officers: onDuty.map((info) => ({ s: info.s, status: dutyLabel(info, t, lang) })) },
    { key: "off", title: t("Off duty"), officers: board.filter((info) => !info.duty).map((info) => ({ s: info.s, status: dutyLabel(info, t, lang) })) },
    { key: "inactive", title: t("Deactivated"), officers: tanods.filter((s) => !s.active).map((s) => ({ s, status: "" })) },
  ];
  const caseOf = (id: string) => data.requests.find((r) => r.id === id);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={t("Tanods")}
        sub={`${t("{n} on duty now", { n: onDuty.length })} · ${t("{shift} shift {hours}", { shift: SHIFT[slot.shift][lang], hours: SHIFT[slot.shift].label })} · ${open.length === 1 ? t("{n} open field assignment", { n: open.length }) : t("{n} open field assignments", { n: open.length })}`}
        actions={manage ? <AddTanodDialog /> : undefined}
      />

      <section aria-labelledby="duty-title" className="grid gap-3">
        <h2 id="duty-title" className="text-[18px] font-bold tracking-[-0.01em]">
          {t("On duty now")}
        </h2>
        {onDuty.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {onDuty.map((info) => {
              const current = info.open[0];
              const r = current && caseOf(current.requestId);
              return (
                <li key={info.s.id} className="grid gap-3 rounded-[20px] bg-card p-4 shadow-sheet">
                  <div className="flex items-center gap-3">
                    <Avatar name={info.s.name} className="size-10 bg-brand-deep text-[12px] text-white" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold">{info.s.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {info.s.zone ? PUROK_NAME[info.s.zone] : t("Any purok")} · {t("until {time}", { time: info.duty === "day" ? "6 PM" : "6 AM" })}
                      </span>
                    </span>
                    <CallTanod s={info.s} className="bg-brand-soft text-primary" />
                  </div>
                  {current ? (
                    <Link
                      href={r && !current.redacted ? `/barangay/cases/${r.id}` : "#"}
                      className="flex items-center gap-2 rounded-xl bg-fill px-3 py-2 text-[12.5px] transition hover:bg-fill-strong"
                    >
                      <FieldStatusPill status={current.status} className="h-5 text-[11px]" />
                      <span className="min-w-0 flex-1 truncate">{r ? (current.redacted ? t("Restricted case") : r.text) : t("Case")}</span>
                      {info.open.length > 1 && <span className="text-ink-3">+{info.open.length - 1}</span>}
                    </Link>
                  ) : (
                    <p className="flex items-center gap-2 px-1 text-[12.5px] font-semibold text-primary">
                      <span className="size-2 rounded-full bg-primary" /> {t("Available")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon={ShieldUser} title={t("No one is on duty right now")} body={manage ? t("Add a shift on the roster below.") : t("Ask a supervisor to update the roster.")} />
        )}
      </section>

      <section aria-labelledby="field-title" className="grid gap-3">
        <h2 id="field-title" className="flex items-baseline gap-2 text-[18px] font-bold tracking-[-0.01em]">
          {t("Field assignments")} <span className="text-[14px] font-semibold text-ink-3 tabular">{open.length}</span>
        </h2>
        {open.length ? (
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-sheet">
            {open.map((a) => {
              const r = caseOf(a.requestId);
              const tanod = data.staff.find((s) => s.id === a.tanodId);
              const since =
                a.status === "on_scene"
                  ? t("on scene {time}", { time: dur(now - a.arrivedAt!) })
                  : a.status === "accepted"
                    ? t("accepted {time}", { time: rel(a.acceptedAt!, lang, now) })
                    : t("sent {time}", { time: rel(a.assignedAt, lang, now) });
              const body = (
                <>
                  <Avatar name={tanod?.name ?? "?"} className="size-9 text-[11px]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-3">
                      <span className="font-semibold text-foreground">{tanod?.name}</span>
                      {r && <span className="font-mono text-[11.5px]">{r.ref}</span>}
                      <span>{since}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[14px]">{a.redacted || !r ? t("Restricted case") : r.text}</span>
                  </span>
                  <FieldStatusPill status={a.status} />
                </>
              );
              const row = "relative flex items-center gap-3 px-4 py-3 after:absolute after:right-4 after:bottom-0 after:left-[64px] after:h-px after:bg-hairline group-last/item:after:hidden";
              return (
                <li key={a.id} className="group/item">
                  {r && !a.redacted ? (
                    <Link href={`/barangay/cases/${r.id}`} className={cn(row, "transition hover:bg-fill/40")}>
                      {body}
                    </Link>
                  ) : (
                    <div className={row}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-[20px] bg-fill px-5 py-6 text-center text-[13.5px] text-muted-foreground">{t("No open field assignments. Send a tanod from any case you handle.")}</p>
        )}
      </section>

      <Roster tanods={active} roster={data.roster} editable={manage} />

      <section aria-labelledby="officers-title" className="grid gap-3">
        <h2 id="officers-title" className="flex items-baseline gap-2 text-[18px] font-bold tracking-[-0.01em]">
          {t("Officers")} <span className="text-[14px] font-semibold text-ink-3 tabular">{active.length}</span>
        </h2>
        {tanods.length ? (
          <div className="divide-y divide-hairline rounded-[20px] bg-card shadow-sheet">
            {officerGroups.map(({ key, title, officers }) => officers.length > 0 && (
              <div key={key} className="px-3.5 py-2 sm:px-4">
                <h3 className={cn("px-1 pt-1.5 pb-1 text-[12px] font-bold", key === "on" ? "text-brand-deep" : "text-muted-foreground")}>{title}</h3>
                <ul className="divide-y divide-hairline">
                  {officers.map(({ s, status }) => (
                    <li key={s.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2.5 px-1 py-2.5 sm:gap-3">
                      <Avatar name={s.name} className={cn("size-8 self-start text-[11px]", key === "on" && "bg-brand-soft text-brand-deep")} />
                      <div className="min-w-0">
                        <p className="text-[14px] leading-snug font-bold">{s.name}</p>
                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-muted-foreground">
                          <span>{s.zone ? PUROK_NAME[s.zone] : t("Any purok")}</span>
                          {s.phone && <span className="tabular whitespace-nowrap">{formatMobile(s.phone)}</span>}
                        </p>
                        {status && <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{status}</p>}
                      </div>
                      {((s.active && s.phone) || manage) && (
                        <div className="flex flex-col items-end sm:flex-row sm:items-center sm:gap-2">
                          {s.active && s.phone && (
                            <a
                              href={`tel:${s.phone}`}
                              aria-label={t("Call {name}, {phone}", { name: s.name, phone: formatMobile(s.phone) })}
                              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand-soft px-3 text-[13px] font-bold whitespace-nowrap text-brand-deep transition-colors hover:bg-primary hover:text-primary-foreground"
                            >
                              <Phone className="size-3.5" aria-hidden /> {t("Call")}
                            </a>
                          )}
                          {manage && <ActiveToggle s={s} />}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-[20px] bg-card px-4 py-6 text-[13.5px] text-muted-foreground shadow-sheet">
            <Plus className="size-4" /> {t("No tanods yet.")}
          </p>
        )}
      </section>
    </div>
  );
}
