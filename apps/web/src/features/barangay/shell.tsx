"use client";

import {
  Briefcase,
  ChartColumn,
  ChevronsUpDown,
  Ellipsis,
  FileText,
  Gavel,
  Inbox,
  Languages,
  ListOrdered,
  LogOut,
  Plus,
  Search,
  Settings2,
  ShieldUser,
  Siren,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Mark } from "@/components/tugon/marks";
import { ActMessages, useAct, useStaff } from "@/hooks/use-live";
import { inboxOrder } from "@/lib/cases";
import { kpDeadline } from "@/lib/kp";
import { CATEGORY, FIELD_RESULT, ROLE, isOpen, type FieldStatus } from "@/lib/domain";
import { canAccess, type Area } from "@/lib/policy";
import { cn } from "@/lib/utils";
import { signOutPortal } from "@/server/sign-out";
import { CommandPalette, useModKey } from "./command-palette";
import { setStaffLang, useStaffLang } from "./i18n";
import { Avatar } from "./ui";

export interface NavItem {
  area: Area;
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  /** Second key of the "G then …" shortcut. */
  jump: string;
  count?: number;
  alert?: boolean;
}

export function StaffShell({ children }: { children: ReactNode }) {
  const { data, connected } = useStaff();
  const pathname = usePathname();
  const router = useRouter();
  const { act } = useAct();
  const [finder, setFinder] = useState(false);
  const me = data?.me ?? null;
  const mod = useModKey();
  const { lang, t, localize } = useStaffLang();
  useEffect(() => {
    if (!data) router.replace(`/barangay/signin?next=${encodeURIComponent(pathname)}`);
  }, [data, pathname, router]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Announce reports that arrive while the inbox is open elsewhere in the app.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data?.me || !canAccess(data.me, "inbox")) return;
    const ids = data.requests.filter((r) => r.status === "received").map((r) => r.id);
    if (seen.current) {
      for (const r of data.requests.filter((q) => q.status === "received" && !seen.current!.has(q.id))) {
        toast(t(r.dangerNow ? "New report · danger flagged" : "New report in intake"), {
          description: t("{ref} · {category} suggested", { ref: r.ref, category: CATEGORY[r.prediction.category][lang] }),
          action: { label: t("Open"), onClick: () => router.push(`/barangay/inbox?id=${r.id}`) },
          duration: 8000,
        });
      }
    }
    seen.current = new Set(ids);
  }, [data, router, t, lang]);

  // Tell whoever sent a tanod (or owns the case) when the tanod declines or files a report.
  const fieldSeen = useRef<Map<string, FieldStatus> | null>(null);
  useEffect(() => {
    if (!data?.me) return;
    const me = data.me;
    const prev = fieldSeen.current;
    if (prev) {
      for (const a of data.assignments) {
        if (a.redacted || prev.get(a.id) === a.status || (a.status !== "done" && a.status !== "declined")) continue;
        const req = data.requests.find((r) => r.id === a.requestId);
        if (!req || (a.assignedBy !== me.id && req.assigneeId !== me.id)) continue;
        const tanod = data.staff.find((s) => s.id === a.tanodId)?.name ?? t("Tanod");
        toast(a.status === "done" ? t("Field report · {ref}", { ref: req.ref }) : t("{name} declined · {ref}", { name: tanod, ref: req.ref }), {
          description: a.status === "done" ? `${tanod}: ${a.result ? FIELD_RESULT[a.result][lang] : t("report filed")}` : (a.closeReason ?? undefined),
          action: { label: t("Open"), onClick: () => router.push(`/barangay/cases/${req.id}`) },
          duration: 8000,
        });
      }
    }
    fieldSeen.current = new Map(data.assignments.map((a) => [a.id, a.status]));
  }, [data, router, t, lang]);

  const nav = useMemo<NavItem[]>(() => {
    if (!data?.me) return [];
    const s = data.me;
    const inbox = inboxOrder(data.requests);
    const queued = data.requests.filter((r) => r.status === "queued" && !r.redacted && (s.role !== "handler" || r.team === s.team));
    const mine = data.requests.filter((r) => r.assigneeId === s.id && isOpen(r));
    const incidents = data.incidents.filter((i) => i.status === "open");
    const now = data.now;
    const docket = data.kp.filter((k) => !k.closedAt);
    const kpOverdue = docket.some((k) => (kpDeadline(k) ?? Infinity) < now);
    const items: NavItem[] = [
      { area: "inbox", href: "/barangay/inbox", label: t("Intake inbox"), short: t("Inbox"), icon: Inbox, jump: "i", count: inbox.length, alert: inbox.some((r) => r.dangerNow) },
      { area: "queue", href: "/barangay/queue", label: t("Work queue"), short: t("Queue"), icon: ListOrdered, jump: "q", count: queued.length },
      { area: "mine", href: "/barangay/mine", label: t("My cases"), short: t("Mine"), icon: Briefcase, jump: "m", count: mine.length },
      { area: "incidents", href: "/barangay/incidents", label: t("Incidents"), short: t("Incidents"), icon: Siren, jump: "n", count: incidents.length, alert: incidents.length > 0 },
      { area: "lupon", href: "/barangay/lupon", label: "Lupon", short: "Lupon", icon: Gavel, jump: "l", count: docket.length, alert: kpOverdue },
      { area: "tanods", href: "/barangay/tanods", label: t("Tanods"), short: t("Tanods"), icon: ShieldUser, jump: "t" },
      { area: "insights", href: "/barangay/insights", label: t("Insights"), short: t("Insights"), icon: ChartColumn, jump: "s" },
      { area: "reports", href: "/barangay/reports", label: t("Monthly report"), short: t("Report"), icon: FileText, jump: "r" },
      { area: "admin", href: "/barangay/admin", label: t("Administration"), short: t("Admin"), icon: Settings2, jump: "a" },
    ];
    return items.filter((i) => canAccess(s, i.area));
  }, [data, t]);

  if (!me || !data) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Mark size={40} className="animate-pulse" />
      </div>
    );
  }

  const active = (href: string) => pathname.startsWith(href) || (href === "/barangay/queue" && pathname.startsWith("/barangay/cases"));
  const canIntake = canAccess(me, "intake");
  // Five tabs fit a phone; the rest go behind "More".
  const tabs = nav.length > 5 ? nav.slice(0, 4) : nav;
  const overflow = nav.length > 5 ? nav.slice(4) : [];

  const userMenu = (trigger: ReactNode, mobile = false) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={mobile ? "bottom" : "top"} className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-[14px] font-semibold text-foreground">{me.name}</span>
          <span className="block text-[12px] text-muted-foreground">
            {me.title} · {t(ROLE[me.role].en)}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
          <Languages className="size-3.5" /> {t("Language")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          aria-label={t("Language")}
          value={lang}
          onValueChange={(value) => {
            if (value === "en" || value === "fil") setStaffLang(value);
          }}
          className="mx-1 mb-1 grid grid-cols-2 gap-0.5 rounded-full bg-fill p-[3px]"
        >
          <DropdownMenuRadioItem value="en" className="h-8 rounded-full pl-3 text-[12.5px] font-semibold data-[state=checked]:bg-card">
            English
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="fil" className="h-8 rounded-full pl-3 text-[12.5px] font-semibold data-[state=checked]:bg-card">
            Filipino
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void act("out", signOutPortal).then((r) => r.ok && router.replace("/barangay/signin"))}
          className="text-high focus:text-high"
        >
          <LogOut className="size-4" /> {t("Sign out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const page = (
    <div className="min-h-dvh md:grid md:grid-cols-[76px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)] print:block">
      {/* Sidebar: icon rail on tablet, full on desktop */}
      <aside className="sticky top-0 hidden h-dvh flex-col md:flex print:hidden">
        <div className="flex h-16 items-center gap-2.5 px-5 xl:px-5">
          <Mark size={32} />
          <span className="hidden leading-tight xl:block">
            <span className="block text-[15px] font-bold tracking-tight">Tugon</span>
            <span className="block text-[11.5px] text-muted-foreground">{data.settings.barangay}</span>
          </span>
        </div>

        <div className="px-3 xl:px-4">
          <button
            type="button"
            onClick={() => setFinder(true)}
            aria-label={t("Search cases, pages and actions")}
            aria-keyshortcuts="Meta+K Control+K /"
            className="flex h-9 w-full items-center gap-2 rounded-xl bg-fill px-2.5 text-[13px] text-muted-foreground transition hover:bg-fill-strong max-xl:justify-center"
          >
            <Search className="size-4 shrink-0" />
            <span className="hidden flex-1 text-left xl:block">{t("Search")}</span>
            <kbd className="hidden rounded-md bg-card px-1.5 py-px font-sans text-[10.5px] font-semibold shadow-sheet xl:block">{mod}K</kbd>
          </button>
        </div>

        <nav aria-label={t("Staff")} className="mt-4 grid gap-0.5 px-3 xl:px-4">
          {nav.map((item) => {
            const Icon = item.icon;
            const on = active(item.href);
            const link = (
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "group relative flex h-10 items-center gap-3 rounded-xl px-2.5 text-[14px] font-semibold text-muted-foreground transition hover:bg-fill hover:text-foreground max-xl:justify-center",
                  on && "bg-card text-foreground shadow-sheet hover:bg-card",
                )}
              >
                <Icon className={cn("size-[18px] shrink-0", on && "text-primary")} />
                <span className="hidden flex-1 xl:block">{item.label}</span>
                {!!item.count && (
                  <span
                    className={cn(
                      "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[12px] font-semibold tabular max-xl:absolute max-xl:-top-1 max-xl:-right-1 max-xl:text-[10.5px]",
                      item.alert ? "bg-high text-white" : "text-ink-3 max-xl:bg-foreground max-xl:text-background",
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </Link>
            );
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" className="xl:hidden">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {canIntake && (
          <div className="mt-5 px-3 xl:px-4">
            <Link
              href="/barangay/intake/new"
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-primary text-[13.5px] font-bold text-primary-foreground shadow-press transition hover:bg-brand-deep"
              aria-label={t("Record walk-in or phone request")}
            >
              <Plus className="size-4" /> <span className="hidden xl:inline">{t("Walk-in / phone")}</span>
            </Link>
          </div>
        )}

        <div className="mt-auto grid gap-3 p-3 xl:p-4">
          <p className="flex items-center gap-2 px-1 text-[11.5px] text-muted-foreground max-xl:justify-center" role="status">
            <span className={cn("size-2 rounded-full", connected ? "bg-primary shadow-[0_0_0_3px_rgb(11_93_75/0.15)]" : "bg-ink-3")} />
            <span className="hidden xl:inline">{connected ? t("Live · updates arrive instantly") : t("Reconnecting…")}</span>
          </p>
          {userMenu(
            <button type="button" className="flex items-center gap-2.5 rounded-xl p-1.5 text-left transition hover:bg-fill max-xl:justify-center">
              <Avatar name={me.name} className="size-9 bg-gold-soft text-[12px] text-[#7a4c00]" />
              <span className="hidden min-w-0 flex-1 xl:block">
                <span className="block truncate text-[13.5px] font-semibold">{me.name}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">{t(ROLE[me.role].en)}</span>
              </span>
              <ChevronsUpDown className="hidden size-4 text-ink-3 xl:block" />
            </button>,
          )}
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2.5 bg-background/85 px-4 backdrop-blur-xl backdrop-saturate-150 md:hidden print:hidden">
          <Mark size={28} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[14px] font-bold">{t("Tugon · Staff")}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {me.name.split(" ").slice(-2).join(" ")} · {t(ROLE[me.role].en)}
            </span>
          </span>
          <button type="button" onClick={() => setFinder(true)} aria-label={t("Search cases, pages and actions")} className="grid size-10 shrink-0 place-items-center rounded-full bg-fill">
            <Search className="size-4" />
          </button>
          {canIntake && (
            <Link href="/barangay/intake/new" aria-label={t("Record walk-in or phone request")} className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
              <Plus className="size-4" />
            </Link>
          )}
          {userMenu(
            <button type="button" aria-label={t("Account")} className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-soft">
              <Avatar name={me.name} className="size-9 bg-gold-soft text-[12px] text-[#7a4c00]" />
            </button>,
            true,
          )}
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 pt-4 pb-28 sm:px-6 md:pt-6 md:pb-10 lg:px-8 lg:pt-8 print:max-w-none print:p-0">{children}</main>

        {/* Mobile bottom nav */}
        <nav aria-label={t("Staff")} className="pb-safe fixed inset-x-0 bottom-0 z-30 bg-card/90 shadow-[0_-12px_32px_-20px_rgb(18_24_32/0.3)] backdrop-blur-xl backdrop-saturate-150 md:hidden print:hidden">
          <ul className="grid h-16" style={{ gridTemplateColumns: `repeat(${tabs.length + (overflow.length ? 1 : 0)}, minmax(0, 1fr))` }}>
            {tabs.map((item) => {
              const Icon = item.icon;
              const on = active(item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={on ? "page" : undefined} className={cn("relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-ink-3", on && "text-foreground")}>
                    <span className={cn("grid h-8 w-14 place-items-center rounded-full", on && "bg-brand-soft text-primary")}>
                      <Icon className="size-[19px]" />
                    </span>
                    {item.short}
                    {!!item.count && (
                      <span className={cn("absolute top-1 right-[calc(50%-24px)] grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold tabular", item.alert ? "bg-high text-white" : "bg-foreground text-background")}>
                        {item.count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
            {overflow.length > 0 && (
              <li>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-ink-3",
                        overflow.some((i) => active(i.href)) && "text-foreground",
                      )}
                    >
                      <span className={cn("grid h-8 w-14 place-items-center rounded-full", overflow.some((i) => active(i.href)) && "bg-brand-soft text-primary")}>
                        <Ellipsis className="size-[19px]" />
                      </span>
                      {t("More")}
                      {overflow.some((i) => i.alert) && <span className="absolute top-1.5 right-[calc(50%-20px)] size-2.5 rounded-full bg-high" />}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top" className="w-60">
                    {overflow.map((item) => {
                      const Icon = item.icon;
                      return (
                        <DropdownMenuItem key={item.href} onSelect={() => router.push(item.href)} className={cn("h-11 gap-3 text-[14px]", active(item.href) && "font-semibold text-primary")}>
                          <Icon className="size-[18px]" />
                          <span className="flex-1">{item.label}</span>
                          {!!item.count && (
                            <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11.5px] font-semibold tabular", item.alert ? "bg-high text-white" : "text-ink-3")}>
                              {item.count}
                            </span>
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )}
          </ul>
        </nav>
      </div>

      <CommandPalette open={finder} onOpenChange={setFinder} nav={nav} />

    </div>
  );
  return <ActMessages.Provider value={localize}>{page}</ActMessages.Provider>;
}
