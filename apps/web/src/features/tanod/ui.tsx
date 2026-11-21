"use client";

import { Check, ChevronRight, Loader2, Lock, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { CategoryIcon, UrgencyTag } from "@/components/tugon/badges";
import { useAct } from "@/hooks/use-live";
import { CATEGORY, FIELD_STATUS, type FieldStatus } from "@/lib/domain";
import { rel } from "@/lib/format";
import { placeLabel } from "@/lib/geo";
import type { TanodAssignment } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { respondToAssignment } from "@/server/field-actions";
import type { Key } from "./i18n";
import { useTL } from "./lang";

const CHIP: Record<FieldStatus, string> = {
  assigned: "bg-gold-soft text-[#7a4c00]",
  accepted: "bg-normal-soft text-normal",
  on_scene: "bg-brand-soft text-brand-deep",
  done: "bg-fill text-foreground/80",
  declined: "bg-high-soft text-high",
  cancelled: "bg-fill text-ink-3",
};

export function FieldChip({ status, className }: { status: FieldStatus; className?: string }) {
  const { lang } = useTL();
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold whitespace-nowrap", CHIP[status], className)}>
      {status === "on_scene" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {FIELD_STATUS[status][lang]}
    </span>
  );
}

export function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h2 className="flex items-baseline gap-2 text-[19px] font-bold tracking-[-0.01em]">
      {children}
      {count !== undefined && <span className="text-[15px] font-semibold text-ink-3 tabular">{count}</span>}
    </h2>
  );
}

const STEPS: { status: FieldStatus; key: Key }[] = [
  { status: "assigned", key: "step.assigned" },
  { status: "accepted", key: "step.accepted" },
  { status: "on_scene", key: "step.on_scene" },
  { status: "done", key: "step.done" },
];

/** Where this assignment is in the field flow; hidden once declined or cancelled. */
export function Steps({ status }: { status: FieldStatus }) {
  const { t } = useTL();
  const at = STEPS.findIndex((s) => s.status === status);
  if (at < 0) return null;
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.status} aria-current={i === at ? "step" : undefined} className="grid gap-1.5">
          <span className={cn("h-1.5 rounded-full", i <= at ? "bg-primary" : "bg-fill-strong")} />
          <span className={cn("flex items-center gap-1 text-[11.5px] font-semibold", i <= at ? "text-foreground" : "text-ink-3")}>
            {i < at && <Check className="size-3 text-primary" strokeWidth={3} />}
            {t(s.key)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function CaseTags({ a, now }: { a: TanodAssignment; now: number }) {
  const { t, lang } = useTL();
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <CategoryIcon category={a.case.category} size="sm" className="size-7 rounded-[9px]" />
        {CATEGORY[a.case.category].short[lang]}
      </span>
      <UrgencyTag urgency={a.case.urgency} lang={lang} className="h-6 text-[12px]" />
      {a.case.dangerNow && <span className="rounded-full bg-high px-2.5 py-0.5 text-[11.5px] font-bold text-white">{t("a.danger")}</span>}
      {a.case.restricted && (
        <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-0.5 text-[11.5px] font-semibold text-background">
          <Lock className="size-3" /> {t("a.restricted")}
        </span>
      )}
      <span className="ml-auto text-[12.5px] text-ink-3 tabular">{rel(a.assignedAt, lang, now)}</span>
    </div>
  );
}

const DECLINE_KEYS: Key[] = ["decline.r1", "decline.r2", "decline.r3"];

