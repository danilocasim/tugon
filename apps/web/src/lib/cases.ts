/** Pure selectors over staff case data, shared by inbox, queue, case view and insights. */
import { CATEGORY, INTAKE_STATUSES, URGENCY, type Category, type ServiceRequest, type Urgency } from "./domain";
import { DAY } from "./format";
import { dbscan, haversineKm, nearestLandmark, type LatLon } from "./geo";
import { isOverdue } from "./priority";

/** Intake order: resident-flagged danger, then suggested urgency, then oldest first. */
export function inboxOrder<T extends ServiceRequest>(reqs: T[]) {
  return reqs
    .filter((r) => INTAKE_STATUSES.includes(r.status))
    .sort(
      (a, b) =>
        Number(b.dangerNow) - Number(a.dangerNow) ||
        URGENCY[b.prediction.urgency].level - URGENCY[a.prediction.urgency].level ||
        a.createdAt - b.createdAt,
    );
}

type Classified = { triage: Pick<NonNullable<ServiceRequest["triage"]>, "category" | "urgency"> | null; prediction: Pick<ServiceRequest["prediction"], "category" | "urgency"> };
export const effectiveCategory = (r: Classified): Category => r.triage?.category ?? r.prediction.category;

/** Possible duplicates: open or recent reports of the same kind within 150 m. Purok-only locations have no real point to compare. */
export function similarReports<T extends ServiceRequest & { redacted?: boolean }>(r: T, all: T[], now = Date.now()) {
  if (r.location?.lat == null || r.location.lon == null || r.location.method === "purok") return [];
  const here = { lat: r.location.lat, lon: r.location.lon };
  const cat = effectiveCategory(r);
  return all
    .filter((q) => q.id !== r.id && !q.redacted && q.location?.lat != null && q.location.lon != null && q.location.method !== "purok" && q.status !== "duplicate" && q.status !== "withdrawn")
    .filter((q) => effectiveCategory(q) === cat && (q.closedAt == null || now - q.closedAt < 2 * DAY) && now - q.createdAt < 14 * DAY)
    .map((q) => ({ q, m: Math.round(haversineKm(here, { lat: q.location!.lat!, lon: q.location!.lon! }) * 1000) }))
    .filter((x) => x.m <= 150)
    .sort((a, b) => a.m - b.m)
    .slice(0, 4);
}

type Mappable = Classified & Pick<ServiceRequest, "status" | "restricted" | "location" | "createdAt">;
export interface Hotspot<T extends Mappable> {
  id: string;
  members: T[];
  center: LatLon;
  radiusKm: number;
  dominant: Category;
  share: number;
  place: string;
  first: number;
  last: number;
}

/**
 * Hotspots: DBSCAN over pinned, non-restricted, location-based reports in the window.
 * Routine inquiries (documents, social assistance) and duplicates are excluded.
 */
export function hotspots<T extends Mappable>(reqs: T[], opts: { epsM: number; minPts: number; days: number; categories: Category[] }, now = Date.now()) {
  const eligible = reqs.filter(
    (r) =>
      !r.restricted &&
      r.status !== "duplicate" &&
      r.status !== "withdrawn" &&
      r.location?.lat != null &&
      r.location.lon != null &&
      r.location.method !== "purok" &&
      CATEGORY[effectiveCategory(r)].located &&
      opts.categories.includes(effectiveCategory(r)) &&
      now - r.createdAt <= opts.days * DAY,
  );
  const pts = eligible.map((r) => ({ lat: r.location!.lat!, lon: r.location!.lon! }));
  const labels = dbscan(pts, opts.epsM / 1000, opts.minPts);
  const groups = new Map<number, T[]>();
  labels.forEach((l, i) => {
    if (l < 0) return;
    groups.set(l, [...(groups.get(l) ?? []), eligible[i]]);
  });
  const clusters: Hotspot<T>[] = [...groups.entries()]
    .map(([l, members]) => {
      const center = {
        lat: members.reduce((a, r) => a + r.location!.lat!, 0) / members.length,
        lon: members.reduce((a, r) => a + r.location!.lon!, 0) / members.length,
      };
      const radiusKm = Math.max(0.04, ...members.map((r) => haversineKm(center, { lat: r.location!.lat!, lon: r.location!.lon! }))) + 0.02;
      const counts = new Map<Category, number>();
      for (const r of members) counts.set(effectiveCategory(r), (counts.get(effectiveCategory(r)) ?? 0) + 1);
      const [dominant, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        id: `c${l}`,
        members,
        center,
        radiusKm,
        dominant,
        share: n / members.length,
        place: nearestLandmark(center.lat, center.lon)?.name ?? "",
        first: Math.min(...members.map((r) => r.createdAt)),
        last: Math.max(...members.map((r) => r.createdAt)),
      };
    })
    .sort((a, b) => b.members.length - a.members.length);
  const noise = eligible.filter((_, i) => labels[i] < 0);
  return { clusters, noise, eligible: eligible.length };
}

