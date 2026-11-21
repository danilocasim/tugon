"use client";

import {
  AlarmClock,
  ArrowLeft,
  Brain,
  Camera,
  Check,
  CheckCircle2,
  Eye,
  Forward,
  Loader2,
  Lock,
  NotebookPen,
  Play,
  RotateCcw,
  Send,
  Shuffle,
  Tags,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategoryIcon, StatusBadge, UrgencyTag } from "@/components/tugon/badges";
import { useAct, useNow, useStaff } from "@/hooks/use-live";
import { CATEGORIES, CATEGORY, CHANNEL, FIELD_RESULT, INTAKE_STATUSES, ROLE, URGENCIES, URGENCY, type CaseEvent, type Category, type FieldResult, type Lang, type Urgency } from "@/lib/domain";
import { dur, fmtDate, rel } from "@/lib/format";
import { compressPhoto } from "@/lib/photo";
import { can } from "@/lib/policy";
import { dueAt, isOverdue, priority, rankQueue } from "@/lib/priority";
import type { DeskSnapshot, StaffRequest } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { assignRequest, changeTriage, postUpdate, referRequest, reopenRequest, resolveRequest, setRestricted, startWork } from "@/server/staff-cases";
import { useClaim } from "./claim";
import { FieldTeam } from "./field";
import { IncidentHint } from "./incidents";
import { KpPanel } from "./lupon";
import { useStaffLang, type Vars } from "./i18n";
import { ReportBody, TriageWorkspace } from "./triage";
import { Avatar, DangerTag, Empty, Reporter, RestrictedTag, ScoreBar, staffName, teamName } from "./ui";

function eventTitle(e: CaseEvent, data: DeskSnapshot, t: (m: string, v?: Vars) => string, lang: Lang): string {
  const m = e.meta ?? {};
  switch (e.type) {
    case "submitted":
      return m.assisted ? (m.assisted === "phone" ? t("Recorded as phone request") : t("Recorded as walk-in request")) : t("Report submitted");
    case "review_started":
      return t("Review started");
    case "info_requested":
      return t("Asked resident for details");
    case "resident_reply":
      return t("Resident replied");
    case "triaged":
      return t("Triaged · {category} · {urgency} → {team}", {
        category: String(CATEGORY[m.category as Category]?.short[lang]),
        urgency: String(URGENCY[m.urgency as Urgency]?.[lang]),
        team: teamName(data, m.team as string),
      });
    case "assigned":
      if (m.via === "claim")
        return Number(m.skipped) > 0
          ? t("Claimed by {name} · skipped {n}", { name: staffName(data, m.assignee as string), n: String(m.skipped) })
          : t("Claimed by {name}", { name: staffName(data, m.assignee as string) });
      return m.via === "reassign" ? t("Reassigned to {name}", { name: staffName(data, m.assignee as string) }) : t("Assigned to {name}", { name: staffName(data, m.assignee as string) });
    case "started":
      return t("Work started");
    case "update":
      return t("Update sent to resident");
    case "note":
      return t("Internal note");
    case "resolved":
      return t("Resolved");
    case "referred":
      return t("Referred to {office}", { office: String(m.office) });
    case "duplicate":
      return m.originalRef == null ? t("Marked duplicate of an earlier report") : t("Marked duplicate of {ref}", { ref: String(m.originalRef) });
    case "withdrawn":
      return t("Withdrawn by resident");
    case "reopened":
      return t("Reopened");
    case "followup_requested":
      return t("Resident asked for a follow-up");
    case "triage_changed":
      return t("Triage changed · {from} → {to}", { from: String(m.from), to: String(m.to) });
    case "tanod_assigned":
      return t("Tanod assigned · {name}", { name: staffName(data, m.tanod as string) });
    case "tanod_accepted":
      return t("Tanod on the way");
    case "tanod_arrived":
      return t("Tanod on scene");
    case "tanod_declined":
      return t("Tanod declined");
    case "tanod_cancelled":
      return t("Field assignment cancelled · {name}", { name: staffName(data, m.tanod as string) });
    case "field_report": {
      const result = FIELD_RESULT[m.result as FieldResult];
      return result ? t("Field report · {result}", { result: result[lang] }) : t("Field report · filed");
    }
    case "incident_linked":
      return t("Linked to incident {ref}", { ref: String(m.incidentRef ?? "") });
    case "incident_update":
      return t("Incident update");
    case "kp_filed":
      return t("Filed with the Lupon");
    case "kp_hearing":
      return t("Lupon hearing scheduled");
    case "kp_recorded":
      return t("Lupon hearing recorded");
    case "kp_closed":
      return t("Lupon case closed");
  }
}

