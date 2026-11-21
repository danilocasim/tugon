import "server-only";
import { notFound } from "next/navigation";
import { effectiveCategory, hotspots, kmeans, median, metrics, silhouette } from "@/lib/cases";
import { CATEGORIES, CATEGORY, CHANNEL, isOpen, type Category, type Channel, type ServiceRequest } from "@/lib/domain";
import { manilaDate } from "@/lib/duty";
import { DAY } from "@/lib/format";
import { haversineKm, PUROKS } from "@/lib/geo";
import { dueAt } from "@/lib/priority";
import { requirePortal } from "./identity";
import { publicSettings } from "./resident-data";
import { serviceClient } from "./service-client";

export const located = CATEGORIES.filter((category) => CATEGORY[category].located);
const pointLimit = 600;
const reportColumns = "id,ref,channel,category,resident_category,created_at,closed_at,status,location,case_work!case_work_request_id_fkey(restricted,prediction,urgency,triaged_at,first_action_at,started_at,team_id,assignee_id,incident_id)";
const time = (value: string | null | undefined) => value ? Date.parse(value) : null;
const protectedCount = (n: number) => n > 0 && n < 3 ? null : n;
const rounded = (n: number) => Math.round(n * 1000) / 1000;

async function selectReports(start: number, end: number, monthly: boolean) {
  const db = serviceClient();
  const from = new Date(start).toISOString(), until = new Date(end).toISOString();
  const createdInWindow = `and(created_at.gte.${from},created_at.lt.${until})`;
  const filter = monthly
    ? `${createdInWindow},and(closed_at.gte.${from},closed_at.lt.${until}),and(created_at.lt.${until},or(closed_at.is.null,closed_at.gte.${until}))`
    : `${createdInWindow},and(created_at.lt.${from},status.in.(received,review,needs_info,queued,in_progress))`;
  const load = () => db.from("service_requests").select(reportColumns).or(filter).order("id");
  const records = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await load().range(offset, offset + 499);
    if (error) throw new Error("Analytics projection unavailable", { cause: error.code });
    for (const r of data) {
      const w = r.case_work;
      if (w?.restricted) continue;
      const predicted = w?.prediction as unknown as ServiceRequest["prediction"] | null;
      const reportedCategory = (r.category ?? predicted?.category ?? r.resident_category) as Category | null;
      const category = reportedCategory ?? "infra";
      const urgency = (w?.urgency as ServiceRequest["prediction"]["urgency"] | null) ?? predicted?.urgency ?? "normal";
      records.push({
        id: r.id, ref: r.ref, channel: r.channel as Channel, createdAt: Date.parse(r.created_at), closedAt: time(r.closed_at),
        status: r.status as ServiceRequest["status"], location: r.location as ServiceRequest["location"], restricted: false,
        prediction: { category: predicted?.category ?? category, urgency: predicted?.urgency ?? urgency },
        triage: w?.triaged_at && w.urgency ? { category, urgency, correctedCategory: !!predicted && category !== predicted.category, correctedUrgency: !!predicted && urgency !== predicted.urgency } : null,
        firstActionAt: time(w?.first_action_at), startedAt: time(w?.started_at), team: w?.team_id, assigned: !!w?.assignee_id,
        canLink: reportedCategory !== null && CATEGORY[reportedCategory].located && !w?.incident_id,
      });
    }
    if (data.length < 500) return records;
  }
}

async function parameters() {
  const db = serviceClient();
  const { data, error } = await db.from("civic_settings").select("target_high,target_medium,target_normal,hotspot_radius,hotspot_minimum").single();
  if (error) throw new Error("Analytics settings unavailable", { cause: error.code });
  return { targets: { high: data.target_high, medium: data.target_medium, normal: data.target_normal }, hotspot: { epsM: data.hotspot_radius, minPts: data.hotspot_minimum } };
}

