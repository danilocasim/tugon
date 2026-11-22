import { createHmac, timingSafeEqual } from "node:crypto";
import { isUUID } from "@/lib/uuid";
import { serviceClient } from "@/server/service-client";

const MAX_PAYLOAD = 12_000;
const response = (status: number) => status === 200 ? Response.json({}) : Response.json({ error: { http_code: status, message: "Could not send verification code" } }, { status });

export async function POST(request: Request) {
  if (process.env.TUGON_AUTH_SMS_ENABLED !== "on") return response(503);
  const secret = process.env.TUGON_AUTH_SMS_HOOK_SECRET?.replace(/^v1,whsec_/u, "");
  const key = process.env.SEMAPHORE_API_KEY;
  const sender = process.env.SEMAPHORE_SENDER;
  if (!secret || !key || !sender) return response(503);
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");
  if (!id || !timestamp || !/^\d{10}$/u.test(timestamp) || Math.abs(Date.now()/1000 - Number(timestamp)) > 300 || !signature) return response(401);
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_PAYLOAD || !request.body) return response(413);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PAYLOAD) { await reader.cancel(); return response(413); }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks, size);
  const expected = createHmac("sha256", Buffer.from(secret, "base64")).update(`${id}.${timestamp}.`).update(raw).digest();
  const valid = signature.split(" ").some((part) => {
    const match = /^v1,([A-Za-z0-9+/]{43}=)$/u.exec(part);
    return !!match && timingSafeEqual(expected, Buffer.from(match[1], "base64"));
  });
  if (!valid) return response(401);
  let payload: { user?: { id?: unknown; phone?: unknown }; sms?: { otp?: unknown } };
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return response(400); }
  if (!payload || !isUUID(payload.user?.id) || typeof payload.user?.phone !== "string" || typeof payload.sms?.otp !== "string" || !/^\d{6}$/u.test(payload.sms.otp)) return response(400);
  const phone = `+${payload.user.phone.replace(/^\+/u, "")}`;
  if (!/^\+639\d{9}$/u.test(phone)) return response(400);
  const db = serviceClient();
  const { data: lease, error } = await db.rpc("lease_sms_auth_hook", { p_id: id, p_user: payload.user.id, p_phone: phone });
  if (error || lease === "unconfirmed") return response(503);
  if (lease === "accepted") return response(200);
  if (lease !== "leased") return response(403);
  try {
    const result = await fetch("https://api.semaphore.co/api/v4/otp", {
      method: "POST", body: new URLSearchParams({ apikey: key, number: phone, sendername: sender, code: payload.sms.otp, message: "Munti Report: {otp} is your verification code. Do not share it." }),
      redirect: "error", signal: AbortSignal.timeout(2500),
    });
    if (!result.ok) return response(503);
    const acknowledged = await db.rpc("accept_sms_auth_hook", { p_id: id });
    return response(!acknowledged.error && acknowledged.data ? 200 : 503);
  } catch { return response(503); }
}
