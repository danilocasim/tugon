"use client";

import { ArrowLeft, Check, Loader2, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useAct, useTanod } from "@/hooks/use-live";
import { formatMobile } from "@/lib/duty";
import { initials } from "@/lib/format";
import { PUROK_NAME } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { signInTanod } from "@/server/actions";
import { useTL } from "./lang";
import { TanodMark } from "./shell";

export function TanodSignIn() {
  const { data } = useTanod();
  const { t, lang, setLang } = useTL();
  const router = useRouter();
  const { act, pending } = useAct();
  const [step, setStep] = useState<"account" | "code">("account");
  const [pick, setPick] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const personas = data?.personas ?? [];
  const chosen = personas.find((p) => p.id === pick) ?? personas[0];

  async function verify() {
    if (!chosen) return;
    const r = await act("signin", () => signInTanod({ staffId: chosen.id, code }), { quiet: true });
    if (!r.ok) return setError(r.message);
    router.replace("/tanod");
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
                setError(null);
                setStep("code");
              }}
            >
              <fieldset className="grid gap-2">
                <legend className="mb-2 flex w-full items-center justify-between text-[14px] font-semibold">
                  {t("si.account")}
                  <span className="rounded-full border border-dashed border-[#8a7f6a] bg-[#fffbe9] px-2 py-0.5 font-mono text-[10.5px] font-normal text-[#5b5240]">prototype</span>
                </legend>
                <div className="grid gap-0.5 rounded-[20px] bg-card p-1.5 shadow-sheet">
                  {personas.map((p) => {
                    const on = chosen?.id === p.id;
                    return (
                      <label key={p.id} className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition", on && "bg-brand-soft")}>
                        <input type="radio" name="persona" value={p.id} checked={on} onChange={() => setPick(p.id)} className="sr-only" />
                        <span className="grid size-10 place-items-center rounded-full bg-fill-strong text-[12px] font-bold">{initials(p.name)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                          <span className="block text-[12.5px] text-muted-foreground">{p.zone ? PUROK_NAME[p.zone] : ""}</span>
                        </span>
                        {on && <Check className="size-5 text-primary" />}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <label className="grid gap-1.5">
                <span className="text-[14px] font-semibold">{t("si.mobile")}</span>
                <input readOnly value={formatMobile(chosen?.phone)} className="field h-14 rounded-2xl px-4 text-[17px] text-muted-foreground tabular" />
              </label>
              <button type="submit" disabled={!chosen} className="h-14 rounded-full bg-primary text-[16px] font-bold text-primary-foreground shadow-press disabled:opacity-60">
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
                  <p className="text-[14px] text-foreground/80">{t("si.codeSub", { phone: formatMobile(chosen?.phone) })}</p>
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
              <button type="submit" disabled={code.length !== 6 || pending === "signin"} className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-bold text-primary-foreground shadow-press disabled:opacity-60">
                {pending === "signin" && <Loader2 className="size-5 animate-spin" />} {t("si.verify")}
              </button>
              <button type="button" onClick={() => setStep("account")} className="text-[14.5px] font-semibold text-primary">
                {t("si.other")}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
