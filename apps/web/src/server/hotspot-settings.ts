"use server";

import { failure, success } from "@/lib/result";
import { requestAuth } from "./supabase";

export async function updateHotspotParams(input: { epsM: number; minPts: number }) {
  if (!Number.isInteger(input.epsM) || input.epsM < 40 || input.epsM > 250 || !Number.isInteger(input.minPts) || input.minPts < 3 || input.minPts > 10) return failure("invalid", "Invalid hotspot defaults.");
  const db = await requestAuth();
  const { error } = await db.rpc("update_hotspot_settings", { p_radius: input.epsM, p_minimum: input.minPts });
  return error ? failure("forbidden", "Unable to save hotspot settings.") : success({ saved: true });
}
