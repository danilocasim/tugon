"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useResident } from "@/hooks/use-live";
import { isOpen } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { useT } from "./lang";
import { PageTitle, RequestList, Skeleton } from "./ui";

export function MyRequests() {
  const { data } = useResident();
  const { t, lang } = useT();
  const router = useRouter();
  const [tab, setTab] = useState<"active" | "closed">("active");

  useEffect(() => {
    if (data && !data.me) router.replace("/resident/signin?next=/resident/requests");
  }, [data, router]);

  if (!data?.me) return <Skeleton className="h-72" />;

  const active = data.requests.filter(isOpen);
  const closed = data.requests.filter((r) => !isOpen(r));
  const list = tab === "active" ? active : closed;

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        action={
          <Link href="/resident/report" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-bold text-primary-foreground shadow-press">
            <Plus className="size-4" /> <span className="hidden sm:inline">{t("requests.new")}</span>
          </Link>
        }
      >
        {t("requests.title")}
      </PageTitle>

      <div role="tablist" aria-label={t("requests.title")} className="mb-5 grid w-full grid-cols-2 rounded-full bg-fill p-[3px] sm:inline-grid sm:w-auto">
        {(
          [
            ["active", t("requests.active"), active.length],
            ["closed", t("requests.closed"), closed.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "relative inline-flex h-9 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition",
              tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === key && <motion.span layoutId="req-tab" className="absolute inset-0 rounded-full bg-card shadow-sheet" />}
            <span className="relative">{label}</span>
            <span className="relative text-[12.5px] text-ink-3 tabular">{count}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {list.length ? (
          <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <RequestList requests={list} lang={lang} />
          </motion.div>
        ) : (
          <motion.p key={`${tab}-empty`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[22px] bg-fill px-4 py-12 text-center text-[15px] text-muted-foreground">
            {tab === "active" ? t("requests.emptyActive") : t("requests.emptyClosed")}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
