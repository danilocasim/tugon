"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, ImageOff, LocateFixed, Loader2, MapPin, Phone, RotateCw, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CategoryIcon } from "@/components/tugon/badges";
import { BarangayMap, type MapPin as Pin } from "@/components/tugon/barangay-map";
import { useAct, useResident } from "@/hooks/use-live";
import { CATEGORIES, CATEGORY, type Category, type LocationInfo } from "@/lib/domain";
import { LANDMARKS, PUROKS, PUROK_NAME, inBounds, landmarkById, nearestLandmark, purokAt, type LatLon } from "@/lib/geo";
import { compressPhoto } from "@/lib/photo";
import { cn } from "@/lib/utils";
import { submitReport } from "@/server/resident-report";
import { useT, type Translate } from "./lang";
import { primaryBtn } from "./signin";

interface Draft {
  step: 1 | 2 | 3 | 4;
  text: string;
  category: Category | null;
  danger: boolean | null;
  location: LocationInfo | null;
  photo: string | null;
  idemKey: string;
}

const freshDraft = (category: Category | null = null): Draft => ({
  step: 1,
  text: "",
  category,
  danger: null,
  location: null,
  photo: null,
  idemKey: crypto.randomUUID(),
});

/** Keep case text, coordinates and any photo in memory; retries reuse this draft's key. */
function useDraft(initialCategory: Category | null) {
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setDraft(freshDraft(initialCategory)); });
    return () => { cancelled = true; };
  }, [initialCategory]);
  return [draft, setDraft] as const;
}

function locationText(loc: LocationInfo, t: Translate) {
  if (loc.method === "landmark") return landmarkById(loc.landmarkId)?.name ?? "";
  if (loc.method === "purok") return PUROK_NAME[loc.purok ?? ""] ?? "";
  const near = nearestLandmark(loc.lat!, loc.lon!);
  if (!near) return "";
  return near.distanceM < 60 ? t("report.pinned", { place: near.name }) : t("report.pinnedFar", { m: Math.round(near.distanceM / 10) * 10, place: near.name });
}

