"use client";

import { ArrowLeft, Check, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useState, useTransition } from "react";
import { Mark, Seal } from "@/components/tugon/marks";
import { requestStaffReset, prepareStaffFactor, setStaffPassword, startStaffSession, verifyStaffFactor } from "@/server/staff-auth";
import { cn } from "@/lib/utils";
import { setStaffLang, useStaffLang } from "./i18n";

const input = "field h-12 w-full rounded-2xl px-4 text-[15px]";

export function StaffSignIn({ next, barangay, startingName, canSetPassword, passwordMfa, expired }: {
  next: string; barangay: string; startingName: string | null; canSetPassword: boolean; passwordMfa: boolean; expired: boolean;
}) {
  const router = useRouter();
  const { t, lang } = useStaffLang();
  const [pending, transition] = useTransition();
  const [step, setStep] = useState<"account" | "mfa" | "password" | "reset">(canSetPassword ? "password" : startingName ? "mfa" : "account");
  const [name, setName] = useState(startingName);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factor, setFactor] = useState<{ id: string; qr: string | null; secret: string | null } | null>(null);
  const [error, setError] = useState<string | null>(expired ? "Open a new invitation or password reset email." : null);
  const [message, setMessage] = useState<string | null>(null);

  function switchTo(target: typeof step) {
    setStep(target);
    setError(null);
    setMessage(null);
    setCode("");
    setPassword("");
    setFactor(null);
  }

  function submit() {
    setError(null);
    setMessage(null);
    transition(async () => {
      if (step === "reset") {
        const res = await requestStaffReset(email);
        if (!res.ok) return setError(res.message);
        setMessage("If the address is eligible, a reset email will arrive shortly.");
        return;
      }
      if (step === "password") {
        const res = await setStaffPassword(password, code);
        if (!res.ok) return setError(res.message);
        switchTo("account");
        setMessage("Password saved. Sign in to continue.");
        router.replace("/barangay/signin");
        return;
      }
      if (step === "account") {
        const res = await startStaffSession({ email, password });
        if (!res.ok) return setError(res.message);
        switchTo("mfa");
        setName(res.data.name);
      }
      if (!factor || step === "account") {
        const res = await prepareStaffFactor();
        if (!res.ok) return setError(res.message);
        setFactor(res.data);
        return;
      }
      const res = await verifyStaffFactor({ id: factor.id, code });
      if (!res.ok) return setError(res.message);
      router.replace(next);
      router.refresh();
    });
  }
  const heading = step === "password" ? "Set your staff password" : step === "reset" ? "Reset your password" : "Sign in to Tugon";
  const button = step === "password" ? "Save password" : step === "reset" ? "Send reset email" : "Continue";
  const feedback = <>
    {error && <p role="alert" className="text-[13px] font-semibold text-high">{t(error)}</p>}
    {message && <p role="status" className="rounded-2xl bg-brand-soft p-3 text-[14px] text-primary">{t(message)}</p>}
  </>;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-brand-deep p-10 text-primary-foreground lg:flex lg:flex-col">
        <svg viewBox="0 0 400 400" className="pointer-events-none absolute -right-24 -bottom-24 size-[520px] opacity-[0.08]" aria-hidden>
          {[0, 72, 144, 216, 288].map((deg) => (
            <ellipse key={deg} cx="200" cy="120" rx="44" ry="86" transform={`rotate(${deg} 200 200)`} fill="none" stroke="currentColor" strokeWidth="6" />
          ))}
          <circle cx="200" cy="200" r="26" fill="currentColor" />
        </svg>
        <div className="flex items-center gap-3">
          <Seal size={44} />
          <div className="leading-tight">
            <p className="text-[15px] font-bold">{barangay}</p>
            <p className="text-[12.5px] text-primary-foreground/70">{t("Staff portal")}</p>
          </div>
        </div>
        <div className="mt-auto max-w-md">
          <p className="text-[34px] leading-[1.1] font-bold tracking-[-0.025em] text-balance">{t("Every report seen, routed, and answered.")}</p>
          <ul className="mt-6 grid gap-2.5 text-[14.5px] text-primary-foreground/85">
            {["Model suggestions you confirm, never auto-decide", "A queue ranked by urgency, with aging", "Hotspots from where residents report"].map((point) => (
              <li key={point} className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-gold" /> {t(point)}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Tugon
          </Link>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setStaffLang(lang === "en" ? "fil" : "en")} className="min-h-11 rounded-full bg-fill px-3 text-[13px] font-bold">{lang === "en" ? "Filipino" : "English"}</button>
            <span className="flex items-center gap-2 lg:hidden"><Mark size={26} /><span className="text-[14px] font-bold">Tugon</span></span>
          </div>
        </div>

        <div className="mx-auto my-auto w-full max-w-[440px] py-8">
          <AnimatePresence mode="wait" initial={false}>
            {step !== "mfa" ? (
              <motion.form key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="grid gap-5"
                onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <div>
                  <h1 className="text-[26px] font-bold tracking-tight">{t(heading)}</h1>
                  {step === "account" && <p className="mt-1 text-[14.5px] text-muted-foreground">{t("Staff accounts use a password and an authenticator code.")}</p>}
                </div>
                <div className="grid gap-3">
                  {step !== "password" && <label className="grid gap-1.5">
                    <span className="text-[13px] font-semibold">{t("Work email")}</span>
                    <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
                  </label>}
                  {step !== "reset" && <label className="grid gap-1.5">
                    <span className="text-[13px] font-semibold">{t("Password")}</span>
                    <input type="password" autoComplete={step === "password" ? "new-password" : "current-password"} required minLength={step === "password" ? 14 : undefined} maxLength={256}
                      value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
                  </label>}
                  {step === "password" && passwordMfa && <label className="grid gap-1.5">
                    <span className="text-[13px] font-semibold">{t("Authenticator code")}</span>
                    <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={input} />
                  </label>}
                </div>
                {feedback}
                <button type="submit" disabled={pending} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-bold text-primary-foreground shadow-press transition hover:bg-brand-deep disabled:opacity-60">
                  {pending && <Loader2 className="size-4 animate-spin" />} {t(button)}
                </button>
                <button type="button" onClick={() => switchTo(step === "account" ? "reset" : "account")} className="min-h-11 text-[13.5px] font-semibold text-primary">
                  {t(step === "account" ? "Forgot your password?" : "Back to sign in")}
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="mfa"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="grid gap-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-primary">
                  <ShieldCheck className="size-6" />
                </span>
                <div>
                  <h1 className="text-[26px] font-bold tracking-tight">{t("Two-step verification")}</h1>
                  <p className="mt-1 text-[14.5px] text-muted-foreground">
                    {t("Enter the 6-digit code from your authenticator app to sign in as")} <strong className="text-foreground">{name}</strong>.
                  </p>
                </div>
                {factor?.secret && <div className="grid justify-items-start gap-3 rounded-[20px] bg-card p-4 shadow-sheet">
                  <p className="text-[14px]">{t("Scan the QR code or enter this setup key in your authenticator app.")}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {factor.qr && <img className="size-44" src={factor.qr} alt={t("Authenticator setup QR code")} />}
                  <code className="max-w-full text-[13px] break-all">{factor.secret}</code>
                </div>}
                {factor && <label className="grid gap-1.5">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold"><KeyRound className="size-3.5" /> {t("Authenticator code")}</span>
                  <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-invalid={!!error || undefined}
                    className={cn(input, "h-14 text-center font-mono text-[26px] tracking-[0.5em]")} />
                </label>}
                {feedback}
                <button
                  type="submit"
                  disabled={(!!factor && code.length !== 6) || pending}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-bold text-primary-foreground shadow-press transition hover:bg-brand-deep disabled:opacity-60"
                >
                  {pending && <Loader2 className="size-4 animate-spin" />} {t(factor ? "Verify and sign in" : "Continue to authenticator")}
                </button>
                <button type="button" onClick={() => switchTo("account")} className="min-h-11 text-[13.5px] font-semibold text-primary">
                  {t("Use a different account")}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
