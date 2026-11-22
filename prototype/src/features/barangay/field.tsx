"use client";

/**
 * Desk side of tanod field work: who is on duty, sending a tanod to a case, and
 * following what they report back. The case always stays with its handler.
 */
import { Loader2, Phone, ShieldUser, X } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAct, useNow, useStaff } from "@/hooks/use-live";
import { FIELD_RESULT, FIELD_STATUS, SHIFT, type FieldStatus, type Lang, type Shift, type Staff } from "@/lib/domain";
import { formatMobile, isOnDuty, shiftWindow } from "@/lib/duty";
import { dur, fmtDate, rel } from "@/lib/format";
import { PUROK_NAME } from "@/lib/geo";
import { can } from "@/lib/policy";
import type { StaffAssignment, StaffRequest, StaffSnapshot } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { assignTanod, cancelTanodAssignment } from "@/server/actions";
import { useStaffLang, type Vars } from "./i18n";
import { Avatar, staffName } from "./ui";

const FIELD_TONE: Record<FieldStatus, string> = {
  assigned: "bg-gold-soft text-[#7a4c00]",
  accepted: "bg-normal-soft text-normal",
  on_scene: "bg-brand-soft text-brand-deep",
  done: "bg-fill text-foreground/80",
  declined: "bg-high-soft text-high",
  cancelled: "bg-fill text-ink-3",
};

export function FieldStatusPill({ status, className }: { status: FieldStatus; className?: string }) {
  const { lang } = useStaffLang();
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold whitespace-nowrap", FIELD_TONE[status], className)}>
      {status === "on_scene" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {FIELD_STATUS[status][lang]}
    </span>
  );
}

export const isOpenField = (a: { status: FieldStatus }) => FIELD_STATUS[a.status].open;

export interface TanodInfo {
  s: Staff;
  duty: Shift | null;
  next: { shift: Shift; start: number } | null;
  open: StaffAssignment[];
}

/** Active tanods with duty status, next shift and open field work: on duty first, then least busy. */
export function tanodBoard(data: StaffSnapshot, now: number): TanodInfo[] {
  return data.staff
    .filter((s) => s.role === "tanod" && s.active)
    .map((s) => {
      const shifts = data.roster.filter((d) => d.tanodId === s.id);
      const next =
        shifts
          .map((d) => ({ shift: d.shift, start: shiftWindow(d.date, d.shift).start }))
          .filter((x) => x.start > now)
          .sort((a, b) => a.start - b.start)[0] ?? null;
      return { s, duty: shifts.find((d) => isOnDuty(d, now))?.shift ?? null, next, open: data.assignments.filter((a) => a.tanodId === s.id && isOpenField(a)) };
    })
    .sort((a, b) => Number(!!b.duty) - Number(!!a.duty) || a.open.length - b.open.length || a.s.name.localeCompare(b.s.name));
}

export function dutyLabel(info: TanodInfo, t: (m: string, v?: Vars) => string, lang: Lang) {
  if (info.duty) return t("On duty · {shift} until {time}", { shift: SHIFT[info.duty][lang], time: info.duty === "day" ? "6 PM" : "6 AM" });
  if (!info.next) return t("No upcoming shift");
  return t("Off duty · next {time}", { time: fmtDate(info.next.start, lang, { weekday: "short", hour: "numeric" }) });
}

export function CallTanod({ s, className }: { s: Staff; className?: string }) {
  const { t } = useStaffLang();
  if (!s.phone) return null;
  return (
    <a
      href={`tel:${s.phone}`}
      aria-label={t("Call {name}, {phone}", { name: s.name, phone: formatMobile(s.phone) })}
      title={formatMobile(s.phone)}
      className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-fill transition hover:bg-brand-soft hover:text-primary", className)}
    >
      <Phone className="size-4" />
    </a>
  );
}

const TEMPLATES = [
  "Pakipuntahan at alamin ang sitwasyon. Iulat dito pagdating.",
  "Bantayan ang lugar hanggang dumating ang team ng barangay.",
  "Kausapin nang mahinahon ang mga sangkot at iulat ang napag-usapan.",
];

