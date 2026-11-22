/**
 * Outgoing SMS. A message is queued inside the same commit as the change that
 * caused it, then delivered after the commit, so a failed action never texts
 * anyone. Without a provider (the prototype default) messages are recorded as
 * "simulated" and shown in Administration → SMS log. With SMS_PROVIDER=semaphore
 * and SEMAPHORE_API_KEY set they go out through Semaphore (sender name from
 * SEMAPHORE_SENDER, if registered).
 */
import type { DB, SmsMessage, SmsPurpose } from "@/lib/domain";
import { mutate, readDb, subscribe } from "./db";

const PROVIDER = process.env.SMS_PROVIDER === "semaphore" && process.env.SEMAPHORE_API_KEY ? "semaphore" : null;
const KEEP = 500;
let seq = 0;

/** 160 GSM characters is one SMS segment; longer texts cost more and get cut by some phones. */
export const smsText = (s: string) => (s.length > 158 ? `${s.slice(0, 157).trimEnd()}…` : s);

export function queueSms(db: DB, to: string | null | undefined, body: string, purpose: SmsPurpose, requestId: string | null = null) {
  if (!to || !/^09\d{9}$/.test(to)) return;
  db.sms.unshift({
    id: `sms_${Date.now().toString(36)}${(++seq).toString(36)}`,
    to,
    body: smsText(body),
    purpose,
    requestId,
    at: Date.now(),
    status: PROVIDER ? "queued" : "simulated",
    error: null,
  });
  if (db.sms.length > KEEP) db.sms.length = KEEP;
}

async function deliver(m: SmsMessage): Promise<string | null> {
  try {
    const form = new URLSearchParams({ apikey: process.env.SEMAPHORE_API_KEY!, number: m.to, message: m.body });
    if (process.env.SEMAPHORE_SENDER) form.set("sendername", process.env.SEMAPHORE_SENDER);
    const res = await fetch("https://api.semaphore.co/api/v4/messages", { method: "POST", body: form, signal: AbortSignal.timeout(10_000) });
    return res.ok ? null : `Provider answered HTTP ${res.status}`;
  } catch (e) {
    return e instanceof Error ? e.message : "Send failed";
  }
}

let flushing = false;
async function flush() {
  if (!PROVIDER || flushing) return;
  const pending = readDb().sms.filter((m) => m.status === "queued");
  if (!pending.length) return;
  flushing = true;
  try {
    const results = await Promise.all(pending.map(async (m) => [m.id, await deliver(m)] as const));
    mutate((db) => {
      for (const [id, error] of results) {
        const m = db.sms.find((x) => x.id === id);
        if (!m) continue;
        m.status = error ? "failed" : "sent";
        m.error = error;
      }
    });
  } finally {
    flushing = false;
  }
}

// Deliver after every commit; registered once per server process, surviving dev hot reloads.
const g = globalThis as typeof globalThis & { __tugonSms?: boolean };
if (!g.__tugonSms) {
  g.__tugonSms = true;
  subscribe(() => void flush());
}
