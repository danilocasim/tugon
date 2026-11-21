import "server-only";
import { notFound } from "next/navigation";
import type { AdminTab } from "@/lib/admin-tabs";
import { portalIdentity } from "./identity";
import { requestAuth } from "./supabase";

export async function adminTab(tab: AdminTab) {
  const actor = await portalIdentity("staff");
  if (actor?.member.role !== "admin") notFound();
  const db = await requestAuth();
  const query = tab === "staff" ? db.rpc("staff_admin_members")
    : tab === "audit" ? db.rpc("staff_admin_audit")
      : tab === "sms" ? db.rpc("delivery_log")
        : tab === "privacy" ? db.rpc("admin_retention_preview").single()
          : null;
  const [settings, teams, referrals, extra] = await Promise.all([
    db.from("civic_settings").select("*").single(), db.from("teams").select("id,name,category").order("name"),
    db.from("referral_offices").select("*").order("name"), query,
  ]);
  if (settings.error || teams.error || referrals.error || extra?.error) throw new Error("Unable to load administration settings");
  return { actor: actor.subject, settings: settings.data, teams: teams.data, referrals: referrals.data, extra: extra?.data ?? null };
}
