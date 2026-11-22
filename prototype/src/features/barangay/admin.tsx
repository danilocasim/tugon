"use client";

import { Loader2, Plus, Search, ShieldAlert, Trash2, UserPlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryIcon } from "@/components/tugon/badges";
import { useAct, useStaff } from "@/hooks/use-live";
import { CATEGORIES, CATEGORY, CATEGORY_TEAM, ROLE, URGENCIES, URGENCY, type Role, type Urgency } from "@/lib/domain";
import { formatMobile } from "@/lib/duty";
import { fmtDate, rel } from "@/lib/format";
import { PUROKS } from "@/lib/geo";
import { canAccess } from "@/lib/policy";
import { cn } from "@/lib/utils";
import { addReferralContact, addTanod, inviteStaff, removeReferralContact, setStaffActive, updateTargets } from "@/server/actions";
import { PrivacySettingsPanel } from "./admin-privacy";
import { SmsLog } from "./admin-sms";
import { useStaffLang } from "./i18n";
import { ADMIN_TABS, Avatar, NoAccess, PageHeader, teamName, type AdminTab } from "./ui";

const field = "field h-11 w-full rounded-xl px-3.5 text-[14px]";
const sheet = "rounded-[24px] bg-card p-5 shadow-sheet sm:p-6";
const th = "px-4 py-3 text-[12px] font-medium text-ink-3";

