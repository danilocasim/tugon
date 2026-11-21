"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAct, useStaff } from "@/hooks/use-live";
import { rankQueue } from "@/lib/priority";
import type { StaffRequest } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { claimRequest } from "@/server/staff-cases";
import { useStaffLang } from "./i18n";

const SKIP_REASONS = ["Same location as my current job", "I have the skills this case needs", "Resident appointment already set", "Higher cases need equipment we don't have today"];

/**
 * Claiming with fairness: the server refuses to let someone jump the team queue
 * without a reason; this hook turns that refusal into a short, logged choice.
 */
export function useClaim() {
  const { data } = useStaff();
  const router = useRouter();
  const { act, pending } = useAct();
  const { t } = useStaffLang();
  const [skip, setSkip] = useState<{ r: StaffRequest; skipped: number } | null>(null);
  const [reason, setReason] = useState("");

  async function claim(r: StaffRequest, why?: string) {
    const res = await act(`claim-${r.id}`, () => claimRequest({ id: r.id, reason: why }), { quiet: true });
    if (!res.ok && res.code === "reason_required") {
      setReason("");
      setSkip({ r, skipped: Number(res.meta?.skipped ?? 1) });
      return;
    }
    if (!res.ok) {
      toast.error(t(res.message));
      return;
    }
    setSkip(null);
    toast.success(t("{ref} is yours", { ref: r.ref }), { action: { label: t("Open"), onClick: () => router.push(`/barangay/cases/${r.id}`) } });
  }

  const top = skip && data ? rankQueue(data.requests.filter((q) => q.status === "queued" && !q.assigneeId && q.team === skip.r.team))[0]?.req : null;

  const dialog = (
    <Dialog open={!!skip} onOpenChange={(o) => !o && setSkip(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {skip?.skipped === 1
              ? t("Skip {n} higher-priority case?", { n: skip.skipped })
              : t("Skip {n} higher-priority cases?", { n: skip?.skipped ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("Taking work out of order is fine when there's a reason. It's recorded in the audit log so the queue stays fair.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          {SKIP_REASONS.map((s) => (
            <label key={s} className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl bg-fill px-3.5 py-3 text-[13.5px] font-medium transition hover:bg-fill-strong", reason === s && "bg-brand-soft hover:bg-brand-soft")}>
              <input type="radio" name="reason" checked={reason === s} onChange={() => setReason(s)} className="accent-[#0b5d4b]" /> {t(s)}
            </label>
          ))}
          <input
            value={SKIP_REASONS.includes(reason) ? "" : reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("Other reason…")}
            aria-label={t("Other reason")}
            className="field h-11 rounded-xl px-3.5 text-[13.5px]"
          />
        </div>
        <DialogFooter>
          {top && (
            <button type="button" onClick={() => void claim(top)} className="h-10 rounded-full bg-fill px-4 text-[14px] font-semibold transition hover:bg-fill-strong">
              {t("Claim {ref} instead", { ref: top.ref })}
            </button>
          )}
          <button
            type="button"
            disabled={reason.trim().length < 3 || !skip}
            onClick={() => skip && void claim(skip.r, reason)}
            className="h-10 rounded-full bg-primary px-5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
          >
            {t("Claim with reason")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { claim, pending, dialog };
}
