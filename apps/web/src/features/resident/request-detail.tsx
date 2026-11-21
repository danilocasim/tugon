"use client";

import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Loader2, MapPin, MessageSquareReply, RotateCcw, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CategoryIcon, StatusBadge } from "@/components/tugon/badges";
import { BarangayMap, type MapPin as Pin } from "@/components/tugon/barangay-map";
import { useAct, useNow, useResident } from "@/hooks/use-live";
import { CATEGORY, STATUS, type Status } from "@/lib/domain";
import { DAY, fmtDate, rel } from "@/lib/format";
import { PUROK_NAME, landmarkById } from "@/lib/geo";
import type { ResidentRequest } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { replyToRequest, requestFollowUp, withdrawRequest } from "@/server/resident-timeline";
import { statusKey } from "./i18n";
import { useT } from "./lang";
import { primaryBtn } from "./signin";
import { SectionLabel, Skeleton, STAGE, STAGE_PATH, Timeline } from "./ui";

function Progress({ status, lang }: { status: Status; lang: "fil" | "en" }) {
  const stage = STAGE[status];
  if (stage === undefined) return null;
  return (
    <ol className="mt-4 grid grid-cols-5 gap-1" aria-label={lang === "fil" ? "Progreso" : "Progress"}>
      {STAGE_PATH.map((s, i) => {
        const done = i < stage || status === "resolved";
        const current = i === stage && status !== "resolved";
        return (
          <li key={s} className="grid gap-1.5" aria-current={current ? "step" : undefined}>
            <span className={cn("h-1.5 rounded-full", done ? "bg-primary" : current ? (status === "needs_info" ? "bg-medium" : "bg-primary/45") : "bg-fill-strong")} />
            {/* Five labels don't fit a phone width; there the bars plus the status line above carry it. */}
            <span className={cn("text-[11px] leading-tight font-semibold max-sm:sr-only", done || current ? "text-foreground" : "text-ink-3")}>
              {done && <Check className="mr-0.5 inline size-3 text-primary" />}
              {STATUS[s][lang]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function RequestDetail({ initial }: { initial: ResidentRequest }) {
  const { id } = initial;
  const { data } = useResident();
  const { t, lang } = useT();
  const router = useRouter();
  const { act, pending } = useAct();
  const [reply, setReply] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [showFollowUp, setShowFollowUp] = useState(false);
  const r = data?.requests.find((q) => q.id === id) ?? initial;

  const { lat, lon, method } = r.location ?? {};
  const pins = useMemo<Pin[]>(
    () => (lat != null && lon != null && method !== "purok" ? [{ id, lat, lon, tone: "brand" }] : []),
    [id, lat, lon, method],
  );
  const focus = useMemo(() => (pins[0] ? { lat: pins[0].lat, lon: pins[0].lon, zoom: 16 } : null), [pins]);
  const now = useNow();

  useEffect(() => {
    if (data && !data.me) router.replace(`/resident/signin?next=/resident/requests/${id}`);
  }, [data, router, id]);

  if (!data?.me) return <Skeleton className="h-96" />;

  const cat = r.category ?? r.residentCategory;
  const canWithdraw = ["received", "review", "needs_info", "queued"].includes(r.status);
  const canFollowUp = r.status === "resolved" && !r.followUp && !!r.closedAt && now - r.closedAt < 14 * DAY;
  const lastAsk = r.events.findLast((e) => e.type === "info_requested");
  const place = r.location?.landmarkId ? landmarkById(r.location.landmarkId)?.name : null;

  const tone =
    r.status === "needs_info"
      ? "bg-medium-soft"
      : r.status === "resolved"
        ? "bg-brand-soft"
        : r.status === "withdrawn" || r.status === "duplicate"
          ? "bg-fill"
          : "bg-card shadow-sheet";

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div>
        <Link href="/resident/requests" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {t("requests.title")}
        </Link>
        <div className="mt-4 flex items-start gap-3">
          {cat && <CategoryIcon category={cat} size="lg" />}
          <div className="min-w-0">
            <p className="font-mono text-[12.5px] text-ink-3">{r.ref}</p>
            <h1 className="text-[22px] leading-tight font-bold tracking-tight sm:text-[26px]">{cat ? CATEGORY[cat][lang] : t("detail.report")}</h1>
            <p className="mt-1 text-[13px] text-ink-3">
              {t("detail.updated")} {rel(r.updatedAt, lang)}
              {r.teamName && (
                <>
                  {" · "}
                  {t("detail.team")} {r.teamName}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <motion.section layout className={cn("rounded-[24px] p-5", tone)} aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge status={r.status} lang={lang} />
          <span className="text-[12.5px] text-ink-3">{t("detail.next")}</span>
        </div>
        <p className="mt-3 text-[16.5px] leading-snug font-semibold">{t(statusKey(r.status))}</p>
        {r.status === "referred" && r.referralOffice && <p className="mt-1 text-[14.5px] text-muted-foreground">{r.referralOffice}</p>}
        {r.status === "duplicate" && r.duplicateOfRef && <p className="mt-1 font-mono text-[14px] text-muted-foreground">→ {r.duplicateOfRef}</p>}
        <Progress status={r.status} lang={lang} />
      </motion.section>

      <AnimatePresence>
        {r.status === "needs_info" && (
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-[24px] bg-card p-5 shadow-lift">
            <h2 className="flex items-center gap-2 text-[17px] font-bold">
              <MessageSquareReply className="size-5 text-medium" /> {t("detail.replyTitle")}
            </h2>
            {lastAsk?.text && <p className="mt-3 rounded-[16px] rounded-tl-[6px] bg-medium-soft px-3.5 py-3 text-[15px] leading-relaxed text-[#5a3400]">{lastAsk.text}</p>}
            <form
              className="mt-3 grid gap-2.5"
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await act("reply", () => replyToRequest({ id: r.id, text: reply }), { success: t("detail.replySent") });
                if (res.ok) setReply("");
              }}
            >
              <label className="sr-only" htmlFor="reply">
                {t("detail.replyTitle")}
              </label>
              <textarea
                id="reply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder={t("detail.replyPlaceholder")}
                className="field w-full rounded-2xl px-4 py-3 text-[16px]"
              />
              <p className="text-[13px] text-ink-3">
                {lang === "fil" ? "Kailangan pa ng pin? " : "Need to add a pin? "}
                <Link href="/resident/report" className="font-semibold text-primary underline underline-offset-2">
                  {lang === "fil" ? "Gumawa ng bagong ulat na may lokasyon" : "Start a new report with a location"}
                </Link>
              </p>
              <button type="submit" disabled={reply.trim().length < 3 || pending === "reply"} className={primaryBtn}>
                {pending === "reply" && <Loader2 className="size-4 animate-spin" />} {t("detail.replySend")}
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      {r.status === "resolved" && r.outcome && (
        <section className="rounded-[24px] bg-card p-5 shadow-sheet">
          <SectionLabel>{t("detail.outcome")}</SectionLabel>
          <p className="flex gap-3 text-[16px] leading-relaxed">
            <CheckCircle2 className="mt-1 size-5 shrink-0 text-primary" />
            {r.outcome}
          </p>
          {r.outcomePhoto && (
            <figure className="mt-4 grid gap-1.5">
              <a href={`/api/photo/${r.id}?portal=resident&kind=outcome`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl bg-fill">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/photo/${r.id}?portal=resident&kind=outcome`} alt={t("detail.proof")} className="max-h-80 w-full object-cover" />
              </a>
              <figcaption className="text-[13px] text-ink-3">{t("detail.proof")}</figcaption>
            </figure>
          )}
          {canFollowUp && (
            <div className="mt-4 border-t border-hairline pt-4">
              {!showFollowUp ? (
                <button type="button" onClick={() => setShowFollowUp(true)} className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-primary">
                  <RotateCcw className="size-4" /> {t("detail.followup")}
                </button>
              ) : (
                <form
                  className="grid gap-2.5"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const res = await act("followup", () => requestFollowUp({ id: r.id, text: followUp }), { success: t("detail.followupSent") });
                    if (res.ok) {
                      setFollowUp("");
                      setShowFollowUp(false);
                    }
                  }}
                >
                  <label htmlFor="followup" className="text-[14.5px] font-semibold">
                    {t("detail.followupHelp")}
                  </label>
                  <textarea id="followup" value={followUp} onChange={(e) => setFollowUp(e.target.value)} rows={3} className="field w-full rounded-2xl px-4 py-3 text-[16px]" />
                  <button type="submit" disabled={followUp.trim().length < 5 || pending === "followup"} className={primaryBtn}>
                    {pending === "followup" && <Loader2 className="size-4 animate-spin" />} {t("detail.followupSend")}
                  </button>
                </form>
              )}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-3 rounded-[24px] bg-card p-5 shadow-sheet">
        <SectionLabel>{t("detail.report")}</SectionLabel>
        {r.dangerNow && (
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-high px-2.5 py-0.5 text-[12.5px] font-bold text-white">
            <AlertTriangle className="size-3.5" /> {t("detail.flagged")}
          </p>
        )}
        <p className="text-[16px] leading-relaxed whitespace-pre-wrap">{r.text}</p>
        <p className="text-[12.5px] text-ink-3">{fmtDate(r.createdAt, lang, { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</p>
        {r.hasPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/resident/evidence/${r.id}`} alt={t("report.photoAttached")} className="mt-1 max-h-80 w-full rounded-2xl object-cover" />
        )}
        {r.location && (
          <div className="mt-1 grid gap-2">
            <p className="flex items-center gap-2 text-[14.5px]">
              <MapPin className="size-4 text-primary" />
              {place ?? (r.location.method === "purok" ? PUROK_NAME[r.location.purok ?? ""] : lang === "fil" ? "Naka-pin sa mapa" : "Pinned on map")}
              {r.location.purok && place && <span className="text-ink-3">· {PUROK_NAME[r.location.purok]}</span>}
            </p>
            {pins.length > 0 && <BarangayMap pins={pins} focus={focus} interactive={false} showPurokLabels={false} label={t("report.where")} className="h-44" />}
          </div>
        )}
      </section>

      <section>
        <SectionLabel>{t("detail.history")}</SectionLabel>
        <div className="rounded-[24px] bg-card p-5 shadow-sheet">
          <Timeline r={r} lang={lang} />
        </div>
      </section>

      <div className="grid gap-3 pb-4">
        {canWithdraw && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-full text-[14.5px] font-semibold text-high transition hover:bg-high-soft">
                <Undo2 className="size-4" /> {t("detail.withdraw")}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("detail.withdrawTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("detail.withdrawBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("detail.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-high text-white hover:bg-[#a12d17]"
                  onClick={() => void act("withdraw", () => withdrawRequest({ id: r.id }), { success: t("detail.withdrawn") })}
                >
                  {t("detail.withdrawConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <p className="text-center text-[12.5px] text-ink-3">{t("detail.receiptNote")}</p>
      </div>
    </div>
  );
}
