"use client";

/**
 * Incident mode: many reports about one problem (a flood at the market, a
 * blackout on a street). Staff link them, send one update that reaches every
 * reporter, and close them together.
 */
import { ArrowLeft, Check, Link2, Loader2, Megaphone, Siren, Unlink, Waves } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategoryIcon, StatusText } from "@/components/tugon/badges";
import { BarangayMap, type MapCluster, type MapPin as Pin } from "@/components/tugon/barangay-map";
import { useAct, useNow, useStaff } from "@/hooks/use-live";
import { CATEGORY, isOpen, type Category, type Incident } from "@/lib/domain";
import { fmtDate, rel } from "@/lib/format";
import { haversineKm, placeLabel } from "@/lib/geo";
import { canAccess } from "@/lib/policy";
import type { StaffRequest, DeskSnapshot } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { closeIncident, createIncident, linkToIncident, postIncidentUpdate, unlinkFromIncident } from "@/server/incidents";
import { useStaffLang } from "./i18n";
import { Empty, NoAccess, PageHeader, Reporter, staffName } from "./ui";

const effective = (r: StaffRequest) => r.triage?.category ?? r.prediction.category;

/** Open, viewable reports near an incident (or a point) in the same category that aren't linked anywhere yet. */
export function nearbyCandidates(data: DeskSnapshot, center: { lat: number; lon: number }, radiusM: number, category: Incident["category"]) {
  return data.requests.filter(
    (r) =>
      !r.redacted &&
      !r.restricted &&
      isOpen(r) &&
      !r.incidentId &&
      effective(r) === category &&
      r.location?.lat != null &&
      r.location.lon != null &&
      haversineKm(center, { lat: r.location.lat, lon: r.location.lon }) * 1000 <= radiusM + 80,
  );
}

type IncidentCandidate = StaffRequest | (Pick<StaffRequest, "id" | "ref" | "status" | "createdAt"> & { category: Category });

function ReportPick({ r, on, onToggle, data }: { r: IncidentCandidate; on: boolean; onToggle: () => void; data: DeskSnapshot | null }) {
  const { lang } = useStaffLang();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      className={cn("flex w-full items-start gap-3 rounded-2xl bg-fill px-3 py-2.5 text-left transition hover:bg-fill-strong", on && "bg-brand-soft hover:bg-brand-soft")}
    >
      <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md", on ? "bg-primary text-white" : "bg-card shadow-sheet")}>{on && <Check className="size-3.5" strokeWidth={3} />}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[12px] text-ink-3">
          <span className="font-mono">{r.ref}</span>
          <StatusText status={r.status} className="text-[11.5px]" lang={lang} />
          <span className="ml-auto">{rel(r.createdAt, lang)}</span>
        </span>
        {"text" in r ? (
          <>
            <span className="mt-0.5 line-clamp-2 block text-[13.5px] leading-snug">{r.text}</span>
            {data && <span className="mt-0.5 block text-[12px] text-muted-foreground"><Reporter r={r} data={data} dial={false} /></span>}
          </>
        ) : (
          <span className="mt-0.5 block text-[13.5px] leading-snug">{CATEGORY[r.category].short[lang]}</span>
        )}
      </span>
    </button>
  );
}

