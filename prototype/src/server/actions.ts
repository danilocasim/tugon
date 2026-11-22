"use server";

/**
 * Resident, desk and tanod mutations. Each action resolves the caller from the
 * session cookie, checks the central policy, validates input, and commits
 * atomically. Failures return a typed result instead of throwing so the UI can
 * show a precise message and keep the user's input. Shared helpers live in
 * ./core; incidents, Lupon and privacy have their own action modules.
 */
import {
  CATEGORIES,
  CATEGORY,
  CATEGORY_TEAM,
  FIELD_RESULTS,
  FIELD_STATUS,
  SHIFTS,
  URGENCIES,
  type Category,
  type DB,
  type FieldAssignment,
  type FieldResult,
  type Lang,
  type LocationInfo,
  type Resident,
  type Role,
  type ServiceRequest,
  type Shift,
  type Staff,
  type Urgency,
} from "@/lib/domain";
import { addDays, isDate, manilaDate, normalizeMobile } from "@/lib/duty";
import { DAY } from "@/lib/format";
import { PUROK_NAME, placeLabel } from "@/lib/geo";
import { can, canAccess, canManageTanods, type CaseAction } from "@/lib/policy";
import { rankQueue } from "@/lib/priority";
import {
  DEMO_CODE,
  addEvent,
  audit,
  cancelAssignment,
  cleanText,
  createRequest,
  fail,
  findReq,
  newId,
  notify,
  parseLocation,
  parsePhoto,
  releaseFieldWork,
  requireResident,
  requireStaff,
  requireTanod,
  resolveCase,
  residentActor,
  run,
  staffActor,
  staffCase,
  type Result,
} from "./core";
import { mutate, readDb, readPhoto, resetDb, savePhoto } from "./db";
import { clearSession, setSession } from "./session";
import { queueSms } from "./sms";

export type { Result };

/* ====================== Resident ====================== */

export async function signInResident(input: { email: string; code: string }) {
  return run(async () => {
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) fail("invalid", "Enter a valid email address.", { field: "email" });
    if (input.code !== DEMO_CODE) fail("invalid", "That code doesn't match. Check the latest email and try again.", { field: "code" });
    const resident = readDb().residents.find((r) => r.email === email);
    if (!resident) return { known: false as const };
    await setSession("resident", resident.id);
    return { known: true as const };
  });
}

export async function createResidentAccount(input: { email: string; code: string; name: string; purok: string; lang: Lang; consent: boolean }) {
  return run(async () => {
    const email = String(input.email ?? "").trim().toLowerCase();
    if (input.code !== DEMO_CODE) fail("invalid", "Verification code expired. Start again.", { field: "code" });
    const name = cleanText(input.name, 2, 60, "Name");
    if (!/^P[1-5]$/.test(input.purok)) fail("invalid", "Choose your purok.", { field: "purok" });
    if (!input.consent) fail("invalid", "Please confirm you've read the privacy notice.", { field: "consent" });
    const id = mutate((db) => {
      if (db.residents.some((r) => r.email === email)) fail("conflict", "An account with this email already exists. Sign in instead.");
      const resident: Resident = { id: newId("r"), name, email, purok: input.purok, lang: input.lang === "en" ? "en" : "fil", emailUpdates: true, phone: null, smsUpdates: false };
      db.residents.push(resident);
      return resident.id;
    });
    await setSession("resident", id);
    return null;
  });
}

export async function signOutResident() {
  return run(async () => {
    await clearSession("resident");
    return null;
  });
}

export async function submitReport(input: {
  text: string;
  residentCategory: Category | null;
  dangerNow: boolean;
  location: LocationInfo | null;
  photo: string | null;
  idemKey: string;
}) {
  return run(async () => {
    const resident = await requireResident(readDb());
    const text = cleanText(input.text, 10, 1000, "Description");
    const residentCategory = input.residentCategory && CATEGORIES.includes(input.residentCategory) ? input.residentCategory : null;
    const location = parseLocation(input.location);
    const photo = parsePhoto(input.photo);
    if (!/^[a-z0-9-]{8,64}$/i.test(input.idemKey)) fail("invalid", "Missing submission key.");

    return mutate((db) => {
      // Idempotency: a retry after a lost response returns the original receipt.
      const existing = db.idem[input.idemKey];
      if (existing) {
        const prior = findReq(db, existing);
        return { id: prior.id, ref: prior.ref, replayed: true };
      }
      const req = createRequest(db, {
        text,
        residentId: resident.id,
        contact: null,
        channel: "online",
        residentCategory,
        dangerNow: !!input.dangerNow,
        location,
        idemKey: input.idemKey,
      });
      if (photo) {
        savePhoto(req.id, photo);
        req.hasPhoto = true;
      }
      addEvent(req, { type: "submitted", vis: "resident", actor: residentActor(resident) }, req.createdAt);
      db.idem[input.idemKey] = req.id;
      return { id: req.id, ref: req.ref, replayed: false };
    });
  });
}

