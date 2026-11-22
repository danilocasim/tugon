"use client";

import { AlertTriangle, ArrowUpRight, Brain, CornerDownRight, ExternalLink, Forward, Layers, Loader2, Lock, MapPin, MessageSquareReply, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CategoryIcon, StatusBadge, StatusText } from "@/components/tugon/badges";
import { BarangayMap, type MapPin as Pin } from "@/components/tugon/barangay-map";
import { useAct, useStaff } from "@/hooks/use-live";
import { similarReports } from "@/lib/cases";
import { CATEGORIES, CATEGORY, CATEGORY_TEAM, URGENCIES, URGENCY, type Category, type Urgency } from "@/lib/domain";
import { formatMobile } from "@/lib/duty";
import { fmtDate, rel } from "@/lib/format";
import { PUROK_NAME, placeLabel } from "@/lib/geo";
import { can } from "@/lib/policy";
import type { StaffRequest, StaffSnapshot } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { askForInfo, markDuplicate, referRequest, startReview, triageRequest } from "@/server/actions";
import { OnDutyNow } from "./field";
import { useStaffLang } from "./i18n";
import { IncidentHint } from "./incidents";
import { ChannelTag, DangerTag, Reporter, RestrictedTag, teamName } from "./ui";

export function ReportBody({ r, data, compactMap }: { r: StaffRequest; data: StaffSnapshot; compactMap?: boolean }) {
  const { lang, t } = useStaffLang();
  const pins = useMemo<Pin[]>(
    () =>
      r.location?.lat != null && r.location.lon != null && r.location.method !== "purok"
        ? [{ id: r.id, lat: r.location.lat, lon: r.location.lon, tone: r.triage?.urgency ?? r.prediction.urgency, selected: true }]
        : [],
    [r.id, r.location?.lat, r.location?.lon, r.location?.method, r.triage?.urgency, r.prediction.urgency],
  );
  const focus = useMemo(() => (pins[0] ? { lat: pins[0].lat, lon: pins[0].lon, zoom: 16.3 } : null), [pins]);
  const place = placeLabel(r, lang);

  if (r.redacted) {
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-foreground p-4 text-background">
        <Lock className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-semibold">{t("Restricted case")}</p>
          <p className="mt-0.5 text-[13.5px] text-background/75">{t("Report text, reporter and notes are withheld. Only the assigned handler and supervisors can open it.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div>
        <p className="text-[18px] leading-[1.55] font-medium text-pretty">{r.text}</p>
        <p className="mt-2 text-[13px] text-ink-3">
          {t("Reported by")} <Reporter r={r} data={data} />
        </p>
      </div>
      <div className="grid gap-2.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
          <MapPin className="size-4 text-primary" />
          <span className="font-semibold">{place ?? t("No location given")}</span>
          {r.location?.purok && place && !place.startsWith("Purok") && <span className="text-ink-3">· {PUROK_NAME[r.location.purok]}</span>}
          {r.location?.method === "device" && <span className="rounded-full bg-fill px-2 text-[11px] font-semibold text-ink-3">GPS</span>}
        </p>
        <div className={cn("grid gap-2.5", r.hasPhoto && !compactMap && "sm:grid-cols-2")}>
          {r.hasPhoto && (
            <a href={`/api/photo/${r.id}?portal=staff`} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-2xl bg-fill">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photo/${r.id}?portal=staff`} alt={t("Photo attached by the resident")} className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
              <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-card/90 px-2.5 py-1 text-[11.5px] font-semibold shadow-sheet backdrop-blur">
                <ExternalLink className="size-3" /> {t("Full size")}
              </span>
            </a>
          )}
          {pins.length > 0 ? (
            <BarangayMap pins={pins} focus={focus} interactive={!compactMap} showPurokLabels={false} label={t("Location of {ref}", { ref: r.ref })} className={cn(r.hasPhoto && !compactMap ? "aspect-[4/3]" : "h-44")} />
          ) : (
            <p className="rounded-2xl bg-fill px-4 py-5 text-center text-[13px] text-muted-foreground">
              {r.location ? t("Resident chose a purok but no exact point.") : t("Not location-based, or resident skipped location.")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Option({ selected, onClick, children, suggested, p }: { selected: boolean; onClick: () => void; children: ReactNode; suggested?: boolean; p?: number }) {
  const { t } = useStaffLang();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-xl bg-fill px-3 py-2 text-left text-[13.5px] font-semibold transition hover:bg-fill-strong active:scale-[0.98]",
        selected && "bg-foreground text-background hover:bg-foreground",
      )}
    >
      {children}
      {suggested && (
        <span className={cn("text-[12px]", selected ? "text-gold" : "text-[#c98a1c]")} aria-label={t("Model suggestion")} title={t("Model suggestion")}>
          ★
        </span>
      )}
      {p !== undefined && <span className={cn("ml-auto text-[11.5px] font-medium tabular", selected ? "text-background/65" : "text-ink-3")}>{Math.round(p * 100)}%</span>}
    </button>
  );
}

function Templates({ items, onPick }: { items: string[]; onPick: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <button key={t} type="button" onClick={() => onPick(t)} className="rounded-full bg-fill px-3 py-1.5 text-left text-[12px] text-foreground/80 transition hover:bg-fill-strong">
          {t.length > 54 ? `${t.slice(0, 52)}…` : t}
        </button>
      ))}
    </div>
  );
}

const ASK_TEMPLATES = [
  "Saan po eksakto ito? Pakilagay ang pinakamalapit na landmark o bahay na palatandaan.",
  "May larawan po ba kayo? Makakatulong ito para maihanda ng team ang kailangang gamit.",
  "Kailan po ito nagsimula, at nangyayari pa rin ba ngayon?",
];

/**
 * Intake decision panel: model suggestion on the left of the decision, staff
 * confirmation on the right. Returns after a terminal intake action.
 */
export function TriageWorkspace({ r, onDone }: { r: StaffRequest; onDone?: (action: string) => void }) {
  const { data } = useStaff();
  const { act, pending } = useAct();
  const { lang, t } = useStaffLang();
  const [category, setCategory] = useState<Category>(r.prediction.category);
  const [urgency, setUrgency] = useState<Urgency>(r.prediction.urgency);
  const [restricted, setRestricted] = useState(r.restricted);
  const [note, setNote] = useState("");
  const [dialog, setDialog] = useState<null | "ask" | "refer" | "duplicate">(null);
  const [message, setMessage] = useState("");
  const [office, setOffice] = useState("");
  const [dupRef, setDupRef] = useState("");
  const reviewed = useRef<string | null>(null);

  useEffect(() => {
    setCategory(r.triage?.category ?? r.prediction.category);
    setUrgency(r.triage?.urgency ?? (r.dangerNow ? "high" : r.prediction.urgency));
    setRestricted(r.restricted);
    setNote("");
  }, [r.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = data!.me!;
  const allowed = can(me, "triage", r);

  // Opening a new report marks it as under review, which the resident sees.
  useEffect(() => {
    if (allowed && r.status === "received" && reviewed.current !== r.id) {
      reviewed.current = r.id;
      void act("review", () => startReview({ id: r.id }), { quiet: true });
    }
  }, [r.id, r.status, allowed, act]);

  const similar = useMemo(() => similarReports(r, data!.requests), [r, data]);
  const corrected = category !== r.prediction.category || urgency !== r.prediction.urgency;
  const lastAsk = r.events.findLast((e) => e.type === "info_requested");
  const lastReply = r.events.findLast((e) => e.type === "resident_reply" || e.type === "followup_requested");
  // Walk-in and phone reporters have no app account: staff call them back instead.
  const reachable = !!r.residentId;

  async function confirm() {
    const res = await act("triage", () => triageRequest({ id: r.id, category, urgency, restricted, note }), {
      success: t("Sent to {team} queue", { team: teamName(data!, CATEGORY_TEAM[category]) }),
    });
    if (res.ok) onDone?.("triaged");
  }

  async function submitDialog() {
    let res;
    if (dialog === "ask") res = await act("dlg", () => askForInfo({ id: r.id, message }), { success: "Question sent to resident" });
    else if (dialog === "refer") res = await act("dlg", () => referRequest({ id: r.id, office, message }), { success: reachable ? "Referred and resident notified" : "Referred · call the reporter back with the office details" });
    else {
      const original = data!.requests.find((q) => q.ref.toLowerCase() === dupRef.trim().toLowerCase());
      if (!original) return;
      res = await act("dlg", () => markDuplicate({ id: r.id, originalId: original.id }), { success: t("Linked to {ref}", { ref: original.ref }) });
    }
    if (res?.ok) {
      setDialog(null);
      setMessage("");
      onDone?.(dialog!);
    }
  }

  const officeEntry = data!.settings.referrals.find((o) => o.id === office);

  const tint = "inline-flex h-9 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[13px] font-semibold whitespace-nowrap transition hover:bg-fill-strong";

  return (
    <div className="rounded-[24px] bg-card shadow-sheet">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5 sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={r.status} lang={lang} />
              {r.dangerNow && <DangerTag />}
              {r.restricted && <RestrictedTag />}
              {r.followUp && (
                <span className="inline-flex h-6 items-center gap-1 rounded-full bg-normal-soft px-2.5 text-[11.5px] font-semibold text-normal">
                  <RotateCcw className="size-3" /> {t("Follow-up")}
                </span>
              )}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
              <span className="font-mono text-[12px] font-semibold text-foreground/80">{r.ref}</span>
              <ChannelTag channel={r.channel} />
              <span>
                {rel(r.createdAt, lang)} · {fmtDate(r.createdAt, lang)}
              </span>
            </p>
          </div>
          <Link href={`/barangay/cases/${r.id}`} className={cn(tint, "h-8 px-3 text-primary")}>
            {t("Full case")} <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        {r.dangerNow && (
          <div className="grid gap-2">
            <div role="alert" className="flex gap-3 rounded-2xl bg-high p-3.5 text-white">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <p className="text-[13.5px] leading-snug">
                <strong>{t("Resident says someone is in danger now.")}</strong> {t("Send or call the tanod on duty, or call back. Tugon isn't a dispatch system; the resident was told to call 911.")}
              </p>
            </div>
            <OnDutyNow r={r} />
          </div>
        )}
        {r.status === "needs_info" && lastAsk && (
          <div className="rounded-2xl bg-medium-soft p-3.5 text-[13.5px] text-[#5a3400]">
            <p className="font-semibold">{t("Waiting on resident since {time}", { time: rel(lastAsk.at, lang) })}</p>
            <p className="mt-1 opacity-85">“{lastAsk.text}”</p>
          </div>
        )}
        {lastReply && r.status === "review" && (
          <div className="rounded-2xl bg-normal-soft p-3.5 text-[13.5px]">
            <p className="flex items-center gap-1.5 font-semibold text-normal">
              <CornerDownRight className="size-4" /> {lastReply.type === "followup_requested" ? t("Resident asked for a follow-up") : t("Resident replied")} · {rel(lastReply.at, lang)}
            </p>
            <p className="mt-1">“{lastReply.text}”</p>
          </div>
        )}

        <ReportBody r={r} data={data!} />
        <IncidentHint r={r} />

        {similar.length > 0 && (
          <section className="grid gap-2">
            <h3 className="flex items-center gap-2 text-[13.5px] font-semibold">
              <Layers className="size-4 text-ink-3" /> {t("Possible duplicates nearby")}
            </h3>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
              {similar.map(({ q, m }) => (
                <li key={q.id} className="flex min-w-0 items-center gap-2.5 rounded-xl bg-fill py-1.5 pr-1.5 pl-3 text-[13px]">
                  <span className="font-mono text-[11.5px] text-ink-3">{q.ref}</span>
                  <StatusText status={q.status} lang={lang} className="text-[12px]" />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{q.text}</span>
                  <span className="text-[12px] text-ink-3 tabular">{m} m</span>
                  {allowed && (
                    <button
                      type="button"
                      onClick={() => {
                        setDupRef(q.ref);
                        setDialog("duplicate");
                      }}
                      className="h-7 rounded-full bg-card px-3 text-[12px] font-semibold shadow-sheet transition hover:shadow-lift"
                    >
                      {t("Link")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {allowed ? (
        <>
          <section className="grid gap-5 border-t border-hairline p-5 sm:p-6" aria-labelledby="triage-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="triage-title" className="text-[17px] font-bold tracking-[-0.01em]">
                {t("Confirm triage")}
              </h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-2.5 py-1 text-[11.5px] font-semibold text-[#7a4c00]">
                    <Brain className="size-3.5" /> {t("★ marks the model's suggestion")}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-72">
                  {t("{name} ({params}), trained on {count} examples. A suggestion only — you decide. Corrections are tracked to measure the model.", {
                    name: data!.model.name,
                    params: data!.model.params,
                    count: data!.model.trainedOn,
                  })}
                </TooltipContent>
              </Tooltip>
            </div>

            {r.prediction.evidence.length > 0 && (
              <p className="-mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
                {t("Words it noticed:")}
                {r.prediction.evidence.map((e) => (
                  <span key={e} className="rounded-full bg-gold-soft px-2 py-0.5 text-[12px] font-medium text-[#7a4c00]">
                    {e}
                  </span>
                ))}
              </p>
            )}

            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">{t("Category")}</legend>
              <div role="radiogroup" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 2xl:grid-cols-3">
                {CATEGORIES.map((c) => (
                  <Option
                    key={c}
                    selected={category === c}
                    onClick={() => setCategory(c)}
                    suggested={r.prediction.category === c}
                    p={r.prediction.categoryRanked.find((x) => x.label === c)?.p}
                  >
                    <CategoryIcon category={c} size="sm" className="size-6 rounded-[8px]" />
                    {CATEGORY[c].short[lang]}
                  </Option>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">{t("Urgency")}</legend>
              <div role="radiogroup" className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                {URGENCIES.map((u) => (
                  <Option key={u} selected={urgency === u} onClick={() => setUrgency(u)} suggested={r.prediction.urgency === u} p={r.prediction.urgencyRanked.find((x) => x.label === u)?.p}>
                    {URGENCY[u][lang]}
                  </Option>
                ))}
              </div>
              {r.dangerNow && r.prediction.urgency !== "high" && (
                <p className="mt-2 text-[12.5px] font-semibold text-high">{t("Resident flagged danger but the model suggested {urgency}. Preset to High.", { urgency: URGENCY[r.prediction.urgency][lang] })}</p>
              )}
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="grid gap-2">
                <span className="text-[13px] font-semibold text-muted-foreground">{t("Internal note · optional")}</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={t("Context for the handling team (not shown to the resident)")}
                  className="ruled w-full rounded-xl px-3 py-2 text-[14px] leading-6 outline-none focus:ring-2 focus:ring-gold/50"
                />
              </label>
              <label className="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-fill px-3.5 text-[13px] font-semibold transition hover:bg-fill-strong">
                <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} className="size-4 accent-[#121820]" />
                <Lock className="size-3.5" /> {t("Restrict access")}
              </label>
            </div>
          </section>

          {/* Sticky so the decision stays reachable however long the evidence is; clears the phone tab bar. */}
          <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-2 rounded-b-[24px] bg-card/95 px-5 py-3.5 shadow-[0_-10px_24px_-18px_rgb(18_24_32/0.35)] backdrop-blur-xl sm:px-6 md:bottom-0">
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              disabled={pending === "triage"}
              onClick={confirm}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[14px] font-bold text-primary-foreground shadow-press transition hover:bg-brand-deep disabled:opacity-60 max-sm:flex-1"
            >
              {pending === "triage" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {t("Send to {team}", { team: teamName(data!, CATEGORY_TEAM[category]) })}
            </motion.button>
            {corrected && <span className="text-[12px] font-semibold text-muted-foreground">{t("Correcting the suggestion")}</span>}
            <span className="ml-auto flex flex-wrap gap-1.5 max-sm:w-full max-sm:[&>*]:flex-1 max-sm:[&>*]:justify-center">
              {reachable ? (
                <button type="button" onClick={() => setDialog("ask")} className={tint}>
                  <MessageSquareReply className="size-4" /> {t("Ask")}
                </button>
              ) : (
                <span className="inline-flex h-9 items-center px-1 text-[12.5px] text-muted-foreground">
                  {r.contact?.sms
                    ? t("No app account · gets SMS updates")
                    : r.contact?.phone
                      ? t("No app account · call back {phone}", { phone: formatMobile(r.contact.phone) })
                      : t("No app account · call back")}
                </span>
              )}
              <button type="button" onClick={() => setDialog("refer")} className={tint}>
                <Forward className="size-4" /> {t("Refer")}
              </button>
              <button type="button" onClick={() => setDialog("duplicate")} className={tint}>
                <Layers className="size-4" /> {t("Duplicate")}
              </button>
            </span>
          </div>
        </>
      ) : (
        <p className="border-t border-hairline px-6 py-4 text-[13.5px] text-muted-foreground">{t("Triage is handled by intake officers and supervisors.")}</p>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog === "ask" ? t("Ask the resident for details") : dialog === "refer" ? t("Refer to another office") : t("Mark as duplicate")}</DialogTitle>
            <DialogDescription>
              {dialog === "ask"
                ? t("The resident sees this message and can reply from their phone. The case waits in your inbox.")
                : dialog === "refer"
                  ? t("Closes the case here and tells the resident who handles it now.")
                  : t("The resident is pointed to the original report, where updates continue.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {dialog === "refer" && (
              <div className="grid max-h-64 gap-1.5 overflow-y-auto">
                {data!.settings.referrals.map((o) => (
                  <label key={o.id} className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl bg-fill p-3 transition hover:bg-fill-strong", office === o.id && "bg-brand-soft hover:bg-brand-soft")}>
                    <input
                      type="radio"
                      name="office"
                      checked={office === o.id}
                      onChange={() => {
                        setOffice(o.id);
                        setMessage(`Inirefer namin ito sa ${o.name} (${o.contact}). Sila na ang hahawak nito; maaari ninyo silang tawagan para sa update.`);
                      }}
                      className="mt-1 accent-[#0b5d4b]"
                    />
                    <span className="text-[13.5px]">
                      <span className="block font-semibold">{o.name}</span>
                      <span className="block text-[12px] text-muted-foreground">{o.scope}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {dialog === "duplicate" ? (
              <label className="grid gap-1.5">
                <span className="text-[13px] font-semibold">{t("Original reference number")}</span>
                <input value={dupRef} onChange={(e) => setDupRef(e.target.value)} placeholder="TGN-2611-0142" className="field h-11 rounded-xl px-3.5 font-mono text-[14px]" />
                {dupRef && !data!.requests.some((q) => q.ref.toLowerCase() === dupRef.trim().toLowerCase()) && <span className="text-[12.5px] text-high">{t("No case with that reference.")}</span>}
              </label>
            ) : (
              <>
                {dialog === "ask" && <Templates items={ASK_TEMPLATES} onPick={setMessage} />}
                <label className="grid gap-1.5">
                  <span className="text-[13px] font-semibold">{t("Message to resident")}</span>
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="field rounded-xl px-3.5 py-2.5 text-[14px]" />
                  <span className="text-[12px] text-ink-3">{t("Visible to the resident. Avoid internal details.")}</span>
                </label>
              </>
            )}
            {dialog === "refer" && officeEntry && <p className="text-[12px] text-ink-3">{t("Contact on file: {contact}", { contact: officeEntry.contact })}</p>}
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setDialog(null)} className="h-10 rounded-full bg-fill px-4 text-[14px] font-semibold transition hover:bg-fill-strong">
              {t("Cancel")}
            </button>
            <button
              type="button"
              disabled={pending === "dlg" || (dialog === "duplicate" ? !dupRef : message.trim().length < 8 || (dialog === "refer" && !office))}
              onClick={submitDialog}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
            >
              {pending === "dlg" && <Loader2 className="size-4 animate-spin" />}
              {dialog === "ask" ? t("Send question") : dialog === "refer" ? t("Refer and notify") : t("Link duplicate")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
