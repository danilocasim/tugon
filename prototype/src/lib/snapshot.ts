/** Shapes the server sends to each portal. Each portal only receives what its user may see. */
import type {
  AuditEntry,
  Category,
  CaseEvent,
  DutyShift,
  FieldAssignment,
  Incident,
  KpCase,
  KpStage,
  LocationInfo,
  PrivacySettings,
  Resident,
  ResidentNotification,
  ServiceRequest,
  Settings,
  Shift,
  SmsMessage,
  Staff,
  Status,
  Team,
  Urgency,
} from "./domain";

export type PublicSettings = Pick<Settings, "barangay" | "city" | "officeHours" | "intakeHours" | "hotline" | "emergency"> & {
  privacy: Pick<PrivacySettings, "retentionMonths" | "dpo">;
};

/** A request as its owner sees it: no model output, urgency, assignee, or internal notes. */
export interface ResidentRequest
  extends Pick<
    ServiceRequest,
    | "id"
    | "ref"
    | "channel"
    | "text"
    | "residentCategory"
    | "dangerNow"
    | "location"
    | "hasPhoto"
    | "createdAt"
    | "updatedAt"
    | "status"
    | "outcome"
    | "outcomePhoto"
    | "followUp"
    | "closedAt"
  > {
  category: Category | null;
  teamName: string | null;
  referralOffice: string | null;
  duplicateOfRef: string | null;
  events: CaseEvent[];
}

export interface ResidentSnapshot {
  rev: number;
  settings: PublicSettings;
  me: Resident | null;
  requests: ResidentRequest[];
  notifications: ResidentNotification[];
}

export interface StaffRequest extends ServiceRequest {
  /** True when this user may not see case content; text, reporter and notes are withheld. */
  redacted: boolean;
}

/** Field assignments on cases this user can't open keep only who and when, for workload counts. */
export interface StaffAssignment extends FieldAssignment {
  redacted: boolean;
}

export interface StaffSnapshot {
  rev: number;
  me: Staff | null;
  staff: Staff[];
  teams: Team[];
  settings: Settings;
  requests: StaffRequest[];
  residents: Record<string, { name: string; email: string; purok: string; sms: boolean }>;
  audit: AuditEntry[];
  model: { name: string; trainedOn: number; vocab: number; params: string };
  roster: DutyShift[];
  assignments: StaffAssignment[];
  incidents: Incident[];
  /** Full Lupon docket for those who keep it; empty for everyone else. */
  kp: KpCase[];
  /** Stage and dates only, for the monthly report. */
  kpLog: { id: string; stage: KpStage; filedAt: number; closedAt: number | null }[];
  /** Administrators only, numbers masked. */
  sms: SmsMessage[];
  /** True when a real SMS provider is configured; otherwise texts are simulated. */
  smsLive: boolean;
  /** Messages per Manila month (YYYY-MM), for the monthly report. */
  smsByMonth: Record<string, number>;
  /** Request ids kept as legal records (Lupon) and exempt from retention. */
  legalHold: string[];
  now: number;
}

/** What a tanod needs in the field: the case as reported, where it is, and who sent them. */
export interface TanodCase {
  id: string;
  ref: string;
  text: string;
  category: Category;
  urgency: Urgency;
  dangerNow: boolean;
  restricted: boolean;
  location: LocationInfo | null;
  hasPhoto: boolean;
  createdAt: number;
  status: Status;
  reporterName: string | null;
  teamName: string | null;
  handlerName: string | null;
}

export interface TanodAssignment extends FieldAssignment {
  case: TanodCase;
  assignedByName: string;
}

export interface TanodSnapshot {
  rev: number;
  now: number;
  me: Staff | null;
  settings: PublicSettings;
  /** Prototype only: tanod accounts for the sign-in screen and the persona switch. */
  personas: { id: string; name: string; zone: string | null; phone: string | null }[];
  assignments: TanodAssignment[];
  shifts: DutyShift[];
  /** Everyone on duty right now, so a tanod knows who to call for backup. */
  onDuty: { id: string; name: string; phone: string | null; zone: string | null; shift: Shift }[];
}
