"use client";

import { CalendarDays, History, LogOut, Radio, ShieldUser, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PrototypeBar } from "@/components/tugon/prototype-bar";
import { useAct, useTanod } from "@/hooks/use-live";
import type { FieldStatus, Lang } from "@/lib/domain";
import { formatMobile, isOnDuty } from "@/lib/duty";
import { initials } from "@/lib/format";
import { PUROK_NAME } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { signOutTanod, switchTanodPersona } from "@/server/actions";
import { useTL } from "./lang";

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function TanodMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-[12px] bg-brand-deep text-white shadow-press", className)} aria-hidden>
      <ShieldUser className="size-5" strokeWidth={2.2} />
    </span>
  );
}

export function TanodShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useTanod();
  const { t, lang, setLang } = useTL();
  const { act } = useAct();
  const online = useOnline();
  const me = data?.me ?? null;
  const onSignIn = pathname.startsWith("/tanod/signin");
  const focused = pathname.startsWith("/tanod/a/");

  useEffect(() => {
    if (data && !me && !onSignIn) router.replace("/tanod/signin");
  }, [data, me, onSignIn, router]);

  // New assignments buzz the phone; cancellations are announced so nobody keeps going.
  const seen = useRef<Map<string, FieldStatus> | null>(null);
  useEffect(() => {
    if (!data?.me) return;
    const prev = seen.current;
    if (prev) {
      for (const a of data.assignments) {
        const before = prev.get(a.id);
        if (!before && a.status === "assigned") {
          navigator.vibrate?.([160, 80, 160]);
          toast(t("toast.new"), {
            description: `${a.case.ref} · ${a.case.text}`,
            action: { label: t("a.open"), onClick: () => router.push(`/tanod/a/${a.id}`) },
            duration: 12000,
          });
        } else if (before && before !== "cancelled" && a.status === "cancelled") {
          toast(t("toast.cancelled"), { description: `${a.case.ref}${a.closeReason ? ` · ${a.closeReason}` : ""}` });
        }
      }
    }
    seen.current = new Map(data.assignments.map((a) => [a.id, a.status]));
  }, [data, router, t]);

  if (onSignIn) return <>{children}</>;
  if (!me || !data) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <TanodMark className="size-12 animate-pulse" />
      </div>
    );
  }

  const fresh = data.assignments.filter((a) => a.status === "assigned").length;
  const onDuty = data.shifts.some((s) => isOnDuty(s, data.now));
  const tabs = [
    { href: "/tanod", label: t("nav.now"), icon: Radio, exact: true, badge: fresh },
    { href: "/tanod/schedule", label: t("nav.schedule"), icon: CalendarDays },
    { href: "/tanod/history", label: t("nav.history"), icon: History },
  ];
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-[60px] max-w-xl items-center gap-3 px-4">
          <Link href="/tanod" className="flex min-w-0 items-center gap-2.5">
            <TanodMark />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[15px] font-bold tracking-tight">{t("app.name")}</span>
              <span className="block truncate text-[12px] text-muted-foreground">{data.settings.barangay}</span>
            </span>
          </Link>
          <span
            className={cn(
              "ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold whitespace-nowrap",
              onDuty ? "bg-brand-soft text-brand-deep" : "bg-fill text-ink-3",
            )}
          >
            <span className={cn("size-2 rounded-full", onDuty ? "animate-pulse bg-primary" : "bg-ink-3/50")} />
            {onDuty ? t("sched.live") : t("duty.pillOff")}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={me.name} className="grid size-9 place-items-center rounded-full bg-gold-soft text-[13px] font-bold text-[#7a4c00]">
                {initials(me.name)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="font-normal">
                <span className="block text-[15px] font-semibold text-foreground">{me.name}</span>
                <span className="block text-[12.5px] text-muted-foreground">
                  {t("menu.mobile")}: {formatMobile(me.phone)}
                </span>
                {me.zone && (
                  <span className="block text-[12.5px] text-muted-foreground">
                    {t("menu.post")}: {PUROK_NAME[me.zone]}
                  </span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[12px] text-muted-foreground">{t("menu.language")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as Lang)}>
                <DropdownMenuRadioItem value="fil">Filipino</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void act("out", signOutTanod).then((r) => r.ok && router.replace("/tanod/signin"))}
                className="text-high focus:text-high"
              >
                <LogOut className="size-4" /> {t("menu.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {!online && (
          <div role="status" className="flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-[13px] text-background">
            <WifiOff className="size-4" /> {t("common.offline")}
          </div>
        )}
      </header>

      <main className={cn("mx-auto w-full max-w-xl flex-1 px-4 pt-3", focused ? "pb-40" : "pb-28")}>{children}</main>

      {!focused && (
        <nav aria-label="Tanod" className="pb-safe fixed inset-x-0 bottom-0 z-30 bg-card/90 shadow-[0_-12px_32px_-20px_rgb(18_24_32/0.3)] backdrop-blur-xl backdrop-saturate-150">
          <ul className="mx-auto grid h-[66px] max-w-md grid-cols-3 items-center px-1">
            {tabs.map((tab) => {
              const active = isActive(tab.href, tab.exact);
              const Icon = tab.icon;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn("relative flex flex-col items-center gap-0.5 py-1 text-[11.5px] font-semibold text-ink-3 transition", active && "text-foreground")}
                  >
                    <span className={cn("grid h-8 w-16 place-items-center rounded-full transition", active && "bg-brand-soft text-primary")}>
                      <Icon className="size-[20px]" strokeWidth={active ? 2.3 : 1.9} />
                    </span>
                    {tab.label}
                    {!!tab.badge && (
                      <span className="absolute top-0 right-[calc(50%-26px)] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-high px-1 text-[10px] font-bold text-white tabular">
                        {tab.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <PrototypeBar className={cn("left-3", focused ? "bottom-[104px]" : "bottom-[84px]")}>
        <PersonaSwitch currentId={me.id} />
      </PrototypeBar>
    </div>
  );
}

/** Prototype-only: hop between tanod accounts to see each one's assignments. */
function PersonaSwitch({ currentId }: { currentId: string }) {
  const router = useRouter();
  const { data } = useTanod();
  const { act } = useAct();
  return (
    <label className="grid gap-1">
      <span className="text-[10.5px] tracking-[0.12em] text-[#8a7f6a] uppercase">View as tanod</span>
      <select
        value={currentId}
        onChange={(e) => void act("persona", () => switchTanodPersona({ staffId: e.target.value })).then((r) => r.ok && router.replace("/tanod"))}
        className="rounded-md border border-[#c9bd9f] bg-white px-2 py-1.5"
      >
        {data?.personas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
