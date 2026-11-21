"use client";

import { Briefcase, ChevronRight } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { CategoryIcon, StatusBadge, UrgencyTag } from "@/components/tugon/badges";
import { useNow, useStaff } from "@/hooks/use-live";
import { DAY, dur, rel } from "@/lib/format";
import { placeLabel } from "@/lib/geo";
import { canAccess } from "@/lib/policy";
import { isOverdue } from "@/lib/priority";
import type { StaffRequest } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { useStaffLang } from "./i18n";
import { Empty, NoAccess, PageHeader } from "./ui";

function CaseLine({ r, now, hint }: { r: StaffRequest; now: number; hint: string }) {
  const { data } = useStaff();
  const { lang, t } = useStaffLang();
  const overdue = isOverdue(r, data!.settings.targets, now);
  return (
    <Link
      href={`/barangay/cases/${r.id}`}
      className={cn(
        "group relative flex items-center gap-3 px-4 py-3.5 transition after:absolute after:right-4 after:bottom-0 after:left-[68px] after:h-px after:bg-hairline hover:bg-fill/40 group-last/item:after:hidden",
        overdue && "bg-high-soft/45 hover:bg-high-soft/70",
      )}
    >
      <CategoryIcon category={r.triage?.category ?? r.prediction.category} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="font-mono font-semibold">{r.ref}</span>
          <StatusBadge status={r.status} lang={lang} className="h-5 text-[11px]" />
          {r.triage && <UrgencyTag urgency={r.triage.urgency} lang={lang} className="h-5 text-[11px]" />}
          {overdue && <span className="rounded-full bg-high px-2 py-0.5 text-[10.5px] font-bold text-white">{t("Overdue")}</span>}
        </span>
        <span className="mt-1 block truncate text-[14px]">{r.text}</span>
        <span className="mt-0.5 block text-[12px] text-ink-3">
          {hint} · {placeLabel(r, lang) ?? t("No location")}
        </span>
      </span>
      <ChevronRight className="size-4 text-ink-3 transition group-hover:translate-x-0.5" />
    </Link>
  );
}

export function MyCases() {
  const { data } = useStaff();
  const now = useNow(30_000);
  const { lang, t } = useStaffLang();
  if (!data?.me) return null;
  const me = data.me;
  if (!canAccess(me, "mine")) return <NoAccess title={t("Case assignments aren't part of your role")} role={me.role} />;

  const mine = data.requests.filter((r) => r.assigneeId === me.id);
  const inProgress = mine.filter((r) => r.status === "in_progress").sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
  const toStart = mine.filter((r) => r.status === "queued");
  const done = mine.filter((r) => (r.status === "resolved" || r.status === "referred") && r.closedAt && now - r.closedAt < 7 * DAY).sort((a, b) => b.closedAt! - a.closedAt!);

  const groups: [string, StaffRequest[], (r: StaffRequest) => string][] = [
    ["Claimed · not started", toStart, (r) => t("waiting {time}", { time: dur(now - r.createdAt) })],
    ["In progress", inProgress, (r) => t("started {time}", { time: rel(r.startedAt ?? r.createdAt, lang, now) })],
    ["Closed this week", done, (r) => t("closed {time}", { time: rel(r.closedAt!, lang, now) })],
  ];

  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader title={t("My cases")} sub={t("{open} open · {closed} closed in the last 7 days", { open: toStart.length + inProgress.length, closed: done.length })} />
      {toStart.length + inProgress.length + done.length === 0 && (
        <Empty
          icon={Briefcase}
          title={t("Nothing assigned to you yet")}
          body={t("Claim the next case from your team's queue.")}
          action={
            <Link href="/barangay/queue" className="mt-1 inline-flex h-10 items-center rounded-full bg-primary px-4 text-[13.5px] font-bold text-primary-foreground shadow-press">
              {t("Open queue")}
            </Link>
          }
        />
      )}
      {groups.map(
        ([title, list, hint]) =>
          list.length > 0 && (
            <section key={title} className="grid gap-3">
              <h2 className="flex items-baseline gap-2 text-[18px] font-bold tracking-[-0.01em]">
                {t(title)} <span className="text-[14px] font-semibold text-ink-3 tabular">{list.length}</span>
              </h2>
              <ul className="overflow-hidden rounded-[20px] bg-card shadow-sheet">
                {list.map((r, i) => (
                  <motion.li key={r.id} className="group/item" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <CaseLine r={r} now={now} hint={hint(r)} />
                  </motion.li>
                ))}
              </ul>
            </section>
          ),
      )}
    </div>
  );
}
