"use client";

import { Lock, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Database, Json } from "@/lib/database.types";
import { ROLE, type Role } from "@/lib/domain";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { changeAdminSetting, inviteStaff, updateStaffAccount } from "@/server/admin-actions";
import type { adminTab } from "@/server/admin-data";
import { useStaffLang } from "./i18n";
import { useRosterAction } from "./roster-act";
import { ADMIN_TABS, type AdminTab } from "@/lib/admin-tabs";
import { Avatar, PageHeader } from "./ui";

const sheet = "grid content-start gap-4 rounded-[24px] bg-card p-5 shadow-sheet sm:p-6";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-[14px] font-bold text-primary-foreground disabled:opacity-50";
const field = "field h-11 w-full rounded-xl px-3.5 text-[14px]";
type Data = Awaited<ReturnType<typeof adminTab>>;
type Functions = Database["public"]["Functions"];

function Input({ name, label, value, type = "text", min, max, step }: { name: string; label: string; value?: string | number; type?: string; min?: number; max?: number; step?: number }) {
  return <label className="grid gap-1.5 text-[13px] font-semibold">{label}<input className={field} name={name} type={type} defaultValue={value} required min={min} max={max} step={step} /></label>;
}

function SettingsForm({ group, title, children }: { group: "targets"|"referral_add"|"privacy"; title: string; children: ReactNode }) {
  const { t } = useStaffLang();
  const { act, pending } = useRosterAction();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, Json>;
    void act(group, () => changeAdminSetting(group, values), { success: t("Settings saved") });
  }
  return <form onSubmit={submit} className={sheet}><h2 className="text-[17px] font-bold tracking-tight">{t(title)}</h2>{children}<button className={`${primary} justify-self-start`} disabled={!!pending}>{t("Save")}</button></form>;
}

function Invite({ teams, defaultOpen }: { teams: Data["teams"]; defaultOpen: boolean }) {
  const { t } = useStaffLang();
  const { act, pending } = useRosterAction();
  const [open, setOpen] = useState(defaultOpen);
  const [role, setRole] = useState("handler");
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button className={primary}><UserPlus className="size-4" /> {t("Invite staff")}</button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>{t("Invite staff")}</DialogTitle><DialogDescription>{t("They will receive an email to set a password and enroll an authenticator.")}</DialogDescription></DialogHeader>
      <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); const form = new FormData(e.currentTarget); const r = await act("invite", () => inviteStaff(form), { success: t("Invitation sent to Auth") }); if (r.ok) setOpen(false); }}>
        <Input name="name" label={t("Full name")} /><Input name="email" label={t("Work email")} type="email" />
        <label className="grid gap-1.5 text-[13px] font-semibold">{t("Role")}<select className={field} name="role" value={role} onChange={(e) => setRole(e.target.value)}>{["intake","handler","supervisor","admin"].map((key) => <option key={key} value={key}>{t(ROLE[key as Role].en)}</option>)}</select></label>
        {role === "handler" && <label className="grid gap-1.5 text-[13px] font-semibold">{t("Team")}<select name="team" className={field}>{teams.map((team) => <option key={team.id} value={team.id}>{t(team.name)}</option>)}</select></label>}
        <button className={primary} disabled={!!pending}>{t("Send invitation")}</button>
      </form>
    </DialogContent>
  </Dialog>;
}

