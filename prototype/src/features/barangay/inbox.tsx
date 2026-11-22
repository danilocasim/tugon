"use client";

import { ArrowLeft, Inbox as InboxIcon, MessageCircleQuestion, RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CategoryIcon, StatusText, UrgencyTag } from "@/components/tugon/badges";
import { useNow, useStaff } from "@/hooks/use-live";
import { inboxOrder } from "@/lib/cases";
import { CATEGORY } from "@/lib/domain";
import { rel } from "@/lib/format";
import { placeLabel } from "@/lib/geo";
import { canAccess } from "@/lib/policy";
import type { StaffRequest } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { useStaffLang } from "./i18n";
import { TriageWorkspace } from "./triage";
import { ChannelTag, Empty, NoAccess, PageHeader } from "./ui";

type Filter = "all" | "danger" | "waiting" | "followup";

function Row({ r, selected, onSelect, now }: { r: StaffRequest; selected: boolean; onSelect: () => void; now: number }) {
  const { lang, t } = useStaffLang();
  const u = r.prediction.urgency;
  const unread = r.status === "received";
  const place = placeLabel(r, lang);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn("relative block w-full px-4 pt-3.5 text-left transition hover:bg-fill/40", selected && "bg-brand-soft/60 hover:bg-brand-soft/60")}
    >
      <span className="grid gap-1.5 border-b border-hairline pb-3.5 group-last/item:border-0">
        <span className="flex items-center gap-2 text-[12px] text-ink-3">
          {unread && <span className="size-2 rounded-full bg-primary" aria-label={t("Unread")} />}
          <span className="font-mono text-[11.5px]">{r.ref}</span>
          <ChannelTag channel={r.channel} />
          <span className="ml-auto tabular">{rel(r.createdAt, lang, now)}</span>
        </span>
        <span className={cn("line-clamp-2 text-[14.5px] leading-snug", unread ? "font-semibold" : "text-foreground/85")}>{r.redacted ? t("Restricted report") : r.text}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          {r.dangerNow && <span className="rounded-full bg-high px-2 py-0.5 text-[11px] font-bold text-white">{t("Danger")}</span>}
          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground/75">
            <CategoryIcon category={r.prediction.category} size="sm" className="size-5 rounded-[6px]" />
            {CATEGORY[r.prediction.category].short[lang]}
          </span>
          <UrgencyTag urgency={u} lang={lang} suggested className="h-auto" />
          {!unread && <StatusText status={r.status} lang={lang} className="text-[12px]" />}
          {r.followUp && <RotateCcw className="size-3.5 text-normal" aria-label={t("Follow-up")} />}
          {place && <span className="truncate text-ink-3">{place}</span>}
        </span>
      </span>
    </button>
  );
}

export function IntakeInbox() {
  const { data } = useStaff();
  const router = useRouter();
  const params = useSearchParams();
  const now = useNow(30_000);
  const { t } = useStaffLang();
  const [filter, setFilter] = useState<Filter>("all");
  const selectedId = params.get("id");

  const items = useMemo(() => (data ? inboxOrder(data.requests) : []), [data]);
  const filtered = items.filter((r) =>
    filter === "danger" ? r.dangerNow : filter === "waiting" ? r.status === "needs_info" : filter === "followup" ? r.followUp : true,
  );
  const selected = data?.requests.find((r) => r.id === selectedId) ?? null;

  // Wide enough for the split view: always show something on the right.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId && filtered[0] && (root.current?.clientWidth ?? 0) >= 896) router.replace(`/barangay/inbox?id=${filtered[0].id}`, { scroll: false });
  }, [selectedId, filtered, router]);

  if (!data?.me) return null;
  if (!canAccess(data.me, "inbox")) return <NoAccess title={t("Intake is handled by intake officers and supervisors")} role={data.me.role} />;

  const counts = {
    all: items.length,
    danger: items.filter((r) => r.dangerNow).length,
    waiting: items.filter((r) => r.status === "needs_info").length,
    followup: items.filter((r) => r.followUp).length,
  };

  const select = (id: string) => router.replace(`/barangay/inbox?id=${id}`, { scroll: false });
  const next = (afterId: string) => {
    const rest = filtered.filter((r) => r.id !== afterId && r.status !== "needs_info");
    if (rest[0]) select(rest[0].id);
    else router.replace("/barangay/inbox", { scroll: false });
  };

  return (
    // Container query, not viewport: the split adapts to the space it actually gets (sidebar, iframe, tablet).
    <div ref={root} className="@container grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className={cn(selected && "@max-4xl:hidden")}>
        <PageHeader
          title={t("Intake inbox")}
          sub={
            <>
              {t("{n} waiting for a decision", { n: counts.all })} · {t(data.settings.intakeHours.replace("Intake inbox monitored ", "monitored "))}
            </>
          }
        />
      </div>

      <div className="grid gap-5 @4xl:grid-cols-[minmax(300px,400px)_minmax(0,1fr)] @4xl:items-start">
        {/* The list stays put while the report scrolls with the page, so the triage decision bar can stick to the viewport. */}
        <section aria-label={t("Reports waiting")} className={cn("grid gap-3 @4xl:sticky @4xl:top-6 @4xl:max-h-[calc(100dvh-48px)] @4xl:grid-rows-[auto_minmax(0,1fr)]", selected && "@max-4xl:hidden")}>
          <div role="tablist" className="scrollbar-none flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-fill p-[3px]">
            {(
              [
                ["all", "All"],
                ["danger", "Danger"],
                ["waiting", "Waiting"],
                ["followup", "Follow-ups"],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={filter === k}
                onClick={() => setFilter(k)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-muted-foreground transition hover:text-foreground",
                  filter === k && "bg-card text-foreground shadow-sheet",
                )}
              >
                {t(label)}
                <span className={cn("text-[12px] tabular", k === "danger" && counts.danger > 0 ? "text-high" : "text-ink-3")}>{counts[k]}</span>
              </button>
            ))}
          </div>
          {filtered.length ? (
            <ul className="overflow-hidden rounded-[20px] bg-card shadow-sheet @4xl:overflow-y-auto">
              <AnimatePresence initial={false}>
                {filtered.map((r) => (
                  <motion.li key={r.id} layout className="group/item" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}>
                    <Row r={r} selected={r.id === selectedId} onSelect={() => select(r.id)} now={now} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <Empty
              icon={filter === "waiting" ? MessageCircleQuestion : InboxIcon}
              title={filter === "all" ? t("Inbox zero") : t("Nothing here")}
              body={filter === "all" ? t("Every report has a decision. New ones appear here instantly.") : t("No reports match this filter.")}
            />
          )}
        </section>

        <section aria-label={t("Selected report")} className={cn("min-w-0", !selected && "@max-4xl:hidden")}>
          {selected ? (
            <motion.div key={selected.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }} className="grid grid-cols-[minmax(0,1fr)] gap-3">
              <button type="button" onClick={() => router.replace("/barangay/inbox", { scroll: false })} className="inline-flex items-center gap-1.5 justify-self-start text-[14px] font-semibold text-muted-foreground @4xl:hidden">
                <ArrowLeft className="size-4" /> {t("Inbox")}
              </button>
              <TriageWorkspace r={selected} onDone={() => next(selected.id)} />
            </motion.div>
          ) : (
            <Empty icon={InboxIcon} title={t("Select a report")} body={t("Pick a report on the left to review the suggestion and route it.")} className="@max-4xl:hidden" />
          )}
        </section>
      </div>
    </div>
  );
}
