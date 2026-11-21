"use client";

/**
 * Lupon Tagapamayapa docket (Katarungang Pambarangay). Timelines and forms follow
 * RA 7160 and the usual KP forms, but each barangay should confirm them against
 * its own Lupon practice and current DILG templates.
 */
import { ArrowLeft, CalendarPlus, Check, FileText, Gavel, Loader2, Printer, Scale, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAct, useNow, useStaff } from "@/hooks/use-live";
import { KP_RESULT, KP_STAGE, type KpCase, type KpHearingResult } from "@/lib/domain";
import { DAY, HOUR, fmtDate, rel } from "@/lib/format";
import { CONCILIATION_DAYS, MEDIATION_DAYS, REPUDIATION_DAYS, canDismiss, canIssueCfa, kpDeadline, nextHearing } from "@/lib/kp";
import { canAccess } from "@/lib/policy";
import type { StaffRequest } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { closeKpCase, extendConciliation, fileKpCase, markSummonsServed, recordHearing, scheduleHearing } from "@/server/lupon";
import { useStaffLang, type Vars } from "./i18n";
import { Empty, NoAccess, PageHeader, staffName } from "./ui";

const STAGE_TONE: Record<KpCase["stage"], string> = {
  mediation: "bg-gold-soft text-[#7a4c00]",
  conciliation: "bg-normal-soft text-normal",
  settled: "bg-brand-soft text-brand-deep",
  cfa: "bg-fill text-foreground",
  dismissed: "bg-fill text-ink-3",
  withdrawn: "bg-fill text-ink-3",
};

export function StageChip({ kp, className }: { kp: KpCase; className?: string }) {
  const { lang } = useStaffLang();
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-semibold whitespace-nowrap", STAGE_TONE[kp.stage], className)}>{KP_STAGE[kp.stage][lang]}</span>;
}

/** "Mediation · 4 days left", or overdue. Null once the case is closed. */
function deadlineInfo(kp: KpCase, now: number, t: (m: string, v?: Vars) => string) {
  const due = kpDeadline(kp);
  if (due === null) return null;
  const start = kp.stage === "mediation" ? kp.mediationStart : kp.conciliationStart!;
  const total = due - start;
  const left = due - now;
  const days = Math.ceil(Math.abs(left) / DAY);
  return {
    due,
    share: Math.min(1, Math.max(0, (now - start) / total)),
    overdue: left < 0,
    label: left < 0 ? (days === 1 ? t("{n} day past the period", { n: days }) : t("{n} days past the period", { n: days })) : days === 1 ? t("{n} day left", { n: days }) : t("{n} days left", { n: days }),
  };
}

const parties = (kp: KpCase) => `${kp.complainant} vs. ${kp.respondent}`;

