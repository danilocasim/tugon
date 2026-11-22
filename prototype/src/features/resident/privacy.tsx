"use client";

import { ArrowLeft, Download, Loader2, Mail, Phone, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useAct, useResident } from "@/hooks/use-live";
import { deleteMyAccount } from "@/server/privacy";
import { useT } from "./lang";

const CONTENT = {
  fil: {
    title: "Privacy notice",
    lead: "Prototype ito. Ang tunay na bersyon ay aaprubahan muna ng Data Protection Officer ng barangay alinsunod sa Data Privacy Act of 2012 (RA 10173).",
    sections: [
      ["Ano ang kinokolekta namin", "Pangalan, email, purok, mobile number kung ilalagay mo, ang iyong ulat, lokasyong pinili mo, at larawan kung magdadagdag ka. Hindi kami humihingi ng government ID para mag-ulat."],
      ["Bakit", "Para matugunan ng barangay ang iyong request at maabisuhan ka sa progreso sa app, email, o text kung pinili mo. Ginagamit din ang mga ulat, nang walang pangalan, para makita ang mga lugar na madalas may problema."],
      ["Sino ang nakakakita", "Ang awtorisadong barangay staff lang na may kinalaman sa iyong kaso, at ang tanod na ipinadala sa lugar. Mas mahigpit ang access sa mga sensitibong ulat, gaya ng karahasan sa tahanan."],
      ["Larawan at lokasyon", "Tinatanggal ang GPS at detalye ng camera sa larawan bago ipadala. Nakikita lang ng staff ang larawan; hindi ito pampubliko."],
    ],
    retention: (m: number) =>
      `Itinatago ang mga sarado nang ulat nang ${m} buwan, pagkatapos ay gagawing anonymous: mananatili lang ang kategorya, purok at petsa para sa estadistika. Ang mga kasong dumaan sa Lupon ay itinatago bilang legal na rekord.`,
    retentionTitle: "Gaano katagal",
    rightsTitle: "Iyong mga karapatan",
    rights: "Puwede mong i-download ang lahat ng data na naka-link sa account mo, ipatama ang mali sa Barangay Hall, o burahin ang account mo.",
    dpoTitle: "Data Protection Officer",
    download: "I-download ang aking data",
    deleteTitle: "Burahin ang aking account",
    deleteBody:
      "Mabubura ang account mo at ang mga notification. Babawiin ang mga bukas mong request, at gagawing anonymous ang lahat ng ulat mo. Ang mga kasong nasa Lupon ay hindi mabubura dahil legal na rekord ang mga ito, pero tatanggalin ang link sa account mo. Hindi na ito maibabalik.",
    deleteConfirm: "I-type ang email mo para kumpirmahin",
    deleteButton: "Burahin nang tuluyan",
    deleted: "Nabura na ang account mo.",
  },
  en: {
    title: "Privacy notice",
    lead: "This is a prototype. A real version is approved first by the barangay's Data Protection Officer under the Data Privacy Act of 2012 (RA 10173).",
    sections: [
      ["What we collect", "Your name, email, purok, your mobile number if you add one, your report, the location you choose, and a photo if you add one. We don't ask for a government ID to report."],
      ["Why", "So the barangay can act on your request and keep you updated in the app, by email, or by text if you choose. Reports are also used, without names, to find places with recurring problems."],
      ["Who can see it", "Only authorized barangay staff involved in your case, and the tanod sent to the place. Sensitive reports, such as domestic violence, have stricter access."],
      ["Photos and location", "GPS and camera details are removed from photos before upload. Photos are visible to staff only, never public."],
    ],
    retention: (m: number) =>
      `Closed reports are kept for ${m} months, then anonymized: only the category, purok and dates stay, for statistics. Cases that went through the Lupon are kept as legal records.`,
    retentionTitle: "How long",
    rightsTitle: "Your rights",
    rights: "You can download all data linked to your account, ask the Barangay Hall to correct anything wrong, or delete your account.",
    dpoTitle: "Data Protection Officer",
    download: "Download my data",
    deleteTitle: "Delete my account",
    deleteBody:
      "Your account and notifications are deleted. Open requests are withdrawn and every report you made is anonymized. Lupon cases can't be erased because they're legal records, but they're unlinked from your account. This can't be undone.",
    deleteConfirm: "Type your email to confirm",
    deleteButton: "Delete permanently",
    deleted: "Your account was deleted.",
  },
};

