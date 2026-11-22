"use client";

import { ArrowLeft, Check, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Mark, Seal } from "@/components/tugon/marks";
import { useAct, useStaff } from "@/hooks/use-live";
import { ROLE } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { signInStaff } from "@/server/actions";
import { useStaffLang } from "./i18n";
import { Avatar, ROLE_HOME } from "./ui";

const input = "field h-12 w-full rounded-2xl px-4 text-[15px]";

export function StaffSignIn() {
  const { data } = useStaff();
  const router = useRouter();
  const params = useSearchParams();
  const { act, pending } = useAct();
  const [step, setStep] = useState<"account" | "mfa">("account");
  const [staffId, setStaffId] = useState("s_jessa");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { t } = useStaffLang();

  const personas = data?.staff.filter((s) => s.active && !s.invited) ?? [];
  const chosen = personas.find((s) => s.id === staffId);

  async function verify() {
    const r = await act("signin", () => signInStaff({ staffId, code }), { quiet: true });
    if (!r.ok) return setError(r.message);
    const next = params.get("next");
    router.replace(next?.startsWith("/barangay/") && !next.startsWith("/barangay/signin") ? next : ROLE_HOME[r.data.role]);
  }

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
            <p className="text-[15px] font-bold">{data?.settings.barangay ?? "Barangay Sampaguita"}</p>
            <p className="text-[12.5px] text-primary-foreground/70">{t("Muntinlupa City · Staff portal")}</p>
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
            <ArrowLeft className="size-4" /> Prototype hub
          </Link>
          <span className="flex items-center gap-2 lg:hidden">
            <Mark size={26} /> <span className="text-[14px] font-bold">Tugon</span>
          </span>
        </div>

        <div className="mx-auto my-auto w-full max-w-[440px] py-8">
          <AnimatePresence mode="wait" initial={false}>
            {step === "account" ? (
              <motion.form
                key="account"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="grid gap-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  setStep("mfa");
                }}
              >
                <div>
                  <h1 className="text-[26px] font-bold tracking-tight">{t("Sign in to Tugon")}</h1>
                  <p className="mt-1 text-[14.5px] text-muted-foreground">{t("Staff accounts use a password and an authenticator code.")}</p>
                </div>

                <fieldset className="grid gap-2">
                  <legend className="mb-2 flex w-full items-center justify-between text-[13px] font-semibold">
                    {t("Demo account")}
                    <span className="rounded-full border border-dashed border-[#8a7f6a] bg-[#fffbe9] px-2 py-0.5 font-mono text-[10.5px] font-normal text-[#5b5240]">prototype</span>
                  </legend>
                  <div className="grid max-h-[300px] gap-0.5 overflow-y-auto rounded-[20px] bg-card p-1.5 shadow-sheet">
                    {personas.map((s) => (
                      <label
                        key={s.id}
                        className={cn("flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-fill/60", staffId === s.id && "bg-brand-soft hover:bg-brand-soft")}
                      >
                        <input type="radio" name="persona" value={s.id} checked={staffId === s.id} onChange={() => setStaffId(s.id)} className="sr-only" />
                        <Avatar name={s.name} className="size-9 text-[12px]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold">{s.name}</span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {t(ROLE[s.role].en)} · {t(ROLE[s.role].blurb)}
                          </span>
                        </span>
                        {staffId === s.id && <Check className="size-4 shrink-0 text-primary" />}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-[13px] font-semibold">{t("Work email")}</span>
                    <input readOnly value={chosen ? `${chosen.name.split(" ").at(-2)?.toLowerCase().replace(/[^a-z]/g, "")}@sampaguita.gov.ph` : ""} className={cn(input, "text-muted-foreground")} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[13px] font-semibold">{t("Password")}</span>
                    <input readOnly type="password" value="prototype-password" className={cn(input, "text-muted-foreground")} />
                  </label>
                </div>

                <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-bold text-primary-foreground shadow-press transition hover:bg-brand-deep">
                  {t("Continue")}
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
                  void verify();
                }}
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-primary">
                  <ShieldCheck className="size-6" />
                </span>
                <div>
                  <h1 className="text-[26px] font-bold tracking-tight">{t("Two-step verification")}</h1>
                  <p className="mt-1 text-[14.5px] text-muted-foreground">
                    {t("Enter the 6-digit code from your authenticator app to sign in as")} <strong className="text-foreground">{chosen?.name}</strong>.
                  </p>
                </div>
                <label className="grid gap-1.5">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                    <KeyRound className="size-3.5" /> {t("Authenticator code")}
                  </span>
                  <input
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    aria-invalid={!!error || undefined}
                    aria-describedby="mfa-hint"
                    className={cn(input, "h-14 text-center font-mono text-[26px] tracking-[0.5em]")}
                  />
                  <span id="mfa-hint" className="font-mono text-[11.5px] text-[#5b5240]">
                    Prototype: use 246810
                  </span>
                  {error && (
                    <span role="alert" className="text-[13px] font-semibold text-high">
                      {t(error)}
                    </span>
                  )}
                </label>
                <button
                  type="submit"
                  disabled={code.length !== 6 || pending === "signin"}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-bold text-primary-foreground shadow-press transition hover:bg-brand-deep disabled:opacity-60"
                >
                  {pending === "signin" && <Loader2 className="size-4 animate-spin" />} {t("Verify and sign in")}
                </button>
                <button type="button" onClick={() => setStep("account")} className="text-[13.5px] font-semibold text-primary">
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
