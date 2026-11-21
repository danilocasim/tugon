"use client";

/**
 * Monthly accomplishment report for the Punong Barangay and the DILG field
 * officer: what came in, how fast it was handled, field and Lupon work, and
 * where problems cluster. Aggregates only, no names of residents.
 */
import { Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { CATEGORY, CHANNEL, KP_STAGE, URGENCY, type Lang } from "@/lib/domain";
import { DAY, dur, fmtDate } from "@/lib/format";
import type { readMonthlyReport } from "@/server/analytics-data";
import { cn } from "@/lib/utils";
import { useStaffLang } from "./i18n";
import { PageHeader } from "./ui";

const monthStart = (ym: string) => Date.parse(`${ym}-01T00:00:00+08:00`);
const monthName = (ym: string, lang: Lang = "en") => fmtDate(monthStart(ym) + DAY, lang, { month: "long", year: "numeric" });
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const printableCount = (n: number | null) => n ?? "Withheld";

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

export function MonthlyReport({ report: r }: { report: Awaited<ReturnType<typeof readMonthlyReport>> }) {
  const { lang, t } = useStaffLang();
  const router = useRouter();
  const [loading, startTransition] = useTransition();
  const { months, month, now, settings } = r;
  let n = 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 print:block" aria-busy={loading}>
      <PageHeader
        className="print:hidden"
        title={t("Monthly report")}
        sub={t("For the Punong Barangay and the DILG field officer. Counts only, no resident names.")}
        actions={
          <>
            <select value={month} onChange={(e) => { const value = e.target.value; startTransition(() => router.replace(`/barangay/reports?month=${value}`, { scroll: false })); }} aria-label={t("Month")} className="field h-10 rounded-full px-4 text-[13.5px] font-semibold">
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthName(m, lang)}
                </option>
              ))}
            </select>
            <button type="button" disabled={loading} onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[13.5px] font-bold text-background">
              <Printer className="size-4" /> {t("Print or save PDF")}
            </button>
          </>
        }
      />

      <article className="mx-auto grid w-full max-w-[900px] gap-7 bg-white px-5 py-8 text-[14px] text-black shadow-sheet sm:px-12 sm:py-12 print:max-w-none print:p-0 print:shadow-none">
        <header className="grid justify-items-center gap-0.5 text-center">
          <p className="text-[12.5px]">Republic of the Philippines · {r.city}</p>
          <p className="text-[16px] font-bold">{r.barangay}</p>
          <h1 className="mt-3 text-[20px] font-bold">Monthly report on resident requests</h1>
          <p className="text-[14px]">
            {monthName(month)}
            {r.partial && ` · as of ${fmtDate(now, "en", { month: "long", day: "numeric" })}`}
          </p>
        </header>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-black/15 text-center sm:grid-cols-4">
          {[
            ["Requests received", String(r.counted)],
            ["Resolved", String(r.resolved)],
            ["Acted on within target", pct(r.onTime, r.acted)],
            ["Open at month end", String(r.openAtEnd)],
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
            foot={["Total", r.counted, r.byCategory.reduce((a, x) => a + x.high, 0), r.resolved, r.medianResolve ? dur(r.medianResolve) : "—"]}
          />
          <p className="text-[12.5px]">
            Also: {r.referred} referred to other offices, {r.received - r.counted} duplicates or withdrawn. Median time to first action:{" "}
            {r.medianFirst ? dur(r.medianFirst) : "—"} (current targets: {URGENCY.high.en.toLowerCase()} {settings.targets.high} h, {URGENCY.medium.en.toLowerCase()} {settings.targets.medium} h,{" "}
            {URGENCY.normal.en.toLowerCase()} {settings.targets.normal} h).
          </p>
        </Section>

        <div className="grid gap-7 sm:grid-cols-2 print:grid-cols-2">
          <Section n={++n} title="How requests came in">
            <Table head={["Channel", "Requests", "Share"]} rows={r.byChannel.map((x) => [CHANNEL[x.ch].en, x.n, pct(x.n, r.counted)])} />
            <p className="text-[12.5px]">{r.sms} text messages accepted by the provider; handset delivery is not confirmed here.</p>
          </Section>
          <Section n={++n} title="Requests by purok">
            {r.byPurok.length ? <Table head={["Purok", "Requests"]} rows={r.byPurok.map((x) => [x.p, printableCount(x.n)])} /> : <p className="text-[13px]">No located requests.</p>}
          </Section>
        </div>

        <div className="grid gap-7 sm:grid-cols-2 print:grid-cols-2">
          <Section n={++n} title="Tanod field work">
            <Table
              head={["", "Count"]}
              rows={[
                ["Day shifts rostered", r.duty.day_count],
                ["Night shifts rostered", r.duty.night_count],
                ["Tanods sent", r.field],
                ["Reports filed from the scene", r.fieldDone],
                ["Declined or cancelled", r.fieldCancelled],
                ["Median time to arrive", r.arrive ? dur(r.arrive) : "—"],
              ]}
            />
          </Section>
          <Section n={++n} title="Katarungang Pambarangay">
            <Table
              head={["", "Cases"]}
              rows={[["Filed this month", printableCount(r.kpFiled)], ...r.closedBy.map((x) => [KP_STAGE[x.s].en, printableCount(x.n)]), ["Pending at month end", printableCount(r.kpPending)]]}
            />
          </Section>
        </div>

        <Section n={++n} title="Incidents">
          {r.incidents.total ? (
            <Table head={["Started", "Reports linked", "Updates posted", "Closed in month"]} rows={[[r.incidents.total, r.incidents.linked, r.incidents.updates, r.incidents.closed]]} />
          ) : (
            <p className="text-[13px]">No incidents this month.</p>
          )}
        </Section>

        <Section n={++n} title="Recurring problem areas">
          {r.clusters.length ? (
            <Table
              head={["Near", "Main concern", "Reports"]}
              rows={r.clusters.map((c) => [c.place, `${CATEGORY[c.dominant].en} (${Math.round(c.share * 100)}%)`, c.count])}
            />
          ) : (
            <p className="text-[13px]">No dense clusters with the current hotspot settings.</p>
          )}
          <p className="text-[12.5px]">
            Found with DBSCAN ({settings.hotspot.epsM} m radius, at least {settings.hotspot.minPts} reports). Restricted cases are excluded.
          </p>
        </Section>

        <footer className="mt-6 grid gap-10 sm:grid-cols-2 print:grid-cols-2">
          {[
            ["Prepared by", r.preparedBy, r.title],
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