export function AssignTanodDialog({ r, open, onOpenChange }: { r: StaffRequest; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data } = useStaff();
  const now = useNow(60_000);
  const { act, pending } = useAct();
  const { lang, t } = useStaffLang();
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const zone = r.location?.purok ?? null;
  const busyHere = new Set(data!.assignments.filter((a) => a.requestId === r.id && isOpenField(a)).map((a) => a.tanodId));
  // Same purok as the case breaks ties among tanods on duty.
  const board = tanodBoard(data!, now).sort((a, b) => Number(!!b.duty) - Number(!!a.duty) || Number(b.s.zone === zone) - Number(a.s.zone === zone));
  const selected = pick ?? board.find((tn) => tn.duty && !busyHere.has(tn.s.id))?.s.id ?? null;
  const chosen = board.find((tn) => tn.s.id === selected);

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setPick(null);
      setNote("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Send a tanod")}</DialogTitle>
          <DialogDescription>{t("They get it on the Tanod app and report back here. The case stays with its handler.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div role="radiogroup" aria-label={t("Tanod")} className="grid max-h-72 gap-1.5 overflow-y-auto">
            {board.map((tn) => {
              const here = busyHere.has(tn.s.id);
              const on = selected === tn.s.id;
              return (
                <button
                  key={tn.s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={here}
                  onClick={() => setPick(tn.s.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl bg-fill px-3 py-2.5 text-left transition hover:bg-fill-strong disabled:opacity-50",
                    on && "bg-brand-soft hover:bg-brand-soft",
                  )}
                >
                  <Avatar name={tn.s.name} className={cn("size-9 text-[11px]", tn.duty && "bg-brand-deep text-white")} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[14px] font-semibold">
                      <span className="truncate">{tn.s.name}</span>
                      {zone && tn.s.zone === zone && <span className="rounded-full bg-card px-2 py-px text-[11px] font-semibold text-primary">{t("Same purok")}</span>}
                    </span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {here ? t("Already on this case") : dutyLabel(tn, t, lang)}
                      {tn.s.zone && ` · ${PUROK_NAME[tn.s.zone]}`}
                      {tn.open.length > 0 && ` · ${t("{n} open", { n: tn.open.length })}`}
                    </span>
                  </span>
                  <span className={cn("size-2.5 shrink-0 rounded-full", tn.duty ? "bg-primary" : "bg-ink-3/40")} aria-hidden />
                </button>
              );
            })}
            {!board.length && <p className="rounded-2xl bg-fill p-4 text-center text-[13px] text-muted-foreground">{t("No active tanods. A supervisor or administrator can add them on the Tanods page.")}</p>}
          </div>
          {chosen && !chosen.duty && (
            <p className="rounded-xl bg-medium-soft px-3 py-2 text-[12.5px] text-[#5a3400]">{t("{name} is off duty now and may not see this until their next shift.", { name: chosen.s.name.split(" ")[0] })}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((tpl) => (
              <button key={tpl} type="button" onClick={() => setNote(tpl)} className="rounded-full bg-fill px-3 py-1.5 text-left text-[12px] text-foreground/80 transition hover:bg-fill-strong">
                {tpl.length > 44 ? `${tpl.slice(0, 42)}…` : tpl}
              </button>
            ))}
          </div>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold">{t("Instructions · optional")}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t("What should they do when they get there?")} className="field rounded-xl px-3.5 py-2.5 text-[14px]" />
          </label>
        </div>
        <DialogFooter>
          <button type="button" onClick={() => close(false)} className="h-10 rounded-full bg-fill px-4 text-[14px] font-semibold transition hover:bg-fill-strong">
            {t("Cancel")}
          </button>
          <button
            type="button"
            disabled={!chosen || pending === "assign-tanod"}
            onClick={async () => {
              if (!chosen) return;
              const res = await act("assign-tanod", () => assignTanod({ id: r.id, tanodId: chosen.s.id, instructions: note }), {
                success: t("Sent to {name} · waiting for them to accept", { name: chosen.s.name }),
              });
              if (res.ok) close(false);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
          >
            {pending === "assign-tanod" ? <Loader2 className="size-4 animate-spin" /> : <ShieldUser className="size-4" />}
            {chosen ? t("Send {name}", { name: chosen.s.name.split(" ")[0] }) : t("Send")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CANCEL_REASONS = ["No longer needed", "Sending someone else", "Handled by the team already"];

function CancelDialog({ a, onClose }: { a: StaffAssignment | null; onClose: () => void }) {
  const { data } = useStaff();
  const { act, pending } = useAct();
  const { t } = useStaffLang();
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  return (
    <Dialog open={!!a} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{a ? t("Call off {name}?", { name: staffName(data!, a.tanodId).split(" ")[0] }) : t("Call off the tanod?")}</DialogTitle>
          <DialogDescription>{t("The assignment closes on their phone right away. The reason stays internal.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          {CANCEL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason(r)}
              className={cn("rounded-xl bg-fill px-3.5 py-3 text-left text-[13.5px] font-medium transition hover:bg-fill-strong", reason === r && "bg-brand-soft hover:bg-brand-soft")}
            >
              {t(r)}
            </button>
          ))}
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className="h-10 rounded-full bg-fill px-4 text-[14px] font-semibold transition hover:bg-fill-strong">
            {t("Keep")}
          </button>
          <button
            type="button"
            disabled={pending === "cancel-tanod"}
            onClick={async () => {
              if (!a) return;
              const res = await act("cancel-tanod", () => cancelTanodAssignment({ assignmentId: a.id, reason }), { success: "Assignment called off" });
              if (res.ok) onClose();
            }}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-high px-5 text-[14px] font-bold text-white disabled:opacity-50"
          >
            {pending === "cancel-tanod" && <Loader2 className="size-4 animate-spin" />} {t("Call off")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function progress(a: StaffAssignment, now: number, t: (m: string, v?: Vars) => string, lang: Lang) {
  if (a.status === "assigned") return t("Sent {time} · not yet accepted", { time: rel(a.assignedAt, lang, now) });
  if (a.status === "accepted") return t("Accepted {time}", { time: rel(a.acceptedAt!, lang, now) });
  if (a.status === "on_scene") return t("On scene for {time}", { time: dur(now - a.arrivedAt!) });
  if (a.status === "done")
    return a.arrivedAt
      ? t("Reported {time} · {duration} on scene", { time: rel(a.closedAt!, lang, now), duration: dur(a.closedAt! - a.arrivedAt) })
      : t("Reported {time}", { time: rel(a.closedAt!, lang, now) });
  return `${FIELD_STATUS[a.status][lang]} ${rel(a.closedAt ?? a.assignedAt, lang, now)}`;
}

/** Everyone sent to this case, what they reported, and controls for whoever owns the case. */
export function FieldTeam({ r }: { r: StaffRequest }) {
  const { data } = useStaff();
  const now = useNow(30_000);
  const { lang, t } = useStaffLang();
  const [assigning, setAssigning] = useState(false);
  const [cancelling, setCancelling] = useState<StaffAssignment | null>(null);
  const me = data!.me!;
  const canSend = can(me, "dispatch", r);
  const list = data!.assignments.filter((a) => a.requestId === r.id).sort((a, b) => Number(isOpenField(b)) - Number(isOpenField(a)) || b.assignedAt - a.assignedAt);

  return (
    <div className="grid gap-3">
      {list.length ? (
        <ul className="grid gap-2">
          {list.map((a) => {
            const tanod = data!.staff.find((s) => s.id === a.tanodId);
            return (
              <li key={a.id} className="rounded-2xl bg-fill/70 p-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={tanod?.name ?? "?"} className="size-8 text-[11px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{tanod?.name ?? t("Former tanod")}</span>
                    <span className="block text-[11.5px] leading-snug text-ink-3">{progress(a, now, t, lang)}</span>
                  </span>
                  <FieldStatusPill status={a.status} />
                </div>
                {a.instructions && <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">“{a.instructions}”</p>}
                {a.status === "done" && a.result && (
                  <div className="mt-2 grid gap-2 rounded-xl bg-card p-3 text-[13px] shadow-sheet">
                    <p className="font-semibold">{FIELD_RESULT[a.result][lang]}</p>
                    {a.report && <p className="leading-snug text-foreground/85">{a.report}</p>}
                    {a.hasPhoto && (
                      <a href={`/api/field-photo/${a.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg bg-fill">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/field-photo/${a.id}`} alt={t("Photo from the field report")} className="aspect-[4/3] w-full object-cover" />
                      </a>
                    )}
                  </div>
                )}
                {!isOpenField(a) && a.status !== "done" && a.closeReason && <p className="mt-2 text-[12.5px] text-muted-foreground">{t("Reason: {reason}", { reason: a.closeReason })}</p>}
                {isOpenField(a) && (
                  <div className="mt-2.5 flex items-center gap-1.5">
                    {tanod?.phone && (
                      <a href={`tel:${tanod.phone}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-[12.5px] font-semibold shadow-sheet transition hover:shadow-lift">
                        <Phone className="size-3.5" /> {formatMobile(tanod.phone)}
                      </a>
                    )}
                    {canSend && (
                      <button type="button" onClick={() => setCancelling(a)} className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold text-ink-3 transition hover:bg-high-soft hover:text-high">
                        <X className="size-3.5" /> {t("Call off")}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">{t("No tanod sent yet.")}</p>
      )}
      {canSend && (
        <button
          type="button"
          onClick={() => setAssigning(true)}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-fill px-3 text-[13.5px] font-semibold transition hover:bg-fill-strong"
        >
          <ShieldUser className="size-4" /> {t("Send a tanod")}
        </button>
      )}
      <AssignTanodDialog r={r} open={assigning} onOpenChange={setAssigning} />
      <CancelDialog a={cancelling} onClose={() => setCancelling(null)} />
    </div>
  );
}

/** Shown under a danger alert: who can go right now, one tap to call or send. */
export function OnDutyNow({ r }: { r: StaffRequest }) {
  const { data } = useStaff();
  const now = useNow(60_000);
  const { t } = useStaffLang();
  const [assigning, setAssigning] = useState(false);
  const onDuty = tanodBoard(data!, now).filter((tn) => tn.duty);
  const here = data!.assignments.filter((a) => a.requestId === r.id && isOpenField(a));
  const canSend = can(data!.me, "dispatch", r);

  return (
    <div className="grid gap-2.5 rounded-2xl bg-fill p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-semibold">{t("Tanods on duty now")}</p>
        {here.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1.5 text-[12px]">
            <span className="font-semibold">{staffName(data!, a.tanodId).split(" ")[0]}</span>
            <FieldStatusPill status={a.status} className="h-5 text-[11px]" />
          </span>
        ))}
        {canSend && (
          <button type="button" onClick={() => setAssigning(true)} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[12.5px] font-bold text-primary-foreground shadow-press">
            <ShieldUser className="size-3.5" /> {t("Send a tanod")}
          </button>
        )}
      </div>
      {onDuty.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {onDuty.map((tn) => (
            <li key={tn.s.id} className="flex items-center gap-2 rounded-full bg-card py-1 pr-1 pl-1 shadow-sheet">
              <Avatar name={tn.s.name} className="size-7 bg-brand-deep text-[10px] text-white" />
              <span className="text-[12.5px] leading-tight">
                <span className="block font-semibold">{tn.s.name}</span>
                <span className="block text-[11px] text-ink-3">
                  {tn.s.zone ? PUROK_NAME[tn.s.zone] : t("Any purok")}
                  {tn.open.length > 0 && ` · ${t("{n} open", { n: tn.open.length })}`}
                </span>
              </span>
              <CallTanod s={tn.s} className="size-8 bg-brand-soft text-primary" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">{t("No one is on the roster right now. Call the barangay hall or the police.")}</p>
      )}
      <AssignTanodDialog r={r} open={assigning} onOpenChange={setAssigning} />
    </div>
  );
}
