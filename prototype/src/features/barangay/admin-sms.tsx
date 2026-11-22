"use client";

import { MessageSquareText } from "lucide-react";
import { useState } from "react";
import { useStaff } from "@/hooks/use-live";
import type { SmsPurpose, SmsStatus } from "@/lib/domain";
import { fmtDate, rel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStaffLang } from "./i18n";
import { Empty } from "./ui";

const PURPOSE: Record<SmsPurpose, string> = { resident: "Resident", reporter: "Walk-in / phone", tanod: "Tanod", hearing: "Lupon hearing" };
const STATUS_TONE: Record<SmsStatus, string> = {
  simulated: "bg-fill text-ink-3",
  queued: "bg-gold-soft text-[#7a4c00]",
  sent: "bg-brand-soft text-brand-deep",
  failed: "bg-high-soft text-high",
};

/** Every text the system sent or would have sent, for cost tracking and to answer "did they get it?". */
export function SmsLog() {
  const { data } = useStaff();
  const { lang, t } = useStaffLang();
  const [purpose, setPurpose] = useState<SmsPurpose | "all">("all");
  const rows = data!.sms.filter((m) => purpose === "all" || m.purpose === purpose);
  const ref = (id: string | null) => data!.requests.find((r) => r.id === id)?.ref ?? "—";

  return (
    <div className="grid gap-4">
      <p className={cn("rounded-2xl px-4 py-3 text-[13px]", data!.smsLive ? "bg-brand-soft text-brand-deep" : "bg-gold-soft text-[#5a3d00]")}>
        {data!.smsLive ? (
          t("Live: texts go out through Semaphore. Failed sends stay in the log with the provider's error.")
        ) : (
          t("Simulated: no SMS provider is configured, so texts are recorded here instead of sent. Set {provider} and {key} on the server to send real messages.")
            .split(/\{(provider|key)\}/)
            .map((part, i) =>
              i % 2 ? (
                <code key={i} className="font-mono text-[12px]">
                  {part === "provider" ? "SMS_PROVIDER=semaphore" : "SEMAPHORE_API_KEY"}
                </code>
              ) : (
                part
              ),
            )
        )}
      </p>
      <div role="radiogroup" aria-label={t("Recipient")} className="scrollbar-none flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-fill p-[3px] text-[13px] font-semibold">
        {(["all", ...(Object.keys(PURPOSE) as SmsPurpose[])] as const).map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={purpose === k}
            onClick={() => setPurpose(k)}
            className={cn("h-8 shrink-0 rounded-full px-3 transition", purpose === k ? "bg-card shadow-sheet" : "text-muted-foreground hover:text-foreground")}
          >
            {k === "all" ? t("All {n}", { n: data!.sms.length }) : t(PURPOSE[k])}
          </button>
        ))}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto rounded-[24px] bg-card shadow-sheet">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="border-b border-hairline">
              <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-[12px] [&>th]:font-medium [&>th]:text-ink-3">
                <th>{t("When")}</th>
                <th>{t("To")}</th>
                <th>{t("For")}</th>
                <th>{t("Case")}</th>
                <th>{t("Message")}</th>
                <th>{t("Status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((m) => (
                <tr key={m.id} className="border-b border-hairline align-top last:border-0">
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular" title={fmtDate(m.at, lang)}>
                    {rel(m.at, lang)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap tabular">{m.to}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{t(PURPOSE[m.purpose])}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] whitespace-nowrap">{ref(m.requestId)}</td>
                  <td className="max-w-[420px] px-4 py-2.5 text-foreground/85">
                    {m.body}
                    {m.error && <span className="mt-0.5 block text-[12px] text-high">{m.error}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-semibold capitalize", STATUS_TONE[m.status])}>{t(m.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={MessageSquareText} title={t("No texts yet")} body={t("Texts appear here when residents, walk-in reporters or tanods are notified by SMS.")} />
      )}
    </div>
  );
}
