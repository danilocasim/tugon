import "server-only";
import { cache } from "react";
import type { KpCase, KpHearing, KpHearingResult, KpStage } from "@/lib/domain";
import { requestAuth } from "./supabase";

const at = (str: string | null) => str ? Date.parse(str) : null;
export const readLupon = cache(async (): Promise<KpCase[]> => {
  const db = await requestAuth();
  const { data, error } = await db.from("lupon_cases").select("*, lupon_hearings(*)").order("filed_at", { ascending: false }).order("id").limit(200);
  if (error) throw new Error("Unable to read the Lupon docket", { cause: error.code });
  return data.map((row) => ({
    id: row.id, number: row.number, requestId: row.request_id, complainant: row.complainant,
    respondent: row.respondent, respondentAddress: row.respondent_address, nature: row.nature,
    filedAt: Date.parse(row.filed_at), filedBy: row.filed_by, stage: row.stage as KpStage, mediationStart: Date.parse(row.filed_at),
    conciliationStart: at(row.conciliation_start), extended: row.extended,
    hearings: row.lupon_hearings.map((h): KpHearing => ({ id: h.id, kind: h.kind as KpHearing["kind"], at: Date.parse(h.at), summonsServed: h.summons_served,
      result: h.result as KpHearingResult | null, notes: h.notes, recordedAt: at(h.recorded_at) })).sort((a, b) => a.at - b.at),
    settlement: row.settlement && row.settlement_at ? { text: row.settlement, at: Date.parse(row.settlement_at) } : null,
    closedAt: at(row.closed_at), closeNote: row.close_note,
  }));
});
