import "server-only";
import { evidenceBucket } from "./evidence";
import { serviceClient } from "./service-client";

export async function processRetention() {
  const scrub = process.env.TUGON_RETENTION_JOBS === "on";
  const cleanup = process.env.TUGON_EVIDENCE_GC === "on";
  if (!scrub && !cleanup) return { enabled: false, scrubbed: 0, evidenceBatch: 0, erased: 0 };
  const db = serviceClient();
  let scrubbed = 0;
  if (scrub) {
    const staged = await db.rpc("stage_approved_erasure");
    if (staged.error) throw new Error("Erasure staging unavailable", { cause: staged.error.code });
    const cases = await db.rpc("stage_retention", { p_limit: 20 });
    if (cases.error) throw new Error("Retention staging unavailable", { cause: cases.error.code });
    scrubbed = cases.data;
  }
  if (cleanup) {
    const queued = await db.rpc("queue_abandoned_evidence");
    if (queued.error) throw new Error("Abandoned evidence scan unavailable", { cause: queued.error.code });
  }
  const batch = await db.rpc("pending_evidence_gc");
  if (batch.error) throw new Error("Evidence cleanup unavailable", { cause: batch.error.code });
  const names = batch.data.map((row) => row.object_name);
  if (names.length) {
    const removal = await evidenceBucket().remove(names);
    if (removal.error) throw new Error("Evidence removal unsuccessful");
    const persisted = await db.rpc("finish_evidence_gc", { p_objects: names });
    if (persisted.error) throw new Error("Evidence removal could not be confirmed", { cause: persisted.error.code });
  }
  let erased = 0;
  if (scrub) {
    const accounts = await db.rpc("erasure_ready_for_auth");
    if (accounts.error) throw new Error("Erasure queue unavailable", { cause: accounts.error.code });
    for (const item of accounts.data) {
      const removal = await db.auth.admin.deleteUser(item.subject);
      if (removal.error && removal.error.code !== "user_not_found") throw new Error("Account removal unsuccessful", { cause: removal.error.code });
      const finished = await db.rpc("finish_erasure", { p_id: item.id });
      if (finished.error) throw new Error("Account removal could not be finalized", { cause: finished.error.code });
      erased++;
    }
  }
  return { enabled: true, scrubbed, evidenceBatch: names.length, erased };
}