type Search = Record<string, string | string[] | undefined>;
const pickInt = (value: Search[string], low: number, high: number, fallback: number) => typeof value === "string" && /^\d{1,3}$/u.test(value) && +value >= low && +value <= high ? +value : fallback;
export async function readInsights(query: Search) {
  const actor = await requirePortal("staff", "/barangay/insights");
  if (actor.member.role !== "admin" && actor.member.role !== "supervisor") notFound();
  const supervisor = actor.member.role === "supervisor";
  const now = Date.now();
  const days = query.days === "7" ? 7 : query.days === "14" ? 14 : 30;
  const algo = query.algo === "kmeans" ? "kmeans" : "dbscan";
  const requested = typeof query.cats === "string" ? new Set(query.cats.split(",")) : null;
  const cats = located.filter((c) => !requested || requested.has(c));
  if (!cats.length) cats.push(...located);
  const [settings, reports, teams, civic] = await Promise.all([
    parameters(), selectReports(now - days * DAY, now, false), serviceClient().from("teams").select("id,name").order("name"), publicSettings(),
  ]);
  if (teams.error) throw new Error("Unable to read analytics teams", { cause: teams.error.code });
  const epsM = pickInt(query.eps, 40, 250, settings.hotspot.epsM);
  const min = pickInt(query.min, 3, 10, settings.hotspot.minPts);
  const available = reports.filter((r) => r.createdAt >= now - days * DAY && r.createdAt <= now && r.location?.lat != null && r.location.lon != null && r.location.method !== "purok" && cats.includes(effectiveCategory(r)) && r.status !== "duplicate" && r.status !== "withdrawn");
  const eligible = available.length > pointLimit ? available.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)).slice(0, pointLimit) : available;
  const pts = eligible.map((r) => ({ lat: r.location!.lat!, lon: r.location!.lon! }));
  const clustered = hotspots(eligible, { epsM, minPts: min, days, categories: cats }, now);
  const clusterRows = clustered.clusters.map((c) => ({
    id: c.id, center: { lat: rounded(c.center.lat), lon: rounded(c.center.lon) }, radiusKm: Math.max(0.12, Math.ceil(c.radiusKm * 10) / 10),
    count: c.members.length, dominant: c.dominant, share: c.share, place: c.place || "Barangay area", first: c.first, last: c.last,
    candidates: supervisor ? c.members.filter((r) => r.canLink && isOpen(r)).map((r) => ({
      id: r.id, ref: r.ref, status: r.status, createdAt: r.createdAt, category: effectiveCategory(r),
    })) : [],
  }));
  let labels: number[];
  let mapClusters;
  if (algo === "kmeans") {
    labels = kmeans(pts, 3);
    mapClusters = [0, 1, 2].flatMap((k) => {
      const members = pts.filter((_, i) => labels[i] === k);
      if (members.length < 3) return [];
      const center = { lat: rounded(members.reduce((a, p) => a + p.lat, 0) / members.length), lon: rounded(members.reduce((a, p) => a + p.lon, 0) / members.length) };
      return [{ id: `k${k}`, center, radiusKm: Math.max(0.12, Math.ceil(Math.max(...members.map((p) => haversineKm(center, p))) * 10) / 10), count: members.length, label: `K-Means cluster ${k + 1}` }];
    });
  } else {
    const indexes = new Map(clustered.clusters.flatMap((c, index) => c.members.map((m) => [m.id, index] as const)));
    labels = eligible.map((r) => indexes.get(r.id) ?? -1);
    mapClusters = clusterRows.map(({ id, center, radiusKm, count, place }) => ({ id, center, radiusKm, count, label: place }));
  }
  const teamCounts = new Map<string, { assigned: number; waiting: number }>();
  for (const r of reports) {
    if (!r.team || (r.status !== "queued" && r.status !== "in_progress")) continue;
    let tally = teamCounts.get(r.team);
    if (!tally) { tally = { assigned: 0, waiting: 0 }; teamCounts.set(r.team, tally); }
    if (r.assigned) tally.assigned++; else tally.waiting++;
  }
  return {
    ...settings, barangay: civic.barangay, days, algo, cats, epsM, min, now, clusterRows,
    m: metrics(reports, days, settings.targets, now),
    openByTeam: teams.data.map((team) => ({ team, ...(teamCounts.get(team.id) ?? { assigned: 0, waiting: 0 }) })),
    analysis: { clusters: mapClusters, score: silhouette(pts, labels), noiseShare: algo === "dbscan" && pts.length ? clustered.noise.length / pts.length : 0, n: pts.length, sampled: pts.length < available.length },
  };
}

