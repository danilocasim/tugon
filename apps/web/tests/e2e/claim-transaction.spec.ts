import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { localServices, staffAccount, staffSignIn } from "./local-staff";

const handlerTeam = `test-queue-${randomUUID().slice(0, 8)}`;

test("two authenticated staff sessions cannot both claim one queue case", async () => {
  const { db: setup } = localServices();
  const [{ db: first }, { db: second }] = [localServices(), localServices()];
  await setup.connect();
  try {
    // Isolate this queue from other synthetic test cases on the same local stack.
    await setup.query("insert into public.teams(id,name) values ($1,'Synthetic concurrent queue')", [handlerTeam]);
    const accounts = await Promise.all([staffAccount("handler", handlerTeam), staffAccount("handler", handlerTeam)]);
    const requests = [randomUUID(), randomUUID()];
    for (const [index, id] of requests.entries()) {
      await setup.query("insert into public.service_requests(id,ref,channel,description,status,category) values($1,$2,'walkin','Synthetic concurrent claim','queued','infra')", [id, `RACE-${id}`]);
      await setup.query("insert into public.case_work(request_id,team_id,urgency) values($1,$2,$3)", [id, handlerTeam, index === 0 ? "normal" : "high"]);
    }
    const users = (await setup.query<{ id: string }>("select id from auth.users where email=any($1::text[]) order by id", [accounts.map((account) => account.email)])).rows;
    const sessions = [randomUUID(), randomUUID()];
    for (const [i, user] of users.entries()) {
      await setup.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())", [sessions[i], user.id]);
    }
    await Promise.all([first.connect(), second.connect()]);
    for (const [i, actor] of [first, second].entries()) {
      await actor.query("set role authenticated");
      await actor.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: users[i].id, session_id: sessions[i], aal: "aal2", amr: [{ method: "password" }] })]);
    }
    await expect(first.query("select public.change_case($1,'claim')", [requests[0]])).rejects.toMatchObject({ code: "P4001", detail: "1" });
    const racing = await Promise.allSettled([first, second].map((db) => db.query("select public.change_case($1,'claim')", [requests[1]])));
    expect(racing.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const denied = racing.find((result) => result.status === "rejected");
    expect(denied && denied.reason).toMatchObject({ code: "22023" });
    const committed = await setup.query<{ assignee_id: string; events: number }>("select w.assignee_id,(select count(*)::int from public.internal_case_events e where e.request_id=w.request_id and e.event_type='assigned') as events from public.case_work w where w.request_id=$1", [requests[1]]);
    expect(users.map((u) => u.id)).toContain(committed.rows[0].assignee_id);
    expect(committed.rows[0].events).toBe(1);
  } finally {
    await Promise.allSettled([setup.end(), first.end(), second.end()]);
  }
});

test("an in-progress request without recorded triage remains visible in the work queue", async ({ page }) => {
  const supervisor = await staffAccount("supervisor");
  const { db } = localServices();
  const id = randomUUID();
  const ref = `UNTRIAGED-${id.slice(0, 8)}`;
  await db.connect();
  try {
    await db.query("insert into public.service_requests(id,ref,channel,description,status,category) values($1,$2,'walkin','Synthetic transferred work','in_progress','infra')", [id, ref]);
    await db.query("insert into public.case_work(request_id,team_id,started_at) values($1,'t_works',now())", [id]);
  } finally { await db.end(); }
  await page.setViewportSize({ width: 320, height: 844 });
  await staffSignIn(page, supervisor, "/barangay/queue");
  const card = page.getByRole("link", { name: new RegExp(ref, "u") });
  await expect(card).toHaveAttribute("href", `/barangay/cases/${id}`);
  await expect(card).toContainText("Triage not recorded");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