const ACTION_LABEL: Record<string, string> = {
  signed_in: "Signed in",
  submitted: "Recorded report",
  triaged: "Triaged",
  review_started: "Started review",
  info_requested: "Asked resident",
  referred: "Referred",
  marked_duplicate: "Marked duplicate",
  claimed: "Claimed",
  assigned: "Assigned",
  reassigned: "Reassigned",
  started: "Started work",
  resolved: "Resolved",
  reopened: "Reopened",
  triage_changed: "Changed triage",
  restricted: "Restricted case",
  unrestricted: "Unrestricted case",
  recorded_assisted: "Recorded walk-in/phone",
  staff_invited: "Invited staff",
  staff_deactivated: "Deactivated staff",
  staff_reactivated: "Reactivated staff",
  targets_changed: "Changed targets",
  hotspot_params_changed: "Changed hotspot settings",
  referral_added: "Added referral contact",
  referral_removed: "Removed referral contact",
  update: "Messaged resident",
  note: "Added note",
  tanod_added: "Added tanod",
  tanod_assigned: "Sent a tanod",
  tanod_accept: "Tanod accepted",
  tanod_accepted: "Tanod accepted",
  tanod_arrive: "Tanod arrived",
  tanod_arrived: "Tanod arrived",
  tanod_decline: "Tanod declined",
  tanod_cancelled: "Called off tanod",
  field_report: "Filed field report",
  duty_added: "Added duty shift",
  duty_removed: "Removed duty shift",
  roster_copied: "Copied roster week",
  incident_created: "Created incident",
  incident_linked: "Linked report to incident",
  incident_unlinked: "Unlinked report from incident",
  incident_update: "Messaged incident reporters",
  incident_closed: "Closed incident",
  kp_filed: "Filed Lupon case",
  kp_hearing_set: "Scheduled Lupon hearing",
  kp_summons_served: "Recorded summons served",
  kp_hearing_recorded: "Recorded Lupon hearing",
  kp_extended: "Extended conciliation",
  kp_cfa: "Issued certificate to file action",
  kp_dismissed: "Dismissed Lupon case",
  kp_withdrawn: "Withdrew Lupon case",
  privacy_settings_changed: "Changed privacy settings",
  retention_run: "Ran data retention",
  account_deleted: "Resident deleted account",
};

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data } = useStaff();
  const { act, pending } = useAct();
  const { t } = useStaffLang();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [zone, setZone] = useState("P1");
  const [role, setRole] = useState<Role>("handler");
  const [team, setTeam] = useState("t_works");
  const tanod = role === "tanod";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[13.5px] font-bold text-primary-foreground shadow-press">
          <UserPlus className="size-4" /> {t("Invite staff")}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tanod ? t("Add a tanod") : t("Invite a staff member")}</DialogTitle>
          <DialogDescription>
            {tanod
              ? t("Tanods sign in to the Tanod app with their mobile number and a one-time code. Put them on the roster from the Tanods page.")
              : t("They get an email to set a password and enroll an authenticator. Access follows the role you choose.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold">{t("Full name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          {tanod ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[13px] font-semibold">{t("Mobile number")}</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={cn(field, "tabular")} placeholder="0917 123 4567" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[13px] font-semibold">{t("Usual purok")}</span>
                <select value={zone} onChange={(e) => setZone(e.target.value)} className={field}>
                  {PUROKS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">{t("Work email")}</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="name@sampaguita.gov.ph" />
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">{t("Role")}</span>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={field}>
                {(Object.keys(ROLE) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {t(ROLE[r].en)}
                  </option>
                ))}
              </select>
            </label>
            {role === "handler" && (
              <label className="grid gap-1.5">
                <span className="text-[13px] font-semibold">{t("Team")}</span>
                <select value={team} onChange={(e) => setTeam(e.target.value)} className={field}>
                  {data!.teams.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      {tm.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p className="rounded-xl bg-fill px-3.5 py-2.5 text-[12.5px] text-muted-foreground">{t(ROLE[role].blurb)}.</p>
        </div>
        <DialogFooter>
          <button
            type="button"
            disabled={pending === "invite" || name.trim().length < 2 || (tanod ? phone.replace(/\D/g, "").length < 10 : !email.includes("@"))}
            onClick={async () => {
              const r = tanod
                ? await act("invite", () => addTanod({ name, phone, zone }), { success: t("{name} added · they can sign in to the Tanod app now", { name: name.trim() }) })
                : await act("invite", () => inviteStaff({ name, email, role, team: role === "handler" ? team : null }), { success: t("Invitation sent to {email}", { email }) });
              if (r.ok) {
                onOpenChange(false);
                setName("");
                setEmail("");
                setPhone("");
              }
            }}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-bold text-primary-foreground disabled:opacity-50"
          >
            {pending === "invite" && <Loader2 className="size-4 animate-spin" />} {tanod ? t("Add tanod") : t("Send invitation")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Targets() {
  const { data } = useStaff();
  const { act, pending } = useAct();
  const { lang, t } = useStaffLang();
  const saved = data!.settings.targets;
  const [targets, setTargets] = useState<Record<Urgency, number>>(saved);
  const changed = URGENCIES.some((u) => targets[u] !== saved[u]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={sheet}>
        <h2 className="text-[17px] font-bold tracking-[-0.01em]">{t("Response targets")}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("Time from submission to work starting. Cases past target show as overdue and escalate to supervisors.")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {URGENCIES.map((u) => (
            <label key={u} className="grid gap-1.5">
              <span className="text-[13px] font-semibold">{URGENCY[u][lang]}</span>
              <span className="relative">
                <input type="number" min={1} max={240} value={targets[u]} onChange={(e) => setTargets({ ...targets, [u]: Number(e.target.value) })} className={cn(field, "pr-11 tabular")} />
                <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-ink-3">{t("hrs")}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={!changed || pending === "targets"}
            onClick={() => void act("targets", () => updateTargets(targets), { success: "Targets updated" })}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-bold text-primary-foreground disabled:opacity-40"
          >
            {pending === "targets" && <Loader2 className="size-4 animate-spin" />} {t("Save targets")}
          </button>
          {changed && (
            <button type="button" onClick={() => setTargets(saved)} className="h-10 rounded-full bg-fill px-4 text-[13px] font-semibold transition hover:bg-fill-strong">
              {t("Discard")}
            </button>
          )}
        </div>
      </section>

      <section className={sheet}>
        <h2 className="text-[17px] font-bold tracking-[-0.01em]">{t("Routing")}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("Confirmed category decides which team's queue a case enters.")}</p>
        <ul className="mt-4 grid">
          {CATEGORIES.map((c) => (
            <li key={c} className="flex items-center gap-3 border-b border-hairline py-2.5 text-[13.5px] last:border-0">
              <CategoryIcon category={c} size="sm" />
              <span className="flex-1 font-medium">{CATEGORY[c][lang]}</span>
              <span className="text-muted-foreground">→ {teamName(data!, CATEGORY_TEAM[c])}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl bg-fill px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
          {t("Hotspot defaults: ε {eps} m · MinPts {minPts} · {days} days (adjust in Insights).", {
            eps: data!.settings.hotspot.epsM,
            minPts: data!.settings.hotspot.minPts,
            days: data!.settings.hotspot.days,
          })}
        </p>
      </section>
    </div>
  );
}

function Referrals() {
  const { data } = useStaff();
  const { act, pending } = useAct();
  const { t } = useStaffLang();
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");
  const [contact, setContact] = useState("");
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <ul className="content-start overflow-hidden rounded-[24px] bg-card shadow-sheet">
        {data!.settings.referrals.map((r) => (
          <li key={r.id} className="flex items-start gap-3 border-b border-hairline px-5 py-4 last:border-0">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">{r.name}</span>
              <span className="block text-[12.5px] text-muted-foreground">{r.scope}</span>
              <span className="mt-1 block text-[12.5px] font-semibold tabular">{r.contact}</span>
            </span>
            <button
              type="button"
              aria-label={t("Remove {name}", { name: r.name })}
              disabled={pending === `rm-${r.id}`}
              onClick={() => void act(`rm-${r.id}`, () => removeReferralContact({ id: r.id }), { success: "Contact removed" })}
              className="grid size-9 place-items-center rounded-full text-ink-3 transition hover:bg-high-soft hover:text-high"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className={cn(sheet, "grid content-start gap-3")}
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await act("add", () => addReferralContact({ name, scope, contact }), { success: "Contact added" });
          if (r.ok) {
            setName("");
            setScope("");
            setContact("");
          }
        }}
      >
        <h2 className="text-[17px] font-bold tracking-[-0.01em]">{t("Add referral office")}</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Office name")} className={field} aria-label={t("Office name")} />
        <input value={scope} onChange={(e) => setScope(e.target.value)} placeholder={t("What they handle")} className={field} aria-label={t("Scope")} />
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t("Hotline or local")} className={field} aria-label={t("Contact")} />
        <button type="submit" disabled={pending === "add"} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-primary text-[13.5px] font-bold text-primary-foreground disabled:opacity-50">
          <Plus className="size-4" /> {t("Add contact")}
        </button>
      </form>
    </div>
  );
}

function AuditLog() {
  const { data } = useStaff();
  const { lang, t } = useStaffLang();
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("all");
  const rows = useMemo(
    () =>
      data!.audit.filter(
        (a) => (actor === "all" || a.actorId === actor) && (!q || `${a.action} ${a.target ?? ""} ${a.detail ?? ""} ${a.actorName}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, q, actor],
  );
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-56 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search actions, references, details")} className={cn(field, "pl-9")} aria-label={t("Search audit log")} />
        </label>
        <select value={actor} onChange={(e) => setActor(e.target.value)} className={cn(field, "w-auto")} aria-label={t("Staff member")}>
          <option value="all">{t("Everyone")}</option>
          {data!.staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-[24px] bg-card shadow-sheet">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="border-b border-hairline">
            <tr>
              <th className={th}>{t("When")}</th>
              <th className={th}>{t("Who")}</th>
              <th className={th}>{t("Action")}</th>
              <th className={th}>{t("Target")}</th>
              <th className={th}>{t("Detail")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((a) => (
              <tr key={a.id} className="border-b border-hairline last:border-0 hover:bg-fill/40">
                <td className="px-4 py-2.5 text-[12.5px] whitespace-nowrap text-muted-foreground tabular" title={fmtDate(a.at, lang)}>
                  {rel(a.at, lang)}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">{a.actorName}</td>
                <td className="px-4 py-2.5 font-medium">{t(ACTION_LABEL[a.action] ?? a.action)}</td>
                <td className="px-4 py-2.5 font-mono text-[12px]">{a.target ?? "—"}</td>
                <td className="max-w-[320px] truncate px-4 py-2.5 text-muted-foreground">{a.detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-center text-[13px] text-muted-foreground">{t("No matching entries.")}</p>}
      </div>
    </div>
  );
}

/** Shallow URL update (no server round trip) so tabs and the invite dialog stay linkable from search. */
function setAdminQuery(next: { tab?: AdminTab; invite?: boolean }) {
  const p = new URLSearchParams(window.location.search);
  if (next.tab) p.set("tab", next.tab);
  if (next.invite === true) p.set("invite", "1");
  if (next.invite === false) p.delete("invite");
  window.history.replaceState(null, "", `?${p}`);
}

export function Administration() {
  const { data } = useStaff();
  const { act, pending } = useAct();
  const { t } = useStaffLang();
  const params = useSearchParams();
  const person = params.get("person");
  const ready = !!data?.me;
  // A person picked in search: bring their row into view once the table exists.
  useEffect(() => {
    if (ready && person) document.getElementById(`staff-${person}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [ready, person]);
  if (!data?.me) return null;
  if (!canAccess(data.me, "admin")) return <NoAccess title={t("Administration is limited to administrators")} role={data.me.role} />;
  const me = data.me;
  const tabParam = params.get("tab");
  const tab: AdminTab = tabParam && Object.hasOwn(ADMIN_TABS, tabParam) ? (tabParam as AdminTab) : "staff";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        title={t("Administration")}
        sub={t("People, routing, targets, referral offices and the audit trail.")}
        actions={<InviteDialog open={params.get("invite") === "1"} onOpenChange={(invite) => setAdminQuery({ invite })} />}
      />
      <p className="flex items-start gap-2 rounded-2xl bg-fill px-4 py-3 text-[13px] text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-ink-3" /> {t("Administrators manage people and settings, not case content. Case text and reporter details aren't visible from this account.")}
      </p>

      <Tabs value={tab} onValueChange={(v) => setAdminQuery({ tab: v as AdminTab })} className="gap-4">
        <TabsList className="h-11 w-full justify-start overflow-x-auto rounded-full bg-fill p-[3px] sm:w-auto">
          {(Object.keys(ADMIN_TABS) as AdminTab[]).map((k) => (
            <TabsTrigger key={k} value={k} className="rounded-full px-4 data-active:bg-card data-active:shadow-sheet">
              {t(ADMIN_TABS[k])}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="staff">
          <div className="overflow-x-auto rounded-[24px] bg-card shadow-sheet">
            <table className="w-full min-w-[760px] text-left text-[13.5px]">
              <thead className="border-b border-hairline">
                <tr>
                  <th className={th}>{t("Person")}</th>
                  <th className={th}>{t("Role")}</th>
                  <th className={th}>{t("Team")}</th>
                  <th className={th}>{t("Status")}</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {data.staff.map((s) => (
                  <tr
                    key={s.id}
                    id={`staff-${s.id}`}
                    className={cn("border-b border-hairline transition-colors last:border-0", !s.active && "opacity-55", person === s.id && "bg-brand-soft/60")}
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
                        <Avatar name={s.name} className="size-8" />
                        <span>
                          <span className="block font-semibold">{s.name}</span>
                          <span className="block text-[12px] text-muted-foreground">{s.role === "tanod" ? formatMobile(s.phone) : s.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3">{t(ROLE[s.role].en)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.team ? teamName(data, s.team) : "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold",
                          !s.active ? "bg-fill text-ink-3" : s.invited ? "bg-gold-soft text-[#7a4c00]" : "bg-brand-soft text-brand-deep",
                        )}
                      >
                        {!s.active ? t("Deactivated") : s.invited ? t("Invited") : s.role === "tanod" ? t("Active · SMS sign-in") : t("Active · MFA on")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.id !== me.id && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button type="button" className={cn("h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition", s.active ? "bg-high-soft text-high hover:bg-[#f7d9d2]" : "bg-fill hover:bg-fill-strong")}>
                              {s.active ? t("Deactivate") : t("Reactivate")}
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{s.active ? t("Deactivate {name}?", { name: s.name }) : t("Reactivate {name}?", { name: s.name })}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {s.active ? t("They're signed out immediately. Their open cases return to the team queue unassigned.") : t("They regain access with their previous role.")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                disabled={pending === s.id}
                                className={s.active ? "bg-high text-white hover:bg-[#a12d17]" : undefined}
                                onClick={() => void act(s.id, () => setStaffActive({ id: s.id, active: !s.active }), { success: s.active ? "Deactivated" : "Reactivated" })}
                              >
                                {s.active ? t("Deactivate") : t("Reactivate")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="targets">
          <Targets />
        </TabsContent>
        <TabsContent value="referrals">
          <Referrals />
        </TabsContent>
        <TabsContent value="sms">
          <SmsLog />
        </TabsContent>
        <TabsContent value="privacy">
          <PrivacySettingsPanel />
        </TabsContent>
        <TabsContent value="audit">
          <AuditLog />
        </TabsContent>
      </Tabs>
    </div>
  );
}
