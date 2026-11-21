import "server-only";
import type { Database } from "@/lib/database.types";
import { serviceClient } from "./service-client";

type Job = Database["public"]["Functions"]["lease_one_delivery"]["Returns"][number];
type Result = { state: "accepted" | "unknown" | "throttled" | "rejected"; id?: string };

function message(job: Job) {
  if (job.purpose === "assignment") return "Tugon: May bagong assignment. Buksan ang Tugon Tanod para basahin at tanggapin ito.";
  if (job.kind === "receipt") return `Tugon: Natanggap ang request mo. Reference: ${job.ref}.`;
  return job.lang === "en" ? `Tugon: There is an update on ${job.ref}. Open your Tugon account or contact the barangay desk.`
    : `Tugon: May update sa ${job.ref}. Buksan ang Tugon o makipag-ugnayan sa barangay hall.`;
}

async function deliver(job: Job): Promise<Result> {
  const text = message(job);
  const email = job.channel === "email";
  const endpoint = email ? "https://api.resend.com/emails" : "https://api.semaphore.co/api/v4/messages";
  const headers = email ? { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `tugon/${job.id}` } : undefined;
  const body = email ? JSON.stringify({ from: process.env.RESEND_FROM, to: [job.recipient], subject: `Tugon · ${job.ref}`, text })
    : new URLSearchParams({ apikey: process.env.SEMAPHORE_API_KEY!, sendername: process.env.SEMAPHORE_SENDER!, number: job.recipient, message: text });
  try {
    const res = await fetch(endpoint, { method: "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(4_000) });
    if (res.status === 429) return { state: "throttled" };
    if (res.status >= 500) return { state: "unknown" };
    if (!res.ok) return { state: "rejected" };
    const data = await res.json();
    const id = email ? data?.id : data?.[0]?.message_id;
    return id == null ? { state: "unknown" } : { state: "accepted", id: String(id) };
  } catch { return { state: "unknown" }; }
}

export async function processDeliveryQueue() {
  if (process.env.TUGON_LIVE_DELIVERY !== "on") return { enabled: false, processed: 0 };
  const channels = [process.env.TUGON_EMAIL_DELIVERY === "on" ? "email" : "", process.env.TUGON_SMS_DELIVERY === "on" ? "sms" : ""].filter(Boolean);
  if (!channels.length) return { enabled: false, processed: 0 };
  if ((channels.includes("email") && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM)) ||
      (channels.includes("sms") && (!process.env.SEMAPHORE_API_KEY || !process.env.SEMAPHORE_SENDER))) throw new Error("Delivery credentials are incomplete");
  const db = serviceClient();
  const deadline = Date.now() + 20_000;
  let processed = 0;
  while (processed < 12 && Date.now() < deadline) {
    const next = await db.rpc("lease_one_delivery", { p_channels: channels }).maybeSingle();
    if (next.error) throw new Error("Delivery lease unavailable", { cause: next.error.code });
    const job = next.data;
    if (!job) break;
    const result = await deliver(job);
    const complete = await db.rpc("finish_delivery", { p_id: job.id, p_attempt: job.attempt, p_result: result.state, p_provider_id: result.id });
    if (complete.error) throw new Error("Delivery outcome could not be committed", { cause: complete.error.code });
    processed++;
  }
  return { enabled: true, processed };
}
