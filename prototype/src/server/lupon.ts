"use server";

/**
 * Lupon Tagapamayapa docket (Katarungang Pambarangay). A peace-and-order case
 * between residents becomes a KP case: hearings are scheduled and recorded,
 * mediation moves to a Pangkat when it fails, and the case ends in an amicable
 * settlement, a certificate to file action, a dismissal, or withdrawal. The
 * linked service request is resolved with a plain-language outcome each time.
 */
import { KP_RESULT, type DB, type KpCase, type KpHearingResult } from "@/lib/domain";
import { DAY, HOUR, fmtDate } from "@/lib/format";
import { REPUDIATION_DAYS, canDismiss, canIssueCfa } from "@/lib/kp";
import { canAccess } from "@/lib/policy";
import { addEvent, audit, cleanText, fail, findReq, newId, notify, requireStaff, resolveCase, run, staffActor } from "./core";
import { mutate, readDb } from "./db";

async function requireLupon() {
  const s = await requireStaff(readDb());
  if (!canAccess(s, "lupon")) fail("forbidden", "The Lupon docket is kept by the barangay secretary, the Peace & Order desk and supervisors.");
  return s;
}

const findKp = (db: DB, id: string) => db.kp.find((k) => k.id === id) ?? fail("not_found", "That Lupon case no longer exists.");
const isOpenKp = (kp: KpCase) => kp.stage === "mediation" || kp.stage === "conciliation";

export async function fileKpCase(input: { requestId: string; complainant: string; respondent: string; respondentAddress: string; nature: string }) {
  return run(async () => {
    const s = await requireLupon();
    const complainant = cleanText(input.complainant, 2, 80, "Complainant");
    const respondent = cleanText(input.respondent, 2, 80, "Respondent");
    const respondentAddress = cleanText(input.respondentAddress, 3, 120, "Respondent's address");
    const nature = cleanText(input.nature, 10, 600, "Nature of the dispute");
    return mutate((db) => {
      const req = findReq(db, input.requestId);
      if ((req.triage?.category ?? req.prediction.category) !== "peace") fail("invalid", "Only peace-and-order cases go to the Lupon.");
      if (req.status !== "queued" && req.status !== "in_progress") fail("conflict", "Triage the case first; closed cases can't be filed.");
      if (db.kp.some((k) => k.requestId === req.id && isOpenKp(k))) fail("conflict", "This case already has an open Lupon proceeding.");
      const now = Date.now();
      const year = new Intl.DateTimeFormat("en-PH", { year: "numeric", timeZone: "Asia/Manila" }).format(now);
      const used = db.kp.filter((k) => k.number.startsWith(`KP-${year}-`)).map((k) => Number(k.number.slice(-3)));
      const kp: KpCase = {
        id: newId("kp"),
        number: `KP-${year}-${String(Math.max(0, ...used) + 1).padStart(3, "0")}`,
        requestId: req.id,
        complainant,
        respondent,
        respondentAddress,
        nature,
        filedAt: now,
        filedBy: s.id,
        stage: "mediation",
        mediationStart: now,
        conciliationStart: null,
        extended: false,
        hearings: [],
        settlement: null,
        closedAt: null,
        closeNote: null,
      };
      db.kp.unshift(kp);
      if (req.status === "queued") {
        req.status = "in_progress";
        req.startedAt = now;
        req.assigneeId ??= s.id;
        addEvent(req, { type: "started", vis: "resident", actor: staffActor(s) });
      }
      addEvent(req, {
        type: "kp_filed",
        vis: "resident",
        actor: staffActor(s),
        text: `Naisampa sa Lupon Tagapamayapa bilang ${kp.number}. Ipapatawag ng Punong Barangay ang magkabilang panig para sa pamamagitan.`,
        meta: { kp: kp.id },
      });
      notify(db, req, "update");
      audit(db, s, "kp_filed", kp.number, req.ref);
      return { id: kp.id, number: kp.number };
    });
  });
}

