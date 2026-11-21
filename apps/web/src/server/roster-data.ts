import "server-only";
import { addDays, manilaDate, weekStart } from "@/lib/duty";
import type { DutyShift, Shift, Staff } from "@/lib/domain";
import type { Database } from "@/lib/database.types";
import type { Membership } from "./identity";
import { requestAuth } from "./supabase";

export function officer(row: Pick<Membership, "user_id" | "name" | "title" | "zone" | "phone"> & { active?: boolean }): Staff {
  return {
    id: row.user_id, name: row.name, title: row.title, role: "tanod", team: null, email: "", active: row.active ?? true,
    phone: row.phone?.replace(/^\+63/u, "0"), zone: row.zone,
  };
}

function shift(row: Database["public"]["Tables"]["duty_roster"]["Row"]): DutyShift {
  return { id: `d_${row.local_date}_${row.shift}_${row.officer_id}`, tanodId: row.officer_id, date: row.local_date, shift: row.shift as Shift };
}

export async function readRoster(member?: Membership) {
  const now = Date.now();
  const client = await requestAuth();
  const monday = weekStart(manilaDate(now));
  const after = member ? addDays(monday, -1) : addDays(monday, -366);
  const before = addDays(monday, member ? 20 : 372);
  const rows: DutyShift[] = [];
  for (let offset = 0;; offset += 500) {
    const query = client.from("duty_roster").select("*").gte("local_date", after).lte("local_date", before)
      .order("local_date").order("shift").order("officer_id").range(offset, offset + 499);
    if (member) query.eq("officer_id", member.user_id);
    const { data, error } = await query;
    if (error) throw new Error("Unable to read the duty roster", { cause: error.code });
    rows.push(...data.map(shift));
    if (data.length < 500) return rows;
  }
}

export async function readOfficers() {
  const client = await requestAuth();
  const { data, error } = await client.from("memberships").select("user_id,name,title,active,phone,zone").eq("role", "tanod").order("zone").order("name");
  if (error) throw new Error("Unable to read officers", { cause: error.code });
  return data.map(officer);
}
