"use client";

import { ChevronRight, FileQuestion } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { CategoryIcon, StatusText } from "@/components/tugon/badges";
import type { Lang, Status } from "@/lib/domain";
import { fmtDate, rel } from "@/lib/format";
import type { ResidentRequest } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { eventKey } from "./i18n";
import { useT } from "./lang";

export function LangSwitch({ compact }: { compact?: boolean }) {
  const { lang, setLang } = useT();
  const options: [Lang, string, string][] = [
    ["fil", "FIL", "Filipino"],
    ["en", "EN", "English"],
  ];
  return (
    <div role="radiogroup" aria-label="Language / Wika" className={cn("inline-flex rounded-full bg-fill p-[3px]", compact && "h-9 items-center")}>
      {options.map(([value, short, long]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={lang === value}
          onClick={() => setLang(value)}
          className={cn(
            "rounded-full px-3 font-semibold transition",
            compact ? "h-[30px] text-[12px]" : "h-9 text-[14px]",
            lang === value ? "bg-card text-foreground shadow-sheet" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {compact ? short : long}
        </button>
      ))}
    </div>
  );
}

export function PageTitle({ children, sub, action }: { children: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em] text-balance sm:text-[32px]">{children}</h1>
        {sub && <p className="mt-1 text-[15px] text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Sentence-case section heading; the page's rhythm comes from spacing, not boxes. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[18px] font-bold tracking-[-0.01em]">{children}</h2>
      {action}
    </div>
  );
}

/** The resident-facing path of a request; needs_info sits on the review step. */
export const STAGE_PATH: Status[] = ["received", "review", "queued", "in_progress", "resolved"];
export const STAGE: Partial<Record<Status, number>> = { received: 0, review: 1, needs_info: 1, queued: 2, in_progress: 3, resolved: 4 };

/** Five thin segments: how far along a request is, at a glance. The status text beside it carries the meaning. */
export function StageBar({ status, className }: { status: Status; className?: string }) {
  const stage = STAGE[status];
  if (stage === undefined) return null;
  return (
    <span className={cn("grid grid-cols-5 gap-1", className)} aria-hidden>
      {STAGE_PATH.map((s, i) => (
        <span
          key={s}
          className={cn(
            "h-1 rounded-full",
            i < stage || status === "resolved" ? "bg-primary" : i === stage ? (status === "needs_info" ? "bg-medium" : "bg-primary/45") : "bg-fill-strong",
          )}
        />
      ))}
    </span>
  );
}

function RequestRow({ r, lang }: { r: ResidentRequest; lang: Lang }) {
  const cat = r.category ?? r.residentCategory;
  return (
    <Link href={`/resident/requests/${r.id}`} className="group flex items-start gap-3.5 px-4 pt-4 transition hover:bg-fill/40 active:bg-fill">
      {cat ? (
        <CategoryIcon category={cat} className="mt-0.5" />
      ) : (
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-[13px] bg-fill text-ink-3" aria-hidden>
          <FileQuestion className="size-5" strokeWidth={1.9} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 items-start gap-2 border-b border-hairline pb-4 group-last/item:border-0">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[15.5px] leading-snug font-medium">{r.text}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
            <StatusText status={r.status} lang={lang} />
            <span>{rel(r.updatedAt, lang)}</span>
          </span>
          <StageBar status={r.status} className="mt-2.5 max-w-[240px]" />
        </span>
        <ChevronRight className="mt-2.5 size-4 shrink-0 text-ink-3/70 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/** One surface for the whole list; rows are separated by inset hairlines, not boxes. */
export function RequestList({ requests, lang }: { requests: ResidentRequest[]; lang: Lang }) {
  return (
    <ul className="overflow-hidden rounded-[22px] bg-card shadow-sheet">
      {requests.map((r) => (
        <li key={r.id} className="group/item">
          <RequestRow r={r} lang={lang} />
        </li>
      ))}
    </ul>
  );
}

/** Resident-visible history, newest last, styled as a logbook. */
export function Timeline({ r, lang }: { r: ResidentRequest; lang: Lang }) {
  const { t } = useT();
  return (
    <ol className="relative">
      {r.events.map((e, i) => {
        const last = i === r.events.length - 1;
        const title = t(eventKey(e.type), { team: r.teamName ?? "", office: String(e.meta?.office ?? r.referralOffice ?? "") });
        return (
          <motion.li
            key={e.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3) }}
            className="relative grid grid-cols-[18px_1fr] gap-3 pb-6 last:pb-0"
          >
            {!last && <span className="absolute top-4 bottom-0 left-[5px] w-[2px] rounded-full bg-fill-strong" aria-hidden />}
            <span className={cn("relative mt-1.5 size-3 rounded-full", last ? "bg-primary shadow-[0_0_0_4px_var(--brand-soft)]" : e.actor.kind === "resident" ? "bg-normal" : "bg-[#cfccc4]")} aria-hidden />
            <div className="min-w-0">
              <p className="text-[15px] leading-snug font-semibold">{title}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                {e.actor.kind === "resident" ? (lang === "fil" ? "Ikaw" : "You") : e.actor.name} · {fmtDate(e.at, lang, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
              {e.text && (
                <p
                  className={cn(
                    "mt-2.5 rounded-[16px] px-3.5 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap",
                    e.actor.kind === "resident" ? "rounded-tr-[6px] bg-normal-soft" : "rounded-tl-[6px] bg-fill",
                  )}
                >
                  {e.text}
                </p>
              )}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[22px] bg-sunken", className)} />;
}
