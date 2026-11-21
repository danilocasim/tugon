import "server-only";
import type { Category, Incident } from "@/lib/domain";
import { requestAuth } from "./supabase";

export async function readIncidents(focus?: string): Promise<Incident[]> {
  const db = await requestAuth();
  const select = () => db.from("incidents").select("*, incident_updates(*), case_work(request_id,restricted)");
  const { data, error } = await select().order("created_at", { ascending: false }).order("id").limit(150);
  if (error) throw new Error("Unable to read incidents", { cause: error.code });
  if (focus && !data.some((row) => row.id === focus)) {
    const { data: incident, error: missing } = await select().eq("id", focus).maybeSingle();
    if (missing) throw new Error("Unable to read incident", { cause: missing.code });
    if (incident) data.push(incident);
  }
  return data.map((row) => ({
    id: row.id, ref: row.ref, title: row.title, category: row.category as Category, center: { lat: row.lat, lon: row.lon },
    radiusM: Math.ceil(row.radius_m), status: row.closed_at ? "closed" : "open", requestIds: row.case_work.filter((c) => !c.restricted).map((c) => c.request_id),
    createdBy: row.created_by, createdAt: Date.parse(row.created_at), closedAt: row.closed_at ? Date.parse(row.closed_at) : null, outcome: row.outcome,
    updates: row.incident_updates.map((u) => ({ id: u.id, at: Date.parse(u.created_at), by: u.actor_id, text: u.message })).sort((a, b) => b.at - a.at),
  }));
}