type StaffRow = Functions["staff_admin_members"]["Returns"][number];
function Staff({ data, selection }: { data: Data; selection: string | null }) {
  const { t } = useStaffLang();
  const { act, pending } = useRosterAction();
  const rows = data.extra as StaffRow[];
  const [editing, setEditing] = useState<StaffRow | null>(() => rows.find((r) => r.id === selection && r.id !== data.actor) ?? null);
  const [role, setRole] = useState(() => editing?.role ?? "handler");
  return <section className="divide-y divide-hairline overflow-hidden rounded-[24px] bg-card shadow-sheet">
    {rows.map((staff) => <div key={staff.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 p-4">
      <Avatar name={staff.name} className="size-9" />
      <div className="min-w-0"><p className="font-bold">{staff.name}</p><p className="break-all text-[13px] text-muted-foreground">{staff.email}</p><p className="text-[12px] text-muted-foreground">{t(ROLE[staff.role as Role].en)}{staff.invited && ` · ${t("Invited")}`}{!staff.active && ` · ${t("Deactivated")}`}</p></div>
      {staff.id !== data.actor && <button type="button" disabled={!!pending} className="min-h-11 rounded-full bg-fill px-3 text-[13px] font-semibold" aria-label={`${t("Manage")} ${staff.name}`} onClick={() => { setEditing(staff); setRole(staff.role); }}>{t("Manage")}</button>}
    </div>)}
    <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      {editing && <DialogContent><DialogHeader><DialogTitle>{editing.name}</DialogTitle><DialogDescription>{t("Role and team changes require the staff member to sign in again.")}</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          const team = role === "handler" ? String(values.get("team")) : undefined;
          const newRole = role !== editing.role || (role === "handler" && team !== editing.team_id) ? role : undefined;
          const result = await act(editing.id, () => updateStaffAccount({ id: editing.id, active: values.get("active") === "on", role: newRole, team }), { success: "Staff membership saved" });
          if (result.ok) setEditing(null);
        }}>
          <label className="grid gap-1.5 text-[13px] font-semibold">{t("Role")}<select className={field} value={role} onChange={(e) => setRole(e.target.value)}>{["intake","handler","supervisor","admin"].map((key) => <option key={key} value={key}>{t(ROLE[key as Role].en)}</option>)}</select></label>
          {role === "handler" && <label className="grid gap-1.5 text-[13px] font-semibold">{t("Team")}<select name="team" className={field} defaultValue={editing.team_id ?? data.teams[0]?.id}>{data.teams.map((team) => <option key={team.id} value={team.id}>{t(team.name)}</option>)}</select></label>}
          <label className="flex min-h-11 items-center gap-2 text-[14px] font-semibold"><input name="active" type="checkbox" defaultChecked={editing.active} className="size-4 accent-primary" />{t("Active account")}</label>
          <button className={primary} disabled={!!pending}>{t("Save")}</button>
        </form>
      </DialogContent>}
    </Dialog>
  </section>;
}

