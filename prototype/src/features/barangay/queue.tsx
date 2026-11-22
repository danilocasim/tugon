"use client";

import { AlarmClock, ArrowUpRight, Info, ListOrdered, Loader2, Play, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CategoryIcon, UrgencyTag } from "@/components/tugon/badges";
import { useAct, useNow, useStaff } from "@/hooks/use-live";
import { CATEGORIES, CATEGORY, URGENCIES, URGENCY, type Category, type Urgency } from "@/lib/domain";
import { dur } from "@/lib/format";
import { PUROKS, placeLabel } from "@/lib/geo";
import { can, canAccess } from "@/lib/policy";
import { T_MAX_MIN, dueAt, isOverdue, rankQueue, type Priority } from "@/lib/priority";
import type { StaffRequest } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { startWork } from "@/server/actions";
import { useClaim } from "./claim";
import { useStaffLang } from "./i18n";
import { Avatar, Empty, NoAccess, PageHeader, RestrictedTag, ScoreBar, staffName, teamName } from "./ui";

const select = "h-9 rounded-full bg-fill pr-2 pl-3.5 text-[13px] font-semibold outline-none transition hover:bg-fill-strong focus-visible:ring-2 focus-visible:ring-primary/40";

export function WorkQueue() {
  const { data } = useStaff();
  const now = useNow(15_000);
  const { claim, pending, dialog } = useClaim();
  const { lang, t } = useStaffLang();
  const me = data?.me;
  const [team, setTeam] = useState<string>("all");
  const [cat, setCat] = useState<Category | "all">("all");
  const [urg, setUrg] = useState<Urgency | "all">("all");
  const [purok, setPurok] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const scopeTeam = me?.role === "handler" ? me.team : team === "all" ? null : team;
  const targets = data?.settings.targets;

  const { ranked, working } = useMemo(() => {
    if (!data || !targets) return { ranked: [], working: [] };
    const inScope = data.requests.filter(
      (r) =>
        (r.status === "queued" || r.status === "in_progress") &&
        (!scopeTeam || r.team === scopeTeam) &&
        (cat === "all" || r.triage?.category === cat) &&
        (urg === "all" || r.triage?.urgency === urg) &&
        (purok === "all" || r.location?.purok === purok) &&
        (!overdueOnly || isOverdue(r, targets, now)),
    );
    return {
      ranked: rankQueue(inScope.filter((r) => r.status === "queued"), now),
      working: inScope.filter((r) => r.status === "in_progress").sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0)),
    };
  }, [data, targets, scopeTeam, cat, urg, purok, overdueOnly, now]);

  if (!data || !me || !targets) return null;
  if (!canAccess(me, "queue")) return <NoAccess title={t("The work queue isn't part of your role")} role={me.role} />;

  const overdueCount = data.requests.filter((r) => (!scopeTeam || r.team === scopeTeam) && isOverdue(r, targets, now)).length;
  const nextUp = ranked.find((x) => !x.req.assigneeId && can(me, "claim", x.req));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        title={t("Work queue")}
        sub={
          <>
            {me.role === "handler" ? teamName(data, me.team) : t("All teams")} · {t("ranked by urgency, category weight and waiting time · updates live")}
          </>
        }
        actions={
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[13px] font-semibold transition hover:bg-fill-strong">
                <Info className="size-4" /> {t("How ranking works")}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[340px] text-[13px] leading-relaxed">
              <p className="font-bold">{t("Priority score")}</p>
              <p className="mt-1 font-mono text-[12px]">0.5·U/3 + 0.3·W/3 + 0.2·min(1, wait/{T_MAX_MIN}m)</p>
              <p className="mt-2 text-muted-foreground">
                {t("Urgency (U) and category weight (W) come from confirmed triage. Waiting time slowly lifts older cases; ties go to whoever has waited longest.")}
              </p>
              <p className="mt-2 text-muted-foreground">
                {t(
                  "Aging stops at {max} minutes, so a routine request can never outrank a fresh high-urgency one. Overdue escalation fills that gap: cases past their response target ({high}h / {medium}h / {normal}h) are flagged to supervisors.",
                  { max: T_MAX_MIN, high: targets.high, medium: targets.medium, normal: targets.normal },
                )}
              </p>
            </PopoverContent>
          </Popover>
        }
      />

      {overdueCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-high-soft px-4 py-3">
          <AlarmClock className="size-5 text-high" />
          <p className="flex-1 text-[13.5px] text-[#7f2311]">
            <strong>
              {overdueCount === 1 ? t("{n} case is past the response target.", { n: overdueCount }) : t("{n} cases are past the response target.", { n: overdueCount })}
            </strong>{" "}
            {me.role === "supervisor" ? t("Reassign or start them.") : t("A supervisor has been flagged.")}
          </p>
          <button
            type="button"
            onClick={() => setOverdueOnly((v) => !v)}
            className="h-8 rounded-full bg-card px-3.5 text-[12.5px] font-semibold text-high shadow-sheet"
          >
            {overdueOnly ? t("Show all") : t("Show overdue")}
          </button>
        </div>
      )}

      {nextUp && (
        <motion.section layout className="relative overflow-hidden rounded-[24px] bg-brand-deep p-5 text-primary-foreground shadow-lift sm:p-6">
          <svg viewBox="0 0 120 120" className="pointer-events-none absolute -top-10 -right-8 size-44 opacity-[0.08]" aria-hidden>
            {[0, 72, 144, 216, 288].map((d) => (
              <ellipse key={d} cx="60" cy="38" rx="11" ry="22" transform={`rotate(${d} 60 60)`} fill="none" stroke="currentColor" strokeWidth="3" />
            ))}
          </svg>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-gold">
            <Sparkles className="size-3.5" /> {t("Next up for you")}
          </p>
          <div className="relative mt-3 flex flex-wrap items-center gap-4">
            <CategoryIcon category={nextUp.req.triage!.category} size="lg" className="bg-white/12 text-white max-sm:hidden" />
            <div className="min-w-[220px] flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-mono font-semibold">{nextUp.req.ref}</span>
                <UrgencyTag urgency={nextUp.req.triage!.urgency} lang={lang} className="bg-white/95" />
                <span className="text-primary-foreground/70">{t("waiting {time}", { time: dur(nextUp.p.waitMin * 60_000) })}</span>
              </p>
              <p className="mt-1 line-clamp-2 text-[16px] leading-snug font-semibold">{nextUp.req.text}</p>
              <p className="mt-1 text-[12.5px] text-primary-foreground/70">{placeLabel(nextUp.req, lang)}</p>
            </div>
            <div className="flex gap-2 max-sm:w-full max-sm:[&>*]:flex-1 max-sm:[&>*]:justify-center">
              <Link href={`/barangay/cases/${nextUp.req.id}`} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/12 px-4 text-[13.5px] font-semibold transition hover:bg-white/20">
                {t("Open")}
              </Link>
              <button
                type="button"
                disabled={pending === `claim-${nextUp.req.id}`}
                onClick={() => void claim(nextUp.req)}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[13.5px] font-bold text-brand-deep transition hover:bg-gold-soft disabled:opacity-60"
              >
                {pending === `claim-${nextUp.req.id}` ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} {t("Claim")}
              </button>
            </div>
          </div>
        </motion.section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {me.role !== "handler" && (
          <select aria-label={t("Team")} value={team} onChange={(e) => setTeam(e.target.value)} className={select}>
            <option value="all">{t("All teams")}</option>
            {data.teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
        )}
        <select aria-label={t("Category")} value={cat} onChange={(e) => setCat(e.target.value as Category | "all")} className={select}>
          <option value="all">{t("All categories")}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY[c].short[lang]}
            </option>
          ))}
        </select>
        <select aria-label={t("Urgency")} value={urg} onChange={(e) => setUrg(e.target.value as Urgency | "all")} className={select}>
          <option value="all">{t("Any urgency")}</option>
          {URGENCIES.map((u) => (
            <option key={u} value={u}>
              {URGENCY[u][lang]}
            </option>
          ))}
        </select>
        <select aria-label={t("Purok")} value={purok} onChange={(e) => setPurok(e.target.value)} className={select}>
          <option value="all">{t("All puroks")}</option>
          {PUROKS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-fill px-3.5 text-[13px] font-semibold transition hover:bg-fill-strong">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="accent-[#c2381f]" /> {t("Overdue only")}
        </label>
      </div>

      <section aria-labelledby="waiting-title" className="grid gap-3">
        <h2 id="waiting-title" className="flex items-baseline gap-2 text-[18px] font-bold tracking-[-0.01em]">
          {t("Waiting")} <span className="text-[14px] font-semibold text-ink-3 tabular">{ranked.length}</span>
        </h2>
        {ranked.length > 0 && (
          <div className="overflow-hidden rounded-[20px] bg-card shadow-sheet">
            <div className="hidden grid-cols-[44px_minmax(0,1fr)_110px_150px_92px_140px_150px] gap-3 border-b border-hairline px-4 py-2.5 text-[12px] font-medium text-ink-3 lg:grid">
              <span>{t("Rank")}</span>
              <span>{t("Case")}</span>
              <span>{t("Urgency")}</span>
              <span>{t("Place")}</span>
              <span>{t("Waiting")}</span>
              <span>{t("Priority")}</span>
              <span />
            </div>
            <ol>
              <AnimatePresence initial={false}>
                {ranked.map(({ req: r, p }, i) => (
                  <motion.li key={r.id} layout className="group/item" transition={{ type: "spring", stiffness: 500, damping: 40 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <QueueRow r={r} p={p} rank={i + 1} now={now} onClaim={() => void claim(r)} claiming={pending === `claim-${r.id}`} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          </div>
        )}
        {!ranked.length && <Empty icon={ListOrdered} title={t("Nothing waiting")} body={t("New cases appear here as soon as intake confirms them.")} />}
      </section>

      {working.length > 0 && (
        <section aria-labelledby="working-title" className="grid gap-3">
          <h2 id="working-title" className="flex items-baseline gap-2 text-[18px] font-bold tracking-[-0.01em]">
            {t("In progress")} <span className="text-[14px] font-semibold text-ink-3 tabular">{working.length}</span>
          </h2>
          <ul className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {working.map((r) => (
              <li key={r.id}>
                <Link href={`/barangay/cases/${r.id}`} className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-sheet transition hover:shadow-lift">
                  <CategoryIcon category={r.triage!.category} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[12px]">
                      <span className="font-mono font-semibold">{r.ref}</span>
                      <UrgencyTag urgency={r.triage!.urgency} lang={lang} className="h-5 text-[11px]" />
                    </span>
                    <span className="mt-0.5 block truncate text-[13.5px]">{r.redacted ? t("Restricted case") : r.text}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
                    <Avatar name={staffName(data, r.assigneeId)} className="size-6 text-[10px]" />
                    {r.startedAt && dur(now - r.startedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dialog}
    </div>
  );
}

function QueueRow({ r, p, rank, now, onClaim, claiming }: { r: StaffRequest; p: Priority; rank: number; now: number; onClaim: () => void; claiming: boolean }) {
  const { data } = useStaff();
  const { act, pending } = useAct();
  const { lang, t } = useStaffLang();
  const me = data!.me!;
  const targets = data!.settings.targets;
  const overdue = isOverdue(r, targets, now);
  const due = dueAt(r, targets) - now;

  const action = r.assigneeId ? (
    r.assigneeId === me.id ? (
      <button
        type="button"
        disabled={pending === "start"}
        onClick={() => void act("start", () => startWork({ id: r.id }), { success: "Work started · resident notified" })}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[12.5px] font-bold text-primary-foreground"
      >
        <Play className="size-3.5" /> {t("Start")}
      </button>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <Avatar name={staffName(data!, r.assigneeId)} className="size-6 text-[10px]" /> {staffName(data!, r.assigneeId).split(" ").slice(-2).join(" ")}
      </span>
    )
  ) : can(me, "claim", r) ? (
    <button type="button" disabled={claiming} onClick={onClaim} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[12.5px] font-bold transition hover:bg-fill-strong disabled:opacity-60">
      {claiming ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />} {t("Claim")}
    </button>
  ) : (
    <span className="text-[12px] text-ink-3">{teamName(data!, r.team)}</span>
  );

  return (
    <div
      className={cn(
        // Inset divider: stops short of the sheet edges, hidden on the last row.
        "relative grid items-center gap-x-3 gap-y-2 px-4 py-3.5 transition after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-hairline hover:bg-fill/40 group-last/item:after:hidden",
        "grid-cols-[32px_minmax(0,1fr)_auto] lg:grid-cols-[44px_minmax(0,1fr)_110px_150px_92px_140px_150px]",
        overdue && "bg-high-soft/45 hover:bg-high-soft/70",
      )}
    >
      <span className={cn("text-[15px] font-bold tabular", rank <= 3 ? "text-foreground" : "text-ink-3")}>{rank}</span>
      <Link href={`/barangay/cases/${r.id}`} className="group flex min-w-0 items-center gap-3">
        <CategoryIcon category={r.triage!.category} size="sm" />
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[12px]">
            <span className="font-mono font-semibold">{r.ref}</span>
            {r.restricted && <RestrictedTag />}
            {overdue && <span className="rounded-full bg-high px-2 py-0.5 text-[10.5px] font-bold text-white">{t("Overdue {time}", { time: dur(-due) })}</span>}
            <ArrowUpRight className="size-3.5 text-ink-3 opacity-0 transition group-hover:opacity-100" />
          </span>
          <span className="mt-0.5 block truncate text-[14px]">{r.redacted ? t("Restricted case") : r.text}</span>
        </span>
      </Link>
      <span className="lg:hidden">{action}</span>
      <span className="col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:contents">
        <span>
          <UrgencyTag urgency={r.triage!.urgency} lang={lang} />
        </span>
        <span className="truncate text-[12.5px] text-muted-foreground">{placeLabel(r, lang) ?? "—"}</span>
        <span className={cn("text-[12.5px] tabular", overdue ? "font-semibold text-high" : "text-muted-foreground")}>{dur(p.waitMin * 60_000)}</span>
        <ScoreBar p={p} compact />
      </span>
      <span className="hidden justify-self-end lg:block">{action}</span>
    </div>
  );
}
