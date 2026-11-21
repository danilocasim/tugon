"use client";

import { Building2, Phone, Radio } from "lucide-react";
import { motion } from "motion/react";
import { useNow, useTanod } from "@/hooks/use-live";
import { SHIFT } from "@/lib/domain";
import { isOnDuty, shiftWindow } from "@/lib/duty";
import { fmtDate, initials } from "@/lib/format";
import { PUROK_NAME } from "@/lib/geo";
import { useTL } from "./lang";
import { AssignmentCard, SectionTitle } from "./ui";

function DutyCard() {
  const { data } = useTanod();
  const { t, lang } = useTL();
  const now = useNow(60_000);
  const me = data!.me!;
  const current = data!.shifts.find((s) => isOnDuty(s, now));
  const next = data!.shifts
    .map((s) => ({ ...s, start: shiftWindow(s.date, s.shift).start }))
    .filter((s) => s.start > now)
    .sort((a, b) => a.start - b.start)[0];
  const partners = data!.onDuty.filter((p) => p.id !== me.id);
  const hall = `tel:${data!.settings.hotline.replace(/[^\d+]/g, "")}`;

  if (!current) {
    return (
      <section className="grid gap-1.5 rounded-[24px] bg-card p-5 shadow-sheet">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-3">
          <span className="size-2 rounded-full bg-ink-3/50" /> {t("duty.off")}
        </p>
        <p className="text-[20px] leading-tight font-bold">
          {next
            ? t("duty.next", { when: `${fmtDate(next.start, lang, { weekday: "long", hour: "numeric", minute: "2-digit" })} · ${SHIFT[next.shift][lang]}` })
            : t("duty.none")}
        </p>
        {me.zone && <p className="text-[13.5px] text-muted-foreground">{`${t("menu.post")}: ${PUROK_NAME[me.zone]}`}</p>}
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-[24px] bg-brand-deep p-5 text-primary-foreground shadow-lift">
      <svg viewBox="0 0 120 120" className="pointer-events-none absolute -top-10 -right-10 size-48 opacity-[0.08]" aria-hidden>
        {[0, 72, 144, 216, 288].map((d) => (
          <ellipse key={d} cx="60" cy="38" rx="11" ry="22" transform={`rotate(${d} 60 60)`} fill="none" stroke="currentColor" strokeWidth="3" />
        ))}
      </svg>
      <p className="flex items-center gap-2 text-[13px] font-semibold text-gold">
        <span className="size-2 animate-pulse rounded-full bg-gold" /> {t("duty.on")}
      </p>
      <p className="mt-1 text-[24px] leading-tight font-bold tracking-tight">
        {t("duty.until", { shift: SHIFT[current.shift][lang], time: current.shift === "day" ? "6 PM" : "6 AM" })}
      </p>
      {me.zone && <p className="mt-0.5 text-[14px] text-primary-foreground/75">{`${t("menu.post")}: ${PUROK_NAME[me.zone]}`}</p>}

      <div className="relative mt-4 grid gap-2">
        <p className="text-[12.5px] font-semibold text-primary-foreground/70">{partners.length ? t("duty.with") : t("duty.alone")}</p>
        <ul className="grid gap-1.5">
          {partners.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/10 py-2 pr-2 pl-3">
              <span className="grid size-8 place-items-center rounded-full bg-white/15 text-[11px] font-bold">{initials(p.name)}</span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[14.5px] font-semibold">{p.name}</span>
                <span className="block text-[12px] text-primary-foreground/70">{p.zone ? PUROK_NAME[p.zone] : SHIFT[p.shift][lang]}</span>
              </span>
              {p.phone && (
                <a href={`tel:${p.phone}`} aria-label={`${p.name}`} className="grid size-11 place-items-center rounded-full bg-white text-brand-deep active:scale-95">
                  <Phone className="size-5" />
                </a>
              )}
            </li>
          ))}
          <li>
            <a href={hall} className="flex items-center gap-3 rounded-2xl bg-white/10 py-2 pr-2 pl-3 active:bg-white/15">
              <span className="grid size-8 place-items-center rounded-full bg-white/15">
                <Building2 className="size-4" />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[14.5px] font-semibold">{t("duty.callHall")}</span>
                <span className="block text-[12px] text-primary-foreground/70 tabular">{data!.settings.hotline}</span>
              </span>
              <span className="grid size-11 place-items-center rounded-full bg-white text-brand-deep">
                <Phone className="size-5" />
              </span>
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}

export function TanodHome() {
  const { data } = useTanod();
  const { t } = useTL();
  const now = useNow(30_000);
  if (!data?.me) return null;
  const fresh = data.assignments.filter((a) => a.status === "assigned");
  const active = data.assignments.filter((a) => a.status === "accepted" || a.status === "on_scene");

  return (
    <div className="grid gap-7">
      <DutyCard />

      {fresh.length > 0 && (
        <section className="grid gap-3">
          <SectionTitle count={fresh.length}>{t("home.new")}</SectionTitle>
          {fresh.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <AssignmentCard a={a} now={now} />
            </motion.div>
          ))}
        </section>
      )}

      {active.length > 0 && (
        <section className="grid gap-3">
          <SectionTitle count={active.length}>{t("home.active")}</SectionTitle>
          {active.map((a) => (
            <AssignmentCard key={a.id} a={a} now={now} />
          ))}
        </section>
      )}

      {fresh.length + active.length === 0 && (
        <section className="grid justify-items-center gap-2 rounded-[24px] bg-fill px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-card text-primary shadow-sheet">
            <Radio className="size-5" />
          </span>
          <p className="text-[17px] font-bold">{t("home.emptyTitle")}</p>
          <p className="max-w-xs text-[14px] text-muted-foreground">{t("home.emptyBody")}</p>
        </section>
      )}
    </div>
  );
}