function Activity({ r, data }: { r: StaffRequest; data: DeskSnapshot }) {
  const { lang, t } = useStaffLang();
  const [view, setView] = useState<"all" | "resident" | "internal">("all");
  const events = [...r.events].reverse().filter((e) => view === "all" || e.vis === view);
  return (
    <section aria-labelledby="activity-title" className="rounded-[24px] bg-card shadow-sheet">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2">
        <h2 id="activity-title" className="text-[17px] font-bold tracking-[-0.01em]">
          {t("Activity")}
        </h2>
        <div role="tablist" className="inline-flex rounded-full bg-fill p-[3px] text-[12.5px] font-semibold">
          {(
            [
              ["all", "All"],
              ["resident", "Resident-visible"],
              ["internal", "Internal"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn("h-7 rounded-full px-3 transition", view === k ? "bg-card shadow-sheet" : "text-muted-foreground hover:text-foreground")}>
              {t(label)}
            </button>
          ))}
        </div>
      </div>
      <ol className="grid pb-2">
        <AnimatePresence initial={false}>
          {events.map((e) => (
            <motion.li
              key={e.id}
              layout
              initial={{ opacity: 0, backgroundColor: "rgb(225 239 232)" }}
              animate={{ opacity: 1, backgroundColor: "rgb(255 255 255 / 0)" }}
              transition={{ backgroundColor: { duration: 1.6 } }}
              className="group/item relative grid grid-cols-[64px_minmax(0,1fr)] gap-3 px-5 py-3 after:absolute after:right-5 after:bottom-0 after:left-5 after:h-px after:bg-hairline last:after:hidden sm:grid-cols-[80px_minmax(0,1fr)]"
            >
              <span className="pt-0.5 text-[11.5px] leading-tight text-ink-3 tabular">
                {fmtDate(e.at, lang, { month: "short", day: "numeric" })}
                <br />
                {fmtDate(e.at, lang, { hour: "numeric", minute: "2-digit" })}
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
                  <span className="font-semibold">{eventTitle(e, data, t, lang)}</span>
                  {e.vis === "resident" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                      <Eye className="size-3" /> {t("resident sees")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-note px-2 text-[11px] font-semibold text-[#7a6200]">
                      <Lock className="size-2.5" /> {t("internal")}
                    </span>
                  )}
                </p>
                <p className="text-[12px] text-ink-3">{e.actor.kind === "staff" ? e.actor.name : e.actor.kind === "resident" ? t("Resident") : t("System")}</p>
                {e.text && (
                  <p
                    className={cn(
                      "mt-1.5 rounded-2xl px-3.5 py-2 text-[13.5px] leading-6 whitespace-pre-wrap",
                      e.vis === "internal" ? "ruled" : e.actor.kind === "resident" ? "bg-normal-soft" : "bg-fill",
                    )}
                  >
                    {e.text}
                  </p>
                )}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}

function Composer({ r }: { r: StaffRequest }) {
  const { data } = useStaff();
  const { act, pending } = useAct();
  const { t } = useStaffLang();
  const me = data!.me!;
  // Walk-in and phone reporters have no app account to receive messages; staff call them back.
  const canMessage = !!r.residentId && (can(me, "work", r) || can(me, "triage", r));
  const [mode, setMode] = useState<"resident" | "internal">(canMessage ? "resident" : "internal");
  const [text, setText] = useState("");
  const resident = mode === "resident";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await act("post", () => postUpdate({ id: r.id, text, vis: mode }), { success: resident ? "Sent · resident notified" : "Note saved" });
        if (res.ok) setText("");
      }}
      className={cn("overflow-hidden rounded-[24px] shadow-sheet transition-colors", resident ? "bg-card" : "ruled")}
    >
      <div className="flex items-center gap-1 px-3 pt-3">
        {(
          [
            ["resident", "Message resident", Eye],
            ["internal", "Internal note", NotebookPen],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            disabled={k === "resident" && !canMessage}
            onClick={() => setMode(k)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition disabled:opacity-40",
              mode === k ? (k === "resident" ? "bg-brand-soft text-brand-deep" : "bg-[#fbecb0] text-[#5e4b00]") : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" /> {t(label)}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="composer">
        {resident ? t("Message to resident") : t("Internal note")}
      </label>
      <textarea
        id="composer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={resident ? t("Write what the resident should know. Plain words; no internal details.") : t("Only staff can see this.")}
        className="block w-full resize-y bg-transparent px-5 py-3 text-[14px] leading-6 outline-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-4">
        <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-semibold", resident ? "text-primary" : "text-[#7a6200]")}>
          {resident ? <Eye className="size-3.5" /> : <Lock className="size-3.5" />}
          {resident ? t("Visible to the resident") : t("Internal · never shown to the resident")}
        </span>
        <button
          type="submit"
          disabled={text.trim().length < 2 || pending === "post"}
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold disabled:opacity-50", resident ? "bg-primary text-primary-foreground" : "bg-foreground text-background")}
        >
          {pending === "post" ? <Loader2 className="size-4 animate-spin" /> : resident ? <Send className="size-4" /> : <NotebookPen className="size-4" />}
          {resident ? t("Send to resident") : t("Save note")}
        </button>
      </div>
    </form>
  );
}

type DialogKind = null | "resolve" | "refer" | "assign" | "reopen" | "retriage" | "restrict";
type Proof = { kind: "none" } | { kind: "upload"; data: string } | { kind: "field"; id: string };

function ProofPicker({ value, onChange, candidates }: { value: Proof; onChange: (p: Proof) => void; candidates: DeskSnapshot["assignments"] }) {
  const { t } = useStaffLang();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const tile = "relative grid h-[72px] w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-fill transition hover:bg-fill-strong";
  const check = (
    <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-primary text-white shadow-sheet">
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-semibold">{t("Proof photo · optional")}</span>
      <span className="-mt-1 text-[12px] text-ink-3">{t("The resident sees it with the outcome. Avoid faces and plate numbers.")}</span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={t("Upload a proof photo")}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setBad(false);
          try {
            onChange({ kind: "upload", data: await compressPhoto(file) });
          } catch {
            setBad(true);
          } finally {
            setBusy(false);
          }
        }}
      />
      <div className="flex flex-wrap gap-2">
        {value.kind === "upload" ? (
          <button type="button" onClick={() => onChange({ kind: "none" })} aria-label={t("Remove uploaded photo")} className={tile}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.data} alt="" className="size-full object-cover" />
            {check}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/45 py-0.5 text-[10px] font-semibold text-white">
              <X className="size-3" /> {t("Remove")}
            </span>
          </button>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className={cn(tile, "content-center gap-1 text-[11.5px] font-semibold text-muted-foreground")}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
            {t("Upload")}
          </button>
        )}
        {candidates.map((photo, index) => {
          const selected = value.kind === "field" && value.id === photo.id;
          return <button key={photo.id} type="button" aria-pressed={selected} aria-label={t("Use field photo {n}", { n: index + 1 })} onClick={() => onChange(selected ? { kind: "none" } : { kind: "field", id: photo.id })} className={tile}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" src={`/api/field-photo/${photo.id}`} alt="" className="size-full object-cover" />
            {selected && check}
            <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-[10px] font-semibold text-white">{t("Field photo")}</span>
          </button>;
        })}
      </div>
      {bad && <p className="text-[12.5px] font-semibold text-high">{t("That photo couldn't be read. Try another one.")}</p>}
    </div>
  );
}

const OUTCOME_TEMPLATES: Record<Category, string[]> = {
  peace: ["Pinuntahan ng tanod at kinausap ang mga sangkot. Babantayan ang lugar ngayong linggo.", "Naipatawag sa Lupon ang dalawang panig para sa pag-uusap sa Sabado, 9 AM."],
  infra: ["Naayos na ng Public Works team ngayong araw. Salamat sa pag-ulat.", "Napalitan na ang ilaw sa poste. Pakisabi kung may iba pang patay na ilaw sa lugar."],
  sanitation: ["Nakolekta na ang basura at nalinis ang lugar. Idinagdag sa regular na ruta ng truck.", "Nalinis na ang kanal. Babalikan ito pagkatapos ng susunod na malakas na ulan."],
  documents: ["Handa na ang dokumento. Puwede na itong kunin sa Barangay Hall, Lunes–Sabado, 8 AM–5 PM. Dalhin ang valid ID."],
  social: ["Na-assess ng Social Services. Nakatakda ang pagbibigay ng tulong sa Biyernes sa Barangay Hall."],
};

function Actions({ r, data }: { r: StaffRequest; data: DeskSnapshot }) {
  const me = data.me!;
  const { act, pending } = useAct();
  const { lang, t } = useStaffLang();
  const claimFlow = useClaim();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [text, setText] = useState("");
  const [proof, setProof] = useState<Proof>({ kind: "none" });
  const [office, setOffice] = useState("");
  const [assignee, setAssignee] = useState("");
  const [cat, setCat] = useState<Category>(r.triage?.category ?? r.prediction.category);
  const [urg, setUrg] = useState<Urgency>(r.triage?.urgency ?? r.prediction.urgency);
  const category = r.triage?.category ?? r.prediction.category;

  const open = (k: DialogKind, preset = "") => {
    setText(preset);
    setProof({ kind: "none" });
    setDialog(k);
  };

  const buttons: ReactNode[] = [];
  const primary = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-[14.5px] font-bold text-primary-foreground shadow-press transition hover:bg-brand-deep disabled:opacity-60";
  const secondary = "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-fill px-3 text-[13.5px] font-semibold transition hover:bg-fill-strong";

  if (r.status === "queued" && !r.assigneeId && can(me, "claim", r))
    buttons.push(
      <button key="claim" type="button" disabled={claimFlow.pending === `claim-${r.id}`} onClick={() => void claimFlow.claim(r)} className={primary}>
        {claimFlow.pending === `claim-${r.id}` ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} {t("Claim case")}
      </button>,
    );
  if (r.status === "queued" && can(me, "work", r) && (r.assigneeId === me.id || me.role === "supervisor"))
    buttons.push(
      <button key="start" type="button" disabled={pending === "start"} onClick={() => void act("start", () => startWork({ id: r.id }), { success: "Work started · resident notified" })} className={primary}>
        {pending === "start" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} {t("Start work")}
      </button>,
    );
  if (r.status === "in_progress" && can(me, "work", r))
    buttons.push(
      <button key="resolve" type="button" onClick={() => open("resolve", OUTCOME_TEMPLATES[category][0])} className={primary}>
        <CheckCircle2 className="size-4" /> {t("Record outcome")}
      </button>,
      ...(data.settings.referrals.length ? [<button key="refer" type="button" onClick={() => open("refer")} className={secondary}>
        <Forward className="size-4" /> {t("Refer elsewhere")}
      </button>] : []),
    );
  if (can(me, "assign", r))
    buttons.push(
      <button key="assign" type="button" onClick={() => open("assign")} className={secondary}>
        <Shuffle className="size-4" /> {r.assigneeId ? t("Reassign") : t("Assign")}
      </button>,
    );
  if (can(me, "reopen", r))
    buttons.push(
      <button key="reopen" type="button" onClick={() => open("reopen")} className={primary}>
        <RotateCcw className="size-4" /> {t("Reopen case")}
      </button>,
    );
  if (can(me, "retriage", r))
    buttons.push(
      <button key="retriage" type="button" onClick={() => open("retriage")} className={secondary}>
        <Tags className="size-4" /> {t("Change category or urgency")}
      </button>,
    );
  if (me.role === "supervisor" && !["duplicate", "withdrawn"].includes(r.status))
    buttons.push(
      <button key="restrict" type="button" onClick={() => open("restrict")} className={secondary}>
        <Lock className="size-4" /> {r.restricted ? t("Remove restriction") : t("Restrict access")}
      </button>,
    );

  async function submit() {
    let res;
    if (dialog === "resolve")
      res = await act(
        "dlg",
        () =>
          resolveRequest({
            id: r.id,
            outcome: text,
            photo: proof.kind === "upload" ? proof.data : null,
            fieldProof: proof.kind === "field" ? proof.id : undefined,
          }),
        { success: "Resolved · resident notified" },
      );
    else if (dialog === "refer") res = await act("dlg", () => referRequest({ id: r.id, office, message: text }), { success: "Referred · resident notified" });
    else if (dialog === "assign") res = await act("dlg", () => assignRequest({ id: r.id, assigneeId: assignee, reason: text }), { success: "Assignment updated" });
    else if (dialog === "reopen") res = await act("dlg", () => reopenRequest({ id: r.id, reason: text }), { success: "Case reopened" });
    else if (dialog === "retriage") res = await act("dlg", () => changeTriage({ id: r.id, category: cat, urgency: urg, reason: text }), { success: "Triage updated" });
    else if (dialog === "restrict") res = await act("dlg", () => setRestricted({ id: r.id, restricted: !r.restricted, reason: text }), { success: r.restricted ? "Restriction removed" : "Case restricted" });
    if (res?.ok) setDialog(null);
  }

  const assignable = data.staff.filter((s) => s.active && (s.role === "supervisor" || (s.role === "handler" && s.team === r.team)));
  const disabled =
    pending === "dlg" ||
    (dialog === "resolve" && text.trim().length < 10) ||
    (dialog === "refer" && (!office || text.trim().length < 8)) ||
    (dialog === "assign" && (!assignee || text.trim().length < 3)) ||
    ((dialog === "reopen" || dialog === "retriage" || dialog === "restrict") && text.trim().length < 5);

  const TITLES: Record<Exclude<DialogKind, null>, [string, string]> = {
    resolve: ["Record the outcome", "The resident sees this exactly as written and gets a notification. They can ask for a follow-up within 14 days."],
    refer: ["Refer to another office", "Closes the case here and tells the resident who handles it now."],
    assign: [r.assigneeId ? "Reassign case" : "Assign case", "Reassigning or assigning outside the routed team needs a reason for the audit log."],
    reopen: ["Reopen this case", "The resident is told it was reopened. Your reason stays internal."],
    retriage: ["Change triage", "Changing category may move the case to another team's queue. The reason is logged."],
    restrict: [r.restricted ? "Remove restriction" : "Restrict access", "Restricted cases are visible only to the assigned handler and supervisors, and stay off hotspot maps."],
  };

  return (
    <>
      {buttons.length ? <div className="grid gap-2">{buttons}</div> : <p className="text-[13px] text-muted-foreground">{t("No actions available to you on this case.")}</p>}
      {claimFlow.dialog}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          {dialog && (
            <DialogHeader>
              <DialogTitle>{t(TITLES[dialog][0])}</DialogTitle>
              <DialogDescription>{t(TITLES[dialog][1])}</DialogDescription>
            </DialogHeader>
          )}
          <div className="grid gap-3">
            {dialog === "resolve" && (
              <div className="flex flex-wrap gap-1.5">
                {OUTCOME_TEMPLATES[category].map((tpl) => (
                  <button key={tpl} type="button" onClick={() => setText(tpl)} className="rounded-full bg-fill px-3 py-1.5 text-left text-[12px] text-foreground/80 transition hover:bg-fill-strong">
                    {tpl.length > 56 ? `${tpl.slice(0, 54)}…` : tpl}
                  </button>
                ))}
              </div>
            )}
            {dialog === "refer" && (
              <div className="grid max-h-56 gap-1.5 overflow-y-auto">
                {data.settings.referrals.map((o) => (
                  <label key={o.id} className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl bg-fill p-3 text-[13px] transition hover:bg-fill-strong", office === o.id && "bg-brand-soft hover:bg-brand-soft")}>
                    <input
                      type="radio"
                      name="office"
                      checked={office === o.id}
                      onChange={() => {
                        setOffice(o.id);
                        setText(`Inirefer namin ito sa ${o.name} (${o.contact}). Sila na ang hahawak nito.`);
                      }}
                      className="mt-1 accent-[#0b5d4b]"
                    />
                    <span>
                      <span className="block font-semibold">{o.name}</span>
                      <span className="block text-[12px] text-muted-foreground">{o.scope}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {dialog === "assign" && (
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="field h-11 rounded-xl px-3 text-[14px]">
                <option value="">{t("Choose a person…")}</option>
                {assignable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.role === "handler" ? teamName(data, s.team) : t(ROLE[s.role].en)}
                    {s.role === "handler" && s.team !== r.team ? ` (${t("other team")})` : ""}
                  </option>
                ))}
              </select>
            )}
            {dialog === "retriage" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <select value={cat} onChange={(e) => setCat(e.target.value as Category)} className="field h-11 rounded-xl px-3 text-[14px]">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY[c].short[lang]}
                    </option>
                  ))}
                </select>
                <select value={urg} onChange={(e) => setUrg(e.target.value as Urgency)} className="field h-11 rounded-xl px-3 text-[14px]">
                  {URGENCIES.map((u) => (
                    <option key={u} value={u}>
                      {URGENCY[u][lang]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">{dialog === "resolve" ? t("Outcome (resident sees this)") : dialog === "refer" ? t("Message to resident") : t("Reason")}</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={dialog === "resolve" || dialog === "refer" ? 4 : 2} className="field rounded-xl px-3.5 py-2.5 text-[14px]" />
            </label>
            {dialog === "resolve" && <ProofPicker value={proof} onChange={setProof} candidates={data.assignments.filter((a) => a.requestId === r.id && a.status === "done" && a.hasPhoto && !a.redacted)} />}
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setDialog(null)} className="h-10 rounded-full bg-fill px-4 text-[14px] font-semibold transition hover:bg-fill-strong">
              {t("Cancel")}
            </button>
            <button type="button" disabled={disabled} onClick={submit} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-bold text-primary-foreground disabled:opacity-50">
              {pending === "dlg" && <Loader2 className="size-4 animate-spin" />} {t("Confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[24px] bg-card p-5 shadow-sheet", className)}>
      <h2 className="mb-3 text-[15px] font-bold tracking-[-0.01em]">{title}</h2>
      {children}
    </section>
  );
}

export function CaseWorkspace({ id }: { id: string }) {
  const { data } = useStaff();
  const now = useNow(30_000);
  const { lang, t } = useStaffLang();
  const r = data?.requests.find((q) => q.id === id);
  const p = useMemo(() => (r ? priority(r, now) : null), [r, now]);

  if (!data?.me) return null;
  if (!r) return <Empty icon={Eye} title={t("Case not found")} body={t("This case is no longer available to your role.")} />;
  if (r.redacted) {
    return (
      <div className="mx-auto grid max-w-xl gap-4 pt-6">
        <Link href="/barangay/queue" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground">
          <ArrowLeft className="size-4" /> {t("Back")}
        </Link>
        <ReportBody r={r} data={data} />
      </div>
    );
  }

  const me = data.me;
  const cat = r.triage?.category ?? r.prediction.category;
  const targets = data.settings.targets;
  const overdue = isOverdue(r, targets, now);
  const due = dueAt(r, targets) - now;
  const teamRank = r.status === "queued" ? rankQueue(data.requests.filter((q) => q.status === "queued" && q.team === r.team), now).findIndex((x) => x.req.id === r.id) + 1 : 0;
  const inIntake = INTAKE_STATUSES.includes(r.status);
  const back = inIntake ? { href: `/barangay/inbox?id=${r.id}`, label: t("Inbox") } : r.assigneeId === me.id ? { href: "/barangay/mine", label: t("My cases") } : { href: "/barangay/queue", label: t("Queue") };
  const fieldTeam = data.assignments.some((item) => item.requestId === r.id) || can(me, "dispatch", r);

  if (inIntake && can(me, "triage", r)) {
    return (
      <div className="mx-auto grid max-w-4xl gap-5">
        <Link href={back.href} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {back.label}
        </Link>
        <TriageWorkspace r={r} />
        <IncidentHint r={r} />
        {fieldTeam && <Card title={t("Field team")}><FieldTeam r={r} /></Card>}
        <KpPanel r={r} />
        <Activity r={r} data={data} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Link href={back.href} className="inline-flex items-center gap-1.5 justify-self-start text-[13.5px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {back.label}
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <CategoryIcon category={cat} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-semibold">{r.ref}</span>
            <StatusBadge status={r.status} lang={lang} />
            {r.triage && <UrgencyTag urgency={r.triage.urgency} lang={lang} />}
            {r.dangerNow && <DangerTag />}
            {r.restricted && <RestrictedTag />}
            {overdue && (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-high px-2.5 text-[11.5px] font-bold text-white">
                <AlarmClock className="size-3.5" /> {t("Overdue {time}", { time: dur(-due) })}
              </span>
            )}
          </div>
          <h1 className="mt-1.5 text-[22px] leading-tight font-bold tracking-tight sm:text-[26px]">{CATEGORY[cat][lang]}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {teamName(data, r.team)} · {r.assigneeId ? t("Assigned to {name}", { name: staffName(data, r.assigneeId) }) : t("Unassigned")} · {t("opened {time}", { time: rel(r.createdAt, lang, now) })}
          </p>
        </div>
      </header>

      {/* On phones the next action comes before the evidence; on desktop it sits in the sticky side column. */}
      <Card title={t("Next step")} className="lg:hidden">
        <Actions r={r} data={data} />
      </Card>
      {fieldTeam && <Card title={t("Field team")} className="lg:hidden"><FieldTeam r={r} /></Card>}
      <div className="empty:hidden lg:hidden"><KpPanel r={r} /></div>
      <IncidentHint r={r} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
          <section aria-label={t("Report")} className="rounded-[24px] bg-card p-5 shadow-sheet sm:p-6">
            <ReportBody r={r} data={data} />
          </section>
          {r.status === "resolved" && r.outcome && (
            <section aria-label={t("Outcome")} className="grid gap-3 rounded-[24px] bg-brand-soft/70 p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-brand-deep">
                <CheckCircle2 className="size-5" /> {t("Outcome the resident sees")}
              </h2>
              <p className="text-[15px] leading-relaxed">{r.outcome}</p>
              {r.outcomePhoto && (
                <a href={`/api/photo/${r.id}?portal=staff&kind=outcome`} target="_blank" rel="noreferrer" className="block max-w-sm overflow-hidden rounded-2xl bg-fill">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/photo/${r.id}?portal=staff&kind=outcome`} alt={t("Proof of resolution")} className="aspect-[4/3] w-full object-cover" />
                </a>
              )}
            </section>
          )}
          {(r.status === "in_progress" || r.status === "queued" || r.status === "resolved" || r.status === "referred") && <Composer r={r} />}
          <Activity r={r} data={data} />
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-6">
          <Card title={t("Next step")} className="max-lg:hidden">
            <Actions r={r} data={data} />
          </Card>
          {fieldTeam && <Card title={t("Field team")} className="max-lg:hidden"><FieldTeam r={r} /></Card>}
          <div className="empty:hidden max-lg:hidden"><KpPanel r={r} /></div>

          {p && (r.status === "queued" || r.status === "in_progress") && (
            <Card title={t("Priority")}>
              <ScoreBar p={p} />
              <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-[13px]">
                <dt className="text-muted-foreground">{r.status === "in_progress" ? t("Open for") : t("Waiting")}</dt>
                <dd className="text-right font-semibold tabular">{dur(p.waitMin * 60_000)}</dd>
                {teamRank > 0 && (
                  <>
                    <dt className="text-muted-foreground">{t("Team queue")}</dt>
                    <dd className="text-right font-semibold tabular">#{teamRank}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">{t("Response target")}</dt>
                <dd className={cn("text-right font-semibold tabular", overdue && "text-high")}>{r.status === "in_progress" ? t("met") : overdue ? `−${dur(-due)}` : t("in {time}", { time: dur(due) })}</dd>
              </dl>
            </Card>
          )}

          {r.triage && (
            <Card title={t("Triage record")}>
              <div className="grid gap-2 text-[13px]">
                <p className="flex items-start gap-2">
                  <Brain className="mt-0.5 size-4 shrink-0 text-gold" />
                  <span>
                    {t("Model suggested")} <strong>{CATEGORY[r.prediction.category].short[lang]}</strong> ({Math.round(r.prediction.categoryP * 100)}%) ·{" "}
                    <strong>{URGENCY[r.prediction.urgency][lang]}</strong> ({Math.round(r.prediction.urgencyP * 100)}%)
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <Avatar name={staffName(data, r.triage.by)} className="size-5 text-[9px]" />
                  <span>
                    {t("Confirmed by {name} {time}", { name: staffName(data, r.triage.by), time: rel(r.triage.at, lang, now) })}
                    {(r.triage.correctedCategory || r.triage.correctedUrgency) && (
                      <span className="mt-1 block w-fit rounded-full bg-fill px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground">
                        {r.triage.correctedCategory && r.triage.correctedUrgency ? t("Corrected category and urgency") : r.triage.correctedCategory ? t("Corrected category") : t("Corrected urgency")}
                      </span>
                    )}
                  </span>
                </p>
              </div>
            </Card>
          )}

          <Card title={t("Details")}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-muted-foreground">{t("Reporter")}</dt>
              <dd className="text-right">
                <Reporter r={r} data={data} />
              </dd>
              <dt className="text-muted-foreground">{t("Channel")}</dt>
              <dd className="text-right">{CHANNEL[r.channel][lang]}</dd>
              <dt className="text-muted-foreground">{t("Submitted")}</dt>
              <dd className="text-right">{fmtDate(r.createdAt, lang)}</dd>
              {r.startedAt && (
                <>
                  <dt className="text-muted-foreground">{t("Started")}</dt>
                  <dd className="text-right">{fmtDate(r.startedAt, lang)}</dd>
                </>
              )}
              {r.closedAt && (
                <>
                  <dt className="text-muted-foreground">{t("Closed")}</dt>
                  <dd className="text-right">{fmtDate(r.closedAt, lang)}</dd>
                </>
              )}
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
