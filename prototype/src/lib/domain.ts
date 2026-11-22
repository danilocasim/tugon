/** Service taxonomy (thesis Tables 3–4), case lifecycle, and shared types. */

export type Lang = "fil" | "en";
export type Category = "peace" | "infra" | "sanitation" | "documents" | "social";
export type Urgency = "high" | "medium" | "normal";
export type Status =
  | "received"
  | "review"
  | "needs_info"
  | "queued"
  | "in_progress"
  | "resolved"
  | "referred"
  | "duplicate"
  | "withdrawn";
export type Channel = "online" | "walkin" | "phone";
export type Role = "intake" | "handler" | "supervisor" | "admin" | "tanod";

export const CATEGORIES: Category[] = ["peace", "infra", "sanitation", "documents", "social"];
export const URGENCIES: Urgency[] = ["high", "medium", "normal"];

export const CATEGORY: Record<
  Category,
  { en: string; fil: string; short: { en: string; fil: string }; weight: number; located: boolean; hint: { en: string; fil: string } }
> = {
  peace: {
    en: "Peace and Order",
    fil: "Kapayapaan at Kaayusan",
    short: { en: "Peace & order", fil: "Kaayusan" },
    weight: 3,
    located: true,
    hint: { en: "Fights, threats, theft, late-night noise", fil: "Away, banta, nakawan, ingay sa gabi" },
  },
  infra: {
    en: "Infrastructure and Public Works",
    fil: "Imprastraktura at Public Works",
    short: { en: "Public works", fil: "Public works" },
    weight: 2,
    located: true,
    hint: { en: "Poles, live wires, potholes, streetlights, manholes", fil: "Poste, live wire, lubak, ilaw, manhole" },
  },
  sanitation: {
    en: "Sanitation and Health",
    fil: "Kalinisan at Kalusugan",
    short: { en: "Sanitation & health", fil: "Kalinisan" },
    weight: 2,
    located: true,
    hint: { en: "Garbage, clogged canals, flooding, dengue, stray dogs", fil: "Basura, baradong kanal, baha, dengue, asong gala" },
  },
  documents: {
    en: "Documents and Certification",
    fil: "Dokumento at Sertipikasyon",
    short: { en: "Documents", fil: "Dokumento" },
    weight: 1,
    located: false,
    hint: { en: "Clearance, indigency, residency, jobseeker certificate", fil: "Clearance, indigency, residency, first-time jobseeker" },
  },
  social: {
    en: "Social Assistance and Others",
    fil: "Tulong Panlipunan at Iba Pa",
    short: { en: "Social assistance", fil: "Tulong" },
    weight: 1,
    located: false,
    hint: { en: "Ayuda, seniors, PWD, solo parents, hospital transport", fil: "Ayuda, senior, PWD, solo parent, sasakyan sa ospital" },
  },
};

export const URGENCY: Record<Urgency, { level: number; en: string; fil: string }> = {
  high: { level: 3, en: "High", fil: "Mataas" },
  medium: { level: 2, en: "Medium", fil: "Katamtaman" },
  normal: { level: 1, en: "Normal", fil: "Karaniwan" },
};

export const STATUS: Record<Status, { en: string; fil: string; open: boolean }> = {
  received: { en: "Received", fil: "Natanggap", open: true },
  review: { en: "Under review", fil: "Sinusuri", open: true },
  needs_info: { en: "Needs information", fil: "Kailangan ng detalye", open: true },
  queued: { en: "Queued", fil: "Nakapila", open: true },
  in_progress: { en: "In progress", fil: "Inaaksyunan", open: true },
  resolved: { en: "Resolved", fil: "Naresolba", open: false },
  referred: { en: "Referred", fil: "Inirefer", open: false },
  duplicate: { en: "Duplicate", fil: "Kapareho ng iba", open: false },
  withdrawn: { en: "Withdrawn", fil: "Binawi", open: false },
};

export const INTAKE_STATUSES: Status[] = ["received", "review", "needs_info"];
export const WORK_STATUSES: Status[] = ["queued", "in_progress"];
export const CLOSED_STATUSES: Status[] = ["resolved", "referred", "duplicate", "withdrawn"];

