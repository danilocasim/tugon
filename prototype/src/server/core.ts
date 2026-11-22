/**
 * Shared server-side helpers for every action module: typed results, input
 * cleaning, events, notifications (in-app and SMS), audit, and the policy gate.
 * Not a server-action file itself, so it can export plain functions.
 */
import { suggest } from "@/lib/classifier";
import {
  FIELD_STATUS,
  type CaseEvent,
  type Category,
  type Channel,
  type DB,
  type FieldAssignment,
  type Lang,
  type LocationInfo,
  type NotificationType,
  type Resident,
  type ServiceRequest,
  type Staff,
} from "@/lib/domain";
import { inBounds, landmarkById, purokAt } from "@/lib/geo";
import { can, type CaseAction } from "@/lib/policy";
import { deletePhoto, mutate, readDb } from "./db";
import { refFor } from "./seed";
import { currentResident, currentStaff, currentTanod } from "./session";
import { queueSms } from "./sms";

export type Result<T = null> = { ok: true; data: T } | { ok: false; code: string; message: string; meta?: Record<string, unknown> };

class ActionError extends Error {
  constructor(
    public code: string,
    message: string,
    public meta?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const fail = (code: string, message: string, meta?: Record<string, unknown>): never => {
  throw new ActionError(code, message, meta);
};

export async function run<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, code: e.code, message: e.message, meta: e.meta };
    console.error(e);
    return { ok: false, code: "server_error", message: "Something went wrong on our side. Your input is kept; please try again." };
  }
}

