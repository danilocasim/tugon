"use client";

import { Footprints, Lock, Phone, Smartphone, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CHANNEL, type Channel, type Role } from "@/lib/domain";
import { formatMobile } from "@/lib/duty";
import { dur, initials } from "@/lib/format";
import { T_MAX_MIN, WEIGHTS, type Priority } from "@/lib/priority";
import type { StaffRequest, StaffSnapshot } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { useStaffLang } from "./i18n";

/** Where each role lands after sign-in. */
export const ROLE_HOME: Record<Role, string> = {
  intake: "/barangay/inbox",
  handler: "/barangay/queue",
  supervisor: "/barangay/inbox",
  admin: "/barangay/insights",
  tanod: "/tanod",
};

export function PageHeader({ title, sub, actions, className }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-[24px] leading-tight font-bold tracking-[-0.025em] sm:text-[28px]">{title}</h1>
        {sub && <p className="mt-1 text-[14.5px] text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Shown when a role opens an area it can't use; points back to that role's workspace. */
export function NoAccess({ title, role }: { title: string; role: Role }) {
  const { t } = useStaffLang();
  return (
    <Empty
      icon={Lock}
      title={title}
      body={t("Access follows your role, so case details stay with the people handling them.")}
      action={
        <Link href={ROLE_HOME[role]} className="mt-1 inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13.5px] font-bold text-primary-foreground">
          {t("Go to your workspace")}
        </Link>
      }
    />
  );
}

const CHANNEL_ICON: Record<Channel, LucideIcon> = { online: Smartphone, walkin: Footprints, phone: Phone };

export function ChannelTag({ channel }: { channel: Channel }) {
  const { lang } = useStaffLang();
  const Icon = CHANNEL_ICON[channel];
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-3">
      <Icon className="size-3.5" /> {CHANNEL[channel][lang]}
    </span>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-grid size-7 shrink-0 place-items-center rounded-full bg-fill-strong text-[11px] font-bold text-foreground/80", className)}>
      {initials(name)}
    </span>
  );
}

/**
 * Priority as three stacked segments (urgency, category weight, aging) so staff
 * can see why a case ranks where it does. Max possible score is 1.0.
 */
export function ScoreBar({ p, className, compact }: { p: Priority; className?: string; compact?: boolean }) {
  const { t } = useStaffLang();
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex min-w-0 items-center gap-2", className)} tabIndex={0} aria-label={t("Priority {score}", { score: p.total.toFixed(2) })}>
          <span className={cn("flex h-1.5 overflow-hidden rounded-full bg-fill-strong", compact ? "w-16" : "w-24")}>
            <span className="h-full bg-foreground transition-[width] duration-500" style={{ width: pct(p.u) }} />
            <span className="h-full bg-chart-4 transition-[width] duration-500" style={{ width: pct(p.w) }} />
            <span className="h-full bg-gold transition-[width] duration-500" style={{ width: pct(p.a) }} />
          </span>
          <span className="text-[13px] font-semibold tabular">{p.total.toFixed(2)}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="w-64 p-3">
        <p className="text-[12px] font-semibold">{t("Why this score")}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="size-2 rounded-full bg-foreground" />
          <dt>{t("Urgency · {w} × U/3", { w: WEIGHTS.u })}</dt>
          <dd className="tabular">{p.u.toFixed(3)}</dd>
          <span className="size-2 rounded-full bg-chart-4" />
          <dt>{t("Category weight · {w} × W/3", { w: WEIGHTS.w })}</dt>
          <dd className="tabular">{p.w.toFixed(3)}</dd>
          <span className="size-2 rounded-full bg-gold" />
          <dt>{t("Aging · {w} × wait/{max}m", { w: WEIGHTS.a, max: T_MAX_MIN })}</dt>
          <dd className="tabular">{p.a.toFixed(3)}</dd>
        </dl>
        <p className="mt-2 border-t border-border pt-2 text-[11.5px] leading-snug text-muted-foreground">
          {t("Waiting {wait}. Aging stops at {max} min, so overdue escalation flags long waits to a supervisor.", { wait: dur(p.waitMin * 60_000), max: T_MAX_MIN })}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function RestrictedTag() {
  const { t } = useStaffLang();
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-foreground px-2.5 text-[11.5px] font-semibold text-background">
      <Lock className="size-3" /> {t("Restricted")}
    </span>
  );
}

export function DangerTag({ className }: { className?: string }) {
  const { t } = useStaffLang();
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full bg-high px-2.5 text-[11.5px] font-bold text-white", className)}>
      <span className="size-1.5 animate-pulse-ring rounded-full bg-white" />
      {t("Danger flagged")}
    </span>
  );
}

function SmsBadge() {
  const { t } = useStaffLang();
  return <span className="ml-1 rounded-full bg-brand-soft px-1.5 py-px text-[10.5px] font-semibold text-brand-deep">{t("SMS on")}</span>;
}

/** Who reported a case. `dial={false}` inside links and buttons, where a nested tel: link isn't allowed. */
export function Reporter({ r, data, dial = true }: { r: StaffRequest; data: StaffSnapshot; dial?: boolean }) {
  const { t } = useStaffLang();
  if (r.redacted) return <span className="text-ink-3">{t("Withheld")}</span>;
  if (r.residentId) {
    const res = data.residents[r.residentId];
    return (
      <span>
        {res?.name ?? t("Resident")} <span className="text-ink-3">· {res?.email}</span>
        {res?.sms && <SmsBadge />}
      </span>
    );
  }
  return (
    <span>
      {r.contact?.name ?? t("Unknown")}{" "}
      {r.contact?.phone &&
        (dial ? (
          <a href={`tel:${r.contact.phone}`} className="text-ink-3 tabular hover:text-primary">
            · {formatMobile(r.contact.phone)}
          </a>
        ) : (
          <span className="text-ink-3 tabular">· {formatMobile(r.contact.phone)}</span>
        ))}
      {r.contact?.sms && <SmsBadge />}
    </span>
  );
}

export function Empty({ icon: Icon, title, body, action, className }: { icon: LucideIcon; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("grid justify-items-center gap-2 rounded-[20px] bg-fill px-6 py-12 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-full bg-card text-ink-3 shadow-sheet">
        <Icon className="size-5" />
      </span>
      <p className="text-[15px] font-semibold">{title}</p>
      {body && <p className="max-w-sm text-[13.5px] text-muted-foreground">{body}</p>}
      {action}
    </div>
  );
}

export const staffName = (data: StaffSnapshot, id: string | null | undefined) => data.staff.find((s) => s.id === id)?.name ?? "—";
export const teamName = (data: StaffSnapshot, id: string | null | undefined) => data.teams.find((t) => t.id === id)?.name ?? "—";

/** Administration sections, addressable as `/barangay/admin?tab=…` so search and links can open one directly. */
export const ADMIN_TABS = {
  staff: "Staff & roles",
  targets: "Targets & routing",
  referrals: "Referral offices",
  sms: "SMS log",
  privacy: "Data privacy",
  audit: "Audit log",
} as const;
export type AdminTab = keyof typeof ADMIN_TABS;