export function Administration({ tab, data, selection, openInvite }: { tab: AdminTab; data: Data; selection: string | null; openInvite: boolean }) {
  const { lang, t } = useStaffLang();
  const { act, pending } = useRosterAction();
  const s = data.settings;
  const preview = tab === "privacy" ? data.extra as Functions["admin_retention_preview"]["Returns"][number] : null;
  const events = tab === "sms" ? data.extra as Functions["delivery_log"]["Returns"] : null;
  const audit = tab === "audit" ? data.extra as Functions["staff_admin_audit"]["Returns"] : null;
  return <div className="grid min-w-0 gap-5">
    <PageHeader title={t("Administration")} sub={t("Staff, routing, delivery and data access")} actions={tab === "staff" ? <Invite teams={data.teams} defaultOpen={openInvite} /> : null} />
    <nav className="flex flex-wrap gap-1 rounded-2xl bg-fill p-1" aria-label={t("Administration sections")}>
      {(Object.keys(ADMIN_TABS) as AdminTab[]).map((key) => <Link key={key} href={`/barangay/admin?tab=${key}`} aria-current={tab === key ? "page" : undefined} className={cn("inline-flex min-h-10 items-center rounded-xl px-3 text-[13px] font-semibold", tab === key ? "bg-card shadow-sheet" : "text-muted-foreground hover:bg-card/70")}>{t(ADMIN_TABS[key])}</Link>)}
    </nav>
    {tab === "staff" && <Staff data={data} selection={selection} />}
    {tab === "targets" && <div className="grid gap-4 lg:grid-cols-2">
      <SettingsForm group="targets" title="Response targets (hours)"><Input name="high" label={t("High")} type="number" value={s.target_high} min={0.25} step={0.25} /><Input name="medium" label={t("Medium")} type="number" value={s.target_medium} min={0.25} step={0.25} /><Input name="normal" label={t("Normal")} type="number" value={s.target_normal} min={0.25} step={0.25} /></SettingsForm>
      <section className={sheet}><h2 className="font-bold">{t("Category routing")}</h2><dl className="divide-y divide-hairline">{data.teams.map((team) => <div key={team.id} className="flex justify-between gap-3 py-2 text-[14px]"><dt>{team.category}</dt><dd className="font-semibold">{t(team.name)}</dd></div>)}</dl></section>
    </div>}
    {tab === "referrals" && <div className="grid gap-4 lg:grid-cols-2">
      <SettingsForm group="referral_add" title="Add referral office"><Input name="name" label={t("Office name")} /><Input name="scope" label={t("Scope")} /><Input name="contact" label={t("Contact")} /></SettingsForm>
      <section className={sheet}><h2 className="font-bold">{t("Referral offices")}</h2>{data.referrals.length ? <ul className="divide-y divide-hairline">{data.referrals.map((row) => <li key={row.id} className="grid gap-1 py-3"><p className="font-semibold">{row.name}</p><p className="text-[13px] text-muted-foreground">{row.scope} · {row.contact}</p><button type="button" className="min-h-11 justify-self-start text-[13px] font-semibold text-high" disabled={!!pending} onClick={() => { if (window.confirm(t("Remove this referral office?"))) void act(row.id, () => changeAdminSetting("referral_remove", { id: row.id })); }}>{t("Remove")}</button></li>)}</ul> : <p className="text-muted-foreground">{t("No referral offices configured.")}</p>}</section>
    </div>}
    {tab === "privacy" && preview && <div className="grid gap-4 lg:grid-cols-2">
      <SettingsForm group="privacy" title="Retention and Data Protection Officer"><Input name="months" label={t("Retention months")} type="number" min={1} max={120} value={s.retention_months} /><Input name="name" label={t("DPO name")} value={s.dpo_name} /><Input name="email" label={t("DPO email")} type="email" value={s.dpo_email} /><Input name="phone" label={t("DPO phone")} value={s.dpo_phone} /></SettingsForm>
      <section className={sheet}><h2 className="flex items-center gap-2 font-bold"><Lock className="size-4" /> {t("Retention preview")}</h2><dl className="grid grid-cols-[1fr_auto] gap-2 text-[14px]"><dt>{t("Due for anonymizing")}</dt><dd>{preview.eligible}</dd><dt>{t("Held records")}</dt><dd>{preview.held}</dd><dt>{t("Deletion requests for review")}</dt><dd>{preview.erasure_pending}</dd></dl></section>
    </div>}
    {tab === "sms" && <section className={sheet}><h2 className="font-bold">{t("Delivery log")}</h2><p className="text-[13px] text-muted-foreground">{t("Provider acceptance is not proof of delivery. Recipient details are not shown.")}</p><ul className="divide-y divide-hairline">{events?.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[14px]"><span>{row.channel.toUpperCase()} · {t(row.purpose)}</span><span className="text-muted-foreground">{fmtDate(Date.parse(row.at), lang)} · {t(row.state)}</span></li>)}</ul>{events?.length === 0 && <p>{t("No queued deliveries.")}</p>}</section>}
    {tab === "audit" && <section className={sheet}><h2 className="flex items-center gap-2 font-bold"><Plus className="size-4" /> {t("Audit log")}</h2><ul className="divide-y divide-hairline">{audit?.map((row) => <li key={row.id} className="grid gap-1 py-3 text-[14px] sm:grid-cols-[1fr_auto]"><span>{t(row.action.replaceAll("_", " "))} · {row.actor}</span><time className="text-muted-foreground" dateTime={row.at}>{fmtDate(Date.parse(row.at), lang)}</time></li>)}</ul></section>}
  </div>;
}
