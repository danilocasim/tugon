"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAct, useNow, useStaff } from "@/hooks/use-live";
import { isOpen } from "@/lib/domain";
import { DAY, fmtDate } from "@/lib/format";
import { runRetention, updatePrivacySettings } from "@/server/privacy";
import { useStaffLang } from "./i18n";

const field = "field h-11 w-full rounded-xl px-3.5 text-[14px]";
const sheet = "rounded-[24px] bg-card p-5 shadow-sheet sm:p-6";

/** Data Privacy Act controls: how long closed cases keep personal details, and who residents contact. */
export function PrivacySettingsPanel() {
  const { data } = useStaff();
  const now = useNow(60_000);
  const { act, pending } = useAct();
  const { lang, t } = useStaffLang();
  const saved = data!.settings.privacy;
  const [months, setMonths] = useState(saved.retentionMonths);
  const [dpo, setDpo] = useState(saved.dpo);
  const changed = months !== saved.retentionMonths || dpo.name !== saved.dpo.name || dpo.email !== saved.dpo.email || dpo.phone !== saved.dpo.phone;

  // Same rule as the server: closed, past the period, not yet anonymized, not a Lupon record.
  const held = new Set(data!.legalHold);
  const eligible = (m: number) => data!.requests.filter((r) => !isOpen(r) && r.closedAt && r.closedAt < now - m * 30 * DAY && !r.anonymizedAt && !held.has(r.id)).length;
  const anonymized = data!.requests.filter((r) => r.anonymizedAt).length;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={`${sheet} grid content-start gap-4`}>
        <div>
          <h2 className="text-[17px] font-bold tracking-[-0.01em]">{t("Retention")}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("Closed cases older than this lose names, contact details, report text and photos. Category, purok and dates stay for statistics. Lupon cases are kept as legal records.")}
          </p>
        </div>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">{t("Keep personal details for")}</span>
          <span className="relative">
            <input type="number" min={1} max={120} value={months} onChange={(e) => setMonths(Number(e.target.value))} className={`${field} pr-20 tabular`} />
            <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-[12.5px] text-ink-3">{t("months")}</span>
          </span>
        </label>
        <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-fill p-3.5 text-[13px]">
          <div>
            <dt className="text-muted-foreground">{t("Due for anonymizing")}</dt>
            <dd className="text-[22px] font-bold tabular">{eligible(months)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("Already anonymized")}</dt>
            <dd className="text-[22px] font-bold tabular">{anonymized}</dd>
          </div>
        </dl>
        <p className="text-[12.5px] text-ink-3">
          {saved.lastRetentionRun ? t("Last run {date}.", { date: fmtDate(saved.lastRetentionRun, lang) }) : t("Retention has not been run yet.")} {t("Also removes SMS records older than the period.")}
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={changed || pending === "retention"}
              title={changed ? t("Save the new period first") : undefined}
              className="inline-flex h-10 items-center justify-center gap-2 justify-self-start rounded-full bg-foreground px-4 text-[13.5px] font-bold text-background disabled:opacity-40"
            >
              {pending === "retention" && <Loader2 className="size-4 animate-spin" />} {t("Run retention now")}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("Anonymize {n} closed cases?", { n: eligible(saved.retentionMonths) })}</AlertDialogTitle>
              <AlertDialogDescription>{t("Names, contact details, report text and photos are permanently removed. This can't be undone.")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-foreground text-background"
                onClick={async () => {
                  const r = await act("retention", runRetention);
                  if (r.ok) toast.success(t("{anonymized} cases anonymized · {sms} SMS records removed", { anonymized: r.data.anonymized, sms: r.data.smsRemoved }));
                }}
              >
                {t("Anonymize")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>

      <section className={`${sheet} grid content-start gap-3`}>
        <div>
          <h2 className="flex items-center gap-2 text-[17px] font-bold tracking-[-0.01em]">
            <ShieldCheck className="size-5 text-primary" /> {t("Data Protection Officer")}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("Shown on the resident privacy notice and in data exports, so residents know who to contact.")}</p>
        </div>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">{t("Name")}</span>
          <input value={dpo.name} onChange={(e) => setDpo({ ...dpo, name: e.target.value })} className={field} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">{t("Email")}</span>
          <input type="email" value={dpo.email} onChange={(e) => setDpo({ ...dpo, email: e.target.value })} className={field} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">{t("Phone")}</span>
          <input value={dpo.phone} onChange={(e) => setDpo({ ...dpo, phone: e.target.value })} className={field} />
        </label>
      </section>

      <div className="flex gap-2 lg:col-span-2">
        <button
          type="button"
          disabled={!changed || pending === "privacy"}
          onClick={() => void act("privacy", () => updatePrivacySettings({ retentionMonths: months, dpo }), { success: "Privacy settings saved" })}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[13.5px] font-bold text-primary-foreground disabled:opacity-40"
        >
          {pending === "privacy" && <Loader2 className="size-4 animate-spin" />} {t("Save privacy settings")}
        </button>
        {changed && (
          <button
            type="button"
            onClick={() => {
              setMonths(saved.retentionMonths);
              setDpo(saved.dpo);
            }}
            className="h-10 rounded-full bg-fill px-4 text-[13.5px] font-semibold transition hover:bg-fill-strong"
          >
            {t("Discard")}
          </button>
        )}
      </div>
    </div>
  );
}
