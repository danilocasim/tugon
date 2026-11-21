"use client";

import { BellRing, Eye, PhoneCall } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import type { Category, LocationInfo } from "@/lib/domain";
import { CATEGORY } from "@/lib/domain";
import { fmtDate } from "@/lib/format";
import { PUROK_NAME, landmarkById } from "@/lib/geo";
import { localHours } from "./i18n";
import { useT } from "./lang";
import { primaryBtn } from "./signin";

/** Decorative barcode derived from the reference digits — a receipt, not a scannable code. */
function Barcode({ value }: { value: string }) {
  const digits = value.replace(/\D/g, "").split("").map(Number);
  const bars = digits.flatMap((d, i) => [1 + (d % 3), 1 + ((d + i) % 2), 2 + ((d * 7 + i) % 3)]);
  const segments: { left: number; width: number }[] = [];
  let x = 0;
  for (const width of bars) {
    segments.push({ left: x, width });
    x += width + 1.2;
  }
  return (
    <svg viewBox={`0 0 ${x} 30`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden>
      {segments.map(({ left, width }, i) => i % 2 === 0 && <rect key={i} x={left} y={0} width={width * 0.9} height={30} fill="#121820" />)}
    </svg>
  );
}

interface ReceiptProps {
  report: { id: string; ref: string; createdAt: number; residentCategory: Category | null; location: LocationInfo | null };
  settings: { barangay: string; intakeHours: string };
  replayed: boolean;
}

export function Receipt({ report: r, settings, replayed }: ReceiptProps) {
  const { t, lang } = useT();

  const place = r.location?.landmarkId ? landmarkById(r.location.landmarkId)?.name : r.location?.purok ? PUROK_NAME[r.location.purok] : null;

  return (
    <div className="mx-auto grid max-w-md gap-6 pt-2">
      <div className="grid justify-items-center gap-3 text-center">
        <motion.svg viewBox="0 0 56 56" className="size-16" initial="hidden" animate="shown" aria-hidden>
          <motion.circle cx="28" cy="28" r="26" fill="#e1efe8" stroke="#0b5d4b" strokeWidth="2.5" variants={{ hidden: { pathLength: 0 }, shown: { pathLength: 1, transition: { duration: 0.5 } } }} />
          <motion.path d="m17 29 7.5 7.5L39.5 21" fill="none" stroke="#0b5d4b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" variants={{ hidden: { pathLength: 0 }, shown: { pathLength: 1, transition: { delay: 0.35, duration: 0.35 } } }} />
        </motion.svg>
        <h1 className="text-[26px] leading-tight font-bold tracking-tight">{t("receipt.title")}</h1>
        {replayed && <p className="rounded-full bg-medium-soft px-3.5 py-1 text-[13.5px] font-semibold text-[#6b3e00]">{t("receipt.replayed")}</p>}
      </div>

      <motion.div
        initial={{ opacity: 0, y: -24, scaleY: 0.96 }}
        animate={{ opacity: 1, y: 0, scaleY: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 26 }}
        className="origin-top drop-shadow-[0_14px_24px_rgb(18_24_32/0.12)]"
      >
        <div className="perforated bg-card px-6 pt-7 pb-6">
          <p className="text-center font-mono text-[10.5px] font-semibold tracking-[0.22em] text-ink-3 uppercase">Tugon · {settings.barangay}</p>
          <div className="my-4 border-t border-dashed border-input" />
          <p className="text-center text-[12px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{t("receipt.ref")}</p>
          <p className="mt-1 text-center font-mono text-[28px] font-semibold tracking-[0.04em] tabular">{r.ref}</p>
          <p className="mx-auto mt-3 w-fit rounded-md border-[1.5px] border-foreground/80 px-2.5 py-1 font-mono text-[11.5px] font-semibold tracking-[0.08em] uppercase">{t("receipt.stamp")}</p>
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
            <dt className="text-ink-3">{t("receipt.submitted")}</dt>
            <dd className="text-right font-mono tabular">{fmtDate(r.createdAt, lang, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</dd>
            <dt className="text-ink-3">{t("detail.category")}</dt>
            <dd className="text-right">{r.residentCategory ? CATEGORY[r.residentCategory].short[lang] : t("report.unsure")}</dd>
            {place && (
              <>
                <dt className="text-ink-3">{t("report.s2")}</dt>
                <dd className="text-right">{place}</dd>
              </>
            )}
          </dl>
          <div className="my-4 border-t border-dashed border-input" />
          <Barcode value={r.ref} />
        </div>
      </motion.div>

      <section className="rounded-[24px] bg-card p-5 shadow-sheet">
        <h2 className="text-[16px] font-bold">{t("receipt.next")}</h2>
        <ul className="mt-3 grid gap-3 text-[14.5px] leading-snug">
          <li className="flex gap-3">
            <Eye className="mt-0.5 size-4 shrink-0 text-primary" /> {t("receipt.next1")}{settings.intakeHours ? ` ${localHours(settings.intakeHours, lang)}.` : ""}
          </li>
          <li className="flex gap-3">
            <BellRing className="mt-0.5 size-4 shrink-0 text-primary" /> {t("receipt.next2")}
          </li>
          <li className="flex gap-3">
            <PhoneCall className="mt-0.5 size-4 shrink-0 text-high" /> {t("receipt.next3")}
          </li>
        </ul>
      </section>

      <div className="grid gap-2.5">
        <Link href={`/resident/requests/${r.id}`} className={primaryBtn}>
          {t("receipt.track")}
        </Link>
        <Link href="/resident" className="inline-flex h-12 items-center justify-center rounded-full text-[15px] font-semibold text-primary hover:bg-brand-soft/50">
          {t("receipt.home")}
        </Link>
      </div>
    </div>
  );
}
