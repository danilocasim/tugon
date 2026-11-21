"use client";

import { ArrowUpRight, Bell, ChevronRight, ClipboardCheck, Clock, MapPin, MessageCircleQuestion, PenLine, Phone } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/tugon/badges";
import { useResident } from "@/hooks/use-live";
import { CATEGORIES, CATEGORY, isOpen } from "@/lib/domain";
import { greeting } from "@/lib/format";
import { localHours } from "./i18n";
import { useT } from "./lang";
import { LangSwitch, RequestList, SectionLabel, Skeleton } from "./ui";

function StartReport({ signedIn }: { signedIn: boolean }) {
  const { t, lang } = useT();
  const to = (path: string) => (signedIn ? path : `/resident/signin?next=${encodeURIComponent(path)}`);
  return (
    <section aria-labelledby="start-title" className="rounded-[24px] bg-card p-4 shadow-sheet sm:p-6">
      <h2 id="start-title" className="text-[21px] leading-tight font-bold tracking-[-0.02em] sm:text-[24px]">
        {t("home.cta")}
      </h2>
      <p className="mt-1 text-[14px] text-muted-foreground">{t("home.pick")}</p>
      <ul className="mt-4 grid grid-cols-2 border-t border-hairline">
        {CATEGORIES.map((category) => (
          <li key={category} className="flex min-w-0 border-b border-hairline odd:border-r">
            <Link
              href={to(`/resident/report?category=${category}`)}
              className="group flex min-h-15 min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-2.5 transition-colors hover:bg-fill/70 sm:gap-3 sm:px-3 sm:py-3.5"
            >
              <CategoryIcon category={category} className="size-8 rounded-[10px] [&>svg]:size-[17px] sm:size-10 sm:rounded-[13px] sm:[&>svg]:size-5" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-tight font-bold sm:text-[15px]">{CATEGORY[category].short[lang]}</span>
                <span className="mt-0.5 hidden text-[12px] leading-snug text-muted-foreground sm:block">{CATEGORY[category].hint[lang]}</span>
              </span>
              <ChevronRight className="hidden size-3.5 shrink-0 text-ink-3 group-hover:text-foreground min-[360px]:block" aria-hidden />
            </Link>
          </li>
        ))}
        <li className="flex min-w-0 border-b border-hairline">
          <Link
            href={to("/resident/report")}
            className="group flex min-h-15 min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-2.5 text-brand-deep transition-colors hover:bg-brand-soft/55 sm:gap-3 sm:px-3 sm:py-3.5"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand-soft sm:size-10 sm:rounded-[13px]" aria-hidden>
              <PenLine className="size-[17px] sm:size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-tight font-bold sm:text-[15px]">{t("home.unsureShort")}</span>
              <span className="mt-0.5 block text-[11.5px] leading-tight text-muted-foreground sm:text-[12px]">{t("home.unsureHint")}</span>
            </span>
            <ArrowUpRight className="hidden size-3.5 shrink-0 group-hover:text-primary min-[360px]:block" aria-hidden />
          </Link>
        </li>
      </ul>
    </section>
  );
}

