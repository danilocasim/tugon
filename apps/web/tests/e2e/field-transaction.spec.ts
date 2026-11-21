import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { localServices, staffAccount } from "./local-staff";

test("simultaneous field submission loses to a locked cancellation", async () => {
  const { db: setup, admin } = localServices();
  const [{ db: desk }, { db: field }] = [localServices(), localServices()];
  await setup.connect();
  try {
    const staff = await staffAccount("supervisor");
    const supervisor = (await setup.query<{ id: string }>("select id from auth.users where email=$1", [staff.email])).rows[0].id;
    const suffix = String(parseInt(randomUUID().slice(0, 6), 16)).padStart(8, "0");
    const mobile = `+6390${suffix}`;
    const signup = await admin.auth.admin.createUser({ phone: mobile, phone_confirm: true });
    if (!signup.data.user) throw new Error(`Unable to provision synthetic officer (${signup.error?.code})`);
    const officer = signup.data.user.id;
    await setup.query("insert into public.memberships(user_id,role,name,zone,phone) values($1,'tanod','Synthetic concurrent officer','P2',$2)", [officer, mobile]);
    const caseId = randomUUID(), job = randomUUID();
    await setup.query("insert into public.service_requests(id,ref,channel,description,category,status) values($1,$2,'walkin','Synthetic concurrent field assignment','peace','in_progress')", [caseId, `FIELD-RACE-${caseId}`]);
    await setup.query("insert into public.field_assignments(id,request_id,tanod_id,sent_by,status) values($1,$2,$3,$4,'on_scene')", [job, caseId, officer, supervisor]);
    const testKey = `field/${job}.jpg`;
    await setup.query("insert into storage.objects(bucket_id,name) values('report-evidence',$1)", [testKey]);
    await Promise.all([desk.connect(), field.connect()]);
    for (const { client, subject, method, aal } of [
      { client: desk, subject: supervisor, method: "password", aal: "aal2" }, { client: field, subject: officer, method: "otp", aal: "aal1" },
    ]) {
      const session = randomUUID();
      await setup.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())", [session, subject]);
      await client.query("set role authenticated");
      await client.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: subject, session_id: session, aal, amr: [{ method }] })]);
    }
    const fieldPid = (await field.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid;
    await desk.query("begin");
    await desk.query("select public.change_field_assignment($1,'cancel','Supervisor called off the assignment')", [job]);
    const posting = field.query("select public.change_field_assignment($1,'report','Synthetic result from the scene','settled',true)", [job]).then(() => null, (error: { code: string }) => error.code);
    try {
      await expect.poll(async () => (await setup.query<{ n: number }>("select cardinality(pg_blocking_pids($1)) as n", [fieldPid])).rows[0].n).toBeGreaterThan(0);
    } finally { await desk.query("commit"); }
    expect(await posting).toBe("22023");
    const { rows } = await setup.query("select status,has_photo,report from public.field_assignments where id=$1", [job]);
    expect(rows).toEqual([{ status: "cancelled", has_photo: false, report: null }]);
  } finally {
    await Promise.allSettled([setup.end(), desk.end(), field.end()]);
  }
});
