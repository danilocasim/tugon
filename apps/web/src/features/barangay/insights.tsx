"use client";

import { AlarmClock, Brain, Clock, Download, FileText, Info, Inbox, Siren, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { CategoryIcon } from "@/components/tugon/badges";
import { BarangayMap } from "@/components/tugon/barangay-map";
import { useAct, useStaff } from "@/hooks/use-live";
import { CATEGORIES, CATEGORY, URGENCIES, URGENCY, isOpen, type Category } from "@/lib/domain";
import { HOUR, dur, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { readInsights } from "@/server/analytics-data";
import { updateHotspotParams } from "@/server/hotspot-settings";
import { CreateIncidentDialog } from "./incidents";
import { useStaffLang } from "./i18n";
import { PageHeader } from "./ui";

const LOCATED: Category[] = CATEGORIES.filter((c) => CATEGORY[c].located);
const URG_BAR = { high: "bg-high", medium: "bg-gold", normal: "bg-normal" } as const;

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: typeof Inbox; label: string; value: ReactNode; sub?: ReactNode; tone?: "alert" }) {
  return (
    <div className="grid content-start gap-1.5 rounded-2xl p-4">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground">
        <Icon className={cn("size-3.5", tone === "alert" && "text-high")} /> {label}
      </p>
      <p className={cn("text-[30px] leading-none font-bold tracking-[-0.02em] tabular", tone === "alert" && "text-high")}>{value}</p>
      {sub && <p className="text-[12px] text-ink-3">{sub}</p>}
    </div>
  );
}