export const CHANNEL: Record<Channel, { en: string; fil: string }> = {
  online: { en: "Online", fil: "Online" },
  walkin: { en: "Walk-in", fil: "Walk-in" },
  phone: { en: "Phone", fil: "Tawag" },
};

export const ROLE: Record<Role, { en: string; blurb: string }> = {
  intake: { en: "Intake officer", blurb: "Reviews new reports, confirms triage, routes to teams" },
  handler: { en: "Handler", blurb: "Works cases for one team, posts updates, records outcomes" },
  supervisor: { en: "Supervisor", blurb: "Overrides, escalations, restricted cases, reopening, tanod roster" },
  admin: { en: "Administrator", blurb: "Staff, roles, routing, targets, audit — not case content" },
  tanod: { en: "Tanod", blurb: "Field officer: takes assignments on duty and files field reports from the Tanod app" },
};

export interface LocationInfo {
  method: "pin" | "device" | "landmark" | "purok";
  purok: string | null;
  landmarkId: string | null;
  lat: number | null;
  lon: number | null;
}

export interface Prediction {
  category: Category;
  categoryP: number;
  categoryRanked: { label: Category; p: number }[];
  urgency: Urgency;
  urgencyP: number;
  urgencyRanked: { label: Urgency; p: number }[];
  evidence: string[];
}

export interface Triage {
  category: Category;
  urgency: Urgency;
  by: string;
  at: number;
  correctedCategory: boolean;
  correctedUrgency: boolean;
}

export type EventType =
  | "submitted"
  | "review_started"
  | "info_requested"
  | "resident_reply"
  | "triaged"
  | "assigned"
  | "started"
  | "update"
  | "note"
  | "resolved"
  | "referred"
  | "duplicate"
  | "withdrawn"
  | "reopened"
  | "followup_requested"
  | "triage_changed"
  | "tanod_assigned"
  | "tanod_accepted"
  | "tanod_arrived"
  | "tanod_declined"
  | "tanod_cancelled"
  | "field_report"
  | "incident_linked"
  | "kp_filed"
  | "kp_hearing"
  | "kp_recorded"
  | "kp_closed";

