"use client";

import { ArrowLeft, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { Seal } from "@/components/tugon/marks";
import { useAct } from "@/hooks/use-live";
import { PUROKS } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { createResidentAccount, sendResidentCode, signInResident } from "@/server/resident-auth";
import { EmailChallenge } from "./email-challenge";
import { useT } from "./lang";
import { LangSwitch } from "./ui";

type Step = "email" | "code" | "signup";

export const fieldClass = "field h-12 w-full rounded-2xl px-4 text-[16px]";
export const primaryBtn =
  "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-[16px] font-bold text-primary-foreground shadow-press transition hover:bg-brand-deep active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none";

export function ResidentSignIn({ next, pendingProfile, enrollmentMode, challenge }: {
  next: string;
  pendingProfile: boolean;
  enrollmentMode: "invite" | "public" | "unavailable";
  challenge?: { siteKey: string; action: string };
}) {
  const { t, lang } = useT();
  const router = useRouter();
  const { act, pending } = useAct();
  const [step, setStep] = useState<Step>(pendingProfile ? "signup" : "email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [purok, setPurok] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeAttempt, setChallengeAttempt] = useState(0);

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError({ field: "email", message: t("signin.invalidEmail") });
    if (challenge && !challengeToken) return setError({ field: "challenge", message: t("signin.challengeRequired") });
    setError(null);
    const result = await act("email", () => sendResidentCode(email, challengeToken), { quiet: true });
    if (challenge) {
      setChallengeToken(null);
      setChallengeAttempt((attempt) => attempt + 1);
    }
    if (!result.ok) {
      const message = result.code === "challenge" ? t("signin.challengeRequired")
        : result.code === "rate_limit" ? t("signin.rateLimit")
        : result.code === "invalid" ? t("signin.invalidEmail")
        : t("signin.deliveryFailed");
      return setError({ field: result.code === "challenge" ? "challenge" : "email", message });
    }
    setCode("");
    setStep("code");
  }

  async function onCode(e: FormEvent) {
    e.preventDefault();
    const r = await act("code", () => signInResident({ email, code }), { quiet: true });
    if (!r.ok) return setError({ field: String(r.meta?.field ?? "code"), message: r.message });
    setError(null);
    if (r.data.known) router.replace(next);
    else setStep("signup");
  }

  async function onSignup(e: FormEvent) {
    e.preventDefault();
    const r = await act("signup", () => createResidentAccount({ name, purok, lang, consent }), { quiet: true });
    if (!r.ok) return setError({ field: String(r.meta?.field ?? ""), message: r.message });
    router.replace(next);
  }

  const err = (field: string) =>
    error && (error.field === field || !error.field) ? (
      <p id={`${field}-error`} role="alert" className="text-[13.5px] font-semibold text-high">
        {error.message}
      </p>
    ) : null;

  return (
    <div className="mx-auto grid max-w-md gap-6 pt-2 sm:pt-8">
      <div className="flex items-center justify-between">
        <Link href="/resident" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {t("nav.home")}
        </Link>
        <LangSwitch compact />
      </div>

      <div className="rounded-[28px] bg-card p-6 shadow-sheet sm:p-8">
        <Seal size={48} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
            {step === "email" && (
              <form onSubmit={onEmail} className="mt-5 grid gap-4" noValidate>
                <div>
                  <h1 className="text-[24px] font-bold tracking-tight">{t("signin.title")}</h1>
                  <p className="mt-1 text-[15px] text-muted-foreground">{t("signin.why")}</p>
                  {enrollmentMode === "invite" && <p className="mt-2 text-[13.5px] text-muted-foreground">{t("signin.inviteOnly")}</p>}
                  {enrollmentMode === "unavailable" && <p role="alert" className="mt-2 text-[13.5px] font-semibold text-high">{t("signin.challengeUnavailable")}</p>}
                </div>
                <label className="grid gap-1.5">
                  <span id="email-label" className="text-[14.5px] font-semibold">{t("signin.email")}</span>
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-labelledby="email-label"
                    aria-invalid={error?.field === "email" || undefined}
                    aria-describedby={error?.field === "email" ? "email-error" : undefined}
                    className={fieldClass}
                    placeholder="pangalan@email.com"
                    autoFocus
                  />
                  {err("email")}
                </label>
                {challenge && <EmailChallenge key={challengeAttempt} {...challenge} onToken={setChallengeToken} />}
                {err("challenge")}
                <button type="submit" disabled={pending !== null || enrollmentMode === "unavailable"} className={primaryBtn}>
                  {pending === "email" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} {t("signin.send")}
                </button>
              </form>
            )}

            {step === "code" && (
              <form onSubmit={onCode} className="mt-5 grid gap-4" noValidate>
                <div>
                  <h1 className="text-[24px] font-bold tracking-tight">{t("signin.title")}</h1>
                  <p className="mt-1 text-[15px] text-muted-foreground">{t("signin.sentTo", { email })}</p>
                  {enrollmentMode === "invite" && <p className="mt-2 text-[13.5px] text-muted-foreground">{t("signin.inviteOnly")}</p>}
                </div>
                <label className="grid gap-1.5">
                  <span id="code-label" className="text-[14.5px] font-semibold">{t("signin.code")}</span>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    aria-labelledby="code-label"
                    aria-invalid={error?.field === "code" || undefined}
                    aria-describedby={error ? "code-hint code-error" : "code-hint"}
                    className={cn(fieldClass, "h-14 text-center font-mono text-[26px] tracking-[0.5em]")}
                    autoFocus
                  />
                  <span id="code-hint" className="font-mono text-[12px] text-[#5b5240]">
                    {t("signin.hint")}
                  </span>
                  {err("code")}
                </label>
                <button type="submit" disabled={code.length !== 6 || pending === "code"} className={primaryBtn}>
                  {pending === "code" && <Loader2 className="size-4 animate-spin" />} {t("signin.verify")}
                </button>
                <button type="button" onClick={() => setStep("email")} className="text-[14px] font-semibold text-primary">
                  {t("signin.change")}
                </button>
              </form>
            )}

            {step === "signup" && (
              <form onSubmit={onSignup} className="mt-5 grid gap-4" noValidate>
                <div>
                  <h1 className="text-[24px] font-bold tracking-tight">{t("signup.title")}</h1>
                  <p className="mt-1 text-[15px] text-muted-foreground">{t("signup.sub")}</p>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-[14.5px] font-semibold">{t("signup.name")}</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={fieldClass} aria-invalid={error?.field === "Name" || undefined} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[14.5px] font-semibold">{t("signup.purok")}</span>
                  <select value={purok} onChange={(e) => setPurok(e.target.value)} className={fieldClass} aria-invalid={error?.field === "purok" || undefined}>
                    <option value="" disabled>
                      —
                    </option>
                    {PUROKS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-start gap-3 rounded-2xl bg-fill p-3.5 text-[14px] leading-snug">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#0b5d4b]" />
                  <span>
                    {t("signup.consent")}{" "}
                    <Link href="/resident/privacy" className="font-semibold text-primary underline underline-offset-2">
                      {t("account.privacy")}
                    </Link>
                  </span>
                </label>
                {error && (
                  <p role="alert" className="text-[13.5px] font-semibold text-high">
                    {error.message}
                  </p>
                )}
                <button type="submit" disabled={!consent || pending === "signup"} className={primaryBtn}>
                  {pending === "signup" && <Loader2 className="size-4 animate-spin" />} {t("signup.create")}
                </button>
              </form>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
