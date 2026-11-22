"use client";

/**
 * Monthly accomplishment report for the Punong Barangay and the DILG field
 * officer: what came in, how fast it was handled, field and Lupon work, and
 * where problems cluster. Aggregates only, no names of residents.
 */
import { Printer } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useNow, useStaff } from "@/hooks/use-live";
import { effectiveCategory, hotspots, median } from "@/lib/cases";
import { CATEGORIES, CATEGORY, CHANNEL, KP_STAGE, URGENCY, type Channel, type KpStage, type Lang } from "@/lib/domain";
import { manilaDate } from "@/lib/duty";
import { DAY, dur, fmtDate } from "@/lib/format";
import { PUROKS } from "@/lib/geo";
import { canAccess } from "@/lib/policy";
import { dueAt } from "@/lib/priority";
import { cn } from "@/lib/utils";
import { useStaffLang } from "./i18n";
import { NoAccess, PageHeader } from "./ui";

const monthStart = (ym: string) => Date.parse(`${ym}-01T00:00:00+08:00`);
const nextMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const monthName = (ym: string, lang: Lang = "en") => fmtDate(monthStart(ym) + DAY, lang, { month: "long", year: "numeric" });
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 break-inside-avoid">
      <h2 className="text-[15px] font-bold">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

function Table({ head, rows, foot, className }: { head: string[]; rows: ReactNode[][]; foot?: ReactNode[]; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-left text-[13px] tabular", className)}>
        <thead>
          <tr className="border-b border-black/60">
            {head.map((h, i) => (
              <th key={h} className={i ? "px-2 py-1.5 text-right font-semibold" : "py-1.5 pr-2 font-semibold"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-black/15">
              {r.map((c, i) => (
                <td key={i} className={i ? "px-2 py-1.5 text-right" : "py-1.5 pr-2"}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr className="border-t border-black/60 font-semibold">
              {foot.map((c, i) => (
                <td key={i} className={i ? "px-2 py-1.5 text-right" : "py-1.5 pr-2"}>
                  {c}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function MonthlyReport() {
  const { data } = useStaff();
  const now = useNow(60_000);
  const { lang, t } = useStaffLang();
  const current = manilaDate(now).slice(0, 7);
  const [month, setMonth] = useState(current);

  // Months that have reports, newest first, always including the current one.
  const months = useMemo(() => {
    const set = new Set([current, ...(data?.requests ?? []).map((r) => manilaDate(r.createdAt).slice(0, 7))]);
    return [...set].sort().reverse();
  }, [data, current]);

  const report = useMemo(() => {
    if (!data) return null;
    const start = monthStart(month);
    const end = monthStart(nextMonth(month));
    const inMonth = (t: number | null | undefined) => t != null && t >= start && t < end;
    const received = data.requests.filter((r) => inMonth(r.createdAt));
    const counted = received.filter((r) => r.status !== "duplicate" && r.status !== "withdrawn");
    const resolved = data.requests.filter((r) => r.status === "resolved" && inMonth(r.closedAt));
    const referred = data.requests.filter((r) => r.status === "referred" && inMonth(r.closedAt));
    const openAtEnd = data.requests.filter((r) => r.createdAt < end && r.status !== "duplicate" && r.status !== "withdrawn" && !(r.closedAt && r.closedAt < end));
    const acted = counted.filter((r) => r.firstActionAt);
    const onTime = acted.filter((r) => r.firstActionAt! <= dueAt(r, data.settings.targets));

    const byCategory = CATEGORIES.map((c) => {
      const rs = counted.filter((r) => effectiveCategory(r) === c);
      const done = resolved.filter((r) => effectiveCategory(r) === c);
      return { c, received: rs.length, high: rs.filter((r) => (r.triage?.urgency ?? r.prediction.urgency) === "high").length, resolved: done.length, median: median(done.map((r) => r.closedAt! - r.createdAt)) };
    });
    const byChannel = (Object.keys(CHANNEL) as Channel[]).map((ch) => ({ ch, n: counted.filter((r) => r.channel === ch).length }));
    const byPurok = PUROKS.map((p) => ({ p, n: counted.filter((r) => r.location?.purok === p.id).length })).filter((x) => x.n);

    const field = data.assignments.filter((a) => inMonth(a.assignedAt));
    const fieldDone = field.filter((a) => a.status === "done");
    const arrive = median(field.filter((a) => a.arrivedAt).map((a) => a.arrivedAt! - a.assignedAt));

    const kpFiled = data.kpLog.filter((k) => inMonth(k.filedAt));
    const kpClosed = data.kpLog.filter((k) => inMonth(k.closedAt));
    const kpPending = data.kpLog.filter((k) => k.filedAt < end && !(k.closedAt && k.closedAt < end)).length;
    const closedBy = (Object.keys(KP_STAGE) as KpStage[]).filter((s) => !KP_STAGE[s].open).map((s) => ({ s, n: kpClosed.filter((k) => k.stage === s).length }));

    const incidents = data.incidents.filter((i) => inMonth(i.createdAt));
    const hs = hotspots(received, { epsM: data.settings.hotspot.epsM, minPts: data.settings.hotspot.minPts, days: 40, categories: CATEGORIES.filter((c) => CATEGORY[c].located) }, end - 1);

    return {
      received,
      counted,
      resolved,
      referred,
      openAtEnd,
      acted,
      onTime,
      byCategory,
      byChannel,
      byPurok,
      field,
      fieldDone,
      arrive,
      kpFiled,
      kpClosed,
      kpPending,
      closedBy,
      incidents,
      clusters: hs.clusters.slice(0, 5),
      sms: data.smsByMonth[month] ?? 0,
      medianFirst: median(acted.map((r) => r.firstActionAt! - r.createdAt)),
      medianResolve: median(resolved.map((r) => r.closedAt! - r.createdAt)),
      partial: month === current,
    };
  }, [data, month, current]);

  if (!data?.me || !report) return null;
  if (!canAccess(data.me, "reports")) return <NoAccess title={t("The monthly report is prepared by the secretary, supervisors and administrators")} role={data.me.role} />;
  const r = report;
  const me = data.me;
  let n = 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 print:block">
      <PageHeader
        className="print:hidden"
        title={t("Monthly report")}
        sub={t("For the Punong Barangay and the DILG field officer. Counts only, no resident names.")}
        actions={
          <>
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t("Month")} className="field h-10 rounded-full px-4 text-[13.5px] font-semibold">
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthName(m, lang)}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[13.5px] font-bold text-background">
              <Printer className="size-4" /> {t("Print or save PDF")}
            </button>
          </>
        }
      />

      <article className="mx-auto grid w-full max-w-[900px] gap-7 bg-white px-5 py-8 text-[14px] text-black shadow-sheet sm:px-12 sm:py-12 print:max-w-none print:p-0 print:shadow-none">
        <header className="grid justify-items-center gap-0.5 text-center">
          <p className="text-[12.5px]">Republic of the Philippines · {data.settings.city}</p>
          <p className="text-[16px] font-bold">{data.settings.barangay}</p>
          <h1 className="mt-3 text-[20px] font-bold">Monthly report on resident requests</h1>
          <p className="text-[14px]">
            {monthName(month)}
            {r.partial && ` · as of ${fmtDate(now, "en", { month: "long", day: "numeric" })}`}
          </p>
        </header>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-black/15 text-center sm:grid-cols-4">
          {[
            ["Requests received", String(r.counted.length)],
            ["Resolved", String(r.resolved.length)],
            ["Acted on within target", pct(r.onTime.length, r.acted.length)],
            ["Open at month end", String(r.openAtEnd.length)],
          ].map(([k, v]) => (
            <div key={k} className="bg-white px-2 py-3">
              <dd className="text-[24px] font-bold tabular">{v}</dd>
              <dt className="text-[12px]">{k}</dt>
            </div>
          ))}
        </dl>

        <Section n={++n} title="Requests by category">
          <Table
            className="min-w-[480px]"
            head={["Category", "Received", "High urgency", "Resolved", "Median time to resolve"]}
            rows={r.byCategory.map((x) => [CATEGORY[x.c].en, x.received, x.high, x.resolved, x.median ? dur(x.median) : "—"])}
            foot={["Total", r.counted.length, r.byCategory.reduce((a, x) => a + x.high, 0), r.resolved.length, r.medianResolve ? dur(r.medianResolve) : "—"]}
          />
          <p className="text-[12.5px]">
            Also: {r.referred.length} referred to other offices, {r.received.length - r.counted.length} duplicates or withdrawn. Median time to first action:{" "}
            {r.medianFirst ? dur(r.medianFirst) : "—"} (targets: {URGENCY.high.en.toLowerCase()} {data.settings.targets.high} h, {URGENCY.medium.en.toLowerCase()} {data.settings.targets.medium} h,{" "}
            {URGENCY.normal.en.toLowerCase()} {data.settings.targets.normal} h).
          </p>
        </Section>

        <div className="grid gap-7 sm:grid-cols-2 print:grid-cols-2">
          <Section n={++n} title="How requests came in">
            <Table head={["Channel", "Requests", "Share"]} rows={r.byChannel.map((x) => [CHANNEL[x.ch].en, x.n, pct(x.n, r.counted.length)])} />
            <p className="text-[12.5px]">{r.sms} text messages sent to residents, walk-in reporters and tanods.</p>
          </Section>
          <Section n={++n} title="Requests by purok">
            {r.byPurok.length ? <Table head={["Purok", "Requests"]} rows={r.byPurok.map((x) => [x.p.name, x.n])} /> : <p className="text-[13px]">No located requests.</p>}
          </Section>
        </div>

        <div className="grid gap-7 sm:grid-cols-2 print:grid-cols-2">
          <Section n={++n} title="Tanod field work">
            <Table
              head={["", "Count"]}
              rows={[
                ["Tanods sent", r.field.length],
                ["Reports filed from the scene", r.fieldDone.length],
                ["Declined or cancelled", r.field.filter((a) => a.status === "declined" || a.status === "cancelled").length],
                ["Median time to arrive", r.arrive ? dur(r.arrive) : "—"],
              ]}
            />
          </Section>
          <Section n={++n} title="Katarungang Pambarangay">
            <Table
              head={["", "Cases"]}
              rows={[["Filed this month", r.kpFiled.length], ...r.closedBy.map((x) => [KP_STAGE[x.s].en, x.n]), ["Pending at month end", r.kpPending]]}
            />
          </Section>
        </div>

        <Section n={++n} title="Incidents">
          {r.incidents.length ? (
            <Table
              head={["Incident", "Reports linked", "Updates sent", "Status"]}
              rows={r.incidents.map((i) => [
                <span key="t">
                  <span className="font-mono text-[12px]">{i.ref}</span> {i.title}
                </span>,
                i.requestIds.length,
                i.updates.length,
                i.status === "open" ? "Active" : `Closed ${fmtDate(i.closedAt!, "en", { month: "short", day: "numeric" })}`,
              ])}
            />
          ) : (
            <p className="text-[13px]">No incidents this month.</p>
          )}
        </Section>

        <Section n={++n} title="Recurring problem areas">
          {r.clusters.length ? (
            <Table
              head={["Near", "Main concern", "Reports"]}
              rows={r.clusters.map((c) => [c.place, `${CATEGORY[c.dominant].en} (${Math.round(c.share * 100)}%)`, c.members.length])}
            />
          ) : (
            <p className="text-[13px]">No dense clusters with the current hotspot settings.</p>
          )}
          <p className="text-[12.5px]">
            Found with DBSCAN ({data.settings.hotspot.epsM} m radius, at least {data.settings.hotspot.minPts} reports). Restricted cases are excluded.
          </p>
        </Section>

        <footer className="mt-6 grid gap-10 sm:grid-cols-2 print:grid-cols-2">
          {[
            ["Prepared by", me.name, me.title],
            ["Noted by", null, "Punong Barangay"],
          ].map(([label, name, title]) => (
            <div key={label} className="grid gap-1 text-[13px]">
              <span>{label}:</span>
              <span className="mt-8 block border-b border-black pb-0.5 font-semibold uppercase">{name ?? "\u00a0"}</span>
              <span>{title}</span>
            </div>
          ))}
        </footer>
        <p className="text-center text-[11px] text-black/60">Generated by Tugon on {fmtDate(now)}.</p>
      </article>
    </div>
  );
}