function Panel({ title, children, action, className }: { title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[24px] bg-card p-5 shadow-sheet sm:p-6", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-[17px] font-bold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Insights({ report }: { report: Awaited<ReturnType<typeof readInsights>> }) {
  const { data } = useStaff();
  const router = useRouter();
  const { act, pending } = useAct();
  const { lang, t } = useStaffLang();
  const { days, algo, cats, analysis, m, clusterRows, openByTeam } = report;
  const [changing, startTransition] = useTransition();
  const [eps, setEps] = useState(report.epsM);
  const [minPts, setMinPts] = useState(report.min);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [incidentFor, setIncidentFor] = useState<string | null>(null);

  function apply(next: { days?: number; algo?: string; eps?: number | null; min?: number | null; cats?: Category[] }) {
    const q = new URLSearchParams({ days: String(next.days ?? days), algo: next.algo ?? algo, cats: (next.cats ?? cats).join(",") });
    const radius = "eps" in next ? next.eps : report.epsM === report.hotspot.epsM ? null : report.epsM;
    const minimum = "min" in next ? next.min : report.min === report.hotspot.minPts ? null : report.min;
    if (radius != null) q.set("eps", String(radius));
    if (minimum != null) q.set("min", String(minimum));
    setFocusId(null);
    setIncidentFor(null);
    startTransition(() => router.replace(`/barangay/insights?${q}`, { scroll: false }));
  }

  const focused = clusterRows.find((c) => c.id === focusId);
  const focus = focused ? { ...focused.center, zoom: 16 } : null;
  const paramsChanged = report.epsM !== report.hotspot.epsM || report.min !== report.hotspot.minPts;
  const maxCat = Math.max(1, ...m.byCategory.map((c) => c.total));
  const maxDay = Math.max(1, ...m.perDay.map((d) => d.count));
  const maxTeam = Math.max(1, ...openByTeam.map((x) => x.assigned + x.waiting));
  const incidentCluster = clusterRows.find((c) => c.id === incidentFor);
  const deskReports = data?.requests;
  const candidates = useMemo(() => {
    if (!incidentCluster) return [];
    const known = new Map(deskReports?.map((r) => [r.id, r]));
    return incidentCluster.candidates.map((candidate) => {
      const report = known.get(candidate.id);
      if (!report) return candidate;
      return !report.restricted && !report.redacted && !report.incidentId && isOpen(report) ? report : null;
    }).filter((candidate) => candidate !== null);
  }, [incidentCluster, deskReports]);

  function exportCsv() {
    const rows = [["section", "key", "value"]];
    rows.push(["window_days", String(days), ""]);
    for (const c of m.byCategory) for (const u of URGENCIES) rows.push(["reports_by_category_urgency", `${CATEGORY[c.category].en} / ${URGENCY[u].en}`, String(c.byUrgency[u])]);
    for (const d of m.perDay) rows.push(["reports_per_day", new Date(d.day + 8 * HOUR).toISOString().slice(0, 10), String(d.count)]);
    for (const c of clusterRows) rows.push(["hotspot", `${c.place} (${CATEGORY[c.dominant].en})`, String(c.count)]);
    rows.push(["median_first_action_minutes", "", m.medianFirstActionMs ? String(Math.round(m.medianFirstActionMs / 60000)) : ""]);
    rows.push(["median_resolution_hours", "", m.medianResolutionMs ? (m.medianResolutionMs / HOUR).toFixed(1) : ""]);
    const blob = new Blob([rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `tugon-insights-${days}d.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const agreement = m.suggestions ? Math.round((m.agreed / m.suggestions) * 100) : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5" aria-busy={changing}>
      <PageHeader
        title={t("Insights")}
        sub={t("{barangay} · aggregate data only, no personal details", { barangay: report.barangay })}
        actions={
          <>
            <div role="radiogroup" aria-label={t("Time window")} className="inline-flex rounded-full bg-fill p-[3px] text-[13px] font-semibold">
              {[7, 14, 30].map((d) => (
                <button key={d} role="radio" aria-checked={days === d} onClick={() => apply({ days: d })} className={cn("h-8 rounded-full px-3.5 transition", days === d ? "bg-card shadow-sheet" : "text-muted-foreground hover:bg-foreground/5")}>
                  {t("{n} days", { n: d })}
                </button>
              ))}
            </div>
            <button type="button" onClick={exportCsv} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[13px] font-semibold transition hover:bg-fill-strong">
              <Download className="size-4" /> {t("Export CSV")}
            </button>
            <Link href="/barangay/reports" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[13px] font-semibold transition hover:bg-fill-strong">
              <FileText className="size-4" /> {t("Monthly report")}
            </Link>
          </>
        }
      />

      <section aria-label={t("Key figures")} className="grid grid-cols-2 gap-1 rounded-[24px] bg-card p-1.5 shadow-sheet sm:grid-cols-3 xl:grid-cols-5">
        <Kpi
          icon={Inbox}
          label={t("Open backlog")}
          value={m.backlog}
          sub={t("{intake} intake · {queued} queued · {working} working", {
            intake: (m.byStatus.received ?? 0) + (m.byStatus.review ?? 0) + (m.byStatus.needs_info ?? 0),
            queued: m.byStatus.queued ?? 0,
            working: m.byStatus.in_progress ?? 0,
          })}
        />
        <Kpi icon={Timer} label={t("Median to first action")} value={m.medianFirstActionMs ? dur(m.medianFirstActionMs) : "—"} sub={t("submitted → staff review")} />
        <Kpi icon={Clock} label={t("Median to resolution")} value={m.medianResolutionMs ? dur(m.medianResolutionMs) : "—"} sub={t("resolved cases in window")} />
        <Kpi
          icon={AlarmClock}
          label={t("Overdue now")}
          value={m.overdue}
          sub={t("targets {high}h / {medium}h / {normal}h", report.targets)}
          tone={m.overdue ? "alert" : undefined}
        />
        <Kpi
          icon={Brain}
          label={t("Model agreement")}
          value={agreement !== null ? `${agreement}%` : "—"}
          sub={t("{agreed}/{suggestions} confirmed as suggested · {missed} High missed", { agreed: m.agreed, suggestions: m.suggestions, missed: m.missedHigh })}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative min-w-0">
          <BarangayMap clusters={analysis.clusters} focus={focus} label={t("Hotspot map")} className="h-[420px] sm:h-[520px]" />
          <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-2">
            <span className="pointer-events-auto inline-flex items-center gap-3 rounded-full bg-card/95 px-3.5 py-2 text-[12px] shadow-lift backdrop-blur">
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full border-2 border-dashed border-high bg-high/10" /> {t("Cluster")}
              </span>
            </span>
          </div>
        </div>

        <Panel
          title={t("Hotspot analysis")}
          action={
            <div role="radiogroup" aria-label={t("Algorithm")} className="inline-flex rounded-full bg-fill p-[3px] text-[12px] font-semibold">
              {(
                [
                  ["dbscan", "DBSCAN"],
                  ["kmeans", "K-Means k=3"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} role="radio" aria-checked={algo === k} onClick={() => apply({ algo: k })} className={cn("h-7 rounded-full px-3 whitespace-nowrap transition", algo === k ? "bg-card shadow-sheet" : "text-muted-foreground hover:text-foreground")}>
                  {label}
                </button>
              ))}
            </div>
          }
          className="grid content-start"
        >
          <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-fill p-3 text-center">
            <div>
              <dt className="text-[11.5px] text-muted-foreground">{t("Clusters")}</dt>
              <dd className="text-[22px] font-bold tabular">{analysis.clusters.length}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] text-muted-foreground">{t("Noise")}</dt>
              <dd className="text-[22px] font-bold tabular">{Math.round(analysis.noiseShare * 100)}%</dd>
            </div>
            <div>
              <dt className="text-[11.5px] text-muted-foreground">{t("Silhouette")}</dt>
              <dd className="text-[22px] font-bold tabular">{analysis.score !== null ? analysis.score.toFixed(2) : "—"}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11.5px] text-ink-3">{t("{n} pinned reports · Haversine distance", { n: analysis.n })}</p>
          {analysis.sampled && <p className="text-[11.5px] text-ink-3">{t("Map analysis is limited to the 600 most recent eligible pins.")}</p>}

          {algo === "dbscan" ? (
            <div className="mt-4 grid gap-4">
              <label className="grid gap-2">
                <span className="flex justify-between text-[12.5px] font-semibold">
                  {t("Radius ε")} <span className="tabular">{eps} m</span>
                </span>
                <Slider min={40} max={250} step={5} value={[eps]} onValueChange={([v]) => setEps(v)} onValueCommit={([v]) => apply({ eps: v })} aria-label={t("Radius epsilon in meters")} />
              </label>
              <label className="grid gap-2">
                <span className="flex justify-between text-[12.5px] font-semibold">
                  MinPts <span className="tabular">{minPts}</span>
                </span>
                <Slider min={3} max={10} step={1} value={[minPts]} onValueChange={([v]) => setMinPts(v)} onValueCommit={([v]) => apply({ min: v })} aria-label={t("Minimum points")} />
              </label>
              {paramsChanged && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending === "save"}
                    onClick={() => void act("save", () => updateHotspotParams({ epsM: report.epsM, minPts: report.min }), { success: "Saved as default" }).then((res) => {
                      if (res.ok) apply({ eps: null, min: null });
                    })}
                    className="h-9 flex-1 rounded-full bg-primary text-[12.5px] font-bold text-primary-foreground"
                  >
                    {t("Save as default")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEps(report.hotspot.epsM);
                      setMinPts(report.hotspot.minPts);
                      apply({ eps: null, min: null });
                    }}
                    className="h-9 rounded-full bg-fill px-4 text-[12.5px] font-semibold transition hover:bg-fill-strong"
                  >
                    {t("Reset")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-normal-soft p-3.5 text-[12.5px] leading-snug text-normal">
              {t("K-Means assigns every report to one of three clusters, including isolated ones. DBSCAN instead leaves sparse reports as noise — the thesis comparison.")}
            </p>
          )}

          <fieldset className="mt-4">
            <legend className="mb-2 text-[12px] font-semibold text-muted-foreground">{t("Categories")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {LOCATED.map((c) => {
                const on = cats.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => apply({ cats: on ? (cats.length > 1 ? cats.filter((x) => x !== c) : cats) : [...cats, c] })}
                    className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition", on ? "bg-foreground text-background" : "bg-fill text-muted-foreground hover:bg-fill-strong")}
                  >
                    {CATEGORY[c].short[lang]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {algo === "dbscan" && (
            <ol className="mt-4 grid gap-1.5">
              {clusterRows.map((c, i) => {
                const startable = c.candidates.length;
                return (
                  <li key={c.id} className={cn("grid rounded-2xl bg-fill/60 transition hover:bg-fill", focusId === c.id && "bg-high-soft hover:bg-high-soft")}>
                    <button type="button" aria-expanded={focusId === c.id} onClick={() => setFocusId(c.id === focusId ? null : c.id)} className="flex min-w-0 items-center gap-3 p-2.5 text-left">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-bold text-background tabular">{c.count}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">
                          {t("#{n} · near {place}", { n: i + 1, place: c.place })}
                        </span>
                        <span className="block text-[11.5px] text-muted-foreground">
                          {Math.round(c.share * 100)}% {CATEGORY[c.dominant].short[lang].toLowerCase()} · {fmtDate(c.first, lang, { month: "short", day: "numeric" })}–{fmtDate(c.last, lang, { month: "short", day: "numeric" })}
                        </span>
                      </span>
                      <CategoryIcon category={c.dominant} size="sm" />
                    </button>
                    {focusId === c.id && startable >= 2 && (
                      <button
                        type="button"
                        onClick={() => setIncidentFor(c.id)}
                        className="mx-2.5 mb-2.5 inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-card px-3 text-[12.5px] font-semibold shadow-sheet"
                      >
                        <Siren className="size-3.5 text-high" /> {t("Start an incident from {n} open reports", { n: startable })}
                      </button>
                    )}
                  </li>
                );
              })}
              {!clusterRows.length && <p className="text-[12.5px] text-muted-foreground">{t("No dense areas with these settings.")}</p>}
            </ol>
          )}
          {incidentCluster && (
            <CreateIncidentDialog
              key={incidentCluster.id}
              open
              onOpenChange={(o) => !o && setIncidentFor(null)}
              candidates={candidates}
              defaultTitle={t("{category} near {place}", { category: CATEGORY[incidentCluster.dominant].short[lang], place: incidentCluster.place })}
            />
          )}

          <p className="mt-4 flex gap-2 text-[11.5px] leading-snug text-ink-3">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {t("Shows where reports were made, not how often problems happen. Restricted cases, routine inquiries, duplicates and purok-only locations are excluded.")}
          </p>
        </Panel>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Panel title={t("Reports by category")} action={<span className="text-[12px] text-muted-foreground">{t("last {n} days", { n: days })}</span>}>
          <ul className="grid gap-3">
            {m.byCategory.map((c) => (
              <li key={c.category} className="grid grid-cols-[132px_minmax(0,1fr)_36px] items-center gap-3 text-[13px] sm:grid-cols-[170px_minmax(0,1fr)_36px]">
                <span className="flex items-center gap-2 truncate font-medium">
                  <CategoryIcon category={c.category} size="sm" className="size-6 rounded-md" /> {CATEGORY[c.category].short[lang]}
                </span>
                <span className="flex h-3 overflow-hidden rounded-full bg-fill">
                  {URGENCIES.map((u) => (
                    <motion.span key={u} className={URG_BAR[u]} initial={{ width: 0 }} animate={{ width: `${(c.byUrgency[u] / maxCat) * 100}%` }} transition={{ duration: 0.6 }} title={`${URGENCY[u][lang]}: ${c.byUrgency[u]}`} />
                  ))}
                </span>
                <span className="text-right font-semibold tabular">{c.total}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex gap-3 text-[11.5px] text-muted-foreground">
            {URGENCIES.map((u) => (
              <span key={u} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-sm", URG_BAR[u])} /> {URGENCY[u][lang]}
              </span>
            ))}
          </p>
        </Panel>

        <Panel title={t("New reports per day")} action={<span className="text-[12px] text-muted-foreground">{t("last {n} days", { n: m.perDay.length })}</span>}>
          <div className="flex h-40 items-end gap-1.5" role="img" aria-label={t("Reports per day")}>
            {m.perDay.map((d, i) => (
              <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
                <motion.span
                  className={cn("rounded-t-md", i === m.perDay.length - 1 ? "bg-primary" : "bg-primary/35 group-hover:bg-primary/60")}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(3, (d.count / maxDay) * 100)}%` }}
                  transition={{ duration: 0.5, delay: i * 0.02 }}
                />
                <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background tabular group-hover:block">{d.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11.5px] text-ink-3">
            <span>{fmtDate(m.perDay[0].day, lang, { month: "short", day: "numeric" })}</span>
            <span>{t("Today")}</span>
          </div>
        </Panel>

        <Panel title={t("Median time to start work, by urgency")}>
          <ul className="grid gap-3">
            {m.startByUrgency.map((x) => {
              const target = report.targets[x.urgency] * HOUR;
              const max = Math.max(...m.startByUrgency.map((y) => y.ms ?? 0), target) * 1.1;
              return (
                <li key={x.urgency} className="grid grid-cols-[80px_minmax(0,1fr)_70px] items-center gap-3 text-[13px]">
                  <span className="font-medium">{URGENCY[x.urgency][lang]}</span>
                  <span className="relative h-3 rounded-full bg-fill">
                    <motion.span className={cn("absolute inset-y-0 left-0 rounded-full", URG_BAR[x.urgency])} initial={{ width: 0 }} animate={{ width: `${((x.ms ?? 0) / max) * 100}%` }} transition={{ duration: 0.6 }} />
                    <span className="absolute -inset-y-1 w-0.5 rounded bg-foreground" style={{ left: `${(target / max) * 100}%` }} title={t("Response target {n}h", { n: report.targets[x.urgency] })} />
                  </span>
                  <span className="text-right font-semibold tabular">{x.ms ? dur(x.ms) : "—"}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11.5px] text-muted-foreground">{t("Black tick = response target. Bars past it mean residents waited longer than promised.")}</p>
        </Panel>

        <Panel title={t("Open workload by team")}>
          <ul className="grid gap-3">
            {openByTeam.map(({ team, assigned, waiting }) => (
              <li key={team.id} className="grid grid-cols-[150px_minmax(0,1fr)_44px] items-center gap-3 text-[13px] sm:grid-cols-[180px_minmax(0,1fr)_44px]">
                <span className="truncate font-medium">{team.name}</span>
                <span className="flex h-3 overflow-hidden rounded-full bg-fill">
                  <motion.span className="bg-primary" initial={{ width: 0 }} animate={{ width: `${(assigned / maxTeam) * 100}%` }} />
                  <motion.span className="bg-primary/30" initial={{ width: 0 }} animate={{ width: `${(waiting / maxTeam) * 100}%` }} />
                </span>
                <span className="text-right font-semibold tabular">{assigned + waiting}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex gap-3 text-[11.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-primary" /> {t("Assigned")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-primary/30" /> {t("Waiting")}
            </span>
          </p>
        </Panel>
      </section>
    </div>
  );
}