export function DeclineSheet({ a, open, onOpenChange }: { a: TanodAssignment; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTL();
  const { act, pending } = useAct();
  const [choice, setChoice] = useState<string>(t("decline.r1"));
  const [other, setOther] = useState("");
  const reason = choice === "other" ? other.trim() : choice;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="rounded-t-[28px] bg-card data-[vaul-drawer-direction=bottom]:border-t-0">
        <div className="mx-auto w-full max-w-md px-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="text-[20px] font-bold">{t("decline.title")}</DrawerTitle>
            <DrawerDescription className="text-[14px]">{t("decline.body")}</DrawerDescription>
          </DrawerHeader>
          <div role="radiogroup" className="grid gap-1.5">
            {[...DECLINE_KEYS.map((k) => t(k)), "other"].map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={choice === r}
                onClick={() => setChoice(r)}
                className={cn("min-h-13 rounded-2xl bg-fill px-4 py-3 text-left text-[15px] font-semibold transition", choice === r && "bg-foreground text-background")}
              >
                {r === "other" ? t("decline.other") : r}
              </button>
            ))}
            {choice === "other" && <input autoFocus value={other} onChange={(e) => setOther(e.target.value)} className="field h-13 rounded-2xl px-4 text-[16px]" aria-label={t("decline.other")} />}
          </div>
          <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="h-13 rounded-full bg-fill px-5 text-[15px] font-semibold">
              {t("decline.cancel")}
            </button>
            <button
              type="button"
              disabled={reason.length < 3 || pending === "decline"}
              onClick={async () => {
                const r = await act("decline", () => respondToAssignment({ id: a.id, action: "decline", reason }), { success: t("toast.declined") });
                if (r.ok) onOpenChange(false);
              }}
              className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-high text-[15px] font-bold text-white disabled:opacity-50"
            >
              {pending === "decline" && <Loader2 className="size-4 animate-spin" />} {t("decline.send")}
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** A new or ongoing assignment on the home screen; new ones can be accepted without opening them. */
export function AssignmentCard({ a, now }: { a: TanodAssignment; now: number }) {
  const { t, lang } = useTL();
  const router = useRouter();
  const { act, pending } = useAct();
  const [declining, setDeclining] = useState(false);
  const fresh = a.status === "assigned";
  const href = `/tanod/a/${a.id}`;

  return (
    <article className="overflow-hidden rounded-[24px] bg-card shadow-sheet">
      <Link href={href} className="block p-4 pb-3.5">
        <CaseTags a={a} now={now} />
        <p className="mt-3 line-clamp-3 text-[17px] leading-snug font-semibold text-pretty">{a.case.text}</p>
        <p className="mt-2 flex items-center gap-1.5 text-[14px] text-muted-foreground">
          <MapPin className="size-4 shrink-0 text-primary" />
          <span className="truncate">{placeLabel(a.case, lang) ?? t("d.noLocation")}</span>
        </p>
        {a.instructions && (
          <p className="mt-3 rounded-2xl bg-fill px-3.5 py-2.5 text-[14px] leading-snug">
            <span className="mb-0.5 block text-[12px] font-semibold text-ink-3">{t("a.from", { name: a.assignedByName })}</span>
            {a.instructions}
          </p>
        )}
      </Link>
      {fresh ? (
        <div className="grid grid-cols-[1fr_2fr] gap-2 border-t border-hairline p-3">
          <button type="button" onClick={() => setDeclining(true)} className="h-13 rounded-full bg-fill text-[15px] font-semibold transition active:scale-[0.98]">
            {t("a.decline")}
          </button>
          <button
            type="button"
            disabled={pending === "accept"}
            onClick={async () => {
              const r = await act("accept", () => respondToAssignment({ id: a.id, action: "accept" }), { success: t("toast.accepted") });
              if (r.ok) router.push(href);
            }}
            className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-bold text-primary-foreground shadow-press transition active:scale-[0.98] disabled:opacity-60"
          >
            {pending === "accept" && <Loader2 className="size-4 animate-spin" />} {t("a.accept")}
          </button>
          <DeclineSheet a={a} open={declining} onOpenChange={setDeclining} />
        </div>
      ) : (
        <Link href={href} className="flex items-center gap-2 border-t border-hairline px-4 py-3">
          <FieldChip status={a.status} />
          <span className="ml-auto inline-flex items-center gap-1 text-[14px] font-semibold text-primary">
            {t("a.open")} <ChevronRight className="size-4" />
          </span>
        </Link>
      )}
    </article>
  );
}
