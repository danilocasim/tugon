import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendResidentCode } from "../src/server/resident-auth";

const { signInWithOtp } = vi.hoisted(() => ({
  signInWithOtp: vi.fn<() => Promise<{ error: { status: number; code: string } | null }>>(async () => ({ error: null })),
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/server/identity", () => ({ portalIdentity: vi.fn() }));
vi.mock("../src/server/supabase", () => ({ requestAuth: async () => ({ auth: { signInWithOtp } }) }));

const address = "resident@example.test";
const hostname = "munti-report.example.test";
const action = "resident_email_otp";
const success = { success: true, hostname, action };

beforeEach(() => {
  signInWithOtp.mockClear();
  vi.stubEnv("TUGON_RESIDENT_PUBLIC_SIGNUP", "off");
  vi.stubEnv("TUGON_TURNSTILE_SITE_KEY", "test-site-value");
  vi.stubEnv("TUGON_TURNSTILE_SECRET_KEY", "test-server-value");
  vi.stubEnv("TUGON_ORIGIN", `https://${hostname}`);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("resident OTP enrollment", () => {
  it("limits invite-only mode to existing users even if the Auth stack allows signup", async () => {
    expect(await sendResidentCode(address, undefined)).toEqual({ ok: true, data: null });
    expect(signInWithOtp).toHaveBeenCalledExactlyOnceWith({ email: address, options: { shouldCreateUser: false } });
  });

  it.each([
    { status: 422, code: "otp_disabled" },
    { status: 429, code: "over_email_send_rate_limit" },
  ])("keeps the invite response neutral for Auth error $code", async (error) => {
    signInWithOtp.mockResolvedValueOnce({ error });
    expect(await sendResidentCode(address, undefined)).toEqual({ ok: true, data: null });
  });

  it("does not initiate a send when public mode has missing server configuration", async () => {
    vi.stubEnv("TUGON_RESIDENT_PUBLIC_SIGNUP", "on");
    vi.stubEnv("TUGON_TURNSTILE_SECRET_KEY", undefined);
    expect(await sendResidentCode(address, "challenge-token")).toMatchObject({ ok: false, code: "delivery" });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("creates new users only after verifying a token for the configured host and action", async () => {
    vi.stubEnv("TUGON_RESIDENT_PUBLIC_SIGNUP", "on");
    const siteverify = vi.fn(async () => Response.json(success));
    vi.stubGlobal("fetch", siteverify);
    expect(await sendResidentCode(address, "challenge-token")).toEqual({ ok: true, data: null });
    expect(siteverify).toHaveBeenCalledExactlyOnceWith("https://challenges.cloudflare.com/turnstile/v0/siteverify", expect.objectContaining({
      method: "POST", redirect: "error", body: new URLSearchParams({ secret: "test-server-value", response: "challenge-token" }),
    }));
    expect(signInWithOtp).toHaveBeenCalledExactlyOnceWith({ email: address, options: { shouldCreateUser: true } });
  });

  it.each([
    { ...success, hostname: "different.example.test" },
    { ...success, action: "different_action" },
    { success: false, "error-codes": ["timeout-or-duplicate"] },
  ])("does not send email on a rejected or unrelated challenge (%j)", async (response) => {
    vi.stubEnv("TUGON_RESIDENT_PUBLIC_SIGNUP", "on");
    vi.stubGlobal("fetch", async () => Response.json(response));
    expect(await sendResidentCode(address, "challenge-token")).toMatchObject({ ok: false, code: "challenge" });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("does not fall back to unprotected sending when Siteverify is unavailable", async () => {
    vi.stubEnv("TUGON_RESIDENT_PUBLIC_SIGNUP", "on");
    vi.stubGlobal("fetch", async () => { throw new Error("network failure"); });
    expect(await sendResidentCode(address, "challenge-token")).toMatchObject({ ok: false, code: "challenge" });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
