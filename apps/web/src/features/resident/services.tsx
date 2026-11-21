"use client";

import { ArrowLeft, ArrowRight, Clock, Coins, Info, PackageCheck } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/tugon/badges";
import { CATEGORY, type Category } from "@/lib/domain";
import { useT } from "./lang";
import { primaryBtn } from "./signin";
import { SectionLabel } from "./ui";

const EXAMPLES: Record<Category, { fil: string[]; en: string[] }> = {
  peace: {
    fil: ["Videoke o inuman hanggang madaling araw", "Grupo ng kabataang nanggugulo sa kanto", "Alitan sa kapitbahay na gustong ipa-mediate sa Lupon"],
    en: ["Videoke or drinking past midnight", "Groups causing trouble on a corner", "A neighbor dispute you want mediated by the Lupon"],
  },
  infra: {
    fil: ["Patay na streetlight", "Malalim na lubak o bukas na manhole", "Nakatagilid na poste o nakalaylay na kable"],
    en: ["Broken streetlight", "Deep pothole or open manhole", "Leaning pole or hanging cable"],
  },
  sanitation: {
    fil: ["Hindi nakolektang basura", "Baradong kanal na nagpapabaha", "Asong gala na nangangagat, o maraming lamok"],
    en: ["Uncollected garbage", "Blocked canal causing flooding", "Aggressive stray dog, or lots of mosquitoes"],
  },
  documents: {
    fil: ["Ano ang kailangan para sa clearance", "Pagkuha ng certificate of indigency", "First-time jobseeker certificate"],
    en: ["What you need for a clearance", "Getting a certificate of indigency", "First-time jobseeker certificate"],
  },
  social: {
    fil: ["Iskedyul ng ayuda", "Tulong para sa senior, PWD, o solo parent", "Sasakyan papuntang ospital"],
    en: ["Ayuda schedule", "Help for seniors, PWD, or solo parents", "Transport to the hospital"],
  },
};

const DOCS: { name: string; bring: { fil: string; en: string }; fee: string; time: { fil: string; en: string } }[] = [
  { name: "Barangay Clearance", bring: { fil: "Valid ID, cedula", en: "Valid ID, community tax certificate" }, fee: "₱50", time: { fil: "Sa araw ding iyon", en: "Same day" } },
  { name: "Certificate of Indigency", bring: { fil: "Valid ID, sulat ng layunin", en: "Valid ID, letter stating purpose" }, fee: "Libre / Free", time: { fil: "Sa araw ding iyon", en: "Same day" } },
  { name: "Certificate of Residency", bring: { fil: "Valid ID, patunay ng tirahan", en: "Valid ID, proof of address" }, fee: "₱30", time: { fil: "Sa araw ding iyon", en: "Same day" } },
  { name: "First-Time Jobseeker (RA 11261)", bring: { fil: "Valid ID; pipirma ng oath sa hall", en: "Valid ID; sign an oath at the hall" }, fee: "Libre / Free", time: { fil: "1 araw", en: "1 day" } },
  { name: "Business Clearance", bring: { fil: "DTI registration, kontrata o titulo ng puwesto", en: "DTI registration, lease or title of the space" }, fee: "₱300", time: { fil: "1–2 araw", en: "1–2 days" } },
];

export function ServicePage({ category }: { category: Category }) {
  const { t, lang } = useT();
  const c = CATEGORY[category];

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <Link href="/resident" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("nav.home")}
      </Link>
      <header className="flex items-start gap-4">
        <CategoryIcon category={category} size="lg" />
        <div>
          <h1 className="text-[26px] leading-tight font-bold tracking-tight">{c[lang]}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">{c.hint[lang]}</p>
        </div>
      </header>

      <section>
        <SectionLabel>{t("service.examples")}</SectionLabel>
        <ul className="divide-y divide-hairline overflow-hidden rounded-[22px] bg-card shadow-sheet">
          {EXAMPLES[category][lang].map((ex) => (
            <li key={ex} className="flex items-center gap-3 px-4 py-3.5 text-[15px]">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" /> {ex}
            </li>
          ))}
        </ul>
      </section>

      {category === "documents" && (
        <section>
          <SectionLabel>{t("service.docs")}</SectionLabel>
          <div className="grid gap-2.5">
            {DOCS.map((d) => (
              <article key={d.name} className="rounded-[22px] bg-card p-4 shadow-sheet">
                <h3 className="text-[16px] font-bold">{d.name}</h3>
                <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[14px]">
                  <div className="flex basis-full gap-2">
                    <PackageCheck className="mt-0.5 size-4 shrink-0 text-ink-3" />
                    <dt className="sr-only">{t("service.bring")}</dt>
                    <dd>{d.bring[lang]}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                      <Coins className="size-4 text-ink-3" />
                      <dt className="sr-only">{t("service.fee")}</dt>
                      <dd className="font-semibold tabular">{d.fee}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                      <Clock className="size-4 text-ink-3" />
                      <dt className="sr-only">{t("service.time")}</dt>
                      <dd>{d.time[lang]}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <p className="mt-3 flex gap-2 rounded-2xl bg-[#fff6d6] px-4 py-3 text-[13px] text-[#5b5240]">
            <Info className="mt-0.5 size-4 shrink-0" /> {t("service.docsNote")}
          </p>
        </section>
      )}

      <Link href={`/resident/report?category=${category}`} className={primaryBtn}>
        {t("service.report")} <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
