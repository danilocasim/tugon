import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { localServices } from "./local-staff";

test("abandoned private JPEG can be removed and finalized safely on repeat", async () => {
  const { admin, db } = localServices();
  const object = `synthetic-janitor/${randomUUID()}.jpg`;
  const photo = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#dce9e0" } }).jpeg().toBuffer();
  const bucket = admin.storage.from("report-evidence");
  expect((await bucket.upload(object, photo, { contentType: "image/jpeg" })).error).toBeNull();
  expect((await bucket.info(object)).error).toBeNull();
  await db.connect();
  try {
    await db.query("update storage.objects set created_at=now()-interval '25 hours' where bucket_id='report-evidence' and name=$1", [object]);
    await db.query("select public.queue_abandoned_evidence()");
    const state = () => db.query<{ removed_at: Date | null }>("select removed_at from tugon_private.evidence_gc where object_name=$1", [object]);
    expect((await state()).rows).toEqual([{ removed_at: null }]);
    expect((await bucket.remove([object])).error).toBeNull();
    await db.query("select public.finish_evidence_gc(array[$1]::text[])", [object]);
    const first = (await state()).rows[0].removed_at;
    expect(first).toBeInstanceOf(Date);
    expect((await bucket.info(object)).error).not.toBeNull();
    await db.query("select public.finish_evidence_gc(array[$1]::text[])", [object]);
    expect((await state()).rows[0].removed_at).toEqual(first);
  } finally { await db.end(); }
});
