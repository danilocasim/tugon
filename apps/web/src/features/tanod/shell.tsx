"use client";

import { CalendarDays, History, LogOut, Radio, ShieldUser } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNow, useTanod } from "@/hooks/use-live";
import type { FieldStatus, Lang } from "@/lib/domain";
import { formatMobile, isOnDuty } from "@/lib/duty";
import { initials } from "@/lib/format";
import { PUROK_NAME } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { signOutPortal } from "@/server/sign-out";
import { useTL } from "./lang";

export function TanodMark({ className }: { className?: string }) {
  return <span className={cn("grid size-9 shrink-0 place-items-center rounded-[12px] bg-brand-deep text-white shadow-press", className)} aria-hidden><ShieldUser className="size-5" strokeWidth={2.2} /></span>;
}

export function TanodShell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useTL();
  const { data } = useTanod();
  const router = useRouter();
  const path = usePathname();
  const now = useNow(30_000);
  const last = useRef<Map<string, FieldStatus> | null>(null);
  useEffect(() => {
    if (!data) { router.replace(`/tanod/signin?next=${encodeURIComponent(path)}`); return; }
    if (last.current) for (const a of data.assignments) {
      const before = last.current.get(a.id);
      if (!before && a.status === "assigned") {
        navigator.vibrate?.([160, 80, 160]);
        toast(t("toast.new"), { description: a.case.ref, action: { label: t("a.open"), onClick: () => router.push(`/tanod/a/${a.id}`) } });
      } else if (before && before !== a.status && a.status === "cancelled") toast(t("toast.cancelled"), { description: a.case.ref });
    }
    last.current = new Map(data.assignments.map((a) => [a.id, a.status]));
  }, [data, path, router, t]);
  if (!data?.me) return null;
  const me = data.me;
  const barangay = data.settings.barangay;
  const onDuty = data.shifts.some((s) => isOnDuty(s, now));
  const focused = path.startsWith("/tanod/a/");
  const tabs = [
    { href: "/tanod", name: t("nav.now"), icon: Radio },
    { href: "/tanod/schedule", name: t("nav.schedule"), icon: CalendarDays },
    { href: "/tanod/history", name: t("nav.history"), icon: History },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-[60px] max-w-xl items-center gap-3 px-4">
          <Link href="/tanod" className="flex min-w-0 items-center gap-2.5">
            <TanodMark /><span className="min-w-0 leading-tight"><span className="block truncate text-[15px] font-bold tracking-tight">{t("app.name")}</span><span className="block truncate text-[12px] text-muted-foreground">{barangay}</span></span>
          </Link>
          <span className={cn("ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold whitespace-nowrap", onDuty ? "bg-brand-soft text-brand-deep" : "bg-fill text-ink-3")}>
            <span className={cn("size-2 rounded-full", onDuty ? "bg-primary" : "bg-ink-3/50")} aria-hidden /> {onDuty ? t("sched.live") : t("duty.pillOff")}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" aria-label={me.name} className="grid size-11 shrink-0 place-items-center rounded-full bg-gold-soft text-[13px] font-bold text-[#7a4c00]">{initials(me.name)}</button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="font-normal"><span className="block text-[15px] font-semibold">{me.name}</span>{me.phone && <span className="block text-muted-foreground">{formatMobile(me.phone)}</span>}{me.zone && <span className="block text-muted-foreground">{PUROK_NAME[me.zone]}</span>}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={lang} onValueChange={(value) => setLang(value as Lang)}><DropdownMenuRadioItem value="fil">Filipino</DropdownMenuRadioItem><DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem></DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void signOutPortal().then((r) => { if (r.ok) router.replace("/tanod/signin"); })} className="text-high"><LogOut className="size-4" /> {t("menu.signOut")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className={cn("mx-auto w-full max-w-xl flex-1 px-4 pt-3", focused ? "pb-40" : "pb-28")}>{children}</main>
      {!focused && <nav aria-label="Tanod" className="pb-safe fixed inset-x-0 bottom-0 z-30 bg-card/90 shadow-[0_-12px_32px_-20px_rgb(18_24_32/0.3)] backdrop-blur-xl">
        <ul className="mx-auto grid h-[66px] max-w-md grid-cols-3 items-center px-1">
          {tabs.map(({ href, name, icon: Icon }) => {
            const active = path === href;
            return <li key={href}><Link href={href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-1 text-[11.5px] font-semibold", !active && "text-ink-3")}>
              <span className={cn("grid h-8 w-16 place-items-center rounded-full", active && "bg-brand-soft text-primary")}><Icon className="size-5" /></span>{name}
            </Link></li>;
          })}
        </ul>
      </nav>}
    </div>
  );
}
