"use client";

import { AlertTriangle, ArrowLeft, Footprints, Loader2, Phone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BarangayMap, type MapPin as Pin } from "@/components/tugon/barangay-map";
import { useAct, useStaff } from "@/hooks/use-live";
import { suggest } from "@/lib/classifier";
import { CATEGORY, URGENCY, type LocationInfo } from "@/lib/domain";
import { LANDMARKS, PUROKS, landmarkById, purokAt, type LatLon } from "@/lib/geo";
import { canAccess } from "@/lib/policy";
import { cn } from "@/lib/utils";
import { createAssistedRequest } from "@/server/staff-cases";
import { useStaffLang } from "./i18n";
import { NoAccess, PageHeader } from "./ui";

const field = "field h-11 w-full rounded-xl px-3.5 text-[14px]";

export function AssistedIntake() {
  const { data } = useStaff();
  const router = useRouter();
  const { act, pending } = useAct();
  const { lang, t } = useStaffLang();
  const [channel, setChannel] = useState<"walkin" | "phone">("walkin");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // Consent must be asked and given, so the box starts unchecked (RA 10173).
  const [sms, setSms] = useState(false);
  const [text, setText] = useState("");
  const [danger, setDanger] = useState(false);
  const [location, setLocation] = useState<LocationInfo | null>(null);
  const preview = useMemo(() => (text.trim().length >= 10 ? suggest(text) : null), [text]);
  const pins = useMemo<Pin[]>(() => (location?.lat != null && location.lon != null ? [{ id: "x", lat: location.lat, lon: location.lon, tone: "brand", selected: true }] : []), [location]);
  const focus = useMemo(() => (location?.lat != null && location.lon != null ? { lat: location.lat, lon: location.lon, zoom: 16 } : null), [location]);

  if (!data?.me) return null;
  if (!canAccess(data.me, "intake")) return <NoAccess title={t("Only intake staff record walk-in and phone requests")} role={data.me.role} />;

  const pick = (p: LatLon) => {
    const purok = purokAt(p.lat, p.lon);
    if (purok) setLocation({ method: "pin", purok, landmarkId: null, lat: p.lat, lon: p.lon });
  };

  async function submit() {
    const res = await act("save", () => createAssistedRequest({ channel, name, phone, sms, text, location: location && { ...location }, residentCategory: null, dangerNow: danger }), { success: "Recorded in the intake inbox" });
    if (res.ok) router.push(`/barangay/inbox?id=${res.data.id}`);
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-5">
      <Link href="/barangay/inbox" className="inline-flex items-center gap-1.5 justify-self-start text-[13.5px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("Inbox")}
      </Link>
      <PageHeader title={t("Record a walk-in or phone request")} sub={t("For residents who can't or don't want to use the app. It enters the same inbox and queue.")} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-4 rounded-[24px] bg-card p-5 shadow-sheet sm:p-6">
          <div role="radiogroup" aria-label={t("Channel")} className="grid grid-cols-2 gap-1 rounded-full bg-fill p-[3px]">
            {(
              [
                ["walkin", "Walk-in", Footprints],
                ["phone", "Phone call", Phone],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={channel === k}
                onClick={() => setChannel(k)}
                className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-full text-[14px] font-semibold text-muted-foreground transition hover:text-foreground", channel === k && "bg-card text-foreground shadow-sheet")}
              >
                <Icon className="size-4" /> {t(label)}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">{t("Name · optional")}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder={t("Leave blank if they prefer")} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">{t("Callback number · optional")}</span>
              <input value={phone} onChange={(e) => { setPhone(e.target.value); setSms(false); }} inputMode="tel" className={cn(field, "tabular")} placeholder="09XX XXX XXXX" />
            </label>
          </div>
          {phone.replace(/\D/g, "").length >= 10 && (
            <label className="-mt-1 flex cursor-pointer items-start gap-2.5 rounded-2xl bg-fill px-3.5 py-3 text-[13.5px]">
              <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} className="mt-0.5 size-4 accent-[#0b5d4b]" />
              <span>
                <span className="block font-semibold">{t("Text them status updates")}</span>
                <span className="block text-[12.5px] text-muted-foreground">{t("Ask first. They get the reference number now and a short SMS at each step; no report details.")}</span>
              </span>
            </label>
          )}
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold">{t("What they reported")}</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className={cn(field, "h-auto py-2.5 leading-6")} placeholder={t("Write it in their words, Taglish is fine")} />
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-2xl bg-high-soft px-3.5 py-3 text-[13.5px] font-semibold text-[#7f2311]">
            <input type="checkbox" checked={danger} onChange={(e) => setDanger(e.target.checked)} className="size-4 accent-[#c2381f]" />
            <AlertTriangle className="size-4" /> {t("Someone is in danger right now")}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">{t("Landmark")}</span>
              <select
                value={location?.landmarkId ?? ""}
                onChange={(e) => {
                  const l = landmarkById(e.target.value);
                  if (l) setLocation({ method: "landmark", purok: l.purok, landmarkId: l.id, lat: l.lat, lon: l.lon });
                }}
                className={field}
              >
                <option value="">—</option>
                {LANDMARKS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">{t("Or purok only")}</span>
              <select value={location?.method === "purok" ? (location.purok ?? "") : ""} onChange={(e) => e.target.value && setLocation({ method: "purok", purok: e.target.value, landmarkId: null, lat: null, lon: null })} className={field}>
                <option value="">—</option>
                {PUROKS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <BarangayMap pins={pins} focus={focus} onPick={pick} label={t("Click to pin the location")} className="h-64" />
          <button
            type="button"
            disabled={text.trim().length < 10 || pending === "save"}
            onClick={submit}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[14.5px] font-bold text-primary-foreground shadow-press disabled:opacity-50"
          >
            {pending === "save" && <Loader2 className="size-4 animate-spin" />} {t("Record request")}
          </button>
        </div>

        <aside className="grid content-start gap-3 rounded-[24px] bg-sunken p-5 sm:p-6 lg:sticky lg:top-6">
          <h2 className="text-[15px] font-bold tracking-[-0.01em]">{t("Live suggestion preview")}</h2>
          {preview ? (
            <div className="grid gap-3">
              {preview.categoryRanked.slice(0, 3).map((c) => (
                <div key={c.label} className="grid gap-1">
                  <div className="flex justify-between text-[13px]">
                    <span className="font-semibold">{CATEGORY[c.label].short[lang]}</span>
                    <span className="text-ink-3 tabular">{Math.round(c.p * 100)}%</span>
                  </div>
                  <span className="h-1.5 overflow-hidden rounded-full bg-card">
                    <span className="block h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${c.p * 100}%` }} />
                  </span>
                </div>
              ))}
              <p className="text-[13px]">
                {t("Urgency:")} <strong>{URGENCY[preview.urgency][lang]}</strong> <span className="text-ink-3 tabular">{Math.round(preview.urgencyP * 100)}%</span>
              </p>
              <p className="text-[12px] text-muted-foreground">{t("Same model as online reports. You'll confirm it in the inbox.")}</p>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">{t("Start typing what the resident said to see how the model would categorize it.")}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
