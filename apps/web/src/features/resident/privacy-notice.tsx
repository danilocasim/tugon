"use client";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAct, useResident } from "@/hooks/use-live";
import { requestErasure } from "@/server/resident-preferences";
import { useT } from "./lang";

const content = {
  fil: {
    lead: "Para sa pagsubok lamang. Huwag gumamit ng tunay na personal na detalye habang sinusuri pa ng barangay ang privacy notice.",
    sections: [
      ["Ano ang kinokolekta", "Ang email na ginagamit sa pag-sign in, pangalan, purok, wika at petsa ng pagsang-ayon. Hindi kailangan ang government ID."],
      ["Bakit", "Para makapag-sign in at maiugnay sa iyo ang mga request na ikaw mismo ang nagsumite."],
      ["Sino ang nakakakita", "Kailangan ang na-verify na email para mabuksan ang iyong account. Hindi pampubliko ang profile at mga request."],
    ],
    courtesy: "Sususuriin ng barangay ang kahilingan alinsunod sa mga patakaran sa pag-iingat ng rekord. Hindi agad mabubura ang data kapag isinumite ito.",
    prompt: "Ilagay ang email ng account",
    request: "Hilinging burahin ang account",
    saved: "Naitala ang kahilingan para sa pagsusuri.",
  },
  en: {
    lead: "For testing only. Use synthetic personal details while the barangay reviews the privacy notice.",
    sections: [
      ["What we collect", "Your sign-in email, name, purok, language and when you acknowledged this notice. No government ID is required."],
      ["Why", "To sign you in and link the requests you submit to your account."],
      ["Who can see it", "Your account requires a verified email. Your profile and requests are not public."],
    ],
    courtesy: "The barangay reviews deletion requests against applicable retention and legal-hold rules. Submitting this form does not immediately erase your data.",
    prompt: "Enter the email used for this account",
    request: "Request account deletion",
    saved: "Your request was recorded for review.",
  },
};

export function PrivacyNotice() {
  const { lang, t } = useT();
  const copy = content[lang];
  const { data } = useResident();
  const { act, pending } = useAct();
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);
  const { lead, sections } = copy;
  const me = data?.me;
  const dpo = data?.settings.privacy.dpo;
  return (
    <article className="mx-auto grid max-w-2xl gap-6">
      <Link href={me ? "/resident/account" : "/resident/signin"} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t(me ? "account.title" : "nav.signin")}
      </Link>
      <header>
        <h1 className="text-[28px] font-bold tracking-tight">{t("account.privacy")}</h1>
        <p className="mt-2 rounded-2xl bg-[#fff6d6] px-4 py-3 text-[14px] text-[#5b5240]">{lead}</p>
      </header>
      <div className="grid gap-5">
        {sections.map(([title, text]) => (
          <section key={title}>
            <h2 className="text-[17px] font-bold">{title}</h2>
            <p className="mt-1 text-[15.5px] leading-relaxed text-muted-foreground">{text}</p>
          </section>
        ))}
      </div>
      {dpo?.name && (
        <section className="grid gap-2 rounded-[24px] bg-card p-5 shadow-sheet">
          <h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="size-5 text-primary" /> Data Protection Officer</h2>
          <p className="font-semibold">{dpo.name}</p>
          {dpo.email && <a href={`mailto:${dpo.email}`} className="text-primary">{dpo.email}</a>}
          {dpo.phone && <p className="text-muted-foreground">{dpo.phone}</p>}
        </section>
      )}
      {me && <form id="delete" className="grid gap-3 rounded-[24px] bg-high-soft/60 p-5"
        onSubmit={async (e) => { e.preventDefault(); const res = await act("erase", () => requestErasure(email)); if (res.ok) { setSaved(true); setEmail(""); } }}>
        <h2 className="text-[17px] font-bold">{copy.request}</h2>
        <p className="text-[14px] text-muted-foreground">{copy.courtesy}</p>
        {saved ? <p role="status" className="font-semibold">{copy.saved}</p> : <>
          <label className="grid gap-1.5 text-[14px] font-semibold">{copy.prompt}
            <input type="email" autoComplete="email" maxLength={254} required className="field h-11 rounded-2xl px-3 text-[16px]"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="min-h-11 rounded-full bg-high px-4 font-semibold text-white disabled:opacity-50" disabled={pending === "erase" || email.trim().toLowerCase() !== me.email.toLowerCase()}>{copy.request}</button>
        </>}
      </form>}
    </article>
  );
}
