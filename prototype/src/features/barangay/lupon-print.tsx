"use client";

/**
 * Printable Lupon documents modelled on the usual KP forms (summons, amicable
 * settlement, certification to file action). Wording must be checked against
 * the current DILG templates before real use.
 */
import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useStaff } from "@/hooks/use-live";
import type { KpCase, Settings } from "@/lib/domain";
import { fmtDate } from "@/lib/format";
import { canAccess } from "@/lib/policy";
import { useStaffLang } from "./i18n";
import { Empty, NoAccess } from "./ui";

export type KpDoc = "summons" | "settlement" | "cfa";

function Caption({ kp }: { kp: KpCase }) {
  return (
    <div className="my-8 grid grid-cols-[1fr_auto] gap-6">
      <div className="grid gap-4">
        <p>
          <span className="block font-semibold uppercase">{kp.complainant}</span>
          <span className="block pl-8 text-[13px]">Complainant</span>
        </p>
        <p className="pl-16 text-[13px] italic">— against —</p>
        <p>
          <span className="block font-semibold uppercase">{kp.respondent}</span>
          <span className="block pl-8 text-[13px]">Respondent</span>
        </p>
      </div>
      <div className="grid content-start gap-2 text-[13.5px]">
        <p>
          Barangay Case No. <span className="font-mono font-semibold">{kp.number}</span>
        </p>
        <p className="max-w-[220px]">For: {kp.nature.length > 90 ? `${kp.nature.slice(0, 88)}…` : kp.nature}</p>
      </div>
    </div>
  );
}

function Signature({ name, role }: { name?: string; role: string }) {
  return (
    <div className="grid justify-items-center gap-0.5 text-center text-[13px]">
      <span className="block h-10 w-60 border-b border-current">{name && <span className="block pt-5 font-semibold uppercase">{name}</span>}</span>
      <span>{role}</span>
    </div>
  );
}

function Letterhead({ settings, title }: { settings: Settings; title: string }) {
  return (
    <header className="grid justify-items-center gap-0.5 text-center">
      <p className="text-[13px]">Republic of the Philippines</p>
      <p className="text-[13px]">{settings.city}</p>
      <p className="text-[15px] font-semibold">{settings.barangay}</p>
      <p className="mt-2 text-[13px] font-semibold tracking-[0.08em]">OFFICE OF THE LUPONG TAGAPAMAYAPA</p>
      <h1 className="mt-6 text-[20px] font-bold tracking-[0.12em]">{title}</h1>
    </header>
  );
}

