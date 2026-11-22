/** Build the per-portal view of the store. Redaction happens here, on the server. */
import { MODEL_CARD } from "@/lib/classifier";
import { FIELD_STATUS, SHIFTS, type CaseEvent, type DB, type EventType, type ServiceRequest } from "@/lib/domain";
import { addDays, isOnDuty, manilaDate, weekStart } from "@/lib/duty";
import { DAY, maskEmail } from "@/lib/format";
import { can, canAccess } from "@/lib/policy";
import type { PublicSettings, ResidentSnapshot, StaffAssignment, StaffRequest, StaffSnapshot, TanodAssignment, TanodSnapshot } from "@/lib/snapshot";
import { currentResident, currentStaff, currentTanod } from "./session";

function publicSettings(db: DB): PublicSettings {
  const { barangay, city, officeHours, intakeHours, hotline, emergency, privacy } = db.settings;
  return { barangay, city, officeHours, intakeHours, hotline, emergency, privacy: { retentionMonths: privacy.retentionMonths, dpo: privacy.dpo } };
}

const maskMobile = (v: string) => `${v.slice(0, 4)}•••${v.slice(-4)}`;

function residentFacingActor(db: DB, e: CaseEvent): CaseEvent["actor"] {
  if (e.actor.kind !== "staff") return e.actor;
  const s = db.staff.find((x) => x.id === e.actor.id);
  const team = db.teams.find((t) => t.id === s?.team);
  return { kind: "staff", name: team ? team.name : "Barangay intake desk" };
}

