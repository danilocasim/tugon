"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useNow, useTanod } from "@/hooks/use-live";
import { FIELD_RESULT, FIELD_STATUS } from "@/lib/domain";
import { dur, rel } from "@/lib/format";
import { useTL } from "./lang";
import { FieldChip } from "./ui";

export function TanodHistory() {
  const { data } = useTanod();
  const { t, lang } = useTL();
  const now = useNow(60_000);
  if (!data?.me) return null;
  const closed = data.assignments.filter((a) => !FIELD_STATUS[a.status].open).sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  return (
    <div className="grid gap-4">
      <div><h1 className="text-[26px] font-bold tracking-tight">{t("hist.title")}</h1><p className="mt-1 text-[14px] text-muted-foreground">{t("hist.sub")}</p></div>
      {closed.length ? (
        <ul className="overflow-hidden rounded-[24px] bg-card shadow-sheet">
          {closed.map((a) => (
            <li key={a.id} className="border-b border-hairline last:border-0">
              <Link href={`/tanod/a/${a.id}`} className="flex items-center gap-3 px-4 py-3.5 transition active:bg-fill/60">
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-3"><span className="shrink-0 font-mono whitespace-nowrap">{a.case.ref}</span><span className="truncate">{rel(a.closedAt ?? a.assignedAt, lang, now)}</span></span>
                  <span className="mt-0.5 block truncate text-[15px] font-semibold">{a.case.text}</span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">{a.result ? FIELD_RESULT[a.result][lang] : a.closeReason}{a.status === "done" && a.arrivedAt && a.closedAt && ` · ${t("hist.onScene", { dur: dur(a.closedAt - a.arrivedAt) })}`}</span>
                </span>
                <FieldChip status={a.status} className="h-6 px-2.5 text-[11.5px]" /><ChevronRight className="size-4 shrink-0 text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-[24px] bg-fill px-6 py-10 text-center text-[14.5px] text-muted-foreground">{t("hist.empty")}</p>}
    </div>
  );
}
