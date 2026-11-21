/**
 * Priority score with linear aging (thesis Chapter 3):
 *   PS = 0.5·(U/3) + 0.3·(W/3) + 0.2·min(1, t_wait / 300 min)
 * Aging alone cannot lift a Normal request above a fresh High one (0.467 < 0.800),
 * so the prototype adds overdue escalation against per-urgency response targets.
 */
import { CATEGORY, URGENCY, type ServiceRequest, type Urgency } from "./domain";

export const WEIGHTS = { u: 0.5, w: 0.3, a: 0.2 };
export const T_MAX_MIN = 300;
const MIN = 60_000;
const HOUR = 60 * MIN;

export interface Priority {
  total: number;
  u: number;
  w: number;
  a: number;
  waitMin: number;
}

export function priority(req: Pick<ServiceRequest, "triage" | "createdAt">, now = Date.now()): Priority | null {
  if (!req.triage) return null;
  const waitMin = Math.max(0, (now - req.createdAt) / MIN);
  const u = WEIGHTS.u * (URGENCY[req.triage.urgency].level / 3);
  const w = WEIGHTS.w * (CATEGORY[req.triage.category].weight / 3);
  const a = WEIGHTS.a * Math.min(1, waitMin / T_MAX_MIN);
  return { total: u + w + a, u, w, a, waitMin };
}

/** Rank by score; ties broken oldest-first (arrival order). */
export function rankQueue<T extends Pick<ServiceRequest, "triage" | "createdAt">>(reqs: T[], now = Date.now()) {
  return reqs
    .map((req) => ({ req, p: priority(req, now)! }))
    .filter((x) => x.p)
    .sort((a, b) => b.p.total - a.p.total || a.req.createdAt - b.req.createdAt);
}

type HasUrgency = { triage: { urgency: Urgency } | null; prediction: { urgency: Urgency } };
const effectiveUrgency = (r: HasUrgency): Urgency => r.triage?.urgency ?? r.prediction.urgency;

/** Overdue = work not started past the response target for its urgency. */
export function isOverdue(r: HasUrgency & Pick<ServiceRequest, "status" | "createdAt">, targetsH: Record<Urgency, number>, now = Date.now()) {
  if (!["received", "review", "needs_info", "queued"].includes(r.status)) return false;
  return now - r.createdAt > targetsH[effectiveUrgency(r)] * HOUR;
}

export function dueAt(r: HasUrgency & Pick<ServiceRequest, "createdAt">, targetsH: Record<Urgency, number>) {
  return r.createdAt + targetsH[effectiveUrgency(r)] * HOUR;
}