function DeleteAccount({ email }: { email: string }) {
  const { lang } = useT();
  const c = CONTENT[lang];
  const router = useRouter();
  const { act, pending } = useAct();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <section id="delete" className="grid gap-3 rounded-[24px] bg-high-soft/60 p-5">
      <h2 className="flex items-center gap-2 text-[17px] font-bold text-high">
        <Trash2 className="size-5" /> {c.deleteTitle}
      </h2>
      <p className="text-[14.5px] leading-relaxed text-foreground/85">{c.deleteBody}</p>
      {open ? (
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act("delete", () => deleteMyAccount({ confirmEmail: typed }));
            if (r.ok) {
              toast(c.deleted);
              router.replace("/resident");
            }
          }}
        >
          <label className="grid gap-1.5">
            <span className="text-[13.5px] font-semibold">{c.deleteConfirm}</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} type="email" autoComplete="off" placeholder={email} className="field h-12 rounded-2xl px-4 text-[16px]" />
          </label>
          <button
            type="submit"
            disabled={typed.trim().toLowerCase() !== email || pending === "delete"}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-high text-[15px] font-bold text-white disabled:opacity-40"
          >
            {pending === "delete" && <Loader2 className="size-4 animate-spin" />} {c.deleteButton}
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="h-12 justify-self-start rounded-full bg-card px-5 text-[15px] font-semibold text-high shadow-sheet">
          {c.deleteTitle}
        </button>
      )}
    </section>
  );
}

export function Privacy() {
  const { lang, t } = useT();
  const { data } = useResident();
  const c = CONTENT[lang];
  const privacy = data?.settings.privacy;
  return (
    <article className="mx-auto grid max-w-2xl gap-6">
      <Link href="/resident/account" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("account.title")}
      </Link>
      <header>
        <h1 className="text-[28px] font-bold tracking-tight">{c.title}</h1>
        <p className="mt-2 rounded-2xl bg-[#fff6d6] px-4 py-3 text-[14px] text-[#5b5240]">{c.lead}</p>
      </header>
      <div className="grid gap-5">
        {c.sections.map(([h, p]) => (
          <section key={h}>
            <h2 className="text-[17px] font-bold">{h}</h2>
            <p className="mt-1 text-[15.5px] leading-relaxed text-muted-foreground">{p}</p>
          </section>
        ))}
        {privacy && (
          <section>
            <h2 className="text-[17px] font-bold">{c.retentionTitle}</h2>
            <p className="mt-1 text-[15.5px] leading-relaxed text-muted-foreground">{c.retention(privacy.retentionMonths)}</p>
          </section>
        )}
        <section>
          <h2 className="text-[17px] font-bold">{c.rightsTitle}</h2>
          <p className="mt-1 text-[15.5px] leading-relaxed text-muted-foreground">{c.rights}</p>
        </section>
      </div>

      {privacy && (
        <section className="grid gap-2 rounded-[24px] bg-card p-5 shadow-sheet">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <ShieldCheck className="size-5 text-primary" /> {c.dpoTitle}
          </h2>
          <p className="text-[16px] font-semibold">{privacy.dpo.name}</p>
          <a href={`mailto:${privacy.dpo.email}`} className="flex items-center gap-2 text-[14.5px] text-primary">
            <Mail className="size-4" /> {privacy.dpo.email}
          </a>
          <p className="flex items-center gap-2 text-[14.5px] text-muted-foreground">
            <Phone className="size-4" /> {privacy.dpo.phone}
          </p>
        </section>
      )}

      {data?.me && (
        <>
          <a href="/api/resident/export" download className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-card text-[15px] font-semibold shadow-sheet transition hover:shadow-lift">
            <Download className="size-4 text-primary" /> {c.download}
          </a>
          <DeleteAccount email={data.me.email} />
        </>
      )}
    </article>
  );
}