async function residentCase(id: string, fn: (db: DB, me: Resident, req: ServiceRequest) => void) {
  const me = await requireResident(readDb());
  return mutate((db) => {
    const req = findReq(db, id);
    if (req.residentId !== me.id) fail("forbidden", "This request belongs to another account.");
    fn(db, me, req);
    return null;
  });
}

export async function replyToRequest(input: { id: string; text: string }) {
  return run(() =>
    residentCase(input.id, (_db, me, req) => {
      if (req.status !== "needs_info") fail("conflict", "The barangay is no longer waiting for details on this request.");
      addEvent(req, { type: "resident_reply", vis: "resident", actor: residentActor(me), text: cleanText(input.text, 3, 800, "Reply") });
      req.status = "review";
    }),
  );
}

export async function withdrawRequest(input: { id: string }) {
  return run(() =>
    residentCase(input.id, (db, me, req) => {
      if (!["received", "review", "needs_info", "queued"].includes(req.status)) fail("conflict", "Work has already started, so this request can't be withdrawn. Message the barangay instead.");
      req.status = "withdrawn";
      req.closedAt = Date.now();
      addEvent(req, { type: "withdrawn", vis: "resident", actor: residentActor(me) });
      releaseFieldWork(db, null, req, "Resident withdrew the request");
    }),
  );
}

export async function requestFollowUp(input: { id: string; text: string }) {
  return run(() =>
    residentCase(input.id, (_db, me, req) => {
      if (req.status !== "resolved" || !req.closedAt || Date.now() - req.closedAt > 14 * DAY) fail("conflict", "Follow-ups are available for 14 days after a request is resolved.");
      addEvent(req, { type: "followup_requested", vis: "resident", actor: residentActor(me), text: cleanText(input.text, 5, 800, "Follow-up") });
      req.status = "review";
      req.followUp = true;
      req.closedAt = null;
    }),
  );
}

export async function markNotificationsRead() {
  return run(async () => {
    const me = await requireResident(readDb());
    mutate((db) => {
      for (const n of db.notifications) if (n.residentId === me.id) n.read = true;
    });
    return null;
  });
}

export async function updateResidentPrefs(input: { lang?: Lang; emailUpdates?: boolean; phone?: string | null; smsUpdates?: boolean }) {
  return run(async () => {
    const me = await requireResident(readDb());
    const phone = input.phone === undefined ? undefined : input.phone === null || input.phone === "" ? null : (normalizeMobile(input.phone) ?? fail("invalid", "Enter a mobile number like 0917 123 4567.", { field: "phone" }));
    mutate((db) => {
      const r = db.residents.find((x) => x.id === me.id)!;
      if (input.lang === "fil" || input.lang === "en") r.lang = input.lang;
      if (typeof input.emailUpdates === "boolean") r.emailUpdates = input.emailUpdates;
      if (phone !== undefined) r.phone = phone;
      if (typeof input.smsUpdates === "boolean") r.smsUpdates = input.smsUpdates;
      // Texts need a number; dropping the number turns them off.
      if (!r.phone) r.smsUpdates = false;
    });
    return null;
  });
}

/* ====================== Staff ====================== */

export async function signInStaff(input: { staffId: string; code: string }) {
  return run(async () => {
    if (input.code !== DEMO_CODE) fail("invalid", "Incorrect authenticator code.", { field: "code" });
    const s = readDb().staff.find((x) => x.id === input.staffId && x.active) ?? fail("forbidden", "This account is inactive.");
    if (s.role === "tanod") fail("forbidden", "Tanod accounts sign in to the Tanod app at /tanod.");
    await setSession("staff", s.id);
    mutate((db) => audit(db, s, "signed_in"));
    return { role: s.role };
  });
}

/** Prototype-only persona switch, so reviewers can see each role's permissions. */
export async function switchStaffPersona(input: { staffId: string }) {
  return run(async () => {
    const s = readDb().staff.find((x) => x.id === input.staffId && x.active && x.role !== "tanod") ?? fail("forbidden", "This account is inactive.");
    await setSession("staff", s.id);
    return { role: s.role };
  });
}

export async function signOutStaff() {
  return run(async () => {
    await clearSession("staff");
    return null;
  });
}

export async function startReview(input: { id: string }) {
  return run(() =>
    staffCase(input.id, "triage", (db, s, req) => {
      if (req.status !== "received") return;
      req.status = "review";
      req.firstActionAt ??= Date.now();
      addEvent(req, { type: "review_started", vis: "resident", actor: staffActor(s) });
      notify(db, req, "review_started");
    }),
  );
}

