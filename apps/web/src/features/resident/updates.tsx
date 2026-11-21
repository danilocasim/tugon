"use client";

import { Bell, CheckCheck, CircleCheck, ClipboardCheck, Eye, Forward, Gavel, Hammer, Layers, MessageSquare, MessageSquareWarning, RotateCcw, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useEffect } from "react";
import { useAct, useResident } from "@/hooks/use-live";
import type { NotificationType } from "@/lib/domain";
import { rel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markNotificationsRead } from "@/server/resident-timeline";
import { notificationKey } from "./i18n";
import { useT } from "./lang";
import { PageTitle, Skeleton } from "./ui";

const ICON: Record<NotificationType, [LucideIcon, string]> = {
  review_started: [Eye, "bg-normal-soft text-normal"],
  info_requested: [MessageSquareWarning, "bg-medium-soft text-medium"],
  queued: [ClipboardCheck, "bg-fill text-foreground"],
  started: [Hammer, "bg-brand-soft text-primary"],
  update: [MessageSquare, "bg-brand-soft text-primary"],
  resolved: [CircleCheck, "bg-primary text-primary-foreground"],
  referred: [Forward, "bg-[#efeaf6] text-[#5d4a7d]"],
  duplicate: [Layers, "bg-fill text-ink-3"],
  reopened: [RotateCcw, "bg-normal-soft text-normal"],
  tanod: [ShieldCheck, "bg-[#e6ecf5] text-[#33507a]"],
  hearing: [Gavel, "bg-gold-soft text-[#7a4c00]"],
};

export function Updates() {
  const { data } = useResident();
  const { t, lang } = useT();
  const router = useRouter();
  const { act, pending } = useAct();

  useEffect(() => {
    if (data && !data.me) router.replace("/resident/signin?next=/resident/updates");
  }, [data, router]);

  if (!data?.me) return <Skeleton className="h-72" />;
  const anyUnread = data.notifications.some((n) => !n.read);

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        action={
          anyUnread && (
            <button
              type="button"
              disabled={pending === "read"}
              onClick={() => void act("read", markNotificationsRead)}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[13.5px] font-semibold transition hover:bg-fill-strong"
            >
              <CheckCheck className="size-4" /> {t("updates.markRead")}
            </button>
          )
        }
      >
        {t("updates.title")}
      </PageTitle>

      {data.notifications.length ? (
        <ul className="overflow-hidden rounded-[22px] bg-card shadow-sheet">
          {data.notifications.map((n, i) => {
            const [Icon, tint] = ICON[n.type];
            const isNew = !n.read;
            return (
              <motion.li key={n.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.025, 0.25) }} className="group/item">
                <Link href={`/resident/requests/${n.requestId}`} className={cn("flex items-start gap-3.5 px-4 pt-3.5 transition hover:bg-fill/40", isNew && "bg-brand-soft/40")}>
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", tint)}>
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="flex min-w-0 flex-1 items-start gap-2 border-b border-hairline pb-3.5 group-last/item:border-0">
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[15px] leading-snug", isNew ? "font-bold" : "font-medium")}>{t(notificationKey(n.type), { ref: n.ref })}</span>
                      <span className="mt-0.5 block text-[12.5px] text-ink-3">{rel(n.at, lang)}</span>
                    </span>
                    {isNew && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-high" aria-label="new" />}
                  </span>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      ) : (
        <div className="grid justify-items-center gap-3 rounded-[22px] bg-fill px-6 py-12 text-center">
          <Bell className="size-6 text-ink-3" />
          <p className="max-w-xs text-[15px] text-muted-foreground">{t("updates.empty")}</p>
        </div>
      )}
    </div>
  );
}
