"use client";

import { ArrowLeft, Camera, Check, ImageOff, Loader2, Lock, MapPin, Navigation, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { BarangayMap, type MapPin as Pin } from "@/components/tugon/barangay-map";
import { useAct, useNow, useTanod } from "@/hooks/use-live";
import { FIELD_RESULT, FIELD_RESULTS, type FieldResult } from "@/lib/domain";
import { dur, fmtDate } from "@/lib/format";
import { placeLabel } from "@/lib/geo";
import { compressPhoto } from "@/lib/photo";
import type { TanodAssignment } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { fileFieldReport, respondToAssignment } from "@/server/field-actions";
import { useTL } from "./lang";
import { CaseTags, DeclineSheet, FieldChip, Steps } from "./ui";

const QUICK_NOTES = ["Kinausap ang mga sangkot at umalis sila nang maayos.", "Walang nadatnan pagdating ko sa lugar.", "Naglagay ng harang at nagbantay hanggang dumating ang team."];

function ReportForm({ a, onCancel }: { a: TanodAssignment; onCancel: () => void }) {
  const { t, lang } = useTL();
  const { act, pending } = useAct();
  const [result, setResult] = useState<FieldResult | null>(null);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setBad(false);
    try {
      setPhoto(await compressPhoto(file));
    } catch {
      setBad(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="report" aria-labelledby="report-title" className="grid gap-5 rounded-[24px] bg-card p-5 shadow-sheet">
      <h2 id="report-title" className="text-[20px] font-bold tracking-tight">
        {t("rep.title")}
      </h2>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-[14px] font-semibold">{t("rep.result")}</legend>
        <div role="radiogroup" className="grid grid-cols-2 gap-2">
          {FIELD_RESULTS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={result === r}
              onClick={() => setResult(r)}
              className={cn(
                "flex min-h-14 items-center gap-2 rounded-2xl bg-fill px-3.5 py-2.5 text-left text-[14.5px] leading-tight font-semibold transition active:scale-[0.98]",
                result === r && "bg-foreground text-background",
              )}
            >
              {result === r && <Check className="size-4 shrink-0" strokeWidth={3} />}
              {FIELD_RESULT[r][lang]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-2">
        <span className="text-[14px] font-semibold">{t("rep.notes")}</span>
        <span className="-mt-1 text-[13px] text-muted-foreground">{t("rep.notesHelp")}</span>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_NOTES.map((n) => (
            <button key={n} type="button" onClick={() => setNotes(n)} className="rounded-full bg-fill px-3 py-1.5 text-left text-[12.5px] text-foreground/80 transition hover:bg-fill-strong">
              {n.length > 40 ? `${n.slice(0, 38)}…` : n}
            </button>
          ))}
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="field rounded-2xl px-4 py-3 text-[16px] leading-relaxed" />
      </label>

      <div className="grid gap-2">
        <span className="text-[14px] font-semibold">{t("rep.photo")}</span>
        <span className="-mt-1 text-[13px] text-muted-foreground">{t("rep.photoHelp")}</span>
        <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label={t("rep.photo")} />
        {photo ? (
          <div className="relative overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="aspect-[4/3] w-full object-cover" />
            <div className="absolute inset-x-3 bottom-3 flex gap-2">
              <button type="button" onClick={() => input.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-[14px] font-semibold shadow-float">
                <Camera className="size-4" /> {t("rep.photoReplace")}
              </button>
              <button type="button" onClick={() => setPhoto(null)} className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-[14px] font-semibold text-high shadow-float">
                <X className="size-4" /> {t("rep.photoRemove")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-fill text-[15px] font-semibold transition hover:bg-fill-strong">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />} {t("rep.photo")}
          </button>
        )}
        {bad && (
          <p role="alert" className="flex items-center gap-2 text-[14px] font-semibold text-high">
            <ImageOff className="size-4" /> {t("rep.photoBad")}
          </p>
        )}
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 bg-card/95 shadow-[0_-12px_32px_-20px_rgb(18_24_32/0.35)] backdrop-blur-xl">
        <div className="mx-auto grid max-w-xl grid-cols-[auto_1fr] gap-2 px-4 py-3">
          <button type="button" onClick={onCancel} className="h-14 rounded-full bg-fill px-5 text-[15px] font-semibold">
            {t("rep.cancel")}
          </button>
          <button
            type="button"
            disabled={!result || notes.trim().length < 10 || pending === "report"}
            onClick={() => result && void act("report", () => fileFieldReport({ id: a.id, result, report: notes, photo }), { success: t("toast.reported") })}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-bold text-primary-foreground shadow-press disabled:opacity-50"
          >
            {pending === "report" && <Loader2 className="size-5 animate-spin" />} {t("rep.send")}
          </button>
        </div>
      </div>
    </section>
  );
}

function ActionBar({ a, onReport }: { a: TanodAssignment; onReport: () => void }) {
  const { t } = useTL();
  const { act, pending } = useAct();
  const [declining, setDeclining] = useState(false);
  const primary = "inline-flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-bold text-primary-foreground shadow-press transition active:scale-[0.98] disabled:opacity-60";
  const secondary = "h-14 rounded-full bg-fill px-5 text-[15px] font-semibold transition active:scale-[0.98]";

  let body: React.ReactNode = null;
  if (a.status === "assigned") {
    body = (
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <button type="button" onClick={() => setDeclining(true)} className={secondary}>
          {t("a.decline")}
        </button>
        <button type="button" disabled={pending === "accept"} onClick={() => void act("accept", () => respondToAssignment({ id: a.id, action: "accept" }), { success: t("toast.accepted") })} className={primary}>
          {pending === "accept" && <Loader2 className="size-5 animate-spin" />} {t("act.accept")}
        </button>
        <DeclineSheet a={a} open={declining} onOpenChange={setDeclining} />
      </div>
    );
  } else if (a.status === "accepted") {
    body = (
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <button type="button" onClick={onReport} className={secondary}>
          {t("act.report")}
        </button>
        <button type="button" disabled={pending === "arrive"} onClick={() => void act("arrive", () => respondToAssignment({ id: a.id, action: "arrive" }), { success: t("toast.arrived") })} className={primary}>
          {pending === "arrive" && <Loader2 className="size-5 animate-spin" />} <MapPin className="size-5" /> {t("act.arrive")}
        </button>
      </div>
    );
  } else if (a.status === "on_scene") {
    body = (
      <button type="button" onClick={onReport} className={cn(primary, "w-full")}>
        {t("act.report")}
      </button>
    );
  }
  if (!body) return null;
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 bg-card/95 shadow-[0_-12px_32px_-20px_rgb(18_24_32/0.35)] backdrop-blur-xl">
      <div className="mx-auto max-w-xl px-4 py-3">{body}</div>
    </div>
  );
}

export function AssignmentDetail({ id }: { id: string }) {
  const { data } = useTanod();
  const { t, lang } = useTL();
  const now = useNow(30_000);
  const [reporting, setReporting] = useState(false);
  const a = data?.assignments.find((x) => x.id === id);
  const loc = a?.case.location;
  const hasPoint = loc?.lat != null && loc.lon != null && loc.method !== "purok";
  const pins = useMemo<Pin[]>(() => (hasPoint && a ? [{ id: a.id, lat: loc!.lat!, lon: loc!.lon!, tone: a.case.urgency, selected: true }] : []), [hasPoint, a, loc]);
  const focus = useMemo(() => (pins[0] ? { lat: pins[0].lat, lon: pins[0].lon, zoom: 16.5 } : null), [pins]);

  if (!data?.me) return null;
  if (!a) {
    return (
      <div className="grid justify-items-center gap-3 pt-16 text-center">
        <p className="text-[18px] font-bold">{t("d.notFound")}</p>
        <p className="max-w-xs text-[14px] text-muted-foreground">{t("d.notFoundBody")}</p>
        <Link href="/tanod" className="mt-2 inline-flex h-12 items-center rounded-full bg-primary px-6 text-[15px] font-bold text-primary-foreground">
          {t("d.back")}
        </Link>
      </div>
    );
  }

  const open = a.status === "assigned" || a.status === "accepted" || a.status === "on_scene";
  const place = placeLabel(a.case, lang);
  const startReport = () => {
    setReporting(true);
    requestAnimationFrame(() => document.getElementById("report")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Link href="/tanod" className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-full px-2 text-[15px] font-semibold text-muted-foreground">
          <ArrowLeft className="size-5" /> {t("d.back")}
        </Link>
        <span className="ml-auto font-mono text-[12.5px] text-ink-3">{a.case.ref}</span>
        <FieldChip status={a.status} />
      </div>

      <Steps status={a.status} />

      {a.case.restricted && (
        <p className="flex items-start gap-2.5 rounded-2xl bg-foreground px-4 py-3 text-[14px] text-background">
          <Lock className="mt-0.5 size-4 shrink-0" /> {t("d.restrictedNote")}
        </p>
      )}

      <section aria-label={t("d.reported")} className="grid gap-3 rounded-[24px] bg-card p-5 shadow-sheet">
        <CaseTags a={a} now={now} />
        <p className="text-[20px] leading-snug font-semibold text-pretty">{a.case.text}</p>
        <p className="text-[13.5px] text-muted-foreground">
          {a.case.reporterName && t("d.reporter", { name: a.case.reporterName })}
          {a.case.reporterName && a.case.handlerName && " · "}
          {a.case.handlerName && t("d.handler", { name: a.case.handlerName })}
        </p>
        {a.instructions && (
          <div className="rounded-2xl bg-gold-soft px-4 py-3">
            <p className="text-[12.5px] font-semibold text-[#7a4c00]">
              {t("d.instructions")} · {a.assignedByName}
            </p>
            <p className="mt-1 text-[16px] leading-snug">{a.instructions}</p>
          </div>
        )}
      </section>

      <section aria-label={t("d.where")} className="grid gap-3 rounded-[24px] bg-card p-5 shadow-sheet">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold">{place ?? t("d.noLocation")}</span>
            {loc && !hasPoint && <span className="block text-[13px] text-muted-foreground">{t("d.noPin")}</span>}
          </p>
        </div>
        {hasPoint && (
          <>
            <BarangayMap pins={pins} focus={focus} interactive={false} showPurokLabels={false} label={place ?? a.case.ref} className="h-48" />
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${loc!.lat},${loc!.lon}&travelmode=walking`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-fill text-[15px] font-semibold transition hover:bg-fill-strong"
            >
              <Navigation className="size-4" /> {t("d.directions")}
            </a>
          </>
        )}
      </section>

      {a.case.hasPhoto && open && (
        <a href={`/api/field-photo/${a.id}?portal=tanod&kind=original`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[24px] bg-fill shadow-sheet">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/field-photo/${a.id}?portal=tanod&kind=original`} alt={t("d.photo")} className="aspect-[4/3] w-full object-cover" />
        </a>
      )}

      {a.status === "done" && a.result && (
        <section className="grid gap-2 rounded-[24px] bg-brand-soft p-5">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-brand-deep">
            <Check className="size-4" strokeWidth={3} /> {t("done.title")}
          </p>
          <p className="text-[18px] font-bold">{FIELD_RESULT[a.result][lang]}</p>
          {a.report && <p className="text-[15px] leading-relaxed">{a.report}</p>}
          {a.hasPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/field-photo/${a.id}?portal=tanod`} alt="" className="mt-1 aspect-[4/3] w-full rounded-2xl object-cover" />
          )}
          <p className="text-[12.5px] text-brand-deep/80">
            {fmtDate(a.closedAt!, lang)}
            {a.arrivedAt && ` · ${t("hist.onScene", { dur: dur(a.closedAt! - a.arrivedAt) })}`}
          </p>
        </section>
      )}

      {(a.status === "declined" || a.status === "cancelled") && (
        <section className="grid gap-1 rounded-[24px] bg-fill p-5">
          <p className="text-[16px] font-bold">{a.status === "cancelled" ? t("closed.cancelled") : t("closed.declined")}</p>
          {a.closeReason && <p className="text-[14px] text-muted-foreground">{t("closed.reason", { reason: a.closeReason })}</p>}
        </section>
      )}

      {reporting && (a.status === "accepted" || a.status === "on_scene") ? <ReportForm a={a} onCancel={() => setReporting(false)} /> : <ActionBar a={a} onReport={startReport} />}
    </div>
  );
}