export async function triageRequest(input: { id: string; category: Category; urgency: Urgency; restricted: boolean; note?: string }) {
  return run(() =>
    staffCase(input.id, "triage", (db, s, req) => {
      if (!CATEGORIES.includes(input.category) || !URGENCIES.includes(input.urgency)) fail("invalid", "Pick a category and urgency.");
      const now = Date.now();
      req.triage = {
        category: input.category,
        urgency: input.urgency,
        by: s.id,
        at: now,
        correctedCategory: input.category !== req.prediction.category,
        correctedUrgency: input.urgency !== req.prediction.urgency,
      };
      req.team = CATEGORY_TEAM[input.category];
      req.restricted = !!input.restricted;
      req.status = "queued";
      req.followUp = false;
      req.firstActionAt ??= now;
      addEvent(req, { type: "triaged", vis: "resident", actor: staffActor(s), meta: { category: input.category, urgency: input.urgency, team: req.team } });
      if (input.note?.trim()) addEvent(req, { type: "note", vis: "internal", actor: staffActor(s), text: cleanText(input.note, 1, 800, "Note") });
      notify(db, req, "queued");
      audit(db, s, "triaged", req.ref, `${CATEGORY[input.category].en} · ${input.urgency}${req.triage.correctedCategory || req.triage.correctedUrgency ? " · corrected model" : ""}${req.restricted ? " · restricted" : ""}`);
    }),
  );
}

export async function askForInfo(input: { id: string; message: string }) {
  return run(() =>
    staffCase(input.id, "triage", (db, s, req) => {
      req.status = "needs_info";
      req.firstActionAt ??= Date.now();
      addEvent(req, { type: "info_requested", vis: "resident", actor: staffActor(s), text: cleanText(input.message, 8, 800, "Message") });
      notify(db, req, "info_requested");
      audit(db, s, "info_requested", req.ref);
    }),
  );
}

export async function referRequest(input: { id: string; office: string; message: string }) {
  return run(async () => {
    const s = await requireStaff(readDb());
    return mutate((db) => {
      const req = findReq(db, input.id);
      if (!can(s, "triage", req) && !can(s, "work", req)) fail("forbidden", "You can't refer this case.");
      const office = db.settings.referrals.find((r) => r.id === input.office) ?? fail("invalid", "Choose a referral office.");
      req.status = "referred";
      req.referral = { office: office.name };
      req.closedAt = Date.now();
      req.firstActionAt ??= req.closedAt;
      addEvent(req, { type: "referred", vis: "resident", actor: staffActor(s), text: cleanText(input.message, 8, 800, "Message to resident"), meta: { office: office.name } });
      notify(db, req, "referred");
      audit(db, s, "referred", req.ref, office.name);
      releaseFieldWork(db, s, req, `Referred to ${office.name}`);
      return null;
    });
  });
}

export async function markDuplicate(input: { id: string; originalId: string }) {
  return run(() =>
    staffCase(input.id, "triage", (db, s, req) => {
      const original = findReq(db, input.originalId);
      if (original.id === req.id) fail("invalid", "A case can't duplicate itself.");
      req.status = "duplicate";
      req.duplicateOf = original.id;
      req.closedAt = Date.now();
      req.firstActionAt ??= req.closedAt;
      addEvent(req, {
        type: "duplicate",
        vis: "resident",
        actor: staffActor(s),
        text: `Kapareho ng naunang ulat ${original.ref}. Doon namin ibabalita ang mga update.`,
        meta: { original: original.id, originalRef: original.ref },
      });
      addEvent(original, { type: "note", vis: "internal", actor: staffActor(s), text: `Linked duplicate ${req.ref}.` });
      notify(db, req, "duplicate");
      audit(db, s, "marked_duplicate", req.ref, `of ${original.ref}`);
      releaseFieldWork(db, s, req, `Duplicate of ${original.ref}`);
    }),
  );
}

export async function claimRequest(input: { id: string; reason?: string }) {
  return run(async () => {
    const s = await requireStaff(readDb());
    return mutate((db) => {
      const req = findReq(db, input.id);
      if (req.assigneeId && req.assigneeId !== s.id) {
        const holder = db.staff.find((x) => x.id === req.assigneeId);
        fail("conflict", `${holder?.name ?? "Someone"} claimed this case a moment ago.`);
      }
      if (!can(s, "claim", req)) fail("forbidden", "This case isn't in your team's queue.");
      const ahead = rankQueue(db.requests.filter((r) => r.status === "queued" && !r.assigneeId && r.team === req.team));
      const position = ahead.findIndex((x) => x.req.id === req.id);
      const reason = input.reason?.trim();
      if (position > 0 && !reason) fail("reason_required", "Higher-priority cases are waiting.", { skipped: position });
      req.assigneeId = s.id;
      addEvent(req, { type: "assigned", vis: "internal", actor: staffActor(s), text: reason, meta: { assignee: s.id, via: "claim", skipped: position } });
      audit(db, s, "claimed", req.ref, position > 0 ? `skipped ${position} higher-priority · ${reason}` : undefined);
      return null;
    });
  });
}

