import { createHash, randomInt } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localServices } from "./local-staff";

test("GoTrue rejects expired and consumed Tanod codes outside the fixed OTP fixture", async () => {
  const { admin, db } = localServices();
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key } = process.env;
  if (!url || !key) throw new Error("Use the isolated Supabase test harness");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const phone = `639000${randomInt(100000, 999999)}`;
  const { data, error } = await admin.auth.admin.createUser({ phone: `+${phone}`, phone_confirm: true });
  if (!data.user) throw new Error(`Could not provision the disposable phone fixture (${error?.code})`);
  const userId = data.user.id;

  // Fixed local test codes bypass GoTrue's expiry. Seed its real stored token instead; no SMS is sent.
  const code = "041628";
  const hash = createHash("sha224").update(phone + code).digest("hex");
  const verify = (token: string) => client.auth.verifyOtp({ phone: `+${phone}`, token, type: "sms" });
  await db.connect();
  try {
    const issue = async (secondsAgo: number) => {
      const issued = await db.query(
        "update auth.users set confirmation_token=$1, confirmation_sent_at=now() - make_interval(secs => $2) where id=$3",
        [hash, secondsAgo, userId],
      );
      expect(issued.rowCount).toBe(1);
    };
    const expectDenied = async (token: string) => {
      const denied = await verify(token);
      expect(denied.error?.code).toBe("otp_expired");
      expect(denied.data.session).toBeNull();
    };

    await issue(86400);
    await expectDenied(code);
    await issue(0);
    await expectDenied("141628");
    const valid = await verify(code);
    expect(valid.error).toBeNull();
    expect(valid.data.session?.user.id).toBe(userId);
    await expectDenied(code);
  } finally {
    await db.end();
  }
});