export interface CaseEvent {
  id: string;
  at: number;
  type: EventType;
  actor: { kind: "resident" | "staff" | "system"; id?: string; name: string };
  vis: "resident" | "internal";
  text?: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface ServiceRequest {
  id: string;
  ref: string;
  residentId: string | null;
  /** Walk-in or phone reporter. `phone` is the full callback number; `sms` records consent to status texts. */
  contact: { name: string; phone?: string; sms?: boolean } | null;
  channel: Channel;
  text: string;
  residentCategory: Category | null;
  dangerNow: boolean;
  location: LocationInfo | null;
  hasPhoto: boolean;
  createdAt: number;
  updatedAt: number;
  status: Status;
  prediction: Prediction;
  triage: Triage | null;
  team: string | null;
  assigneeId: string | null;
  restricted: boolean;
  duplicateOf: string | null;
  referral: { office: string } | null;
  outcome: string | null;
  /** A photo shown to the resident as proof of the fix, stored as `o_<id>`. */
  outcomePhoto: boolean;
  firstActionAt: number | null;
  startedAt: number | null;
  closedAt: number | null;
  followUp: boolean;
  events: CaseEvent[];
  idemKey: string | null;
  incidentId: string | null;
  /** Set when retention or an erasure request removed personal details. */
  anonymizedAt: number | null;
}

export interface Resident {
  id: string;
  name: string;
  email: string;
  purok: string;
  lang: Lang;
  emailUpdates: boolean;
  /** Normalized PH mobile number, optional. */
  phone: string | null;
  smsUpdates: boolean;
}

export interface Staff {
  id: string;
  name: string;
  title: string;
  role: Role;
  team: string | null;
  /** Empty for tanods, who sign in with their mobile number. */
  email: string;
  active: boolean;
  invited?: boolean;
  /** Normalized PH mobile number (09XXXXXXXXX); required for tanods for one-tap calls. */
  phone?: string;
  /** Purok a tanod is usually posted to. */
  zone?: string | null;
}

export interface Team {
  id: string;
  name: string;
  category: Category;
}

export type NotificationType =
  | "review_started"
  | "info_requested"
  | "queued"
  | "started"
  | "update"
  | "resolved"
  | "referred"
  | "duplicate"
  | "reopened"
  | "tanod"
  | "hearing";

export interface ResidentNotification {
  id: string;
  residentId: string;
  requestId: string;
  ref: string;
  type: NotificationType;
  at: number;
  read: boolean;
}

export interface AuditEntry {
  id: string;
  at: number;
  actorId: string;
  actorName: string;
  action: string;
  target?: string;
  detail?: string;
}

export interface ReferralContact {
  id: string;
  name: string;
  scope: string;
  contact: string;
}

export interface Settings {
  barangay: string;
  city: string;
  officeHours: string;
  intakeHours: string;
  hotline: string;
  emergency: string;
  targets: Record<Urgency, number>;
  hotspot: { epsM: number; minPts: number; days: number };
  referrals: ReferralContact[];
  privacy: PrivacySettings;
}

/** Data Privacy Act (RA 10173) controls the administrator sets. */
export interface PrivacySettings {
  /** Closed cases older than this are anonymized; Lupon cases are kept as legal records. */
  retentionMonths: number;
  dpo: { name: string; email: string; phone: string };
  lastRetentionRun: number | null;
}

export type SmsPurpose = "resident" | "reporter" | "tanod" | "hearing";
export type SmsStatus = "queued" | "sent" | "simulated" | "failed";
export interface SmsMessage {
  id: string;
  to: string;
  body: string;
  purpose: SmsPurpose;
  requestId: string | null;
  at: number;
  status: SmsStatus;
  error: string | null;
}

/** Many reports about one thing (a flood, a blackout): linked so one update reaches every reporter. */
export interface Incident {
  id: string;
  ref: string;
  title: string;
  category: Category;
  center: { lat: number; lon: number };
  radiusM: number;
  status: "open" | "closed";
  requestIds: string[];
  createdBy: string;
  createdAt: number;
  closedAt: number | null;
  outcome: string | null;
  updates: { id: string; at: number; by: string; text: string }[];
}

/**
 * Katarungang Pambarangay (RA 7160, secs. 399–422): mediation by the Punong Barangay,
 * then conciliation by a Pangkat, ending in settlement, a certificate to file action, or dismissal.
 */
export type KpStage = "mediation" | "conciliation" | "settled" | "cfa" | "dismissed" | "withdrawn";
export const KP_STAGE: Record<KpStage, { en: string; fil: string; open: boolean }> = {
  mediation: { en: "Mediation", fil: "Pamamagitan", open: true },
  conciliation: { en: "Conciliation (Pangkat)", fil: "Pagkakasundo (Pangkat)", open: true },
  settled: { en: "Amicably settled", fil: "Nagkasundo", open: false },
  cfa: { en: "Certificate to file action", fil: "Certificate to file action", open: false },
  dismissed: { en: "Dismissed", fil: "Ibinasura", open: false },
  withdrawn: { en: "Withdrawn", fil: "Binawi", open: false },
};
export type KpHearingResult = "settled" | "continued" | "failed" | "respondent_absent" | "complainant_absent";
export const KP_RESULT: Record<KpHearingResult, { en: string; fil: string }> = {
  settled: { en: "Settled", fil: "Nagkasundo" },
  continued: { en: "Continued to another date", fil: "Itutuloy sa ibang araw" },
  failed: { en: "No agreement", fil: "Hindi nagkasundo" },
  respondent_absent: { en: "Respondent did not appear", fil: "Hindi sumipot ang inirereklamo" },
  complainant_absent: { en: "Complainant did not appear", fil: "Hindi sumipot ang nagrereklamo" },
};
export interface KpHearing {
  id: string;
  kind: "mediation" | "conciliation";
  at: number;
  summonsServed: boolean;
  result: KpHearingResult | null;
  notes: string | null;
  recordedAt: number | null;
}
export interface KpCase {
  id: string;
  number: string;
  requestId: string;
  complainant: string;
  respondent: string;
  respondentAddress: string;
  nature: string;
  filedAt: number;
  filedBy: string;
  stage: KpStage;
  mediationStart: number;
  conciliationStart: number | null;
  extended: boolean;
  hearings: KpHearing[];
  settlement: { text: string; at: number } | null;
  closedAt: number | null;
  closeNote: string | null;
}

/** Tanod duty runs in two 12-hour shifts, Asia/Manila time. */
export type Shift = "day" | "night";
export const SHIFTS: Shift[] = ["day", "night"];
export const SHIFT: Record<Shift, { en: string; fil: string; startHour: number; hours: number; label: string }> = {
  day: { en: "Day", fil: "Araw", startHour: 6, hours: 12, label: "6 AM – 6 PM" },
  night: { en: "Night", fil: "Gabi", startHour: 18, hours: 12, label: "6 PM – 6 AM" },
};

export interface DutyShift {
  id: string;
  tanodId: string;
  /** Manila calendar date the shift starts on, YYYY-MM-DD. A night shift ends the next morning. */
  date: string;
  shift: Shift;
}

export type FieldStatus = "assigned" | "accepted" | "on_scene" | "done" | "declined" | "cancelled";
export const FIELD_STATUS: Record<FieldStatus, { en: string; fil: string; open: boolean }> = {
  assigned: { en: "Waiting to accept", fil: "Bagong assignment", open: true },
  accepted: { en: "On the way", fil: "Papunta na", open: true },
  on_scene: { en: "On scene", fil: "Nasa lugar na", open: true },
  done: { en: "Report filed", fil: "Naiulat na", open: false },
  declined: { en: "Declined", fil: "Hindi natanggap", open: false },
  cancelled: { en: "Cancelled", fil: "Kinansela", open: false },
};

export type FieldResult = "settled" | "follow_up" | "unfounded" | "turned_over";
export const FIELD_RESULTS: FieldResult[] = ["settled", "follow_up", "unfounded", "turned_over"];
export const FIELD_RESULT: Record<FieldResult, { en: string; fil: string }> = {
  settled: { en: "Handled on site", fil: "Naayos sa lugar" },
  follow_up: { en: "Needs follow-up", fil: "Kailangan pa ng follow-up" },
  unfounded: { en: "Nothing found on arrival", fil: "Walang nadatnan" },
  turned_over: { en: "Turned over to police", fil: "Itinurn-over sa pulis" },
};

/** A tanod sent to a case. The case stays with its handler; the tanod reports back. */
export interface FieldAssignment {
  id: string;
  requestId: string;
  tanodId: string;
  assignedBy: string;
  instructions: string | null;
  status: FieldStatus;
  assignedAt: number;
  acceptedAt: number | null;
  arrivedAt: number | null;
  closedAt: number | null;
  result: FieldResult | null;
  report: string | null;
  hasPhoto: boolean;
  closeReason: string | null;
}

export interface DB {
  version: 3;
  rev: number;
  seq: number;
  createdAt: number;
  residents: Resident[];
  staff: Staff[];
  teams: Team[];
  requests: ServiceRequest[];
  notifications: ResidentNotification[];
  audit: AuditEntry[];
  settings: Settings;
  idem: Record<string, string>;
  roster: DutyShift[];
  assignments: FieldAssignment[];
  incidents: Incident[];
  kp: KpCase[];
  sms: SmsMessage[];
}

export const catLabel = (c: Category | null | undefined, lang: Lang = "en") =>
  c ? CATEGORY[c][lang] : lang === "fil" ? "Hindi pa natutukoy" : "Not yet categorized";

/** Routing: each category goes to one team's queue. */
export const CATEGORY_TEAM: Record<Category, string> = {
  peace: "t_peace",
  infra: "t_works",
  sanitation: "t_health",
  documents: "t_records",
  social: "t_social",
};

export const isOpen = (r: { status: Status }) => STATUS[r.status].open;