export async function readMonthlyReport(query: Search) {
  const actor = await requirePortal("staff", "/barangay/reports");
  if (!["admin", "supervisor", "intake"].includes(actor.member.role)) notFound();
  const db = serviceClient();
  const now = Date.now();
  const current = manilaDate(now).slice(0, 7);
  const result = await db.rpc("report_months");
  if (result.error) throw new Error("Unable to list reporting months", { cause: result.error.code });
  const months = result.data.map((row) => row.month);
  const month = typeof query.month === "string" && months.includes(query.month) ? query.month : current;
  const start = Date.parse(`${month}-01T00:00:00+08:00`);
  const following = new Date(`${month}-01T00:00:00Z`);
  following.setUTCMonth(following.getUTCMonth() + 1);
  const end = Date.parse(`${following.toISOString().slice(0, 7)}-01T00:00:00+08:00`);
  const since = new Date(start).toISOString(), until = new Date(end).toISOString();
  const [reports, settings, civic, operations, sms, duty] = await Promise.all([
    selectReports(start, end, true), parameters(), publicSettings(),
    db.rpc("report_operations", { p_start: since, p_end: until }).single(),
    db.rpc("report_delivery_count", { p_start: since, p_end: until }),
    db.rpc("report_duty_totals", { p_start: `${month}-01`, p_end: following.toISOString().slice(0, 10) }).single(),
  ]);
  if (operations.error || sms.error || duty.error) throw new Error("Unable to read monthly aggregates", { cause: operations.error?.code ?? sms.error?.code ?? duty.error?.code });
  const ops = operations.data;
  const outcomes = { settled: ops.lupon_settled, cfa: ops.lupon_cfa, dismissed: ops.lupon_dismissed, withdrawn: ops.lupon_withdrawn };
  const inMonth = (t: number | null) => t != null && t >= start && t < end;
  const received = reports.filter((r) => inMonth(r.createdAt));
  const counted = received.filter((r) => r.status !== "duplicate" && r.status !== "withdrawn");
  const resolved = reports.filter((r) => r.status === "resolved" && inMonth(r.closedAt));
  const referred = reports.filter((r) => r.status === "referred" && inMonth(r.closedAt));
  const openAtEnd = reports.filter((r) => r.createdAt < end && r.status !== "duplicate" && r.status !== "withdrawn" && (r.closedAt == null || r.closedAt >= end));
  const acted = counted.filter((r) => r.firstActionAt != null && r.firstActionAt < end);
  const onTime = acted.filter((r) => r.firstActionAt! <= dueAt(r, settings.targets));
  const byCategory = CATEGORIES.map((c) => {
    const group = counted.filter((r) => effectiveCategory(r) === c);
    const closed = resolved.filter((r) => effectiveCategory(r) === c);
    return { c, received: group.length, high: group.filter((r) => (r.triage?.urgency ?? r.prediction.urgency) === "high").length, resolved: closed.length, median: median(closed.map((r) => r.closedAt! - r.createdAt)) };
  });
  const byChannel = (Object.keys(CHANNEL) as Channel[]).map((ch) => ({ ch, n: counted.filter((r) => r.channel === ch).length }));
  const byPurok = PUROKS.map((p) => ({ p: p.name, n: protectedCount(counted.filter((r) => r.location?.purok === p.id).length) })).filter((x) => x.n !== 0);
  const hs = hotspots(counted.slice(0, pointLimit), { ...settings.hotspot, days: 32, categories: located }, end - 1);
  return {
    months, month, now, settings, barangay: civic.barangay, city: civic.city, preparedBy: actor.member.name, title: actor.member.title,
    counted: counted.length, received: received.length, resolved: resolved.length, referred: referred.length, openAtEnd: openAtEnd.length, acted: acted.length, onTime: onTime.length,
    duty: duty.data,
    byCategory, byChannel, byPurok, field: ops.field_sent, fieldDone: ops.field_done,
    fieldCancelled: ops.field_cancelled, arrive: ops.median_arrival_ms,
    kpFiled: protectedCount(ops.lupon_filed), kpPending: protectedCount(ops.lupon_pending),
    closedBy: (Object.keys(outcomes) as (keyof typeof outcomes)[]).map((s) => ({ s, n: protectedCount(outcomes[s]) })),
    incidents: { total: ops.incident_started, closed: ops.incident_closed, updates: ops.incident_updates, linked: ops.incident_linked },
    clusters: hs.clusters.slice(0, 5).map((c) => ({ place: c.place || "Barangay area", dominant: c.dominant, share: c.share, count: c.members.length })),
    sms: sms.data, medianFirst: median(acted.map((r) => r.firstActionAt! - r.createdAt)), medianResolve: median(resolved.map((r) => r.closedAt! - r.createdAt)), partial: month === current,
  };
}
