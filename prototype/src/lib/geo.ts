/**
 * Geography for the fictional Barangay Sampaguita, laid over the thesis study
 * area (14.3681–14.3919 N, 121.0280–121.0520 E). Haversine distance and DBSCAN
 * over a precomputed Haversine matrix, as specified in Chapter 3.
 */
import type { Lang, LocationInfo } from "./domain";

export const BOUNDS = { latMin: 14.3681, latMax: 14.3919, lonMin: 121.028, lonMax: 121.052 };
export const CENTER = { lat: 14.38, lon: 121.04 };
const EARTH_R_KM = 6371;

/** Planning grid: 1000 units across ≈2.59 km; height keeps the true aspect. */
const GRID_W = 1000;
const GRID_H = 1022;

export interface LatLon {
  lat: number;
  lon: number;
}

export function fromGrid(x: number, y: number): LatLon {
  return {
    lat: +(BOUNDS.latMax - (y / GRID_H) * (BOUNDS.latMax - BOUNDS.latMin)).toFixed(6),
    lon: +(BOUNDS.lonMin + (x / GRID_W) * (BOUNDS.lonMax - BOUNDS.lonMin)).toFixed(6),
  };
}

export function inBounds(lat: number, lon: number) {
  return lat >= BOUNDS.latMin && lat <= BOUNDS.latMax && lon >= BOUNDS.lonMin && lon <= BOUNDS.lonMax;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km (R = 6,371 km). */
export function haversineKm(a: LatLon, b: LatLon) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * DBSCAN over a precomputed pairwise Haversine matrix.
 * minPts counts the point itself, matching scikit-learn's min_samples.
 * Returns one label per point; −1 marks noise.
 */
export function dbscan(points: LatLon[], epsKm: number, minPts: number): number[] {
  const n = points.length;
  const dist = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineKm(points[i], points[j]);
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }
  const neighbors = (i: number) => {
    const out: number[] = [];
    for (let j = 0; j < n; j++) if (dist[i][j] <= epsKm) out.push(j);
    return out;
  };

  const UNVISITED = -2;
  const labels = new Array<number>(n).fill(UNVISITED);
  let cluster = 0;
  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNVISITED) continue;
    const seeds = neighbors(i);
    if (seeds.length < minPts) {
      labels[i] = -1;
      continue;
    }
    labels[i] = cluster;
    const queue = seeds.filter((j) => j !== i);
    while (queue.length) {
      const j = queue.shift()!;
      if (labels[j] === -1) labels[j] = cluster; // border point, not expanded
      if (labels[j] !== UNVISITED) continue;
      labels[j] = cluster;
      const next = neighbors(j);
      if (next.length >= minPts) queue.push(...next);
    }
    cluster++;
  }
  return labels;
}

/* ---------- Puroks and landmarks ---------- */

type Pt = [number, number];
const PUROK_GRID: { id: string; name: string; label: Pt; poly: Pt[] }[] = [
  { id: "P2", name: "Purok 2", label: [250, 175], poly: [[0, 0], [560, 0], [520, 300], [300, 360], [0, 330]] },
  { id: "P3", name: "Purok 3", label: [820, 90], poly: [[560, 0], [1000, 0], [1000, 380], [700, 360], [520, 300]] },
  { id: "P1", name: "Purok 1", label: [260, 460], poly: [[0, 330], [300, 360], [520, 300], [700, 360], [680, 560], [420, 580], [0, 560]] },
  { id: "P4", name: "Purok 4", label: [170, 760], poly: [[0, 560], [420, 580], [520, 1022], [0, 1022]] },
  { id: "P5", name: "Purok 5", label: [820, 700], poly: [[420, 580], [680, 560], [700, 360], [1000, 380], [1000, 1022], [520, 1022]] },
];

export const PUROKS = PUROK_GRID.map((p) => ({
  id: p.id,
  name: p.name,
  label: fromGrid(...p.label),
  ring: p.poly.map(([x, y]) => fromGrid(x, y)),
}));

export const PUROK_NAME: Record<string, string> = Object.fromEntries(PUROKS.map((p) => [p.id, p.name]));

export interface Landmark extends LatLon {
  id: string;
  name: string;
  purok: string;
}

