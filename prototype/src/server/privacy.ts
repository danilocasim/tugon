"use server";

/**
 * Data Privacy Act (RA 10173) controls: the retention period and the Data
 * Protection Officer's contact (administrators), running retention, and a
 * resident's right to erasure. Lupon cases are kept as legal records.
 */
import { DAY } from "@/lib/format";
import { canAccess } from "@/lib/policy";
import { anonymizeRequest, audit, cleanText, fail, releaseFieldWork, requireResident, requireStaff, run } from "./core";
import { mutate, readDb } from "./db";
import { clearSession } from "./session";

async function requireAdmin() {
  const s = await requireStaff(readDb());
  if (!canAccess(s, "admin")) fail("forbidden", "Privacy settings are limited to administrators.");
  return s;
}

const MONTH = 30 * DAY;

export async function updatePrivacySettings(input: { retentionMonths: number; dpo: { name: string; email: string; phone: string } }) {
  return run(async () => {
    const s = await requireAdmin();
    const months = Math.round(Number(input.retentionMonths));
    if (!(months >= 1 && months <= 120)) fail("invalid", "Retention must be between 1 and 120 months.", { field: "retentionMonths" });
    const name = cleanText(input.dpo?.name, 3, 80, "DPO name");
    const email = String(input.dpo?.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) fail("invalid", "Enter the DPO's email.", { field: "dpoEmail" });
    const phone = cleanText(input.dpo?.phone, 5, 40, "DPO phone");
    mutate((db) => {
      const before = db.settings.privacy.retentionMonths;
      db.settings.privacy = { ...db.settings.privacy, retentionMonths: months, dpo: { name, email, phone } };
      audit(db, s, "privacy_settings_changed", undefined, before !== months ? `retention ${before} → ${months} months` : "DPO contact");
    });
    return null;
  });
}

/**
 * Anonymize closed cases past the retention period and drop old SMS records.
 * Counts and categories stay, so monthly reports and hotspots still add up.
 */
export async function runRetention() {
  return run(async () => {
    const s = await requireAdmin();
    return mutate((db) => {
      const now = Date.now();
      const cutoff = now - db.settings.privacy.retentionMonths * MONTH;
      const held = new Set(db.kp.map((k) => k.requestId));
      let anonymized = 0;
      for (const r of db.requests) {
        if (r.anonymizedAt || !r.closedAt || r.closedAt > cutoff || held.has(r.id) || r.status === "in_progress" || r.status === "queued") continue;
        anonymizeRequest(db, r, "Anonymized after the retention period");
        anonymized += 1;
      }
      const smsBefore = db.sms.length;
      db.sms = db.sms.filter((m) => m.at > cutoff);
      db.notifications = db.notifications.filter((n) => n.at > cutoff);
      db.settings.privacy.lastRetentionRun = now;
      audit(db, s, "retention_run", undefined, `${anonymized} cases anonymized · ${smsBefore - db.sms.length} SMS records removed`);
      return { anonymized, smsRemoved: smsBefore - db.sms.length };
    });
  });
}

/**
 * Right to erasure: the account is removed, open requests are withdrawn, and
 * every request is anonymized, except those in Lupon proceedings, which the
 * barangay must keep; those are detached from the account instead.
 */
export async function deleteMyAccount(input: { confirmEmail: string }) {
  return run(async () => {
    const me = await requireResident(readDb());
    if (String(input.confirmEmail ?? "").trim().toLowerCase() !== me.email) fail("invalid", "Type your email exactly to confirm.", { field: "confirmEmail" });
    const result = mutate((db) => {
      const held = new Set(db.kp.map((k) => k.requestId));
      let kept = 0;
      for (const r of db.requests) {
        if (r.residentId !== me.id) continue;
        if (r.status !== "resolved" && r.status !== "referred" && r.status !== "duplicate" && r.status !== "withdrawn" && !held.has(r.id)) {
          r.status = "withdrawn";
          r.closedAt = Date.now();
          releaseFieldWork(db, null, r, "Resident deleted their account");
        }
        if (held.has(r.id)) {
          r.residentId = null;
          r.contact = { name: me.name };
          kept += 1;
        } else anonymizeRequest(db, r, "Removed at the resident's request");
      }
      db.notifications = db.notifications.filter((n) => n.residentId !== me.id);
      if (me.phone) db.sms = db.sms.filter((m) => m.to !== me.phone);
      db.residents = db.residents.filter((r) => r.id !== me.id);
      db.audit.unshift({ id: `a_${Date.now().toString(36)}`, at: Date.now(), actorId: me.id, actorName: "Resident (account deleted)", action: "account_deleted", detail: kept ? `${kept} kept for Lupon records` : undefined });
      return { kept };
    });
    await clearSession("resident");
    return result;
  });
}
