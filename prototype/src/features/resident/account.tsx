"use client";

import { ChevronRight, Download, LogOut, Mail, MapPin, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useAct, useResident } from "@/hooks/use-live";
import { formatMobile } from "@/lib/duty";
import { initials } from "@/lib/format";
import { PUROK_NAME } from "@/lib/geo";
import { signOutResident, updateResidentPrefs } from "@/server/actions";
import { useT } from "./lang";
import { LangSwitch, PageTitle, Skeleton } from "./ui";

function MobileField({ phone }: { phone: string | null }) {
  const { t } = useT();
  const { act, pending } = useAct();
  const [value, setValue] = useState(formatMobile(phone));
  const dirty = value.replace(/\D/g, "") !== (phone ?? "");
  return (
    <form
      className="grid gap-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void act("mobile", () => updateResidentPrefs({ phone: value.trim() || null }), { success: t("account.mobileSaved") });
      }}
    >
      <label htmlFor="mobile" className="flex items-center gap-2 text-[15px] font-semibold">
        <Smartphone className="size-4 text-primary" /> {t("account.mobile")}
      </label>
      <span className="-mt-1 text-[13px] text-ink-3">{t("account.mobileHelp")}</span>
      <div className="flex gap-2">
        <input
          id="mobile"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
          placeholder="0917 123 4567"
          className="field h-12 min-w-0 flex-1 rounded-2xl px-4 text-[16px] tabular"
        />
        <button type="submit" disabled={!dirty || pending === "mobile"} className="h-12 rounded-full bg-primary px-5 text-[15px] font-bold text-primary-foreground disabled:opacity-40">
          {t("account.mobileSave")}
        </button>
      </div>
    </form>
  );
}

export function Account() {
  const { data } = useResident();
  const { t } = useT();
  const router = useRouter();
  const { act, pending } = useAct();

  useEffect(() => {
    if (data && !data.me) router.replace("/resident/signin?next=/resident/account");
  }, [data, router]);

  if (!data?.me) return <Skeleton className="h-72" />;
  const me = data.me;

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageTitle>{t("account.title")}</PageTitle>

      <section className="flex items-center gap-4 rounded-[24px] bg-card p-5 shadow-sheet">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-gold-soft text-[19px] font-bold text-[#7a4c00]">{initials(me.name)}</span>
        <div className="min-w-0">
          <p className="truncate text-[18px] font-bold">{me.name}</p>
          <p className="flex items-center gap-1.5 truncate text-[14px] text-muted-foreground">
            <Mail className="size-3.5" /> {me.email}
          </p>
          <p className="flex items-center gap-1.5 text-[14px] text-muted-foreground">
            <MapPin className="size-3.5" /> {PUROK_NAME[me.purok]}
          </p>
        </div>
      </section>

      <section className="divide-y divide-hairline overflow-hidden rounded-[22px] bg-card shadow-sheet">
        <div className="flex items-center justify-between gap-4 p-4">
          <span className="text-[15px] font-semibold">{t("account.language")}</span>
          <LangSwitch />
        </div>
        <label className="flex items-start justify-between gap-4 p-4">
          <span>
            <span className="block text-[15px] font-semibold">{t("account.email")}</span>
            <span className="mt-0.5 block text-[13px] text-ink-3">{t("account.emailHelp")}</span>
          </span>
          <Switch checked={me.emailUpdates} disabled={pending === "email"} onCheckedChange={(v) => void act("email", () => updateResidentPrefs({ emailUpdates: v }))} className="mt-1" />
        </label>
      </section>

      <section className="divide-y divide-hairline overflow-hidden rounded-[22px] bg-card shadow-sheet">
        <MobileField key={me.phone ?? ""} phone={me.phone} />
        <label className="flex items-start justify-between gap-4 p-4">
          <span>
            <span className="block text-[15px] font-semibold">{t("account.sms")}</span>
            <span className="mt-0.5 block text-[13px] text-ink-3">{me.phone ? t("account.smsHelp") : t("account.smsNeedsMobile")}</span>
          </span>
          <Switch checked={me.smsUpdates} disabled={!me.phone || pending === "sms"} onCheckedChange={(v) => void act("sms", () => updateResidentPrefs({ smsUpdates: v }))} className="mt-1" />
        </label>
      </section>

      <section className="divide-y divide-hairline overflow-hidden rounded-[22px] bg-card shadow-sheet">
        <Link href="/resident/privacy" className="flex items-center gap-3 p-4 transition hover:bg-fill/50">
          <ShieldCheck className="size-5 text-primary" />
          <span className="flex-1 text-[15px] font-semibold">{t("account.privacy")}</span>
          <ChevronRight className="size-4 text-ink-3" />
        </Link>
        <a href="/api/resident/export" download className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-fill/50">
          <Download className="size-5 text-primary" />
          <span className="flex-1 text-[15px] font-semibold">{t("account.download")}</span>
          <span className="text-[12.5px] font-medium text-ink-3">JSON</span>
        </a>
        <Link href="/resident/privacy#delete" className="flex items-center gap-3 p-4 text-high transition hover:bg-high-soft/40">
          <Trash2 className="size-5" />
          <span className="flex-1 text-[15px] font-semibold">{t("account.delete")}</span>
          <ChevronRight className="size-4 opacity-60" />
        </Link>
      </section>

      <button
        type="button"
        disabled={pending === "out"}
        onClick={async () => {
          const r = await act("out", signOutResident);
          if (r.ok) router.replace("/resident");
        }}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-high-soft/60 text-[15px] font-semibold text-high transition hover:bg-high-soft"
      >
        <LogOut className="size-4" /> {t("account.signout")}
      </button>
    </div>
  );
}