export function ReportFlow({ initialCategory }: { initialCategory: Category | null }) {
  const { t, lang } = useT();
  const router = useRouter();
  const { data } = useResident();
  const { act, pending } = useAct();
  const [draft, setDraft] = useDraft(initialCategory);
  const [lost, setLost] = useState(false);
  const [touched, setTouched] = useState(false);
  const [online, setOnline] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

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

  const update = useCallback((patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d)), [setDraft]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [draft?.step]);

  if (!draft || !data?.me) return <div className="h-96 animate-pulse rounded-[24px] bg-sunken" />;

  const located = draft.category ? CATEGORY[draft.category].located : true;
  const step1Valid = draft.text.trim().length >= 10 && draft.danger !== null;
  const step2Valid = !located || !!draft.location;
  const canNext = draft.step === 1 ? step1Valid : draft.step === 2 ? step2Valid : true;
  const steps = [t("report.s1"), t("report.s2"), t("report.s3"), t("report.s4")];

  async function submit() {
    if (!draft) return;
    setErrorMsg(null);
    const payload = { text: draft.text, residentCategory: draft.category, dangerNow: !!draft.danger, location: draft.location, photo: draft.photo, idemKey: draft.idemKey };
    const r = await act("submit", () => submitReport(payload), { quiet: true });
    if (!r.ok) {
      if (r.code === "network") {
        setLost(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      else {
        setLost(false);
        setErrorMsg(r.message);
      }
      return;
    }
    router.push(`/resident/receipt/${r.data.id}${r.data.replayed ? "?replayed=1" : ""}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <Link href="/resident" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
          <X className="size-4" /> {t("report.title")}
        </Link>
        <span className="text-[13px] font-medium text-ink-3 tabular">{t("report.step", { n: draft.step })}</span>
      </div>

      <ol className="mb-7 grid grid-cols-4 gap-1.5" aria-label={t("report.title")}>
        {steps.map((label, i) => {
          const n = (i + 1) as Draft["step"];
          const done = n < draft.step;
          const current = n === draft.step;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={n > draft.step}
                onClick={() => update({ step: n })}
                aria-current={current ? "step" : undefined}
                className="group grid w-full gap-1.5 text-left disabled:cursor-default"
              >
                <span className="h-1.5 overflow-hidden rounded-full bg-fill-strong">
                  <motion.span
                    className="block h-full rounded-full bg-primary"
                    initial={false}
                    animate={{ width: done || current ? "100%" : "0%" }}
                    transition={{ duration: 0.35 }}
                  />
                </span>
                <span className={cn("flex items-center gap-1 text-[12.5px] font-semibold", current ? "text-foreground" : "text-ink-3")}>
                  {done && <Check className="size-3.5 text-primary" />}
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          key={draft.step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
          aria-labelledby="step-title"
        >
          {draft.step === 1 && (
            <div className="grid gap-7">
              <div className="grid gap-2">
                <h1 id="step-title" ref={headingRef} tabIndex={-1} className="text-[24px] leading-tight font-bold tracking-tight outline-none sm:text-[28px]">
                  {t("report.what")}
                </h1>
                <p className="text-[15px] text-muted-foreground">{t("report.whatHelp")}</p>
                <textarea
                  value={draft.text}
                  onChange={(e) => update({ text: e.target.value })}
                  onBlur={() => setTouched(true)}
                  placeholder={t("report.whatPlaceholder")}
                  rows={5}
                  maxLength={1000}
                  aria-label={t("report.what")}
                  aria-invalid={touched && draft.text.trim().length < 10 ? true : undefined}
                  aria-describedby="what-hint"
                  className="mt-1 min-h-44 w-full resize-none rounded-[22px] bg-card px-4 py-4 text-[17px] leading-relaxed shadow-sheet outline-none transition placeholder:text-ink-3/70 focus:shadow-[0_0_0_2px_var(--ring),0_0_0_6px_rgb(11_93_75/0.12)] aria-invalid:shadow-[0_0_0_2px_var(--high)]"
                />
                <div id="what-hint" className="flex justify-between text-[12.5px]">
                  <span className={cn("font-semibold", touched && draft.text.trim().length < 10 ? "text-high" : "text-transparent")} aria-live="polite">
                    {touched && draft.text.trim().length < 10 ? t("report.whatShort") : "."}
                  </span>
                  <span className="text-ink-3 tabular">{draft.text.length}/1000</span>
                </div>
              </div>

              <fieldset className="grid gap-2.5">
                <legend className="text-[16px] font-bold">
                  {t("report.cat")} <span className="font-normal text-ink-3">· {t("report.catHelp")}</span>
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip selected={draft.category === null} onClick={() => update({ category: null })}>
                    {t("report.unsure")}
                  </Chip>
                  {CATEGORIES.map((c) => (
                    <Chip key={c} selected={draft.category === c} onClick={() => update({ category: c })}>
                      <CategoryIcon category={c} size="sm" className="-ml-1.5 size-6 rounded-full" />
                      {CATEGORY[c].short[lang]}
                    </Chip>
                  ))}
                </div>
              </fieldset>

              <fieldset className="grid gap-2.5">
                <legend className="text-[16px] font-bold">{t("report.danger")}</legend>
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  {[
                    [true, t("report.dangerYes")],
                    [false, t("report.dangerNo")],
                  ].map(([value, label]) => (
                    <label
                      key={String(value)}
                      className={cn(
                        "flex h-14 cursor-pointer items-center gap-3 rounded-[18px] bg-card px-4 text-[15.5px] font-semibold shadow-sheet transition hover:shadow-lift",
                        draft.danger === value && (value ? "bg-high-soft text-[#7f2311] shadow-none" : "bg-brand-soft text-brand-deep shadow-none"),
                      )}
                    >
                      <input type="radio" name="danger" className="size-5 accent-[#0b5d4b]" checked={draft.danger === value} onChange={() => update({ danger: value as boolean })} />
                      {label}
                    </label>
                  ))}
                </div>
                {touched && draft.danger === null && (
                  <p role="alert" className="text-[13.5px] font-semibold text-high">
                    {lang === "fil" ? "Pumili ng sagot." : "Choose an answer."}
                  </p>
                )}
                <AnimatePresence>
                  {draft.danger && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div role="alert" className="mt-1 grid gap-3 rounded-[22px] bg-high p-4 text-white">
                        <p className="flex gap-2.5 text-[15px] leading-snug font-semibold">
                          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                          {t("report.dangerNotice")}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <a href="tel:911" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-bold text-high">
                            <Phone className="size-4" /> 911
                          </a>
                          <a href={`tel:${data.settings.hotline.replace(/[^\d+]/g, "")}`} className="inline-flex h-11 items-center justify-center rounded-full bg-white/15 text-[14px] font-semibold tabular">
                            {data.settings.hotline}
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </fieldset>
            </div>
          )}

          {draft.step === 2 && <WhereStep draft={draft} update={update} located={located} headingRef={headingRef} showError={touched && !step2Valid} />}

          {draft.step === 3 && <PhotoStep draft={draft} update={update} headingRef={headingRef} />}

          {draft.step === 4 && (
            <div className="grid gap-5">
              <h1 id="step-title" ref={headingRef} tabIndex={-1} className="text-[24px] font-bold tracking-tight outline-none sm:text-[28px]">
                {t("report.review")}
              </h1>
              <AnimatePresence>
                {lost && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="rounded-[22px] bg-medium-soft p-4">
                    <p className="flex items-center gap-2 text-[15.5px] font-bold text-[#6b3e00]">
                      <WifiOff className="size-4" /> {t("report.lostTitle")}
                    </p>
                    <p className="mt-1 text-[14px] text-[#6b3e00]/85">{t("report.lostBody")}</p>
                  </motion.div>
                )}
              </AnimatePresence>
              <dl className="overflow-hidden rounded-[22px] bg-card shadow-sheet">
                <ReviewRow label={t("report.s1")} onEdit={() => update({ step: 1 })} editLabel={t("report.edit")}>
                  <p className="text-[15.5px] leading-relaxed whitespace-pre-wrap">{draft.text}</p>
                  <p className="mt-2 flex flex-wrap gap-2 text-[13px]">
                    <span className="rounded-full bg-fill px-2.5 py-0.5 font-semibold">{draft.category ? CATEGORY[draft.category][lang] : t("report.unsure")}</span>
                    {draft.danger && <span className="rounded-full bg-high px-2.5 py-0.5 font-semibold text-white">{t("report.dangerYes")}</span>}
                  </p>
                </ReviewRow>
                <ReviewRow label={t("report.s2")} onEdit={() => update({ step: 2 })} editLabel={t("report.edit")}>
                  <p className="flex items-center gap-2 text-[15px]">
                    <MapPin className="size-4 text-primary" />
                    {draft.location ? (
                      <>
                        {locationText(draft.location, t)}
                        {draft.location.purok && <span className="text-ink-3">· {PUROK_NAME[draft.location.purok]}</span>}
                      </>
                    ) : (
                      <span className="text-ink-3">{t("report.none")}</span>
                    )}
                  </p>
                </ReviewRow>
                <ReviewRow label={t("report.s3")} onEdit={() => update({ step: 3 })} editLabel={t("report.edit")}>
                  {draft.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.photo} alt={t("report.photoAttached")} className="h-28 w-40 rounded-2xl object-cover" />
                  ) : (
                    <p className="text-[15px] text-ink-3">{t("report.none")}</p>
                  )}
                </ReviewRow>
              </dl>
              <p className="text-[13.5px] text-muted-foreground">
                {t("report.privacy")}{" "}
                <Link href="/resident/privacy" className="font-semibold text-primary underline underline-offset-2">
                  {t("report.privacyLink")}
                </Link>
              </p>
              {!online && (
                <p role="status" className="flex items-center gap-2 rounded-[22px] bg-foreground px-4 py-3 text-[14px] text-background">
                  <WifiOff className="size-4" /> {t("report.offline")}
                </p>
              )}
              {errorMsg && (
                <p role="alert" className="rounded-2xl bg-high-soft px-4 py-3 text-[14px] font-semibold text-high">
                  {errorMsg}
                </p>
              )}
            </div>
          )}
        </motion.section>
      </AnimatePresence>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-background from-60% to-background/0 pt-5 md:static md:mt-8 md:bg-none md:pt-0">
        <div className="mx-auto flex max-w-2xl gap-2.5 px-4 py-3 md:px-0">
          {draft.step > 1 && (
            <button
              type="button"
              onClick={() => update({ step: (draft.step - 1) as Draft["step"] })}
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-card px-4 text-[15px] font-semibold shadow-sheet transition hover:shadow-lift"
            >
              <ArrowLeft className="size-4" /> <span className="sr-only sm:not-sr-only">{t("report.back")}</span>
            </button>
          )}
          {draft.step < 4 ? (
            <button
              type="button"
              aria-disabled={!canNext}
              onClick={() => {
                setTouched(true);
                if (!canNext) return;
                setTouched(false);
                update({ step: (draft.step + 1) as Draft["step"] });
              }}
              className={cn(primaryBtn, !canNext && "opacity-60")}
            >
              {t("report.next")} <ArrowRight className="size-4" />
            </button>
          ) : (
            <button type="button" disabled={pending === "submit" || !online} onClick={submit} className={primaryBtn}>
              {pending === "submit" ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> {t("report.sending")}
                </>
              ) : lost ? (
                <>
                  <RotateCw className="size-4" /> {t("report.retry")}
                </>
              ) : (
                t("report.submit")
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full bg-card px-3.5 text-[14px] font-semibold shadow-sheet transition hover:shadow-lift",
        selected && "bg-foreground text-background shadow-none hover:shadow-none",
      )}
    >
      {children}
    </button>
  );
}

function ReviewRow({ label, children, onEdit, editLabel }: { label: string; children: ReactNode; onEdit: () => void; editLabel: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 border-b border-hairline p-4 last:border-0">
      <dt className="text-[13px] font-semibold text-ink-3">{label}</dt>
      <button type="button" onClick={onEdit} className="row-span-2 self-start text-[14px] font-semibold text-primary">
        {editLabel}
      </button>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function WhereStep({
  draft,
  update,
  located,
  headingRef,
  showError,
}: {
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  located: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  showError: boolean;
}) {
  const { t } = useT();
  const [geoState, setGeoState] = useState<"idle" | "locating" | "outside" | "denied">("idle");
  const loc = draft.location;

  const lat = loc?.lat;
  const lon = loc?.lon;
  const pins = useMemo<Pin[]>(() => (lat != null && lon != null ? [{ id: "me", lat, lon, tone: "brand", selected: true }] : []), [lat, lon]);
  const focus = useMemo(() => (lat != null && lon != null ? { lat, lon, zoom: 16.2 } : null), [lat, lon]);

  const pick = useCallback(
    (p: LatLon) => {
      if (!inBounds(p.lat, p.lon) || !purokAt(p.lat, p.lon)) return setGeoState("outside");
      setGeoState("idle");
      update({ location: { method: "pin", purok: purokAt(p.lat, p.lon), landmarkId: null, lat: p.lat, lon: p.lon } });
    },
    [update],
  );

  function locateMe() {
    if (!navigator.geolocation) return setGeoState("denied");
    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: +pos.coords.latitude.toFixed(6), lon: +pos.coords.longitude.toFixed(6) };
        if (!purokAt(p.lat, p.lon)) return setGeoState("outside");
        setGeoState("idle");
        update({ location: { method: "device", purok: purokAt(p.lat, p.lon), landmarkId: null, lat: p.lat, lon: p.lon } });
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 id="step-title" ref={headingRef} tabIndex={-1} className="text-[24px] font-bold tracking-tight outline-none sm:text-[28px]">
          {t("report.where")}
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          {t("report.whereHelp")} {!located && <span className="font-semibold text-foreground">{t("report.whereOptional")}</span>}
        </p>
      </div>

      <div className="relative">
        <BarangayMap pins={pins} focus={focus} onPick={pick} label={t("report.where")} className="h-[320px] sm:h-[400px]" />
        <button
          type="button"
          onClick={locateMe}
          className="absolute top-3 left-3 inline-flex h-10 items-center gap-2 rounded-full bg-card px-3.5 text-[14px] font-semibold shadow-lift transition hover:bg-[#fafaf8]"
        >
          {geoState === "locating" ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4 text-primary" />}
          {geoState === "locating" ? t("report.locating") : t("report.useMine")}
        </button>
      </div>

      <AnimatePresence>
        {(geoState === "outside" || geoState === "denied") && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status" className="rounded-2xl bg-medium-soft px-4 py-2.5 text-[14px] text-[#6b3e00]">
            {geoState === "outside" ? t("report.outside") : t("report.denied")}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3 rounded-[22px] bg-card p-3.5 shadow-sheet">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", loc ? "bg-brand-soft text-primary" : "bg-fill text-ink-3")}>
          <MapPin className="size-5" />
        </span>
        <div className="min-w-0 flex-1" aria-live="polite">
          {loc ? (
            <>
              <p className="truncate text-[15px] font-semibold">{locationText(loc, t)}</p>
              <p className="text-[13px] text-ink-3">{loc.purok ? PUROK_NAME[loc.purok] : ""}</p>
            </>
          ) : (
            <p className={cn("text-[15px]", showError ? "font-semibold text-high" : "text-ink-3")}>
              {showError ? t("report.whereRequired") : t("report.noLocation")}
            </p>
          )}
        </div>
        {loc && (
          <button type="button" onClick={() => update({ location: null })} className="text-[14px] font-semibold text-primary">
            {t("report.clear")}
          </button>
        )}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-[13.5px] font-semibold text-muted-foreground">{t("report.landmark")}</span>
          <select
            value={loc?.method === "landmark" ? (loc.landmarkId ?? "") : ""}
            onChange={(e) => {
              const l = landmarkById(e.target.value);
              if (l) update({ location: { method: "landmark", purok: l.purok, landmarkId: l.id, lat: l.lat, lon: l.lon } });
            }}
            className="field h-12 rounded-2xl px-3.5 text-[15px]"
          >
            <option value="">{t("report.landmarkNone")}</option>
            {LANDMARKS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-[13.5px] font-semibold text-muted-foreground">{t("report.purok")}</span>
          <select
            value={loc?.method === "purok" ? (loc.purok ?? "") : ""}
            onChange={(e) => e.target.value && update({ location: { method: "purok", purok: e.target.value, landmarkId: null, lat: null, lon: null } })}
            className="field h-12 rounded-2xl px-3.5 text-[15px]"
          >
            <option value="">—</option>
            {PUROKS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function PhotoStep({ draft, update, headingRef }: { draft: Draft; update: (p: Partial<Draft>) => void; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setBad(false);
    try {
      update({ photo: await compressPhoto(file) });
    } catch {
      setBad(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 id="step-title" ref={headingRef} tabIndex={-1} className="text-[24px] font-bold tracking-tight outline-none sm:text-[28px]">
          {t("report.photo")}
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">{t("report.photoHelp")}</p>
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label={t("report.photoChoose")} />
      {draft.photo ? (
        <div className="relative overflow-hidden rounded-[24px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={draft.photo} alt={t("report.photoAttached")} className="aspect-[4/3] w-full object-cover" />
          <div className="absolute inset-x-3 bottom-3 flex gap-2">
            <button type="button" onClick={() => input.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-[14px] font-semibold shadow-float">
              <Camera className="size-4" /> {t("report.photoReplace")}
            </button>
            <button type="button" onClick={() => update({ photo: null })} className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-[14px] font-semibold text-high shadow-float">
              <X className="size-4" /> {t("report.clear")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="grid aspect-[4/3] w-full place-items-center rounded-[24px] bg-card text-center shadow-sheet transition hover:bg-brand-soft/40 hover:shadow-lift"
        >
          <span className="grid justify-items-center gap-3">
            <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-primary">
              {busy ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
            </span>
            <span className="text-[16px] font-bold">{t("report.photoChoose")}</span>
            <span className="text-[12.5px] text-ink-3">JPG · PNG · HEIC</span>
          </span>
        </button>
      )}
      {bad && (
        <p role="alert" className="flex items-center gap-2 text-[14px] font-semibold text-high">
          <ImageOff className="size-4" /> {t("report.photoBad")}
        </p>
      )}
    </div>
  );
}