/** Replaces an empty list with what will happen, so a first-time resident knows what to expect. */
function HowItWorks({ lead }: { lead: string }) {
  const { t } = useT();
  const steps = [
    [PenLine, "home.how1t", "home.how1b"],
    [ClipboardCheck, "home.how2t", "home.how2b"],
    [Bell, "home.how3t", "home.how3b"],
  ] as const;
  return (
    <section aria-labelledby="how-title">
      <SectionLabel>
        <span id="how-title">{t("home.how")}</span>
      </SectionLabel>
      <p className="-mt-1 mb-3 text-[14.5px] text-muted-foreground">{lead}</p>
      <ol className="grid gap-2.5 sm:grid-cols-3">
        {steps.map(([Icon, title, body], i) => (
          <li key={title} className="flex gap-3.5 rounded-[22px] bg-card p-4 shadow-sheet sm:flex-col sm:gap-3">
            <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-primary">
              <Icon className="size-[18px]" />
              <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground tabular">{i + 1}</span>
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] leading-snug font-semibold">{t(title)}</span>
              <span className="mt-0.5 block text-[13.5px] leading-snug text-muted-foreground">{t(body)}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** How to reach the barangay outside the app, with the emergency route at the bottom of the same card. */
function HallCard() {
  const { t, lang } = useT();
  const { data } = useResident();
  if (!data) return null;
  const { settings } = data;
  const hotline = settings.hotline.replace(/[^\d+]/g, "");
  return (
    <section aria-labelledby="hall-title" className="overflow-hidden rounded-[24px] bg-card shadow-sheet">
      <div className="grid gap-3.5 p-5 text-[14.5px]">
        <h2 id="hall-title" className="text-[17px] font-bold tracking-[-0.01em]">
          {t("home.hours")}
        </h2>
        {(settings.officeHours || settings.intakeHours) && (
          <p className="flex items-start gap-3">
            <Clock className="mt-0.5 size-[18px] shrink-0 text-ink-3" />
            <span>
              {localHours(settings.officeHours, lang)}
              {settings.intakeHours && <span className="mt-0.5 block text-[13px] text-ink-3">{localHours(settings.intakeHours, lang)}</span>}
            </span>
          </p>
        )}
        {settings.hallAddress && (
          <p className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-[18px] shrink-0 text-ink-3" />
            <span>{settings.hallAddress}</span>
          </p>
        )}
        {hotline && (
          <a href={`tel:${hotline}`} className="flex items-start gap-3 font-semibold text-primary">
            <Phone className="mt-0.5 size-[18px] shrink-0" />
            <span>{t("emergency.callHall")} · <span className="tabular">{settings.hotline}</span></span>
          </a>
        )}
      </div>
      <div className="flex items-center gap-3 bg-high-soft px-5 py-3.5">
        <p className="min-w-0 flex-1 text-[14px] leading-snug font-bold text-[#7f2311]">{t("emergency.title")}</p>
        <a
          href="tel:911"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-high px-4 text-[14.5px] font-bold text-white transition hover:bg-[#a12d17] active:scale-[0.98]"
        >
          <Phone className="size-4" strokeWidth={2.4} /> 911
        </a>
      </div>
    </section>
  );
}

/** Learn before reporting: what each service covers and, for documents, what to bring. */
function ServiceGuide() {
  const { t, lang } = useT();
  return (
    <section aria-labelledby="guide-title">
      <SectionLabel>
        <span id="guide-title">{t("home.guide")}</span>
      </SectionLabel>
      <p className="-mt-1 mb-3 text-[13.5px] text-muted-foreground">{t("home.guideSub")}</p>
      <ul className="overflow-hidden rounded-[22px] bg-card shadow-sheet">
        {CATEGORIES.map((c) => (
          <li key={c} className="group/item">
            <Link href={`/resident/services/${c}`} className="group flex items-center gap-3 px-4 transition hover:bg-fill/40 active:bg-fill">
              <CategoryIcon category={c} size="sm" />
              <span className="flex min-w-0 flex-1 items-center gap-2 border-b border-hairline py-3.5 group-last/item:border-0">
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{CATEGORY[c][lang]}</span>
                <ChevronRight className="size-4 shrink-0 text-ink-3/70 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ResidentHome() {
  const { data } = useResident();
  const { t, lang } = useT();

  if (!data) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const me = data.me;
  const active = data.requests.filter(isOpen);
  const waiting = data.requests.filter((r) => r.status === "needs_info");
  const firstName = me?.name.split(" ")[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
      <div className="grid content-start gap-6">
        <header>
          <h1 className="text-[28px] leading-[1.1] font-bold tracking-[-0.03em] text-balance sm:text-[34px]">
            {me ? `${greeting(lang)}, ${firstName}.` : `${t("home.guest")}!`}
          </h1>
          <p className="mt-1.5 text-[16px] text-muted-foreground">{t("home.ask")}</p>
        </header>

        {!me && (
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-[14.5px] text-muted-foreground">
              {t("home.signedOut")}{" "}
              <Link href="/resident/signin" className="font-semibold whitespace-nowrap text-primary underline decoration-primary/30 underline-offset-4">
                {t("nav.signin")}
              </Link>
            </p>
            <span className="sm:hidden">
              <LangSwitch compact />
            </span>
          </div>
        )}

        {/* What the barangay is waiting on comes before anything new. */}
        {waiting.map((r) => (
          <Link key={r.id} href={`/resident/requests/${r.id}`} className="flex items-center gap-3 rounded-[22px] bg-medium-soft p-3.5 pl-4 transition active:scale-[0.99]">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-medium text-white">
              <MessageCircleQuestion className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-[#6b3e00]">{t("home.waiting")}</span>
              <span className="block truncate text-[13.5px] text-[#6b3e00]/80">
                <span className="font-mono">{r.ref}</span> · {r.events.findLast((e) => e.type === "info_requested")?.text}
              </span>
            </span>
            <span className="inline-flex h-9 shrink-0 items-center rounded-full bg-card px-4 text-[13.5px] font-bold text-medium shadow-sheet">{t("home.waitingCta")}</span>
          </Link>
        ))}

        <StartReport signedIn={!!me} />

        {me && active.length > 0 ? (
          <section aria-labelledby="active-title">
            <SectionLabel
              action={
                <Link href="/resident/requests" className="inline-flex items-center gap-0.5 text-[14px] font-semibold text-primary">
                  {t("home.seeAll")} <ChevronRight className="size-4" />
                </Link>
              }
            >
              <span id="active-title">{t("home.active")}</span>
            </SectionLabel>
            <RequestList requests={active.slice(0, 3)} lang={lang} />
          </section>
        ) : (
          <div className="grid gap-3">
            <HowItWorks lead={me ? t("home.none") : t("home.howLead")} />
            {me && data.requests.length > 0 && (
              <Link href="/resident/requests" className="inline-flex items-center gap-0.5 justify-self-start text-[14px] font-semibold text-primary">
                {t("home.past")} <ChevronRight className="size-4" />
              </Link>
            )}
          </div>
        )}
      </div>

      <aside className="grid content-start gap-8 lg:sticky lg:top-[84px]">
        <HallCard />
        <ServiceGuide />
      </aside>
    </div>
  );
}