export async function assignRequest(input: { id: string; assigneeId: string; reason: string }) {
  return run(() =>
    staffCase(input.id, "assign", (db, s, req) => {
      const to = db.staff.find((x) => x.id === input.assigneeId && x.active && (x.role === "handler" || x.role === "supervisor")) ?? fail("invalid", "Choose an active handler.");
      const reassign = !!req.assigneeId && req.assigneeId !== to.id;
      const crossTeam = to.role === "handler" && to.team !== req.team;
      const reason = input.reason?.trim();
      if ((reassign || crossTeam) && !reason) fail("reason_required", reassign ? "Reassigning needs a reason for the audit log." : "Assigning outside the routed team needs a reason.");
      req.assigneeId = to.id;
      addEvent(req, { type: "assigned", vis: "internal", actor: staffActor(s), text: reason, meta: { assignee: to.id, via: reassign ? "reassign" : "assign" } });
      audit(db, s, reassign ? "reassigned" : "assigned", req.ref, `→ ${to.name}${reason ? ` · ${reason}` : ""}`);
    }),
  );
}

export async function startWork(input: { id: string }) {
  return run(() =>
    staffCase(input.id, "work", (db, s, req) => {
      if (req.status !== "queued") fail("conflict", "This case is already in progress or closed.");
      if (!req.assigneeId) req.assigneeId = s.id;
      req.status = "in_progress";
      req.startedAt = Date.now();
      addEvent(req, { type: "started", vis: "resident", actor: staffActor(s) });
      notify(db, req, "started");
      audit(db, s, "started", req.ref);
    }),
  );
}

export async function postUpdate(input: { id: string; text: string; vis: "resident" | "internal" }) {
  const action: CaseAction = input.vis === "resident" ? "work" : "note";
  return run(async () => {
    const s = await requireStaff(readDb());
    return mutate((db) => {
      const req = findReq(db, input.id);
      const allowed = input.vis === "resident" ? can(s, action, req) || can(s, "triage", req) : can(s, "note", req);
      if (!allowed) fail("forbidden", input.vis === "resident" ? "Only the assigned handler or a supervisor can message the resident here." : "You can't add notes to this case.");
      const text = cleanText(input.text, 2, 1200, input.vis === "resident" ? "Update" : "Note");
      addEvent(req, { type: input.vis === "resident" ? "update" : "note", vis: input.vis, actor: staffActor(s), text });
      if (input.vis === "resident") notify(db, req, "update");
      return null;
    });
  });
}

/** The outcome may carry a proof photo: a fresh upload, or the photo from a tanod's field report. */
export async function resolveRequest(input: { id: string; outcome: string; photo?: string | null; fieldPhotoFrom?: string | null }) {
  return run(() =>
    staffCase(input.id, "work", (db, s, req) => {
      if (req.status !== "in_progress") fail("conflict", "Start work before recording an outcome.");
      const outcome = cleanText(input.outcome, 10, 1000, "Outcome");
      const fromField = input.fieldPhotoFrom ? db.assignments.find((a) => a.id === input.fieldPhotoFrom && a.requestId === req.id && a.hasPhoto) : null;
      if (input.fieldPhotoFrom && !fromField) fail("invalid", "That field photo is no longer available.");
      const proof = parsePhoto(input.photo) ?? (fromField ? readPhoto(fromField.id) : null);
      if (proof) {
        savePhoto(`o_${req.id}`, proof);
        req.outcomePhoto = true;
      }
      resolveCase(db, s, req, outcome);
      audit(db, s, "resolved", req.ref, proof ? "with photo" : undefined);
    }),
  );
}

export async function reopenRequest(input: { id: string; reason: string }) {
  return run(() =>
    staffCase(input.id, "reopen", (db, s, req) => {
      const reason = cleanText(input.reason, 5, 600, "Reason");
      req.status = req.assigneeId ? "in_progress" : "queued";
      req.closedAt = null;
      addEvent(req, { type: "reopened", vis: "resident", actor: staffActor(s) });
      addEvent(req, { type: "note", vis: "internal", actor: staffActor(s), text: `Reopened: ${reason}` });
      notify(db, req, "reopened");
      audit(db, s, "reopened", req.ref, reason);
    }),
  );
}

