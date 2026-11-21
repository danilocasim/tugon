"use client";

import { ArrowLeft, Loader2, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { sendTanodCode, verifyTanodCode } from "@/server/tanod-auth";
import { useTL } from "./lang";
import { TanodMark } from "./shell";

export function TanodSignIn({ next }: { next: string }) {
  const { t, lang, setLang } = useTL();
  const router = useRouter();
  const [pending, transition] = useTransition();
  const [step, setStep] = useState<"account" | "code">("account");
  const [phone, setPhone] = useState("");
  const [suffix, setSuffix] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function send() {
    setError(null);
    transition(async () => {
      const res = await sendTanodCode(phone);
      if (!res.ok) return setError(res.message);
      setSuffix(res.data.suffix);
      setStep("code");
    });
  }

  function verify() {
    setError(null);
    transition(async () => {
      const res = await verifyTanodCode({ phone, code });
      if (!res.ok) return setError(res.message);
      router.replace(next);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-5">
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted-foreground">
          <ArrowLeft className="size-4" /> {t("si.hub")}
        </Link>
        <div className="inline-flex rounded-full bg-fill p-[3px] text-[13px] font-semibold">
          {(["fil", "en"] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} className={cn("h-8 rounded-full px-3 transition", lang === l ? "bg-card shadow-sheet" : "text-muted-foreground")}>
              {l === "fil" ? "Filipino" : "English"}
            </button>
          ))}
        </div>
      </div>

      <div className="my-auto grid gap-6 py-8">
        <div className="grid justify-items-start gap-4">
          <TanodMark className="size-14 rounded-[18px] [&_svg]:size-7" />
          <div>
            <h1 className="text-[28px] leading-tight font-bold tracking-tight">{t("si.title")}</h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground">{t("si.sub")}</p>
          </div>
        </div>

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
                send();
              }}
            >
              <label className="grid gap-1.5">
                <span className="text-[14px] font-semibold">{t("si.mobile")}</span>
                <input required type="tel" autoComplete="tel" maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} className="field h-14 rounded-2xl px-4 text-[17px] tabular" />
              </label>
              {error && <p role="alert" className="text-[14px] font-semibold text-high">{error}</p>}
              <button type="submit" disabled={!phone || pending} className="h-14 rounded-full bg-primary text-[16px] font-bold text-primary-foreground shadow-press disabled:opacity-60">
                {t("si.continue")}
              </button>
            </motion.form>
          ) : (
            <motion.form
              key="code"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="grid gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <div className="flex items-start gap-3 rounded-2xl bg-brand-soft p-4">
                <MessageSquareText className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <p className="text-[16px] font-bold">{t("si.codeTitle")}</p>
                  <p className="text-[14px] text-foreground/80">{t("si.codeSub", { phone: `•••• ${suffix}` })}</p>
                </div>
              </div>
              <label className="grid gap-1.5">
                <span className="text-[14px] font-semibold">{t("si.code")}</span>
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  aria-invalid={!!error || undefined}
                  aria-describedby="code-hint"
                  className="field h-16 rounded-2xl text-center font-mono text-[28px] tracking-[0.5em]"
                />
                <span id="code-hint" className="font-mono text-[12px] text-[#5b5240]">
                  {t("si.codeHint")}
                </span>
                {error && (
                  <span role="alert" className="text-[14px] font-semibold text-high">
                    {error}
                  </span>
                )}
              </label>
              <button type="submit" disabled={code.length !== 6 || pending} className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-bold text-primary-foreground shadow-press disabled:opacity-60">
                {pending && <Loader2 className="size-5 animate-spin" />} {t("si.verify")}
              </button>
              <button type="button" onClick={() => { setStep("account"); setCode(""); setError(null); }} className="min-h-11 text-[14.5px] font-semibold text-primary">
                {t("si.other")}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
