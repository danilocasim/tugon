"use client";

import { Bell, ClipboardList, Home, PenLine, Phone, UserRound, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Seal } from "@/components/tugon/marks";
import { useResident } from "@/hooks/use-live";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "./lang";
import { LangSwitch } from "./ui";

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

export function ResidentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data } = useResident();
  const { t } = useT();
  const online = useOnline();
  const me = data?.me;
  const needsYou = data?.requests.filter((r) => r.status === "needs_info").length ?? 0;
  const unread = data?.notifications.filter((n) => !n.read).length ?? 0;
  const focusedFlow = pathname.startsWith("/resident/report") || pathname.startsWith("/resident/signin");

  const tabs = [
    { href: "/resident", label: t("nav.home"), icon: Home, exact: true },
    { href: "/resident/requests", label: t("nav.requests"), icon: ClipboardList, badge: needsYou },
    { href: "/resident/report", label: t("nav.report"), icon: PenLine, primary: true },
    { href: "/resident/updates", label: t("nav.updates"), icon: Bell, badge: unread },
    { href: "/resident/account", label: t("nav.account"), icon: UserRound },
  ];
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-[60px] max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/resident" className="flex min-w-0 items-center gap-2.5 rounded-lg">
            <Seal size={36} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[15px] font-bold tracking-tight">{data?.settings.barangay ?? "Tugon"}</span>
              {data?.settings.city && <span className="block truncate text-[12px] text-muted-foreground">{data.settings.city} · Tugon</span>}
            </span>
          </Link>

          <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
            {tabs
              .filter((tab) => !tab.primary && tab.href !== "/resident/account")
              .map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={isActive(tab.href, tab.exact) ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[14px] font-semibold text-muted-foreground transition hover:text-foreground",
                    isActive(tab.href, tab.exact) && "bg-fill text-foreground",
                  )}
                >
                  {tab.label}
                  {!!tab.badge && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-high px-1.5 text-[11px] font-bold text-white tabular">{tab.badge}</span>}
                </Link>
              ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <a
              href="tel:911"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-high-soft px-3 text-[13px] font-bold text-high transition hover:bg-high hover:text-white"
            >
              <Phone className="size-3.5" strokeWidth={2.4} />
              <span className="hidden sm:inline">{t("emergency.chip")}</span>
              <span className="sm:hidden">911</span>
            </a>
            {!focusedFlow && (
              <Link
                href="/resident/report"
                className="hidden h-9 items-center gap-2 rounded-full bg-primary px-4 text-[14px] font-bold text-primary-foreground shadow-press transition hover:bg-brand-deep md:inline-flex"
              >
                <PenLine className="size-4" /> {t("nav.report")}
              </Link>
            )}
            {me ? (
              <Link
                href="/resident/account"
                aria-label={t("nav.account")}
                className="grid size-9 place-items-center rounded-full bg-gold-soft text-[13px] font-bold text-[#7a4c00]"
              >
                {initials(me.name)}
              </Link>
            ) : (
              data && (
                <span className="hidden sm:block">
                  <LangSwitch compact />
                </span>
              )
            )}
          </div>
        </div>
        {!online && (
          <div role="status" className="flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-[13px] text-background">
            <WifiOff className="size-4" /> {t("common.offlineBanner")}
          </div>
        )}
      </header>

      <main className={cn("mx-auto w-full max-w-5xl flex-1 px-4 pt-3 sm:px-6 sm:pt-6 md:pb-16", focusedFlow ? "pb-32" : "pb-28")}>{children}</main>

      {!focusedFlow && (
        <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 bg-card/90 shadow-[0_-12px_32px_-20px_rgb(18_24_32/0.3)] backdrop-blur-xl backdrop-saturate-150 md:hidden">
          <ul className="mx-auto grid h-[66px] max-w-md grid-cols-5 items-center px-1">
            {tabs.map((tab) => {
              const active = isActive(tab.href, tab.exact);
              const Icon = tab.icon;
              if (tab.primary)
                return (
                  <li key={tab.href} className="flex justify-center">
                    <Link
                      href={tab.href}
                      className="-mt-6 grid size-14 place-items-center rounded-[18px] bg-primary text-primary-foreground shadow-press transition active:scale-95"
                    >
                      <Icon className="size-6" strokeWidth={2.2} />
                      <span className="sr-only">{tab.label}</span>
                    </Link>
                  </li>
                );
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn("relative flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold text-ink-3 transition", active && "text-foreground")}
                  >
                    <span className={cn("grid h-8 w-14 place-items-center rounded-full transition", active && "bg-brand-soft text-primary")}>
                      <Icon className="size-[20px]" strokeWidth={active ? 2.3 : 1.9} />
                    </span>
                    {tab.label}
                    {!!tab.badge && (
                      <span className="absolute top-0 right-[calc(50%-22px)] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-high px-1 text-[10px] font-bold text-white tabular">
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
    </div>
  );
}