export async function changeTriage(input: { id: string; category: Category; urgency: Urgency; reason: string }) {
  return run(() =>
    staffCase(input.id, "retriage", (db, s, req) => {
      if (!CATEGORIES.includes(input.category) || !URGENCIES.includes(input.urgency)) fail("invalid", "Pick a category and urgency.");
      const reason = cleanText(input.reason, 5, 600, "Reason");
      const before = `${req.triage?.category} · ${req.triage?.urgency}`;
      req.triage = { ...req.triage!, category: input.category, urgency: input.urgency };
      const team = CATEGORY_TEAM[input.category];
      if (team !== req.team) {
        req.team = team;
        const assignee = db.staff.find((x) => x.id === req.assigneeId);
        if (assignee?.role === "handler" && assignee.team !== team) {
          req.assigneeId = null;
          req.status = "queued";
        }
      }
      addEvent(req, { type: "triage_changed", vis: "internal", actor: staffActor(s), text: reason, meta: { from: before, to: `${input.category} · ${input.urgency}` } });
      audit(db, s, "triage_changed", req.ref, `${before} → ${input.category} · ${input.urgency} · ${reason}`);
    }),
  );
}

export async function setRestricted(input: { id: string; restricted: boolean; reason: string }) {
  return run(async () => {
    const s = await requireStaff(readDb());
    if (s.role !== "supervisor" && s.role !== "intake") fail("forbidden", "Only intake or supervisors can change case restrictions.");
    return staffCase(input.id, "view", (db, actor, req) => {
      req.restricted = input.restricted;
      addEvent(req, { type: "note", vis: "internal", actor: staffActor(actor), text: `${input.restricted ? "Restricted" : "Unrestricted"}: ${cleanText(input.reason, 5, 400, "Reason")}` });
      audit(db, actor, input.restricted ? "restricted" : "unrestricted", req.ref, input.reason);
    });
  });
}

export async function createAssistedRequest(input: {
  channel: "walkin" | "phone";
  name: string;
  phone: string;
  sms: boolean;
  text: string;
  location: LocationInfo | null;
  dangerNow: boolean;
}) {
  return run(async () => {
    const s = await requireStaff(readDb());
    if (!canAccess(s, "intake")) fail("forbidden", "Only intake staff can record walk-in or phone requests.");
    const text = cleanText(input.text, 10, 1000, "Description");
    const name = input.name?.trim() ? cleanText(input.name, 2, 60, "Name") : input.channel === "phone" ? "Caller" : "Walk-in resident";
    const phone = input.phone?.trim() ? (normalizeMobile(input.phone) ?? fail("invalid", "Enter a mobile number like 0917 123 4567.", { field: "phone" })) : null;
    const location = parseLocation(input.location);
    return mutate((db) => {
      const req = createRequest(db, {
        text,
        residentId: null,
        contact: { name, ...(phone ? { phone, sms: !!input.sms } : {}) },
        channel: input.channel,
        residentCategory: null,
        dangerNow: !!input.dangerNow,
        location,
        idemKey: null,
      });
      addEvent(req, { type: "submitted", vis: "internal", actor: staffActor(s), meta: { assisted: input.channel } }, req.createdAt);
      if (phone && input.sms) queueSms(db, phone, `Tugon: Natanggap ng ${db.settings.barangay} ang ulat mo. Ref ${req.ref}. Itetext ka namin kapag may update.`, "reporter", req.id);
      audit(db, s, "recorded_assisted", req.ref, input.channel);
      return { id: req.id, ref: req.ref };
    });
  });
}

/* ====================== Tanods: roster and field assignments ====================== */

async function requireTanodManager(db: DB) {
  const s = await requireStaff(db);
  if (!canManageTanods(s)) fail("forbidden", "Only supervisors and administrators manage tanods and the duty roster.");
  return s;
}

const activeTanod = (db: DB, id: string) => db.staff.find((x) => x.id === id && x.role === "tanod" && x.active) ?? fail("invalid", "Choose an active tanod.");

/** Tanods sign in with their mobile number (SMS code in production), so the account is usable immediately. */
export async function addTanod(input: { name: string; phone: string; zone: string | null }) {
  return run(async () => {
    const s = await requireTanodManager(readDb());
    const name = cleanText(input.name, 2, 60, "Name");
    const phone = normalizeMobile(input.phone) ?? fail("invalid", "Enter a mobile number like 0917 123 4567.", { field: "phone" });
    const zone = input.zone && PUROK_NAME[input.zone] ? input.zone : null;
    return mutate((db) => {
      if (db.staff.some((x) => x.phone === phone)) fail("conflict", "That mobile number already belongs to an account.", { field: "phone" });
      const id = newId("s");
      db.staff.push({ id, name, title: "Barangay Tanod", role: "tanod", team: "t_peace", email: "", active: true, phone, zone });
      audit(db, s, "tanod_added", name, zone ? PUROK_NAME[zone] : undefined);
      return { id };
    });
  });
}

