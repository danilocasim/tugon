import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { PORTAL_ROOT, portalReturnPath, type Portal } from "@/lib/auth-path";
import { requestAuth } from "./supabase";

export interface Membership {
  user_id: string;
  role: "resident" | "intake" | "handler" | "supervisor" | "admin" | "tanod";
  name: string;
  title: string;
  team_id: string | null;
  zone: string | null;
  phone: string | null;
}

export const readIdentity = cache(async () => {
  const client = await requestAuth();
  const { data: verified, error: verificationError } = await client.auth.getClaims();
  if (verificationError || !verified?.claims.sub) return null;
  const { claims } = verified;
  const { data, error } = await client.from("memberships").select("user_id,role,name,title,team_id,zone,phone")
    .eq("user_id", claims.sub).maybeSingle<Membership>();
  if (error) throw new Error("Unable to read portal membership", { cause: error.code });
  const password = Array.isArray(claims.amr) && claims.amr.some((entry) =>
    typeof entry === "string" ? entry === "password" : entry.method === "password");
  return { member: data, subject: claims.sub, email: claims.email ?? null, aal: claims.aal, session: claims.session_id, password };
});

export async function portalIdentity(portal: Portal) {
  const identity = await readIdentity();
  const member = identity?.member;
  if (!member) return null;
  if (portal === "staff" && (member.role === "resident" || member.role === "tanod" || identity.aal !== "aal2" || !identity.password)) return null;
  if (portal === "resident" && member.role !== "resident") return null;
  if (portal === "tanod" && member.role !== "tanod") return null;
  return { ...identity, member };
}

export async function requirePortal(portal: Portal, next: string) {
  const identity = await portalIdentity(portal);
  if (!identity) redirect(`${PORTAL_ROOT[portal]}/signin?next=${encodeURIComponent(portalReturnPath(portal, next))}`);
  return identity;
}