export async function residentSnapshot(db: DB): Promise<ResidentSnapshot> {
  const me = await currentResident(db);
  const settings = publicSettings(db);
  if (!me) return { rev: db.rev, settings, me: null, requests: [], notifications: [] };

  const requests = db.requests
    .filter((r) => r.residentId === me.id)
    .map((r) => ({
      id: r.id,
      ref: r.ref,
      channel: r.channel,
      text: r.text,
      residentCategory: r.residentCategory,
      dangerNow: r.dangerNow,
      location: r.location,
      hasPhoto: r.hasPhoto,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      status: r.status,
      outcome: r.outcome,
      outcomePhoto: r.outcomePhoto,
      followUp: r.followUp,
      closedAt: r.closedAt,
      category: r.triage?.category ?? null,
      teamName: db.teams.find((t) => t.id === r.team)?.name ?? null,
      referralOffice: r.referral?.office ?? null,
      duplicateOfRef: db.requests.find((q) => q.id === r.duplicateOf)?.ref ?? null,
      events: r.events.filter((e) => e.vis === "resident").map((e) => ({ ...e, actor: residentFacingActor(db, e) })),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return {
    rev: db.rev,
    settings,
    me,
    requests,
    notifications: db.notifications.filter((n) => n.residentId === me.id).sort((a, b) => b.at - a.at),
  };
}

const SAFE_EVENT_TYPES: Partial<Record<EventType, true>> = {
  submitted: true,
  triaged: true,
  assigned: true,
  started: true,
  resolved: true,
  referred: true,
  duplicate: true,
  withdrawn: true,
  reopened: true,
  tanod_assigned: true,
  tanod_accepted: true,
  tanod_arrived: true,
  field_report: true,
};

function redact(r: ServiceRequest): StaffRequest {
  return {
    ...r,
    redacted: true,
    text: "",
    contact: null,
    residentId: null,
    outcome: null,
    location: r.location && !r.restricted ? r.location : r.location ? { ...r.location, lat: null, lon: null, landmarkId: null, method: "purok" } : null,
    prediction: { ...r.prediction, evidence: [] },
    events: r.events.filter((e) => SAFE_EVENT_TYPES[e.type]).map(({ text: _text, ...e }) => e),
  };
}

export async function staffSnapshot(db: DB): Promise<StaffSnapshot> {
  const me = await currentStaff(db);
  const now = Date.now();
  const base = {
    rev: db.rev,
    me,
    // Signed-out visitors only get the desk persona list for the sign-in screen.
    staff: me ? db.staff : db.staff.filter((s) => s.active && s.role !== "tanod").map((s) => ({ ...s, email: "" })),
    teams: db.teams,
    settings: db.settings,
    model: MODEL_CARD,
    now,
  };
  if (!me) return { ...base, requests: [], residents: {}, audit: [], roster: [], assignments: [], incidents: [], kp: [], kpLog: [], sms: [], smsLive: false, smsByMonth: {}, legalHold: [] };

  const requests = db.requests.map((r) => (can(me, "view", r) ? { ...r, redacted: false } : redact(r)));
  const residents: StaffSnapshot["residents"] = {};
  for (const r of requests) {
    if (r.redacted || !r.residentId) continue;
    const res = db.residents.find((x) => x.id === r.residentId);
    if (res) residents[res.id] = { name: res.name, email: maskEmail(res.email), purok: res.purok, sms: res.smsUpdates && !!res.phone };
  }
  const visible = new Set(requests.filter((r) => !r.redacted).map((r) => r.id));
  const assignments: StaffAssignment[] = db.assignments.map((a) =>
    visible.has(a.requestId) ? { ...a, redacted: false } : { ...a, instructions: null, report: null, hasPhoto: false, closeReason: null, redacted: true },
  );
  const from = addDays(manilaDate(now), -8);
  const seesAudit = me.role === "admin" || me.role === "supervisor";
  const reports = canAccess(me, "reports");
  const smsByMonth: Record<string, number> = {};
  if (reports) {
    for (const m of db.sms) {
      const month = manilaDate(m.at).slice(0, 7);
      smsByMonth[month] = (smsByMonth[month] ?? 0) + 1;
    }
  }
  return {
    ...base,
    requests,
    residents,
    audit: seesAudit ? db.audit.slice(0, 400) : [],
    roster: db.roster.filter((d) => d.date >= from),
    assignments,
    incidents: db.incidents,
    kp: canAccess(me, "lupon") ? db.kp : [],
    kpLog: reports ? db.kp.map((k) => ({ id: k.id, stage: k.stage, filedAt: k.filedAt, closedAt: k.closedAt })) : [],
    sms: me.role === "admin" ? db.sms.map((m) => ({ ...m, to: maskMobile(m.to) })) : [],
    smsLive: process.env.SMS_PROVIDER === "semaphore" && !!process.env.SEMAPHORE_API_KEY,
    smsByMonth,
    legalHold: db.kp.map((k) => k.requestId),
  };
}

export async function tanodSnapshot(db: DB): Promise<TanodSnapshot> {
  const me = await currentTanod(db);
  const now = Date.now();
  const base = { rev: db.rev, now, settings: publicSettings(db) };
  // Prototype only: the tanod accounts for the sign-in screen and the persona switch.
  const personas = db.staff.filter((s) => s.role === "tanod" && s.active && !s.invited).map((s) => ({ id: s.id, name: s.name, zone: s.zone ?? null, phone: s.phone ?? null }));
  if (!me) return { ...base, me: null, personas, assignments: [], shifts: [], onDuty: [] };

  const name = (id: string | null) => db.staff.find((s) => s.id === id)?.name ?? null;
  const assignments: TanodAssignment[] = db.assignments
    .filter((a) => a.tanodId === me.id && (FIELD_STATUS[a.status].open || (a.closedAt ?? a.assignedAt) > now - 30 * DAY))
    .flatMap((a) => {
      const r = db.requests.find((q) => q.id === a.requestId);
      if (!r) return [];
      return [
        {
          ...a,
          assignedByName: name(a.assignedBy) ?? "Barangay",
          case: {
            id: r.id,
            ref: r.ref,
            text: r.text,
            category: r.triage?.category ?? r.prediction.category,
            urgency: r.triage?.urgency ?? r.prediction.urgency,
            dangerNow: r.dangerNow,
            restricted: r.restricted,
            location: r.location,
            hasPhoto: r.hasPhoto,
            createdAt: r.createdAt,
            status: r.status,
            reporterName: r.residentId ? (db.residents.find((x) => x.id === r.residentId)?.name ?? null) : (r.contact?.name ?? null),
            teamName: db.teams.find((t) => t.id === r.team)?.name ?? null,
            handlerName: name(r.assigneeId),
          },
        },
      ];
    })
    .sort((a, b) => b.assignedAt - a.assignedAt);

  const today = manilaDate(now);
  // The whole current week (for the schedule calendar) plus yesterday's night shift, through two more weeks.
  const from = [weekStart(today), addDays(today, -1)].sort()[0];
  const shifts = db.roster
    .filter((d) => d.tanodId === me.id && d.date >= from && d.date <= addDays(weekStart(today), 20))
    .sort((a, b) => a.date.localeCompare(b.date) || SHIFTS.indexOf(a.shift) - SHIFTS.indexOf(b.shift));
  const onDuty = db.roster
    .filter((d) => isOnDuty(d, now))
    .flatMap((d) => {
      const s = db.staff.find((x) => x.id === d.tanodId && x.active);
      return s ? [{ id: s.id, name: s.name, phone: s.phone ?? null, zone: s.zone ?? null, shift: d.shift }] : [];
    });
  return { ...base, me, personas, assignments, shifts, onDuty };
}