export function KpDocument({ id, doc, hearingId }: { id: string; doc: KpDoc; hearingId: string | null }) {
  const { data } = useStaff();
  const { t } = useStaffLang();
  if (!data?.me) return null;
  if (!canAccess(data.me, "lupon")) return <NoAccess title={t("The Lupon docket is kept by the secretary, the Peace & Order desk and supervisors")} role={data.me.role} />;
  const kp = data.kp.find((k) => k.id === id);
  if (!kp) return <Empty icon={Printer} title={t("Lupon case not found")} />;
  const s = data.settings;
  const hearing = kp.hearings.find((h) => h.id === hearingId) ?? [...kp.hearings].sort((a, b) => b.at - a.at)[0];
  const respondentAbsent = kp.hearings.some((h) => h.result === "respondent_absent");
  const pangkat = kp.hearings.some((h) => h.kind === "conciliation");
  const today = fmtDate(kp.closedAt ?? Date.now(), "en", { month: "long", day: "numeric", year: "numeric" });

  let body: ReactNode;
  if (doc === "summons") {
    if (!hearing) return <Empty icon={Printer} title={t("No hearing to summon for")} body={t("Schedule a hearing first.")} />;
    const day = fmtDate(hearing.at, "en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const time = fmtDate(hearing.at, "en", { hour: "numeric", minute: "2-digit" });
    body = (
      <>
        <Letterhead settings={s} title="SUMMONS" />
        <Caption kp={kp} />
        <p>
          TO: <strong className="uppercase">{kp.respondent}</strong>
          <br />
          {kp.respondentAddress}
        </p>
        <p className="mt-5 indent-10 leading-[1.9]">
          You are hereby summoned to appear before me in person, together with your witnesses, on <strong>{day}</strong> at <strong>{time}</strong>, at the {s.barangay} Hall, then and
          there to answer to a complaint made before me, a copy of which is attached hereto, for {hearing.kind === "mediation" ? "mediation" : "conciliation"} of your dispute with the
          complainant.
        </p>
        <p className="mt-4 indent-10 leading-[1.9]">
          You are hereby warned that if you refuse or willfully fail to appear in obedience to this summons, you shall be barred from filing any counterclaim arising from said
          complaint.
        </p>
        <p className="mt-4 indent-10 leading-[1.9]">FAIL NOT or else face punishment as for contempt of court.</p>
        <p className="mt-6">Issued this {fmtDate(Date.now(), "en", { month: "long", day: "numeric", year: "numeric" })}.</p>
        <div className="mt-14 flex justify-end">
          <Signature role={hearing.kind === "mediation" ? "Punong Barangay / Lupon Chairman" : "Pangkat Chairman"} />
        </div>
        <section className="mt-14 border-t border-dashed border-current pt-5 text-[13px]">
          <h2 className="font-bold tracking-[0.08em]">OFFICER&apos;S RETURN</h2>
          <p className="mt-3 leading-[1.9]">
            I served this summons upon respondent {kp.respondent} on ____________________, 20___, by: (write the name/s of respondent/s before the mode by which they were served)
          </p>
          <p className="mt-2 leading-[1.9]">
            ____ 1. handing to them the summons in person, or
            <br />
            ____ 2. handing to them the summons when they refused to receive it, or
            <br />
            ____ 3. leaving the summons at their dwelling with a person of suitable age and discretion residing therein.
          </p>
          <div className="mt-10 flex justify-between gap-6">
            <Signature role="Received by respondent / date" />
            <Signature role="Serving officer" />
          </div>
        </section>
      </>
    );
  } else if (doc === "settlement") {
    if (!kp.settlement) return <Empty icon={Printer} title={t("No settlement recorded")} />;
    body = (
      <>
        <Letterhead settings={s} title="AMICABLE SETTLEMENT" />
        <Caption kp={kp} />
        <p className="indent-10 leading-[1.9]">We, complainant and respondent in the above-captioned case, do hereby agree to settle our dispute as follows:</p>
        <p className="mt-4 rounded-sm px-10 leading-[1.9] whitespace-pre-line">{kp.settlement.text}</p>
        <p className="mt-4 indent-10 leading-[1.9]">and bind ourselves to comply honestly and faithfully with the above terms of settlement.</p>
        <p className="mt-6">Entered into this {fmtDate(kp.settlement.at, "en", { month: "long", day: "numeric", year: "numeric" })}.</p>
        <div className="mt-14 flex flex-wrap justify-between gap-10">
          <Signature name={kp.complainant} role="Complainant" />
          <Signature name={kp.respondent} role="Respondent" />
        </div>
        <section className="mt-14 text-[13px]">
          <h2 className="font-bold tracking-[0.08em]">ATTESTATION</h2>
          <p className="mt-3 leading-[1.9]">
            I hereby certify that the foregoing amicable settlement was entered into by the parties freely and voluntarily, after I had explained to them the nature and consequence
            of such settlement. Either party may repudiate it within ten (10) days from today by filing a sworn statement with the Lupon Chairman.
          </p>
          <div className="mt-12 flex justify-end">
            <Signature role={pangkat ? "Pangkat Chairman" : "Punong Barangay / Lupon Chairman"} />
          </div>
        </section>
      </>
    );
  } else {
    if (kp.stage !== "cfa") return <Empty icon={Printer} title={t("No certificate issued for this case")} />;
    body = (
      <>
        <Letterhead settings={s} title="CERTIFICATION TO FILE ACTION" />
        <Caption kp={kp} />
        <p>This is to certify that:</p>
        <ol className="mt-3 grid list-decimal gap-3 pl-14 leading-[1.9]">
          {respondentAbsent ? (
            <>
              <li>The respondent, despite due notice, failed to appear before the {pangkat ? "Pangkat ng Tagapagkasundo" : "Punong Barangay"} for the hearing of this complaint;</li>
              <li>Therefore, the corresponding complaint for the dispute may now be filed in court or government office, and the respondent is barred from filing a counterclaim arising from it.</li>
            </>
          ) : (
            <>
              <li>There has been a personal confrontation between the parties before the Punong Barangay but mediation failed;</li>
              <li>The Pangkat ng Tagapagkasundo was constituted, but the personal confrontation before the Pangkat likewise did not result in a settlement;</li>
              <li>Therefore, the corresponding complaint for the dispute may now be filed in court or government office.</li>
            </>
          )}
        </ol>
        <p className="mt-6">Issued this {today}.</p>
        <div className="mt-14 flex flex-wrap justify-between gap-10">
          <Signature role={pangkat ? "Pangkat Secretary" : "Lupon Secretary"} />
          <Signature role={pangkat ? "Attested: Pangkat Chairman" : "Attested: Lupon Chairman"} />
        </div>
      </>
    );
  }

  return (
    <div className="grid gap-4 print:block">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/barangay/lupon/${kp.id}`} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {kp.number}
        </Link>
        <p className="ml-auto rounded-full bg-gold-soft px-3 py-1.5 text-[12.5px] text-[#5a3d00]">{t("Based on the usual KP forms. Check wording against current DILG templates.")}</p>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[13.5px] font-bold text-background">
          <Printer className="size-4" /> {t("Print")}
        </button>
      </div>
      <article className="mx-auto w-full max-w-[816px] overflow-x-auto bg-white px-6 py-10 font-serif text-[15px] text-black shadow-sheet sm:px-16 sm:py-14 print:max-w-none print:p-0 print:shadow-none">
        {body}
      </article>
    </div>
  );
}