const LANDMARK_GRID: { id: string; name: string; purok: string; x: number; y: number }[] = [
  { id: "hall", name: "Barangay Hall", purok: "P1", x: 470, y: 505 },
  { id: "mph", name: "Multipurpose Hall", purok: "P1", x: 405, y: 455 },
  { id: "health", name: "Health Center", purok: "P1", x: 625, y: 515 },
  { id: "p1-gate", name: "Purok 1 Gate", purok: "P1", x: 520, y: 395 },
  { id: "p1-alley", name: "Purok 1 Alley", purok: "P1", x: 565, y: 440 },
  { id: "p1-main", name: "Purok 1 Main Road", purok: "P1", x: 540, y: 418 },
  { id: "p2-chapel", name: "Purok 2 Chapel", purok: "P2", x: 215, y: 250 },
  { id: "p2-court", name: "Purok 2 Basketball Court", purok: "P2", x: 360, y: 150 },
  { id: "p3-daycare", name: "Purok 3 Day Care", purok: "P3", x: 770, y: 135 },
  { id: "p3-block4", name: "Purok 3 Block 4", purok: "P3", x: 790, y: 160 },
  { id: "p3-corner", name: "Purok 3 Corner", purok: "P3", x: 755, y: 172 },
  { id: "p4-gym", name: "Purok 4 Gym", purok: "P4", x: 400, y: 705 },
  { id: "p4-creek", name: "Purok 4 Creek side", purok: "P4", x: 410, y: 740 },
  { id: "p4-junk", name: "Purok 4 Junkshop", purok: "P4", x: 440, y: 728 },
  { id: "p5-market", name: "Purok 5 Talipapa", purok: "P5", x: 780, y: 760 },
  { id: "p5-school", name: "Purok 5 Elementary School", purok: "P5", x: 650, y: 860 },
];

export const LANDMARKS: Landmark[] = LANDMARK_GRID.map((l) => ({ id: l.id, name: l.name, purok: l.purok, ...fromGrid(l.x, l.y) }));

/** Thesis hotspot centres (Chapter 3, Methods of Collecting Data). */
export const THESIS_HOTSPOTS = {
  A: { lat: 14.3884, lon: 121.0466 },
  B: { lat: 14.3822, lon: 121.0411 },
  C: { lat: 14.375, lon: 121.0381 },
};

function pointInRing(p: LatLon, ring: LatLon[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
  }
  return inside;
}

/** Purok containing a coordinate, or null when outside the barangay. */
export function purokAt(lat: number, lon: number): string | null {
  if (!inBounds(lat, lon)) return null;
  return PUROKS.find((p) => pointInRing({ lat, lon }, p.ring))?.id ?? null;
}

export function purokCenter(id: string): LatLon | null {
  const p = PUROKS.find((q) => q.id === id);
  if (!p) return null;
  return {
    lat: p.ring.reduce((a, v) => a + v.lat, 0) / p.ring.length,
    lon: p.ring.reduce((a, v) => a + v.lon, 0) / p.ring.length,
  };
}

export const landmarkById = (id: string | null | undefined) => LANDMARKS.find((l) => l.id === id) ?? null;

export function nearestLandmark(lat: number, lon: number) {
  let best: Landmark | null = null;
  let bestD = Infinity;
  for (const l of LANDMARKS) {
    const d = haversineKm({ lat, lon }, l);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best ? { ...best, distanceM: Math.round(bestD * 1000) } : null;
}

/** Human place name for a report: landmark, distance to the nearest landmark, or purok only. */
export function placeLabel(r: { location: LocationInfo | null }, lang: Lang = "en") {
  const l = r.location;
  if (!l) return null;
  if (l.landmarkId) return landmarkById(l.landmarkId)?.name ?? null;
  const fil = lang === "fil";
  if (l.lat != null && l.lon != null && l.method !== "purok") {
    const near = nearestLandmark(l.lat, l.lon);
    if (!near) return fil ? "May pin sa mapa" : "Pinned";
    const m = Math.round(near.distanceM / 10) * 10;
    if (near.distanceM < 60) return `${fil ? "Sa" : "At"} ${near.name}`;
    return fil ? `${m} m mula sa ${near.name}` : `${m} m from ${near.name}`;
  }
  return l.purok ? `${PUROK_NAME[l.purok]} (${fil ? "walang pin" : "no pin"})` : null;
}

/** Approximate circle polygon (for drawing cluster extents on the map). */
export function circleRing(center: LatLon, radiusKm: number, steps = 48): LatLon[] {
  const out: LatLon[] = [];
  const dLat = (radiusKm / EARTH_R_KM) * (180 / Math.PI);
  const dLon = dLat / Math.cos(rad(center.lat));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    out.push({ lat: center.lat + dLat * Math.sin(t), lon: center.lon + dLon * Math.cos(t) });
  }
  return out;
}