export async function setDuty(input: { tanodId: string; date: string; shift: Shift; on: boolean }) {
  return run(async () => {
    const s = await requireTanodManager(readDb());
    if (!isDate(input.date) || !SHIFTS.includes(input.shift)) fail("invalid", "Choose a date and shift.");
    const today = manilaDate(Date.now());
    // Yesterday stays editable because its night shift runs until this morning.
    if (input.date < addDays(today, -1) || input.date > addDays(today, 60)) fail("invalid", "The roster can be changed from yesterday up to 60 days ahead.");
    return mutate((db) => {
      const t = activeTanod(db, input.tanodId);
      const id = `d_${input.date}_${input.shift}_${t.id}`;
      const has = db.roster.some((d) => d.id === id);
      if (input.on && !has) db.roster.push({ id, tanodId: t.id, date: input.date, shift: input.shift });
      if (!input.on && has) db.roster = db.roster.filter((d) => d.id !== id);
      if (input.on !== has) audit(db, s, input.on ? "duty_added" : "duty_removed", t.name, `${input.date} · ${input.shift}`);
      return null;
    });
  });
}

/** Rosters mostly repeat: copy last week's shifts into an empty or partly filled week. */
export async function copyPreviousWeek(input: { weekStart: string }) {
  return run(async () => {
    const s = await requireTanodManager(readDb());
    if (!isDate(input.weekStart)) fail("invalid", "Choose a week.");
    const today = manilaDate(Date.now());
    return mutate((db) => {
      let added = 0;
      for (let i = 0; i < 7; i++) {
        const to = addDays(input.weekStart, i);
        if (to < today) continue;
        const from = addDays(to, -7);
        for (const d of db.roster.filter((x) => x.date === from)) {
          const id = `d_${to}_${d.shift}_${d.tanodId}`;
          if (db.roster.some((x) => x.id === id) || !db.staff.some((x) => x.id === d.tanodId && x.active)) continue;
          db.roster.push({ id, tanodId: d.tanodId, date: to, shift: d.shift });
          added += 1;
        }
      }
      audit(db, s, "roster_copied", `week of ${input.weekStart}`, `${added} shifts`);
      return { added };
    });
  });
}

export async function assignTanod(input: { id: string; tanodId: string; instructions?: string }) {
  return run(() =>
    staffCase(input.id, "dispatch", (db, s, req) => {
      const t = activeTanod(db, input.tanodId);
      if (db.assignments.some((a) => a.requestId === req.id && a.tanodId === t.id && FIELD_STATUS[a.status].open)) fail("conflict", `${t.name} is already assigned to this case.`);
      const instructions = input.instructions?.trim() ? cleanText(input.instructions, 3, 500, "Instructions") : null;
      const a: FieldAssignment = {
        id: newId("fa"),
        requestId: req.id,
        tanodId: t.id,
        assignedBy: s.id,
        instructions,
        status: "assigned",
        assignedAt: Date.now(),
        acceptedAt: null,
        arrivedAt: null,
        closedAt: null,
        result: null,
        report: null,
        hasPhoto: false,
        closeReason: null,
      };
      db.assignments.push(a);
      addEvent(req, { type: "tanod_assigned", vis: "internal", actor: staffActor(s), text: instructions ?? undefined, meta: { assignment: a.id, tanod: t.id } });
      // The app may be closed; a text makes sure the tanod knows.
      queueSms(db, t.phone, `Tugon Tanod: May bagong assignment ka, ${req.ref}${placeLabel(req, "fil") ? ` sa ${placeLabel(req, "fil")}` : ""}. Buksan ang Tanod app para tanggapin.`, "tanod", req.id);
      audit(db, s, "tanod_assigned", req.ref, t.name);
    }),
  );
}

export async function cancelTanodAssignment(input: { assignmentId: string; reason: string }) {
  return run(async () => {
    const s = await requireStaff(readDb());
    const reason = cleanText(input.reason, 3, 200, "Reason");
    return mutate((db) => {
      const a = db.assignments.find((x) => x.id === input.assignmentId) ?? fail("not_found", "That assignment no longer exists.");
      const req = findReq(db, a.requestId);
      if (!can(s, "dispatch", req)) fail("forbidden", "You can't change the field team on this case.");
      if (!FIELD_STATUS[a.status].open) fail("conflict", "This assignment is already closed.");
      cancelAssignment(req, a, staffActor(s), reason);
      audit(db, s, "tanod_cancelled", req.ref, reason);
      return null;
    });
  });
}