/** Start an incident from a group of reports (a hotspot cluster, or one report and its neighbors). */
export function CreateIncidentDialog({
  open,
  onOpenChange,
  candidates,
  defaultTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: IncidentCandidate[];
  defaultTitle: string;
}) {
  const { data } = useStaff();
  const router = useRouter();
  const { act, pending } = useAct();
  const { t } = useStaffLang();
  const [title, setTitle] = useState(defaultTitle);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const chosen = picked ?? new Set(candidates.map((r) => r.id));
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPicked(null);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Start an incident")}</DialogTitle>
          <DialogDescription>{t("Linked reporters get every incident update as a normal update on their report, by app and by SMS if they opted in.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold">{t("Title staff will see")}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="field h-11 rounded-xl px-3.5 text-[14px]" />
          </label>
          <p className="text-[13px] font-semibold">{t("Link {n} of {total} open reports", { n: chosen.size, total: candidates.length })}</p>
          <div className="grid max-h-72 gap-1.5 overflow-y-auto">
            {candidates.map((r) => (
              <ReportPick key={r.id} r={r} on={chosen.has(r.id)} onToggle={() => toggle(r.id)} data={data} />
            ))}
          </div>
        </div>
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-full bg-fill px-4 text-[14px] font-semibold transition hover:bg-fill-strong">
            {t("Cancel")}
          </button>
          <button
            type="button"
            disabled={chosen.size < 2 || chosen.size > 100 || title.trim().length < 4 || title.trim().length > 120 || pending === "incident"}
            onClick={async () => {
              const r = await act("incident", () => createIncident({ title, requestIds: [...chosen] }), { success: "Incident started" });
              if (r.ok) {
                onOpenChange(false);
                router.push(`/barangay/incidents/${r.data.id}`);
              }
            }}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
          >
            {pending === "incident" ? <Loader2 className="size-4 animate-spin" /> : <Siren className="size-4" />} {t("Start incident")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** In triage: this report is probably part of an open incident, or already linked to one. */
export function IncidentHint({ r }: { r: StaffRequest }) {
  const { data } = useStaff();
  const { act, pending } = useAct();
  const { lang, t } = useStaffLang();
  const [starting, setStarting] = useState(false);
  if (!data?.me || !canAccess(data.me, "incidents") || r.redacted || r.restricted || !isOpen(r)) return null;
  const linked = r.incidentId ? data.incidents.find((i) => i.id === r.incidentId) : null;
  if (linked) {
    return (
      <Link href={`/barangay/incidents/${linked.id}`} className="flex items-center gap-2.5 rounded-2xl bg-normal-soft px-3.5 py-2.5 text-[13.5px] transition hover:bg-normal-soft/70">
        <Waves className="size-4 shrink-0 text-normal" />
        <span className="min-w-0 flex-1">
          {t("Part of")} <strong>{linked.ref}</strong> · {linked.title}
        </span>
        <span className="text-[12.5px] font-semibold text-normal">{t("Open")}</span>
      </Link>
    );
  }
  const loc = r.location;
  if (loc?.lat == null || loc.lon == null) return null;
  const near = data.incidents.find((i) => i.status === "open" && i.category === effective(r) && haversineKm(i.center, { lat: loc.lat!, lon: loc.lon! }) * 1000 <= i.radiusM + 80);
  if (near) {
    return (
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl bg-normal-soft px-3.5 py-2.5 text-[13.5px]">
        <Waves className="size-4 shrink-0 text-normal" />
        <span className="min-w-0 flex-1">
          {t("Looks like part of")} <strong>{near.ref}</strong> · {near.title}
        </span>
        <button
          type="button"
          disabled={pending === "link"}
          onClick={() => void act("link", () => linkToIncident({ incidentId: near.id, requestId: r.id }), { success: t("Linked to {ref}", { ref: near.ref }) })}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-[12.5px] font-semibold text-normal shadow-sheet"
        >
          {pending === "link" ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />} {t("Link")}
        </button>
      </div>
    );
  }
  const neighbors = nearbyCandidates(data, { lat: loc.lat, lon: loc.lon }, 120, effective(r));
  if (neighbors.length < 3) return null;
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-2xl bg-fill px-3.5 py-2.5 text-[13.5px]">
      <Waves className="size-4 shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1">
        {t("{n} open {category} reports within 120 m. One problem?", { n: neighbors.length, category: CATEGORY[effective(r)].short[lang].toLowerCase() })}
      </span>
      <button type="button" onClick={() => setStarting(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-[12.5px] font-semibold shadow-sheet">
        <Siren className="size-3.5" /> {t("Start incident")}
      </button>
      <CreateIncidentDialog
        open={starting}
        onOpenChange={setStarting}
        candidates={neighbors}
        defaultTitle={t("{category} near {place}", { category: CATEGORY[effective(r)].short[lang], place: placeLabel(r, lang) ?? t("this report") })}
      />
    </div>
  );
}

export function IncidentsPage() {
  const { data } = useStaff();
  const now = useNow(60_000);
  const { lang, t } = useStaffLang();
  if (!data?.me) return null;
  if (!canAccess(data.me, "incidents")) return <NoAccess title={t("Incidents are run by intake officers and supervisors")} role={data.me.role} />;
  const open = data.incidents.filter((i) => i.status === "open");
  const closed = data.incidents.filter((i) => i.status === "closed");
  const linkedOpen = (i: Incident) => i.requestIds.filter((id) => data.requests.some((r) => r.id === id && isOpen(r))).length;

  const row = (i: Incident) => (
    <li key={i.id} className="border-b border-hairline last:border-0">
      <Link href={`/barangay/incidents/${i.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-fill/40">
        <CategoryIcon category={i.category} size="sm" className="size-10 rounded-xl" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[12px] text-ink-3">
            <span className="font-mono">{i.ref}</span>
            <span>{i.status === "open" ? t("started {when}", { when: rel(i.createdAt, lang, now) }) : t("closed {when}", { when: rel(i.closedAt!, lang, now) })}</span>
          </span>
          <span className="block truncate text-[15px] font-semibold">{i.title}</span>
          <span className="block text-[12.5px] text-muted-foreground">
            {t("{n} reports", { n: i.requestIds.length })}
            {i.status === "open" ? ` · ${t("{n} still open", { n: linkedOpen(i) })}` : ""} · {t("{n} updates sent", { n: i.updates.length })}
          </span>
        </span>
        {i.status === "open" && <span className="rounded-full bg-high-soft px-2.5 py-1 text-[11.5px] font-bold text-high">{t("Active")}</span>}
      </Link>
    </li>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={t("Incidents")} sub={t("Many reports, one problem: link them, update everyone at once, close them together.")} />
      <section className="grid gap-3">
        <h2 className="flex items-baseline gap-2 text-[18px] font-bold tracking-[-0.01em]">
          {t("Active")} <span className="text-[14px] font-semibold text-ink-3 tabular">{open.length}</span>
        </h2>
        {open.length ? (
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-sheet">{open.map(row)}</ul>
        ) : (
          <Empty
            icon={Siren}
            title={t("No active incidents")}
            body={t("Start one from a hotspot on Insights, or from a report in the inbox when several neighbors report the same thing.")}
          />
        )}
      </section>
      {closed.length > 0 && (
        <section className="grid gap-3">
          <h2 className="flex items-baseline gap-2 text-[18px] font-bold tracking-[-0.01em]">
            {t("Closed")} <span className="text-[14px] font-semibold text-ink-3 tabular">{closed.length}</span>
          </h2>
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-sheet">{closed.map(row)}</ul>
        </section>
      )}
    </div>
  );
}

const UPDATE_TEMPLATES = [
  "Alam na ng barangay ang problema at may team nang papunta. Iwasan muna ang lugar.",
  "Ginagawa na ang paglilinis ng kanal. Inaasahang huhupa ang tubig sa loob ng ilang oras.",
  "Bukas ang evacuation area sa Barangay Hall para sa mga kailangang lumikas.",
];

export function IncidentDetail({ id }: { id: string }) {
  const { data } = useStaff();
  const now = useNow(30_000);
  const { act, pending } = useAct();
  const [text, setText] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState("");
  const inc = data?.incidents.find((i) => i.id === id);
  const linked = useMemo(() => data?.requests.filter((r) => r.incidentId === id && !r.restricted) ?? [], [data, id]);
  const pins = useMemo<Pin[]>(
    () =>
      linked.flatMap((r) =>
        r.location?.lat != null && r.location.lon != null ? [{ id: r.id, lat: r.location.lat, lon: r.location.lon, tone: r.triage?.urgency ?? r.prediction.urgency, label: r.ref }] : [],
      ),
    [linked],
  );
  const circle = useMemo<MapCluster[]>(
    () => (inc ? [{ id: inc.id, center: inc.center, radiusKm: inc.radiusM / 1000, count: linked.length, label: inc.title }] : []),
    [inc, linked.length],
  );
  const { lang, t } = useStaffLang();

  if (!data?.me) return null;
  if (!canAccess(data.me, "incidents")) return <NoAccess title={t("Incidents are run by intake officers and supervisors")} role={data.me.role} />;
  if (!inc) return <Empty icon={Siren} title={t("Incident not found")} body={t("This incident is not available to your role.")} />;

  const open = inc.status === "open";
  const reachable = linked.filter(isOpen);
  const suggestions = open ? nearbyCandidates(data, inc.center, inc.radiusM, inc.category) : [];
  const supervisor = data.me.role === "supervisor";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Link href="/barangay/incidents" className="inline-flex items-center gap-1.5 justify-self-start text-[13.5px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("Incidents")}
      </Link>
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <CategoryIcon category={inc.category} size="lg" />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-mono font-semibold">{inc.ref}</span>
            {open ? <span className="rounded-full bg-high-soft px-2.5 py-0.5 text-[11.5px] font-bold text-high">{t("Active")}</span> : <span className="rounded-full bg-fill px-2.5 py-0.5 text-[11.5px] font-semibold">{t("Closed")}</span>}
          </p>
          <h1 className="mt-1 text-[24px] leading-tight font-bold tracking-tight wrap-anywhere sm:text-[28px]">{inc.title}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {CATEGORY[inc.category][lang]} · {t("started by {name} {when}", { name: staffName(data, inc.createdBy), when: rel(inc.createdAt, lang, now) })} ·{" "}
            {t("{n} reports within {radius} m", { n: inc.requestIds.length, radius: inc.radiusM })}
          </p>
        </div>
        {open && supervisor && (
          <button type="button" onClick={() => setClosing(true)} className="col-start-2 inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-full bg-foreground px-4 text-[13.5px] font-bold text-background sm:col-start-3 sm:row-start-1">
            <Check className="size-4" /> {t("Close incident")}
          </button>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
          <BarangayMap
            pins={pins}
            clusters={circle}
            focus={{ ...inc.center, zoom: 16.4 }}
            label={t("Map of {ref}", { ref: inc.ref })}
            className="h-72 sm:h-80"
          />

          <section className="grid gap-3">
            <h2 className="flex items-baseline gap-2 text-[18px] font-bold tracking-[-0.01em]">
              {t("Linked reports")} <span className="text-[14px] font-semibold text-ink-3 tabular">{linked.length}</span>
            </h2>
            <ul className="overflow-hidden rounded-[20px] bg-card shadow-sheet">
              {linked.map((r) => (
                <li key={r.id} className="flex items-start gap-3 border-b border-hairline px-4 py-3 last:border-0">
                  <Link href={`/barangay/cases/${r.id}`} className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[12px] text-ink-3">
                      <span className="font-mono">{r.ref}</span>
                      <StatusText status={r.status} className="text-[11.5px]" lang={lang} />
                      <span>{rel(r.createdAt, lang, now)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[14px] leading-snug">{r.redacted ? t("Restricted case") : r.text}</span>
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                      <Reporter r={r} data={data} dial={false} />
                    </span>
                  </Link>
                  {open && (
                    <button
                      type="button"
                      aria-label={t("Unlink {ref}", { ref: r.ref })}
                      title={t("Unlink")}
                      disabled={pending === `unlink-${r.id}`}
                      onClick={() => void act(`unlink-${r.id}`, () => unlinkFromIncident({ incidentId: inc.id, requestId: r.id }), { success: t("{ref} unlinked", { ref: r.ref }) })}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-fill hover:text-foreground"
                    >
                      <Unlink className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {suggestions.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-[16px] font-bold">{t("Nearby reports not linked yet")}</h2>
              <ul className="grid gap-1.5">
                {suggestions.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-fill px-3.5 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[12px] text-ink-3">
                        <span className="font-mono">{r.ref}</span>
                        <span>{rel(r.createdAt, lang, now)}</span>
                      </span>
                      <span className="block truncate text-[13.5px]">{r.text}</span>
                    </span>
                    <button
                      type="button"
                      disabled={pending === `link-${r.id}`}
                      onClick={() => void act(`link-${r.id}`, () => linkToIncident({ incidentId: inc.id, requestId: r.id }), { success: t("{ref} linked", { ref: r.ref }) })}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-[12.5px] font-semibold shadow-sheet"
                    >
                      <Link2 className="size-3.5" /> {t("Link")}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-6">
          {open && (
            <section className="grid gap-3 rounded-[24px] bg-card p-5 shadow-sheet">
              <h2 className="flex items-center gap-2 text-[15px] font-bold">
                <Megaphone className="size-4 text-primary" /> {t("Update everyone")}
              </h2>
              <p className="-mt-1 text-[12.5px] text-muted-foreground">{t("Goes to {n} open reports as a resident-visible update, by SMS for those who opted in.", { n: reachable.length })}</p>
              <div className="flex flex-wrap gap-1.5">
                {UPDATE_TEMPLATES.map((tpl) => (
                  <button key={tpl} type="button" onClick={() => setText(tpl)} className="rounded-full bg-fill px-3 py-1.5 text-left text-[12px] text-foreground/80 transition hover:bg-fill-strong">
                    {tpl.length > 40 ? `${tpl.slice(0, 38)}…` : tpl}
                  </button>
                ))}
              </div>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={600} aria-label={t("Public incident update")} placeholder={t("Plain words. What's happening, what residents should do.")} className="field rounded-xl px-3.5 py-2.5 text-[14px]" />
              <button
                type="button"
                disabled={text.trim().length < 10 || text.trim().length > 600 || !reachable.length || pending === "broadcast"}
                onClick={() => setReviewing(true)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-[14px] font-bold text-primary-foreground shadow-press disabled:opacity-50"
              >
                <Megaphone className="size-4" /> {t("Review update")}
              </button>
            </section>
          )}

          {!open && inc.outcome && (
            <section className="grid gap-2 rounded-[24px] bg-brand-soft/70 p-5">
              <h2 className="text-[15px] font-bold text-brand-deep">{t("Closed {date}", { date: inc.closedAt ? fmtDate(inc.closedAt, lang) : "" })}</h2>
              <p className="text-[14px] leading-relaxed">{inc.outcome}</p>
            </section>
          )}

          <section className="grid gap-2 rounded-[24px] bg-card p-5 shadow-sheet">
            <h2 className="text-[15px] font-bold">{t("Updates sent")}</h2>
            {inc.updates.length ? (
              <ol className="grid gap-2">
                {inc.updates.map((u) => (
                  <li key={u.id} className="rounded-2xl bg-fill px-3.5 py-2.5 text-[13.5px]">
                    <p className="leading-snug">{u.text}</p>
                    <p className="mt-1 text-[11.5px] text-ink-3">
                      {staffName(data, u.by)} · {rel(u.at, lang, now)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] text-muted-foreground">{t("Nothing sent yet.")}</p>
            )}
          </section>
        </aside>
      </div>

      <Dialog open={reviewing && open} onOpenChange={setReviewing}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Review incident update")}</DialogTitle>
            <DialogDescription>{t("This update will be posted to {n} open report timelines. Remove names, addresses and private details before sending.", { n: reachable.length })}</DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words rounded-xl bg-fill p-3 text-[14px]">{text.trim()}</p>
          <DialogFooter>
            <button type="button" onClick={() => setReviewing(false)} className="h-10 rounded-full bg-fill px-4 text-[14px] font-semibold">{t("Edit update")}</button>
            <button type="button" disabled={!reachable.length || pending === "broadcast"} className="h-10 rounded-full bg-primary px-4 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
              onClick={async () => {
                const result = await act("broadcast", () => postIncidentUpdate({ incidentId: inc.id, text }));
                if (result.ok) {
                  setReviewing(false);
                  setText("");
                  toast.success(t("Update posted to {n} report timelines", { n: result.data.reached }));
                }
              }}>{t("Post update")}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closing} onOpenChange={setClosing}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Close {ref}", { ref: inc.ref })}</DialogTitle>
            <DialogDescription>{t("This posts an outcome to eligible reports with owners. Cases still in intake or without an owner stay open.")}</DialogDescription>
          </DialogHeader>
          <textarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            rows={4}
            aria-label={t("Incident outcome")}
            maxLength={600}
            placeholder="Hal. Nalinis na ang kanal at humupa na ang baha. Salamat sa mga nag-ulat."
            className="field rounded-xl px-3.5 py-2.5 text-[14px]"
          />
          <DialogFooter>
            <button type="button" onClick={() => setClosing(false)} className="h-10 rounded-full bg-fill px-4 text-[14px] font-semibold transition hover:bg-fill-strong">
              {t("Cancel")}
            </button>
            <button
              type="button"
              disabled={outcome.trim().length < 10 || pending === "close"}
              onClick={async () => {
                const r = await act("close", () => closeIncident({ incidentId: inc.id, outcome }));
                if (r.ok) {
                  setClosing(false);
                  toast.success(
                    r.data.left
                      ? t("Closed · {resolved} resolved · {left} still open", { resolved: r.data.resolved, left: r.data.left })
                      : t("Closed · {resolved} resolved", { resolved: r.data.resolved }),
                  );
                }
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-[14px] font-bold text-background disabled:opacity-50"
            >
              {pending === "close" && <Loader2 className="size-4 animate-spin" />} {t("Close and notify")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