export async function scheduleHearing(input: { kpId: string; at: number }) {
  return run(async () => {
    const s = await requireLupon();
    const at = Number(input.at);
    const now = Date.now();
    if (!Number.isFinite(at) || at < now - HOUR || at > now + 60 * DAY) fail("invalid", "Pick a date within the next 60 days.", { field: "at" });
    return mutate((db) => {
      const kp = findKp(db, input.kpId);
      if (!isOpenKp(kp)) fail("conflict", "This Lupon case is closed.");
      const kind = kp.stage === "conciliation" ? "conciliation" : "mediation";
      kp.hearings.push({ id: newId("kh"), kind, at, summonsServed: false, result: null, notes: null, recordedAt: null });
      const req = findReq(db, kp.requestId);
      const when = fmtDate(at, "fil", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
      addEvent(req, {
        type: "kp_hearing",
        vis: "resident",
        actor: staffActor(s),
        text: `Pagdinig sa Lupon (${kind === "mediation" ? "pamamagitan" : "Pangkat"}) sa ${when}, Barangay Hall. Dumating sa oras at magdala ng anumang katibayan.`,
        meta: { kp: kp.id, at },
      });
      notify(db, req, "hearing");
      audit(db, s, "kp_hearing_set", kp.number, fmtDate(at));
      return null;
    });
  });
}

export async function markSummonsServed(input: { kpId: string; hearingId: string }) {
  return run(async () => {
    const s = await requireLupon();
    return mutate((db) => {
      const kp = findKp(db, input.kpId);
      const h = kp.hearings.find((x) => x.id === input.hearingId) ?? fail("not_found", "That hearing no longer exists.");
      h.summonsServed = true;
      audit(db, s, "kp_summons_served", kp.number);
      return null;
    });
  });
}

const RESULTS = Object.keys(KP_RESULT) as KpHearingResult[];

/** Record what happened. A failed mediation moves the case to a Pangkat; a settlement closes it. */
export async function recordHearing(input: { kpId: string; hearingId: string; result: KpHearingResult; notes: string; settlement?: string }) {
  return run(async () => {
    const s = await requireLupon();
    if (!RESULTS.includes(input.result)) fail("invalid", "Choose what happened.");
    const notes = input.notes?.trim() ? cleanText(input.notes, 3, 1000, "Notes") : null;
    const settlement = input.result === "settled" ? cleanText(input.settlement, 20, 2000, "Settlement terms") : null;
    return mutate((db) => {
      const kp = findKp(db, input.kpId);
      if (!isOpenKp(kp)) fail("conflict", "This Lupon case is closed.");
      const h = kp.hearings.find((x) => x.id === input.hearingId) ?? fail("not_found", "That hearing no longer exists.");
      if (h.result) fail("conflict", "This hearing was already recorded.");
      if (h.at > Date.now() + 2 * HOUR) fail("conflict", "Record a hearing on or after its date.");
      const req = findReq(db, kp.requestId);
      const now = Date.now();
      h.result = input.result;
      h.notes = notes;
      h.recordedAt = now;
      const moved = input.result === "failed" && kp.stage === "mediation";
      if (moved) {
        kp.stage = "conciliation";
        kp.conciliationStart = now;
      }
      addEvent(req, {
        type: "kp_recorded",
        vis: "internal",
        actor: staffActor(s),
        text: [KP_RESULT[input.result].en, moved ? "Referred to a Pangkat ng Tagapagkasundo." : null, notes].filter(Boolean).join(" · "),
        meta: { kp: kp.id, result: input.result },
      });
      if (settlement) {
        kp.stage = "settled";
        kp.settlement = { text: settlement, at: now };
        kp.closedAt = now;
        resolveCase(
          db,
          s,
          req,
          `Nagkasundo ang magkabilang panig sa Lupon (${kp.number}). May ${REPUDIATION_DAYS} araw para kontrahin ang kasunduan; pagkatapos nito, may bisa na ito gaya ng pinal na desisyon.`,
        );
      }
      audit(db, s, "kp_hearing_recorded", kp.number, KP_RESULT[input.result].en);
      return { stage: kp.stage };
    });
  });
}

export async function extendConciliation(input: { kpId: string }) {
  return run(async () => {
    const s = await requireLupon();
    return mutate((db) => {
      const kp = findKp(db, input.kpId);
      if (kp.stage !== "conciliation") fail("conflict", "Only conciliation can be extended.");
      if (kp.extended) fail("conflict", "Conciliation was already extended once.");
      kp.extended = true;
      addEvent(findReq(db, kp.requestId), { type: "kp_recorded", vis: "internal", actor: staffActor(s), text: "Pangkat extended conciliation by 15 days.", meta: { kp: kp.id } });
      audit(db, s, "kp_extended", kp.number);
      return null;
    });
  });
}

const CLOSE_COPY = {
  cfa: (kp: KpCase) =>
    `Hindi nagkasundo ang magkabilang panig sa Lupon (${kp.number}). Inilabas ang Certificate to File Action; maaari na itong dalhin sa korte o sa tamang ahensya. Kunin ang kopya sa Barangay Hall.`,
  dismissed: (kp: KpCase) => `Ibinasura ang reklamo sa Lupon (${kp.number}) dahil hindi sumipot ang nagrereklamo sa pagdinig.`,
  withdrawn: (kp: KpCase) => `Binawi ang reklamo sa Lupon (${kp.number}).`,
};

export async function closeKpCase(input: { kpId: string; outcome: "cfa" | "dismissed" | "withdrawn"; note: string }) {
  return run(async () => {
    const s = await requireLupon();
    if (!(input.outcome in CLOSE_COPY)) fail("invalid", "Choose how the case ends.");
    const note = cleanText(input.note, 3, 600, "Note");
    return mutate((db) => {
      const kp = findKp(db, input.kpId);
      if (!isOpenKp(kp)) fail("conflict", "This Lupon case is already closed.");
      if (input.outcome === "cfa" && !canIssueCfa(kp)) fail("conflict", "A certificate to file action needs a failed conciliation, an expired Pangkat period, or a respondent who didn't appear.");
      if (input.outcome === "dismissed" && !canDismiss(kp)) fail("conflict", "Dismissal needs a hearing the complainant didn't attend.");
      kp.stage = input.outcome;
      kp.closedAt = Date.now();
      kp.closeNote = note;
      const req = findReq(db, kp.requestId);
      addEvent(req, { type: "kp_closed", vis: "internal", actor: staffActor(s), text: note, meta: { kp: kp.id, outcome: input.outcome } });
      if (req.status === "in_progress" || req.status === "queued") resolveCase(db, s, req, CLOSE_COPY[input.outcome](kp));
      audit(db, s, `kp_${input.outcome}`, kp.number, note);
      return null;
    });
  });
}