/* ---------- Tanod app ---------- */

export async function signInTanod(input: { staffId: string; code: string }) {
  return run(async () => {
    if (input.code !== DEMO_CODE) fail("invalid", "Mali ang code. Subukan ulit.", { field: "code" });
    const s = readDb().staff.find((x) => x.id === input.staffId && x.active && x.role === "tanod") ?? fail("forbidden", "Hindi aktibo ang account na ito.");
    await setSession("tanod", s.id);
    mutate((db) => audit(db, s, "signed_in", undefined, "Tanod app"));
    return null;
  });
}

/** Prototype-only, like the desk persona switch. */
export async function switchTanodPersona(input: { staffId: string }) {
  return run(async () => {
    const s = readDb().staff.find((x) => x.id === input.staffId && x.active && x.role === "tanod") ?? fail("forbidden", "Hindi aktibo ang account na ito.");
    await setSession("tanod", s.id);
    return null;
  });
}

export async function signOutTanod() {
  return run(async () => {
    await clearSession("tanod");
    return null;
  });
}

function myAssignment(db: DB, me: Staff, id: string) {
  return db.assignments.find((x) => x.id === id && x.tanodId === me.id) ?? fail("not_found", "Wala na ang assignment na ito.");
}

export async function respondToAssignment(input: { id: string; action: "accept" | "arrive" | "decline"; reason?: string }) {
  return run(async () => {
    const me = await requireTanod(readDb());
    if (!["accept", "arrive", "decline"].includes(input.action)) fail("invalid", "Unknown action.");
    return mutate((db) => {
      const a = myAssignment(db, me, input.id);
      const req = findReq(db, a.requestId);
      const now = Date.now();
      const meta = { assignment: a.id, tanod: me.id };
      if (input.action === "accept") {
        if (a.status !== "assigned") fail("conflict", "Natanggap na o sarado na ang assignment na ito.");
        a.status = "accepted";
        a.acceptedAt = now;
        addEvent(req, { type: "tanod_accepted", vis: "resident", actor: staffActor(me), meta });
        notify(db, req, "tanod");
      } else if (input.action === "arrive") {
        if (a.status !== "accepted") fail("conflict", "Tanggapin muna ang assignment.");
        a.status = "on_scene";
        a.arrivedAt = now;
        addEvent(req, { type: "tanod_arrived", vis: "resident", actor: staffActor(me), meta });
      } else {
        if (a.status !== "assigned") fail("conflict", "Natanggap mo na ito. Mag-ulat na lang kung hindi natuloy.");
        const reason = cleanText(input.reason, 3, 200, "Reason");
        a.status = "declined";
        a.closedAt = now;
        a.closeReason = reason;
        addEvent(req, { type: "tanod_declined", vis: "internal", actor: staffActor(me), text: reason, meta });
      }
      audit(db, me, `tanod_${input.action}`, req.ref);
      return null;
    });
  });
}

export async function fileFieldReport(input: { id: string; result: FieldResult; report: string; photo?: string | null }) {
  return run(async () => {
    const me = await requireTanod(readDb());
    if (!FIELD_RESULTS.includes(input.result)) fail("invalid", "Pumili ng resulta.", { field: "result" });
    const report = cleanText(input.report, 10, 1000, "Report");
    const photo = parsePhoto(input.photo);
    return mutate((db) => {
      const a = myAssignment(db, me, input.id);
      if (a.status !== "accepted" && a.status !== "on_scene") fail("conflict", "Tanggapin muna ang assignment bago mag-ulat.");
      const req = findReq(db, a.requestId);
      const now = Date.now();
      if (photo) savePhoto(a.id, photo);
      a.status = "done";
      a.closedAt = now;
      a.arrivedAt ??= now;
      a.result = input.result;
      a.report = report;
      a.hasPhoto = !!photo;
      addEvent(req, { type: "field_report", vis: "internal", actor: staffActor(me), text: report, meta: { assignment: a.id, tanod: me.id, result: input.result, photo: !!photo } });
      audit(db, me, "field_report", req.ref, input.result);
      return null;
    });
  });
}

/* ====================== Administration ====================== */

async function requireAdmin(db: DB) {
  const s = await requireStaff(db);
  if (!canAccess(s, "admin")) fail("forbidden", "Administration is limited to administrators.");
  return s;
}

