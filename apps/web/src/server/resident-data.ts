import "server-only";
import { cache } from "react";
import type { CaseEvent, LocationInfo, ResidentNotification } from "@/lib/domain";
import type { Database } from "@/lib/database.types";
import type { PublicSettings, ResidentRequest, ResidentSnapshot } from "@/lib/snapshot";
import { portalIdentity } from "./identity";
import { requestAuth } from "./supabase";

export const publicSettings = cache(async (): Promise<PublicSettings> => {
  const client = await requestAuth();
  const { data, error } = await client.from("civic_settings").select("*").single();
  if (error || !data) throw new Error("Unable to read barangay settings", { cause: error?.code });
  return {
    barangay: data.barangay, city: data.city, hallAddress: data.hall_address,
    officeHours: data.office_hours, intakeHours: data.intake_hours, hotline: data.hotline, emergency: data.emergency,
    privacy: { retentionMonths: data.retention_months, dpo: { name: data.dpo_name, email: data.dpo_email, phone: data.dpo_phone } },
  };
});

export const residentSnapshot = cache(async (): Promise<ResidentSnapshot> => {
  const [settings, identity] = await Promise.all([publicSettings(), portalIdentity("resident")]);
  if (!identity || !identity.email) return { rev: 0, settings, me: null, requests: [], notifications: [] };
  const client = await requestAuth();
  const [{ data: profile, error: profileError }, { data: rows, error: requestError }, { data: notices, error: noticeError }] = await Promise.all([
    client.from("resident_profiles").select("*").eq("user_id", identity.subject).maybeSingle(),
    client.from("service_requests").select("*, resident_request_events(*)").eq("resident_id", identity.subject).order("updated_at", { ascending: false }).order("id").limit(100),
    client.from("resident_notifications").select("*, service_requests!inner(ref)").eq("resident_id", identity.subject).order("created_at", { ascending: false }).order("id").limit(100),
  ]);
  if (profileError || requestError || noticeError) throw new Error("Unable to read resident records", { cause: profileError?.code ?? requestError?.code ?? noticeError?.code });
  if (!profile) return { rev: 0, settings, me: null, requests: [], notifications: [] };
  const requests = rows.map((row) => projectRequest(row, identity.member.name, settings.barangay));
  const notifications: ResidentNotification[] = notices.map((n) => ({
    id: n.id, residentId: identity.subject, requestId: n.request_id, ref: n.service_requests.ref,
    type: n.kind as ResidentNotification["type"], at: Date.parse(n.created_at), read: n.read_at !== null,
  }));
  return {
    rev: Date.now(), settings, requests, notifications,
    me: {
      id: identity.subject, name: identity.member.name, email: identity.email, purok: profile.purok,
      lang: profile.lang === "en" ? "en" : "fil", emailUpdates: profile.email_updates,
      phone: identity.member.phone?.replace(/^\+63/u, "0") ?? null, smsUpdates: profile.sms_updates,
    },
  };
});

type ReportRow = Database["public"]["Tables"]["service_requests"]["Row"] & {
  resident_request_events: Database["public"]["Tables"]["resident_request_events"]["Row"][];
};

function projectRequest(r: ReportRow, name: string, barangay: string): ResidentRequest {
  return {
    id: r.id, ref: r.ref, channel: r.channel as ResidentRequest["channel"], text: r.description,
    residentCategory: r.resident_category as ResidentRequest["residentCategory"], dangerNow: r.danger_now,
    location: r.location as LocationInfo | null, hasPhoto: r.has_photo, createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at), status: r.status as ResidentRequest["status"], outcome: r.outcome,
    outcomePhoto: r.outcome_photo, followUp: r.follow_up, closedAt: r.closed_at ? Date.parse(r.closed_at) : null,
    category: r.category as ResidentRequest["category"], teamName: r.team_name, referralOffice: r.referral_office,
    duplicateOfRef: r.duplicate_of_ref,
    events: r.resident_request_events.map((event): CaseEvent => ({
      id: event.id, at: Date.parse(event.created_at), type: event.event_type as CaseEvent["type"],
      vis: "resident",
      actor: { kind: event.author as CaseEvent["actor"]["kind"], name: event.author === "resident" ? name : barangay },
      ...(event.message === null ? {} : { text: event.message }),
    })).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)),
  };
}

export async function readResidentRequest(id: string, actor: NonNullable<Awaited<ReturnType<typeof portalIdentity>>>) {
  const client = await requestAuth();
  const [{ data, error }, settings] = await Promise.all([
    client.from("service_requests").select("*, resident_request_events(*)").eq("id", id).eq("resident_id", actor.subject).maybeSingle(),
    publicSettings(),
  ]);
  if (error) throw new Error("Unable to read the request", { cause: error.code });
  return data ? projectRequest(data, actor.member.name, settings.barangay) : null;
}