export const DEMO_CODE = "246810";
let idSeq = 0;
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(++idSeq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function cleanText(v: unknown, min: number, max: number, field: string) {
  const s = typeof v === "string" ? v.trim().replace(/\s+\n/g, "\n") : "";
  if (s.length < min) fail("invalid", `${field} needs at least ${min} characters.`, { field });
  if (s.length > max) fail("invalid", `${field} must be ${max} characters or fewer.`, { field });
  return s;
}

export function findReq(db: DB, id: string) {
  return db.requests.find((r) => r.id === id) ?? fail("not_found", "That case no longer exists.");
}

export function addEvent(req: ServiceRequest, e: Omit<CaseEvent, "id" | "at">, at = Date.now()) {
  req.events.push({ id: newId("e"), at, ...e });
  req.updatedAt = at;
}

/** The words staff last wrote for the resident: an update, a hearing notice, a Lupon filing. */
const lastText = (r: ServiceRequest) => r.events.findLast((e) => e.vis === "resident" && e.text)?.text ?? "";

/** Short, no report content beyond what staff wrote for the resident. Review and duplicate stay app-only. */
const SMS_COPY: Record<Lang, Partial<Record<NotificationType, (r: ServiceRequest, team: string) => string>>> = {
  fil: {
    queued: (r, team) => `Tugon ${r.ref}: Naipasa na ang ulat mo sa ${team}. Abangan ang susunod na update.`,
    info_requested: (r) => `Tugon ${r.ref}: Kailangan ng barangay ng dagdag na detalye. Buksan ang Tugon app para sumagot.`,
    started: (r) => `Tugon ${r.ref}: Inaaksyunan na ang ulat mo.`,
    update: (r) => `Tugon ${r.ref}: ${lastText(r)}`,
    resolved: (r) => `Tugon ${r.ref}: Naresolba na. ${r.outcome ?? ""}`,
    referred: (r) => `Tugon ${r.ref}: Inirefer sa ${r.referral?.office ?? "ibang opisina"}.`,
    reopened: (r) => `Tugon ${r.ref}: Muling binuksan ang ulat mo.`,
    tanod: (r) => `Tugon ${r.ref}: Papunta na ang tanod.`,
    hearing: (r) => `Tugon ${r.ref}: ${lastText(r)}`,
  },
  en: {
    queued: (r, team) => `Tugon ${r.ref}: Your report went to ${team}. Watch for the next update.`,
    info_requested: (r) => `Tugon ${r.ref}: The barangay needs more details. Open the Tugon app to reply.`,
    started: (r) => `Tugon ${r.ref}: Work has started on your report.`,
    update: (r) => `Tugon ${r.ref}: ${lastText(r)}`,
    resolved: (r) => `Tugon ${r.ref}: Resolved. ${r.outcome ?? ""}`,
    referred: (r) => `Tugon ${r.ref}: Referred to ${r.referral?.office ?? "another office"}.`,
    reopened: (r) => `Tugon ${r.ref}: Your report was reopened.`,
    tanod: (r) => `Tugon ${r.ref}: A tanod is on the way.`,
    hearing: (r) => `Tugon ${r.ref}: ${lastText(r)}`,
  },
};

/** In-app notice for account holders, plus an SMS for anyone who opted in (residents or walk-in reporters). */
export function notify(db: DB, req: ServiceRequest, type: NotificationType) {
  const resident = req.residentId ? db.residents.find((r) => r.id === req.residentId) : null;
  if (resident) db.notifications.unshift({ id: newId("n"), residentId: resident.id, requestId: req.id, ref: req.ref, type, at: Date.now(), read: false });
  const to = resident ? (resident.smsUpdates ? resident.phone : null) : req.contact?.sms ? req.contact.phone : null;
  const copy = SMS_COPY[resident?.lang ?? "fil"][type];
  if (to && copy) queueSms(db, to, copy(req, db.teams.find((t) => t.id === req.team)?.name ?? "barangay"), resident ? "resident" : "reporter", req.id);
}

export function audit(db: DB, s: Staff, action: string, target?: string, detail?: string) {
  db.audit.unshift({ id: newId("a"), at: Date.now(), actorId: s.id, actorName: s.name, action, target, detail });
}

export const staffActor = (s: Staff): CaseEvent["actor"] => ({ kind: "staff", id: s.id, name: s.name });
export const residentActor = (r: Resident): CaseEvent["actor"] => ({ kind: "resident", id: r.id, name: r.name });

export async function requireStaff(db: DB) {
  return (await currentStaff(db)) ?? fail("unauthenticated", "Your staff session ended. Sign in again.");
}

export async function requireResident(db: DB) {
  return (await currentResident(db)) ?? fail("unauthenticated", "Please sign in to continue.");
}

export async function requireTanod(db: DB) {
  return (await currentTanod(db)) ?? fail("unauthenticated", "Natapos ang session mo. Mag-sign in ulit.");
}

export function cancelAssignment(req: ServiceRequest, a: FieldAssignment, actor: CaseEvent["actor"], reason: string) {
  a.status = "cancelled";
  a.closedAt = Date.now();
  a.closeReason = reason;
  addEvent(req, { type: "tanod_cancelled", vis: "internal", actor, text: reason, meta: { assignment: a.id, tanod: a.tanodId } });
}

/** Closing a case releases its tanods, so nobody keeps heading to a finished job. */
export function releaseFieldWork(db: DB, s: Staff | null, req: ServiceRequest, reason: string) {
  const actor: CaseEvent["actor"] = s ? staffActor(s) : { kind: "system", name: "Tugon" };
  for (const a of db.assignments) if (a.requestId === req.id && FIELD_STATUS[a.status].open) cancelAssignment(req, a, actor, reason);
}

/**
 * Close a case as resolved with the message the resident sees. Used by the case
 * page, incident close-out and Lupon outcomes so all three notify the same way.
 */
export function resolveCase(db: DB, s: Staff, req: ServiceRequest, outcome: string) {
  const now = Date.now();
  if (req.status === "queued") {
    req.startedAt = now;
    req.assigneeId ??= s.id;
  }
  req.status = "resolved";
  req.outcome = outcome;
  req.closedAt = now;
  addEvent(req, { type: "resolved", vis: "resident", actor: staffActor(s), text: outcome });
  notify(db, req, "resolved");
  releaseFieldWork(db, s, req, "Case resolved");
}

/** Resolve the staff caller, then re-check the policy against the latest committed state. */
export async function staffCase(id: string, action: CaseAction, fn: (db: DB, s: Staff, req: ServiceRequest) => void) {
  const s = await requireStaff(readDb());
  return mutate((db) => {
    const req = findReq(db, id);
    if (!can(s, action, req)) fail("forbidden", "You don't have permission for that action on this case.");
    fn(db, s, req);
    return { rev: db.rev + 1 };
  });
}

export function parseLocation(input: unknown): LocationInfo | null {
  if (!input || typeof input !== "object") return null;
  const l = input as Partial<LocationInfo>;
  if (l.method === "landmark") {
    const lm = landmarkById(l.landmarkId) ?? fail("invalid", "Choose a landmark from the list.", { field: "location" });
    return { method: "landmark", purok: lm.purok, landmarkId: lm.id, lat: lm.lat, lon: lm.lon };
  }
  if (l.method === "purok") {
    if (!l.purok || !/^P[1-5]$/.test(l.purok)) fail("invalid", "Choose a purok.", { field: "location" });
    return { method: "purok", purok: l.purok!, landmarkId: null, lat: null, lon: null };
  }
  if (l.method === "pin" || l.method === "device") {
    const lat = Number(l.lat);
    const lon = Number(l.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBounds(lat, lon)) fail("invalid", "That point is outside the barangay. Move the pin inside the boundary.", { field: "location" });
    return { method: l.method, purok: purokAt(lat, lon), landmarkId: null, lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
  }
  return null;
}

/** Accept only real JPEG bytes (magic-number sniffing), re-encoded client-side to strip EXIF. */
export function parsePhoto(dataUrl: unknown) {
  if (dataUrl == null || dataUrl === "") return null;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/jpeg;base64,")) fail("invalid", "Photos must be JPEG images.", { field: "photo" });
  const bytes = Buffer.from((dataUrl as string).slice(23), "base64");
  if (bytes.length > 600_000) fail("invalid", "That photo is too large. Try a smaller one.", { field: "photo" });
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) fail("invalid", "That file isn't a valid image.", { field: "photo" });
  return bytes;
}

export function createRequest(
  db: DB,
  input: {
    text: string;
    residentId: string | null;
    contact: ServiceRequest["contact"];
    channel: Channel;
    residentCategory: Category | null;
    dangerNow: boolean;
    location: LocationInfo | null;
    idemKey: string | null;
  },
) {
  const now = Date.now();
  db.seq += 1;
  const req: ServiceRequest = {
    id: newId("q"),
    ref: refFor(db.seq, now),
    ...input,
    hasPhoto: false,
    createdAt: now,
    updatedAt: now,
    status: "received",
    prediction: suggest(input.text),
    triage: null,
    team: null,
    assigneeId: null,
    restricted: false,
    duplicateOf: null,
    referral: null,
    outcome: null,
    outcomePhoto: false,
    firstActionAt: null,
    startedAt: null,
    closedAt: null,
    followUp: false,
    events: [],
    idemKey: input.idemKey,
    incidentId: null,
    anonymizedAt: null,
  };
  db.requests.push(req);
  return req;
}

/**
 * Strip everything that identifies a person but keep what statistics need
 * (category, urgency, timing, purok). Photos are deleted from disk.
 */
export function anonymizeRequest(db: DB, req: ServiceRequest, note: string) {
  if (req.hasPhoto) deletePhoto(req.id);
  if (req.outcomePhoto) deletePhoto(`o_${req.id}`);
  for (const a of db.assignments) {
    if (a.requestId !== req.id) continue;
    if (a.hasPhoto) deletePhoto(a.id);
    a.report = a.report ? "[anonymized]" : null;
    a.instructions = null;
    a.hasPhoto = false;
  }
  req.text = `[${note}]`;
  req.residentId = null;
  req.contact = null;
  req.outcome = req.outcome ? "[anonymized]" : null;
  req.hasPhoto = false;
  req.outcomePhoto = false;
  req.location = req.location?.purok ? { method: "purok", purok: req.location.purok, landmarkId: null, lat: null, lon: null } : null;
  req.prediction = { ...req.prediction, evidence: [] };
  req.events = req.events.map(({ text: _text, ...e }) => (e.actor.kind === "resident" ? { ...e, actor: { kind: "resident", name: "Resident" } } : e));
  req.anonymizedAt = Date.now();
}