export async function inviteStaff(input: { name: string; email: string; role: Role; team: string | null }) {
  return run(async () => {
    const s = await requireAdmin(readDb());
    const name = cleanText(input.name, 2, 60, "Name");
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) fail("invalid", "Enter a valid email.", { field: "email" });
    if (!["intake", "handler", "supervisor", "admin"].includes(input.role)) fail("invalid", "Choose a role.");
    if (input.role === "handler" && !input.team) fail("invalid", "Handlers need a team.", { field: "team" });
    mutate((db) => {
      if (db.staff.some((x) => x.email === email)) fail("conflict", "That email already has an account.");
      db.staff.push({ id: newId("s"), name, title: "Invited", role: input.role, team: input.role === "handler" ? input.team : null, email, active: true, invited: true });
      audit(db, s, "staff_invited", email, input.role);
    });
    return null;
  });
}

/** Administrators manage every account; supervisors may also activate or deactivate tanods. */
export async function setStaffActive(input: { id: string; active: boolean }) {
  return run(async () => {
    const s = await requireStaff(readDb());
    if (input.id === s.id) fail("invalid", "You can't deactivate your own account.");
    mutate((db) => {
      const target = db.staff.find((x) => x.id === input.id) ?? fail("not_found", "Account not found.");
      if (!canAccess(s, "admin") && !(target.role === "tanod" && canManageTanods(s))) fail("forbidden", "Only administrators can change this account.");
      target.active = input.active;
      if (!input.active) {
        for (const r of db.requests) if (r.assigneeId === target.id && (r.status === "queued" || r.status === "in_progress")) r.assigneeId = null;
        // A deactivated tanod leaves the roster from today on and is pulled off open field work.
        const today = manilaDate(Date.now());
        db.roster = db.roster.filter((d) => d.tanodId !== target.id || d.date < today);
        for (const a of db.assignments) {
          if (a.tanodId !== target.id || !FIELD_STATUS[a.status].open) continue;
          const req = db.requests.find((r) => r.id === a.requestId);
          if (req) cancelAssignment(req, a, staffActor(s), "Tanod account deactivated");
        }
      }
      audit(db, s, input.active ? "staff_reactivated" : "staff_deactivated", target.email || target.name);
    });
    return null;
  });
}

export async function updateTargets(input: Record<Urgency, number>) {
  return run(async () => {
    const s = await requireAdmin(readDb());
    for (const u of URGENCIES) if (!(input[u] >= 1 && input[u] <= 240)) fail("invalid", "Targets must be between 1 and 240 hours.");
    if (!(input.high <= input.medium && input.medium <= input.normal)) fail("invalid", "Higher urgency needs an equal or shorter target.");
    mutate((db) => {
      const before = db.settings.targets;
      db.settings.targets = { high: input.high, medium: input.medium, normal: input.normal };
      audit(db, s, "targets_changed", undefined, `${before.high}/${before.medium}/${before.normal}h → ${input.high}/${input.medium}/${input.normal}h`);
    });
    return null;
  });
}

export async function updateHotspotParams(input: { epsM: number; minPts: number; days: number }) {
  return run(async () => {
    const s = await requireStaff(readDb());
    if (!canAccess(s, "insights")) fail("forbidden", "Only supervisors and administrators can change analysis settings.");
    if (!(input.epsM >= 30 && input.epsM <= 400 && input.minPts >= 2 && input.minPts <= 12 && [7, 14, 30].includes(input.days))) fail("invalid", "Settings out of range.");
    mutate((db) => {
      db.settings.hotspot = { epsM: Math.round(input.epsM), minPts: Math.round(input.minPts), days: input.days };
      audit(db, s, "hotspot_params_changed", undefined, `ε ${input.epsM} m · MinPts ${input.minPts} · ${input.days}d`);
    });
    return null;
  });
}

export async function addReferralContact(input: { name: string; scope: string; contact: string }) {
  return run(async () => {
    const s = await requireAdmin(readDb());
    const name = cleanText(input.name, 3, 80, "Office name");
    const scope = cleanText(input.scope, 3, 140, "Scope");
    const contact = cleanText(input.contact, 3, 60, "Contact");
    mutate((db) => {
      db.settings.referrals.push({ id: newId("ref"), name, scope, contact });
      audit(db, s, "referral_added", name);
    });
    return null;
  });
}

export async function removeReferralContact(input: { id: string }) {
  return run(async () => {
    const s = await requireAdmin(readDb());
    mutate((db) => {
      const ref = db.settings.referrals.find((r) => r.id === input.id) ?? fail("not_found", "Contact not found.");
      db.settings.referrals = db.settings.referrals.filter((r) => r.id !== input.id);
      audit(db, s, "referral_removed", ref.name);
    });
    return null;
  });
}

/* ====================== Prototype ====================== */

export async function resetDemo() {
  return run(() => {
    resetDb();
    return null;
  });
}