/** K-Means (k-means++ seeding, deterministic) over the same points, for the thesis comparison. */
export function kmeans(points: LatLon[], k: number, seed = 42) {
  if (points.length < k) return points.map((_, i) => i);
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const centers: LatLon[] = [points[Math.floor(rnd() * points.length)]];
  while (centers.length < k) {
    const d2 = points.map((p) => Math.min(...centers.map((c) => haversineKm(p, c) ** 2)));
    const total = d2.reduce((a, b) => a + b, 0);
    let target = rnd() * total;
    let idx = 0;
    while ((target -= d2[idx]) > 0 && idx < points.length - 1) idx++;
    centers.push(points[idx]);
  }
  let labels = new Array<number>(points.length).fill(0);
  for (let iter = 0; iter < 50; iter++) {
    const next = points.map((p) => centers.reduce((best, c, i) => (haversineKm(p, c) < haversineKm(p, centers[best]) ? i : best), 0));
    const moved = next.some((l, i) => l !== labels[i]);
    labels = next;
    centers.forEach((_, ci) => {
      const m = points.filter((_, i) => labels[i] === ci);
      if (m.length) centers[ci] = { lat: m.reduce((a, p) => a + p.lat, 0) / m.length, lon: m.reduce((a, p) => a + p.lon, 0) / m.length };
    });
    if (!moved && iter > 0) break;
  }
  return labels;
}

/** Mean silhouette over Haversine distance; noise (−1) excluded. */
export function silhouette(points: LatLon[], labels: number[]) {
  const idx = points.map((_, i) => i).filter((i) => labels[i] >= 0);
  const clusters = [...new Set(idx.map((i) => labels[i]))];
  if (clusters.length < 2) return null;
  const scores = idx.map((i) => {
    const mean = (c: number) => {
      const others = idx.filter((j) => j !== i && labels[j] === c);
      return others.length ? others.reduce((a, j) => a + haversineKm(points[i], points[j]), 0) / others.length : 0;
    };
    const a = mean(labels[i]);
    const b = Math.min(...clusters.filter((c) => c !== labels[i]).map(mean));
    return Math.max(a, b) ? (b - a) / Math.max(a, b) : 0;
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export interface Metrics {
  backlog: number;
  byStatus: Record<string, number>;
  medianFirstActionMs: number | null;
  medianResolutionMs: number | null;
  overdue: number;
  suggestions: number;
  agreed: number;
  missedHigh: number;
  byCategory: { category: Category; total: number; byUrgency: Record<Urgency, number> }[];
  perDay: { day: number; count: number }[];
  startByUrgency: { urgency: Urgency; ms: number | null; n: number }[];
}

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type MetricRequest = Omit<Classified, "triage"> & Pick<ServiceRequest, "status" | "createdAt" | "firstActionAt" | "startedAt" | "closedAt"> & {
  triage: Pick<NonNullable<ServiceRequest["triage"]>, "category" | "urgency" | "correctedCategory" | "correctedUrgency"> | null;
};
export function metrics(reqs: MetricRequest[], days: number, targets: Record<Urgency, number>, now = Date.now()): Metrics {
  const inWindow = reqs.filter((r) => now - r.createdAt <= days * DAY);
  const open = reqs.filter((r) => !["resolved", "referred", "duplicate", "withdrawn"].includes(r.status));
  const byStatus: Record<string, number> = {};
  for (const r of open) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const triaged = inWindow.filter((r) => r.triage);
  const resolved = inWindow.filter((r) => r.status === "resolved" && r.closedAt);
  const today = Math.floor((now + 8 * 3_600_000) / DAY) * DAY - 8 * 3_600_000;
  const span = Math.min(days, 14);
  return {
    backlog: open.length,
    byStatus,
    medianFirstActionMs: median(inWindow.filter((r) => r.firstActionAt).map((r) => r.firstActionAt! - r.createdAt)),
    medianResolutionMs: median(resolved.map((r) => r.closedAt! - r.createdAt)),
    overdue: reqs.filter((r) => isOverdue(r, targets, now)).length,
    suggestions: triaged.length,
    agreed: triaged.filter((r) => !r.triage!.correctedCategory && !r.triage!.correctedUrgency).length,
    missedHigh: triaged.filter((r) => r.triage!.urgency === "high" && r.prediction.urgency !== "high").length,
    byCategory: (Object.keys(CATEGORY) as Category[]).map((c) => {
      const rs = inWindow.filter((r) => effectiveCategory(r) === c);
      const byUrgency = { high: 0, medium: 0, normal: 0 } as Record<Urgency, number>;
      for (const r of rs) byUrgency[r.triage?.urgency ?? r.prediction.urgency]++;
      return { category: c, total: rs.length, byUrgency };
    }),
    perDay: Array.from({ length: span }, (_, i) => {
      const day = today - (span - 1 - i) * DAY;
      return { day, count: reqs.filter((r) => r.createdAt >= day && r.createdAt < day + DAY).length };
    }),
    startByUrgency: (["high", "medium", "normal"] as Urgency[]).map((u) => {
      const rs = inWindow.filter((r) => r.startedAt && r.triage?.urgency === u);
      return { urgency: u, ms: median(rs.map((r) => r.startedAt! - r.createdAt)), n: rs.length };
    }),
  };
}
