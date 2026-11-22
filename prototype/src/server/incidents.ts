"use server";

/**
 * Incident mode: during a surge (a flood, a blackout) many residents report the
 * same thing. Linking their reports to one incident lets staff answer everyone
 * with one update and close them together.
 */
import { CATEGORIES, isOpen, type Category, type DB, type Incident, type ServiceRequest, type Staff } from "@/lib/domain";
import { haversineKm } from "@/lib/geo";
import { can, canAccess } from "@/lib/policy";
import { addEvent, audit, cleanText, fail, findReq, newId, notify, requireStaff, resolveCase, run, staffActor } from "./core";
import { mutate, readDb } from "./db";

async function requireIncidentStaff() {
  const s = await requireStaff(readDb());
  if (!canAccess(s, "incidents")) fail("forbidden", "Incidents are run by intake officers and supervisors.");
  return s;
}

const findIncident = (db: DB, id: string) => db.incidents.find((i) => i.id === id) ?? fail("not_found", "That incident no longer exists.");
const effectiveCategory = (r: ServiceRequest): Category => r.triage?.category ?? r.prediction.category;

function incidentRef(db: DB, at: number) {
  const parts = new Intl.DateTimeFormat("en-PH", { year: "2-digit", month: "2-digit", timeZone: "Asia/Manila" }).formatToParts(at);
  const part = (t: string) => parts.find((p) => p.type === t)!.value;
  return `INC-${part("year")}${part("month")}-${String(db.incidents.length + 1).padStart(2, "0")}`;
}

/** Center on the pinned reports and cover them all, with a margin for reports still coming in. */
function extent(reqs: ServiceRequest[]) {
  const pts = reqs.flatMap((r) => (r.location?.lat != null && r.location.lon != null ? [{ lat: r.location.lat, lon: r.location.lon }] : []));
  if (!pts.length) return null;
  const center = { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lon: pts.reduce((a, p) => a + p.lon, 0) / pts.length };
  const far = Math.max(...pts.map((p) => haversineKm(center, p) * 1000));
  return { center: { lat: +center.lat.toFixed(6), lon: +center.lon.toFixed(6) }, radiusM: Math.min(600, Math.max(80, Math.round(far + 60))) };
}

function link(db: DB, s: Staff, inc: Incident, req: ServiceRequest) {
  if (!can(s, "view", req)) fail("forbidden", `You can't open ${req.ref}.`);
  if (!isOpen(req)) fail("conflict", `${req.ref} is already closed.`);
  if (req.incidentId && req.incidentId !== inc.id) fail("conflict", `${req.ref} already belongs to another incident.`);
  if (req.incidentId === inc.id) return;
  req.incidentId = inc.id;
  inc.requestIds.push(req.id);
  addEvent(req, { type: "incident_linked", vis: "internal", actor: staffActor(s), meta: { incident: inc.id, incidentRef: inc.ref } });
}

export async function createIncident(input: { title: string; requestIds: string[] }) {
  return run(async () => {
    const s = await requireIncidentStaff();
    const title = cleanText(input.title, 4, 80, "Title");
    if (!Array.isArray(input.requestIds) || !input.requestIds.length) fail("invalid", "Link at least one open report.");
    return mutate((db) => {
      const reqs = [...new Set(input.requestIds)].map((id) => findReq(db, id));
      const area = extent(reqs) ?? fail("invalid", "At least one linked report needs a map location.");
      const counts = CATEGORIES.map((c) => [c, reqs.filter((r) => effectiveCategory(r) === c).length] as const);
      const inc: Incident = {
        id: newId("inc"),
        ref: incidentRef(db, Date.now()),
        title,
        category: counts.sort((a, b) => b[1] - a[1])[0][0],
        ...area,
        status: "open",
        requestIds: [],
        createdBy: s.id,
        createdAt: Date.now(),
        closedAt: null,
        outcome: null,
        updates: [],
      };
      db.incidents.unshift(inc);
      for (const r of reqs) link(db, s, inc, r);
      audit(db, s, "incident_created", inc.ref, `${title} · ${reqs.length} reports`);
      return { id: inc.id, ref: inc.ref };
    });
  });
}

export async function linkToIncident(input: { incidentId: string; requestId: string }) {
  return run(async () => {
    const s = await requireIncidentStaff();
    return mutate((db) => {
      const inc = findIncident(db, input.incidentId);
      if (inc.status !== "open") fail("conflict", "This incident is closed.");
      link(db, s, inc, findReq(db, input.requestId));
      audit(db, s, "incident_linked", inc.ref, findReq(db, input.requestId).ref);
      return null;
    });
  });
}

export async function unlinkFromIncident(input: { incidentId: string; requestId: string }) {
  return run(async () => {
    const s = await requireIncidentStaff();
    return mutate((db) => {
      const inc = findIncident(db, input.incidentId);
      const req = findReq(db, input.requestId);
      if (req.incidentId !== inc.id) fail("conflict", "That report isn't part of this incident.");
      req.incidentId = null;
      inc.requestIds = inc.requestIds.filter((id) => id !== req.id);
      addEvent(req, { type: "note", vis: "internal", actor: staffActor(s), text: `Unlinked from incident ${inc.ref}.` });
      audit(db, s, "incident_unlinked", inc.ref, req.ref);
      return null;
    });
  });
}

/** One message, delivered to every reporter on the incident as a normal update (app, and SMS when opted in). */
export async function postIncidentUpdate(input: { incidentId: string; text: string }) {
  return run(async () => {
    const s = await requireIncidentStaff();
    const text = cleanText(input.text, 8, 500, "Update");
    return mutate((db) => {
      const inc = findIncident(db, input.incidentId);
      if (inc.status !== "open") fail("conflict", "This incident is closed.");
      let reached = 0;
      for (const id of inc.requestIds) {
        const req = db.requests.find((r) => r.id === id);
        if (!req || !isOpen(req)) continue;
        addEvent(req, { type: "update", vis: "resident", actor: staffActor(s), text, meta: { incident: inc.id } });
        notify(db, req, "update");
        reached += 1;
      }
      inc.updates.unshift({ id: newId("iu"), at: Date.now(), by: s.id, text });
      audit(db, s, "incident_update", inc.ref, `${reached} reporters`);
      return { reached };
    });
  });
}

/** Final word to every reporter; queued and in-progress cases close as resolved, intake-stage ones stay for triage. */
export async function closeIncident(input: { incidentId: string; outcome: string }) {
  return run(async () => {
    const s = await requireIncidentStaff();
    if (s.role !== "supervisor") fail("forbidden", "A supervisor closes incidents, because closing resolves the linked cases.");
    const outcome = cleanText(input.outcome, 10, 600, "Outcome");
    return mutate((db) => {
      const inc = findIncident(db, input.incidentId);
      if (inc.status !== "open") fail("conflict", "This incident is already closed.");
      let resolved = 0;
      let left = 0;
      for (const id of inc.requestIds) {
        const req = db.requests.find((r) => r.id === id);
        if (!req || !isOpen(req)) continue;
        if (req.status === "queued" || req.status === "in_progress") {
          resolveCase(db, s, req, outcome);
          resolved += 1;
        } else {
          addEvent(req, { type: "update", vis: "resident", actor: staffActor(s), text: outcome, meta: { incident: inc.id } });
          notify(db, req, "update");
          left += 1;
        }
      }
      inc.status = "closed";
      inc.closedAt = Date.now();
      inc.outcome = outcome;
      audit(db, s, "incident_closed", inc.ref, `${resolved} resolved · ${left} still in intake`);
      return { resolved, left };
    });
  });
}