export function LuponDocket() {
  const { data } = useStaff();
  const now = useNow(60_000);
  const { lang, t } = useStaffLang();
  if (!data?.me) return null;
  if (!canAccess(data.me, "lupon")) return <NoAccess title={t("The Lupon docket is kept by the secretary, the Peace & Order desk and supervisors")} role={data.me.role} />;
  if (!data.settings.luponEnabled) return <Empty icon={Gavel} title={t("Lupon has not been enabled")} body={t("The barangay must approve the local rules and forms before the docket can be used.")} />;
  const open = data.kp.filter((k) => KP_STAGE[k.stage].open).sort((a, b) => (kpDeadline(a) ?? Infinity) - (kpDeadline(b) ?? Infinity));
  const closed = data.kp.filter((k) => !KP_STAGE[k.stage].open);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={t("Lupon docket")}
        sub={t("Katarungang Pambarangay cases. Mediation runs {mediation} days, conciliation {conciliation} days (extendable once). Confirm timelines with your Lupon.", {
          mediation: MEDIATION_DAYS,
          conciliation: CONCILIATION_DAYS,
        })}
      />
      <section className="grid gap-3">
        <h2 className="flex items-baseline gap-2 text-[18px] font-bold tracking-[-0.01em]">
          {t("Pending")} <span className="text-[14px] font-semibold text-ink-3 tabular">{open.length}</span>
        </h2>
        {open.length ? (
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-sheet">
            {open.map((kp) => {
              const d = deadlineInfo(kp, now, t);
              const next = nextHearing(kp, now);
              return (
                <li key={kp.id} className="border-b border-hairline last:border-0">
                  <Link href={`/barangay/lupon/${kp.id}`} className="grid gap-2 px-4 py-3.5 transition hover:bg-fill/40 sm:grid-cols-[minmax(0,1fr)_200px_170px] sm:items-center sm:gap-4">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[12px] text-ink-3">
                        <span className="font-mono font-semibold text-foreground/80">{kp.number}</span>
                        <StageChip kp={kp} />
                      </span>
                      <span className="mt-1 block truncate text-[15px] font-semibold">{parties(kp)}</span>
                      <span className="block truncate text-[12.5px] text-muted-foreground">{kp.nature}</span>
                    </span>
                    <span className="text-[13px]">
                      <span className="block text-[11.5px] text-ink-3">{t("Next hearing")}</span>
                      {next ? fmtDate(next.at, lang, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : <span className="font-semibold text-[#7a4c00]">{t("Not scheduled")}</span>}
                    </span>
                    {d && (
                      <span className="grid gap-1 text-[12.5px]">
                        <span className={cn("font-semibold", d.overdue && "text-high")}>{d.label}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-fill">
                          <span className={cn("block h-full rounded-full", d.overdue ? "bg-high" : d.share > 0.7 ? "bg-gold" : "bg-primary")} style={{ width: `${d.share * 100}%` }} />
                        </span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon={Scale} title={t("No open Lupon cases")} body={t("File a peace-and-order case with the Lupon from its case page.")} />
        )}
      </section>
      {closed.length > 0 && (
        <section className="grid gap-3">
          <h2 className="flex items-baseline gap-2 text-[18px] font-bold tracking-[-0.01em]">
            {t("Closed")} <span className="text-[14px] font-semibold text-ink-3 tabular">{closed.length}</span>
          </h2>
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-sheet">
            {closed.map((kp) => (
              <li key={kp.id} className="border-b border-hairline last:border-0">
                <Link href={`/barangay/lupon/${kp.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-fill/40">
                  <span className="font-mono text-[12.5px] font-semibold">{kp.number}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{parties(kp)}</span>
                  <StageChip kp={kp} />
                  <span className="text-[12px] text-ink-3 max-sm:hidden">{kp.closedAt && fmtDate(kp.closedAt, lang, { month: "short", day: "numeric" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Datetime-local form value, always expressed in Manila time. */
function tomorrowNine() {
  return `${new Date(Date.now() + DAY + 8 * 3_600_000).toISOString().slice(0, 10)}T09:00`;
}

type CloseKind = "cfa" | "dismissed" | "withdrawn";
const CLOSE_LABEL: Record<CloseKind, { title: string; body: string; placeholder: string }> = {
  cfa: {
    title: "Issue certificate to file action",
    body: "The parties may now go to court or the proper office. The resident's case closes with a plain-language explanation.",
    placeholder: "Hal. Hindi nagkasundo sa Pangkat; tumangging magbayad ang inirereklamo.",
  },
  dismissed: { title: "Dismiss the complaint", body: "The complainant did not appear without a valid reason.", placeholder: "Hal. Dalawang beses hindi sumipot ang nagrereklamo." },
  withdrawn: { title: "Mark as withdrawn", body: "The complainant withdrew the complaint.", placeholder: "Hal. Binawi ng nagrereklamo; nagkaayos na sila sa labas." },
};

export function KpCaseDetail({ id }: { id: string }) {
  const { data } = useStaff();
  const now = useNow(30_000);
  const { act, pending } = useAct();
  const [when, setWhen] = useState(tomorrowNine);
  const [recording, setRecording] = useState<string | null>(null);
  const [result, setResult] = useState<KpHearingResult>("continued");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [closing, setClosing] = useState<CloseKind | null>(null);
  const [closeNote, setCloseNote] = useState("");
  const { lang, t } = useStaffLang();

  if (!data?.me) return null;
  if (!canAccess(data.me, "lupon")) return <NoAccess title={t("The Lupon docket is kept by the secretary, the Peace & Order desk and supervisors")} role={data.me.role} />;
  const kp = data.kp.find((k) => k.id === id);
  if (!kp) return <Empty icon={Gavel} title={t("Lupon case not found")} body={t("This proceeding is not available to your role.")} />;

  const req = data.requests.find((r) => r.id === kp.requestId);
  const open = KP_STAGE[kp.stage].open;
  const d = deadlineInfo(kp, now, t);
  const hearings = [...kp.hearings].sort((a, b) => a.at - b.at);
  const cfa = canIssueCfa(kp, now);
  const dismiss = canDismiss(kp);
  const repudiationEnds = kp.settlement ? kp.settlement.at + REPUDIATION_DAYS * DAY : null;
  const print = (doc: string, hearing?: string) => `/barangay/lupon/${kp.id}/print?doc=${doc}${hearing ? `&hearing=${hearing}` : ""}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Link href="/barangay/lupon" className="inline-flex items-center gap-1.5 justify-self-start text-[13.5px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("Lupon docket")}
      </Link>
      <header className="grid gap-1">
        <p className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-mono font-semibold">{kp.number}</span>
          <StageChip kp={kp} />
          {req && (
            <Link href={`/barangay/cases/${req.id}`} className="font-mono text-[12px] text-primary hover:underline">
              {req.ref}
            </Link>
          )}
        </p>
        <h1 className="text-[24px] leading-tight font-bold tracking-tight sm:text-[28px]">{parties(kp)}</h1>
        <p className="text-[13px] text-muted-foreground">
          {t("Filed {date} by {name} · respondent at {address}", { date: fmtDate(kp.filedAt, lang), name: staffName(data, kp.filedBy), address: kp.respondentAddress })}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
          <section className="rounded-[24px] bg-card p-5 shadow-sheet sm:p-6">
            <h2 className="text-[12px] font-semibold text-ink-3">{t("Nature of the dispute")}</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed">{kp.nature}</p>
            {kp.settlement && (
              <div className="mt-4 rounded-2xl bg-brand-soft/70 p-4">
                <h3 className="text-[13px] font-bold text-brand-deep">{t("Amicable settlement · {date}", { date: fmtDate(kp.settlement.at, lang) })}</h3>
                <p className="mt-1 text-[14px] leading-relaxed whitespace-pre-line">{kp.settlement.text}</p>
                {repudiationEnds && (
                  <p className="mt-2 text-[12.5px] text-brand-deep">
                    {repudiationEnds > now
                      ? t("Either party may repudiate until {date}.", { date: fmtDate(repudiationEnds, lang, { month: "long", day: "numeric" }) })
                      : t("Repudiation period over: the settlement now has the force of a final judgment.")}
                  </p>
                )}
              </div>
            )}
            {kp.closeNote && (
              <div className="mt-4 rounded-2xl bg-fill p-4">
                <h3 className="text-[13px] font-bold">
                  {KP_STAGE[kp.stage][lang]} · {kp.closedAt && fmtDate(kp.closedAt, lang)}
                </h3>
                <p className="mt-1 text-[14px]">{kp.closeNote}</p>
              </div>
            )}
          </section>

          <section className="grid gap-3">
            <h2 className="text-[18px] font-bold tracking-[-0.01em]">{t("Hearings")}</h2>
            {hearings.length ? (
              <ol className="overflow-hidden rounded-[20px] bg-card shadow-sheet">
                {hearings.map((h) => {
                  const due = h.at <= now + 2 * HOUR;
                  return (
                    <li key={h.id} className="grid gap-2 border-b border-hairline px-4 py-3.5 last:border-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-[14.5px] font-semibold">{fmtDate(h.at, lang, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                        <span className="text-[12.5px] text-muted-foreground">{h.kind === "mediation" ? t("Mediation · Punong Barangay") : t("Conciliation · Pangkat")}</span>
                        <span className="ml-auto text-[12px] text-ink-3">{rel(h.at, lang, now)}</span>
                      </div>
                      {h.result ? (
                        <p className="text-[13.5px]">
                          <span className={cn("font-semibold", h.result === "settled" && "text-brand-deep", (h.result === "failed" || h.result.endsWith("absent")) && "text-[#7a4c00]")}>{KP_RESULT[h.result][lang]}</span>
                          {h.notes && <span className="text-muted-foreground"> · {h.notes}</span>}
                        </p>
                      ) : !open ? (
                        <p className="text-[13.5px] text-ink-3">{t("Not held · case closed")}</p>
                      ) : h.kind !== kp.stage ? (
                        <p className="text-[13.5px] text-ink-3">{t("Not held · case moved to the next stage")}</p>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {h.summonsServed ? (
                            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-[12.5px] font-semibold text-brand-deep">
                              <Check className="size-3.5" /> {t("Summons served")}
                            </span>
                          ) : (
                            open && (
                              <button
                                type="button"
                                disabled={pending === `served-${h.id}`}
                                onClick={() => void act(`served-${h.id}`, () => markSummonsServed({ kpId: kp.id, hearingId: h.id }), { success: "Summons marked served" })}
                                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fill px-3 text-[12.5px] font-semibold transition hover:bg-fill-strong"
                              >
                                {t("Mark summons served")}
                              </button>
                            )
                          )}
                          <Link href={print("summons", h.id)} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fill px-3 text-[12.5px] font-semibold transition hover:bg-fill-strong">
                            <Printer className="size-3.5" /> {t("Summons")}
                          </Link>
                          {open && (
                            <button
                              type="button"
                              disabled={!due}
                              title={due ? undefined : t("Record the result on or after the hearing date")}
                              onClick={() => {
                                setRecording(h.id);
                                setResult("continued");
                                setNotes("");
                                setTerms("");
                              }}
                              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[12.5px] font-bold text-primary-foreground disabled:opacity-40"
                            >
                              {t("Record result")}
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="rounded-2xl bg-fill px-4 py-3 text-[13.5px] text-muted-foreground">{t("No hearing scheduled yet. Summon both parties within the mediation period.")}</p>
            )}
            {open && (
              <form
                className="flex flex-wrap items-end gap-2 rounded-[20px] bg-card p-4 shadow-sheet"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await act("schedule", () => scheduleHearing({ kpId: kp.id, at: Date.parse(`${when}:00+08:00`) }), { success: t("Hearing scheduled") });
                }}
              >
                <label className="grid min-w-[220px] flex-1 gap-1.5">
                  <span className="text-[13px] font-semibold">{kp.stage === "conciliation" ? t("Schedule a Pangkat hearing") : t("Schedule a mediation hearing")} · Manila</span>
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="field h-11 rounded-xl px-3 text-[14px]" />
                </label>
                <button type="submit" disabled={!when || pending === "schedule"} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13.5px] font-bold text-background disabled:opacity-50">
                  {pending === "schedule" ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />} {t("Schedule")}
                </button>
              </form>
            )}
          </section>
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-6">
          {d && (
            <section className="grid gap-2 rounded-[24px] bg-card p-5 shadow-sheet">
              <h2 className="flex items-center gap-2 text-[15px] font-bold">
                <Timer className="size-4 text-ink-3" /> {kp.stage === "mediation" ? t("Mediation period") : kp.extended ? t("Conciliation period (extended)") : t("Conciliation period")}
              </h2>
              <p className={cn("text-[22px] font-bold tabular", d.overdue && "text-high")}>{d.label}</p>
              <span className="h-2 overflow-hidden rounded-full bg-fill">
                <span className={cn("block h-full rounded-full", d.overdue ? "bg-high" : d.share > 0.7 ? "bg-gold" : "bg-primary")} style={{ width: `${d.share * 100}%` }} />
              </span>
              <p className="text-[12.5px] text-muted-foreground">{t("Ends {date}", { date: fmtDate(d.due, lang, { weekday: "long", month: "long", day: "numeric" }) })}</p>
              {kp.stage === "conciliation" && !kp.extended && (
                <button
                  type="button"
                  disabled={pending === "extend"}
                  onClick={() => void act("extend", () => extendConciliation({ kpId: kp.id }), { success: t("Extended by {n} days", { n: CONCILIATION_DAYS }) })}
                  className="mt-1 h-9 justify-self-start rounded-full bg-fill px-3.5 text-[13px] font-semibold transition hover:bg-fill-strong"
                >
                  {t("Extend {n} days", { n: CONCILIATION_DAYS })}
                </button>
              )}
            </section>
          )}

          {open && (
            <section className="grid gap-2 rounded-[24px] bg-card p-5 shadow-sheet">
              <h2 className="text-[15px] font-bold">{t("Close the case")}</h2>
              <button
                type="button"
                disabled={!cfa}
                onClick={() => setClosing("cfa")}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground text-[14px] font-bold text-background disabled:opacity-35"
              >
                <FileText className="size-4" /> {t("Issue certificate to file action")}
              </button>
              {!cfa && <p className="text-[12px] text-ink-3">{t("Available after a failed Pangkat hearing, an expired conciliation period, or a respondent who didn't appear.")}</p>}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={!dismiss} onClick={() => setClosing("dismissed")} className="h-10 rounded-full bg-fill text-[13px] font-semibold transition hover:bg-fill-strong disabled:opacity-40">
                  {t("Dismiss")}
                </button>
                <button type="button" onClick={() => setClosing("withdrawn")} className="h-10 rounded-full bg-fill text-[13px] font-semibold transition hover:bg-fill-strong">
                  {t("Withdrawn")}
                </button>
              </div>
            </section>
          )}

          <section className="grid gap-2 rounded-[24px] bg-card p-5 shadow-sheet">
            <h2 className="text-[15px] font-bold">{t("Documents")}</h2>
            {kp.stage === "settled" && (
              <Link href={print("settlement")} target="_blank" className="flex h-10 items-center gap-2 rounded-xl bg-fill px-3 text-[13.5px] font-semibold transition hover:bg-fill-strong">
                <Printer className="size-4 text-ink-3" /> {t("Amicable settlement")}
              </Link>
            )}
            {kp.stage === "cfa" && (
              <Link href={print("cfa")} target="_blank" className="flex h-10 items-center gap-2 rounded-xl bg-fill px-3 text-[13.5px] font-semibold transition hover:bg-fill-strong">
                <Printer className="size-4 text-ink-3" /> {t("Certificate to file action")}
              </Link>
            )}
            {hearings
              .filter((h) => open || h.result)
              .map((h) => (
                <Link key={h.id} href={print("summons", h.id)} target="_blank" className="flex h-10 items-center gap-2 rounded-xl bg-fill px-3 text-[13.5px] font-semibold transition hover:bg-fill-strong">
                  <Printer className="size-4 text-ink-3" /> {t("Summons · {date}", { date: fmtDate(h.at, lang, { month: "short", day: "numeric" }) })}
                </Link>
              ))}
            {!hearings.length && kp.stage !== "settled" && kp.stage !== "cfa" && <p className="text-[12.5px] text-muted-foreground">{t("Summons appear once a hearing is scheduled.")}</p>}
            <p className="text-[11.5px] text-ink-3">{t("Based on the usual KP forms. Check wording against current DILG templates before use.")}</p>
          </section>
        </aside>
      </div>

      <Dialog open={recording !== null} onOpenChange={(o) => !o && setRecording(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Record hearing result")}</DialogTitle>
            <DialogDescription>
              {kp.stage === "mediation" ? t("No agreement at mediation sends the case to a Pangkat ng Tagapagkasundo.") : t("A settlement closes the case and resolves the resident's report.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div role="radiogroup" aria-label={t("Result")} className="grid gap-1.5">
              {(Object.keys(KP_RESULT) as KpHearingResult[]).map((k) => (
                <label key={k} className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl bg-fill px-3 py-2.5 text-[13.5px] transition hover:bg-fill-strong", result === k && "bg-brand-soft hover:bg-brand-soft")}>
                  <input type="radio" name="kp-result" checked={result === k} onChange={() => setResult(k)} className="accent-[#0b5d4b]" />
                  {KP_RESULT[k][lang]}
                </label>
              ))}
            </div>
            {result === "settled" && (
              <label className="grid gap-1.5">
                <span className="text-[13px] font-semibold">{t("Terms of the settlement")}</span>
                <textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  rows={4}
                  placeholder="Hal. Babayaran ni G. Ramirez ang ₱3,000 sa loob ng 30 araw. Hindi na magpapatugtog nang malakas pagkalipas ng 10 PM."
                  className="field rounded-xl px-3.5 py-2.5 text-[14px]"
                />
              </label>
            )}
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">{t("Notes · internal")}</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="field rounded-xl px-3.5 py-2.5 text-[14px]" />
            </label>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setRecording(null)} className="h-10 rounded-full bg-fill px-4 text-[14px] font-semibold transition hover:bg-fill-strong">
              {t("Cancel")}
            </button>
            <button
              type="button"
              disabled={pending === "record" || (result === "settled" && terms.trim().length < 20)}
              onClick={async () => {
                const r = await act("record", () => recordHearing({ kpId: kp.id, hearingId: recording!, result, notes, settlement: terms }), {
                  success: result === "settled" ? "Settled · case resolved" : "Hearing recorded",
                });
                if (r.ok) setRecording(null);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
            >
              {pending === "record" && <Loader2 className="size-4 animate-spin" />} {t("Save result")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closing !== null} onOpenChange={(o) => !o && setClosing(null)}>
        <DialogContent className="sm:max-w-lg">
          {closing && (
            <>
              <DialogHeader>
                <DialogTitle>{t(CLOSE_LABEL[closing].title)}</DialogTitle>
                <DialogDescription>{t(CLOSE_LABEL[closing].body)}</DialogDescription>
              </DialogHeader>
              <label className="grid gap-1.5">
                <span className="text-[13px] font-semibold">{t("Note for the record")}</span>
                <textarea value={closeNote} onChange={(e) => setCloseNote(e.target.value)} rows={3} placeholder={CLOSE_LABEL[closing].placeholder} className="field rounded-xl px-3.5 py-2.5 text-[14px]" />
              </label>
              <DialogFooter>
                <button type="button" onClick={() => setClosing(null)} className="h-10 rounded-full bg-fill px-4 text-[14px] font-semibold transition hover:bg-fill-strong">
                  {t("Cancel")}
                </button>
                <button
                  type="button"
                  disabled={closeNote.trim().length < 3 || pending === "close"}
                  onClick={async () => {
                    const r = await act("close", () => closeKpCase({ kpId: kp.id, outcome: closing, note: closeNote }), {
                      success: t("{stage} · resident notified", { stage: KP_STAGE[closing][lang] }),
                    });
                    if (r.ok) {
                      setClosing(null);
                      setCloseNote("");
                    }
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-[14px] font-bold text-background disabled:opacity-50"
                >
                  {pending === "close" && <Loader2 className="size-4 animate-spin" />} {t("Confirm")}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Case page card: the Lupon proceeding for this case, or a way to file one. */
export function KpPanel({ r }: { r: StaffRequest }) {
  const { data } = useStaff();
  const now = useNow(60_000);
  const { act, pending } = useAct();
  const router = useRouter();
  const [filing, setFiling] = useState(false);
  const [form, setForm] = useState({ complainant: "", respondent: "", respondentAddress: "", nature: "" });
  const [confirmed, setConfirmed] = useState(false);
  const { lang, t } = useStaffLang();
  if (!data?.me || !data.settings.luponEnabled || !canAccess(data.me, "lupon") || r.redacted) return null;
  const kps = data.kp.filter((k) => k.requestId === r.id);
  const current = kps.find((k) => KP_STAGE[k.stage].open) ?? kps[0];
  const category = r.triage?.category ?? r.prediction.category;
  const fileable = category === "peace" && (r.status === "queued" || r.status === "in_progress") && !kps.some((k) => KP_STAGE[k.stage].open);
  if (!current && !fileable) return null;

  const reporter = r.residentId ? data.residents[r.residentId]?.name : r.contact?.name;
  const next = current && nextHearing(current, now);

  return (
    <section className="grid gap-2.5 rounded-[24px] bg-card p-5 shadow-sheet">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <Scale className="size-4 text-ink-3" /> Lupon
      </h2>
      {current ? (
        <Link href={`/barangay/lupon/${current.id}`} className="grid gap-1 rounded-2xl bg-fill px-3.5 py-3 transition hover:bg-fill-strong">
          <span className="flex items-center gap-2">
            <span className="font-mono text-[12.5px] font-semibold">{current.number}</span>
            <StageChip kp={current} />
          </span>
          <span className="text-[13px] text-muted-foreground">
            {next
              ? t("Hearing {date}", { date: fmtDate(next.at, lang, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) })
              : KP_STAGE[current.stage].open
                ? t("No hearing scheduled")
                : current.closedAt && t("Closed {date}", { date: fmtDate(current.closedAt, lang) })}
          </span>
        </Link>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">{t("Dispute between residents of the barangay? File it for mediation by the Punong Barangay.")}</p>
          <button
            type="button"
            onClick={() => {
              setForm({ complainant: reporter ?? "", respondent: "", respondentAddress: "", nature: r.text.slice(0, 600) });
              setConfirmed(false);
              setFiling(true);
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-fill text-[13.5px] font-semibold transition hover:bg-fill-strong"
          >
            <Gavel className="size-4" /> {t("File with the Lupon")}
          </button>
        </>
      )}

      <Dialog open={filing} onOpenChange={setFiling}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("File with the Lupon Tagapamayapa")}</DialogTitle>
            <DialogDescription>{t("Starts the {n}-day mediation period. Both parties should live in the same city or municipality.", { n: MEDIATION_DAYS })}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[13px] font-semibold">{t("Complainant")}</span>
                <input value={form.complainant} onChange={(e) => setForm({ ...form, complainant: e.target.value })} className="field h-11 rounded-xl px-3.5 text-[14px]" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[13px] font-semibold">{t("Respondent")}</span>
                <input value={form.respondent} onChange={(e) => setForm({ ...form, respondent: e.target.value })} className="field h-11 rounded-xl px-3.5 text-[14px]" />
              </label>
            </div>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">{t("Respondent's address")}</span>
              <input value={form.respondentAddress} onChange={(e) => setForm({ ...form, respondentAddress: e.target.value })} placeholder="Hal. 14 Ilang-Ilang St., Purok 3" className="field h-11 rounded-xl px-3.5 text-[14px]" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">{t("Nature of the dispute")}</span>
              <textarea value={form.nature} onChange={(e) => setForm({ ...form, nature: e.target.value })} rows={4} className="field rounded-xl px-3.5 py-2.5 text-[14px]" />
            </label>
            <label className="flex items-start gap-2.5 rounded-xl bg-fill p-3 text-[13px]">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              {t("I verified that this dispute is eligible under the approved Lupon rules.")}
            </label>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setFiling(false)} className="h-10 rounded-full bg-fill px-4 text-[14px] font-semibold transition hover:bg-fill-strong">
              {t("Cancel")}
            </button>
            <button
              type="button"
              disabled={!confirmed || pending === "file" || form.complainant.trim().length < 2 || form.respondent.trim().length < 2 || form.respondentAddress.trim().length < 3 || form.nature.trim().length < 10}
              onClick={async () => {
                const res = await act("file", () => fileKpCase({ requestId: r.id, ...form, confirmed }));
                if (res.ok) {
                  setFiling(false);
                  router.push(`/barangay/lupon/${res.data.id}`);
                }
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
            >
              {pending === "file" && <Loader2 className="size-4 animate-spin" />} {t("File case")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
