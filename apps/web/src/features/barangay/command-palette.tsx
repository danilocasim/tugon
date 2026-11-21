"use client";

/**
 * Staff command palette (⌘K / Ctrl K, or "/"): find any case you can open by
 * reference, words, place, resident or assignee; jump between pages; run the
 * next useful action for your role. "G then <key>" jumps without opening it.
 */
import { Command } from "cmdk";
import { Building2, CornerDownLeft, Lock, LogOut, MessageSquareText, Plus, ScrollText, Search, ShieldCheck, Sparkles, Timer, UserPlus, Users, type LucideIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CategoryIcon, StatusText } from "@/components/tugon/badges";
import { useAct, useNow, useStaff } from "@/hooks/use-live";
import { inboxOrder } from "@/lib/cases";
import { CATEGORY, INTAKE_STATUSES, ROLE, STATUS, isOpen } from "@/lib/domain";
import { rel } from "@/lib/format";
import { placeLabel } from "@/lib/geo";
import { can, canAccess } from "@/lib/policy";
import { isOverdue, rankQueue } from "@/lib/priority";
import type { StaffRequest } from "@/lib/snapshot";
import { cn } from "@/lib/utils";
import { signOutPortal } from "@/server/sign-out";
import { useStaffLang } from "./i18n";
import type { NavItem } from "./shell";
import { ADMIN_TABS, type AdminTab } from "@/lib/admin-tabs";
import { Avatar, staffName, teamName } from "./ui";

type Reason = "danger" | "overdue" | "yours";

const REASON: Record<Reason, { label: string; className: string; rank: number }> = {
  danger: { label: "Danger", className: "bg-high text-white", rank: 0 },
  overdue: { label: "Overdue", className: "bg-high-soft text-high", rank: 1 },
  yours: { label: "Yours", className: "bg-brand-soft text-brand-deep", rank: 2 },
};

const ADMIN_ICON: Record<AdminTab, LucideIcon> = { staff: Users, targets: Timer, referrals: Building2, sms: MessageSquareText, privacy: ShieldCheck, audit: ScrollText };

const GROUP =
  "px-2 pb-1 **:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:pt-3 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:text-[12px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:text-ink-3";

const recentCases = new Map<string, string[]>();
function rememberCase(staffId: string, caseId: string) {
  recentCases.set(staffId, [caseId, ...(recentCases.get(staffId) ?? []).filter((id) => id !== caseId)].slice(0, 6));
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Every typed word must appear somewhere (no scattered-letter fuzzy hits in long
 * report text). Hits in the reference or title outrank hits deeper in the report.
 */
function matchScore(value: string, search: string, keywords?: string[]) {
  const words = fold(search).split(/\s+/).filter(Boolean);
  const all = fold([value, ...(keywords ?? [])].join(" "));
  if (!words.every((w) => all.includes(w))) return 0;
  const head = fold(`${value} ${keywords?.[0] ?? ""}`);
  return words.every((w) => head.includes(w)) ? 1 : 0.5;
}

const noSubscribe = () => () => {};

/** "⌘" on Apple devices, "Ctrl " elsewhere; the server render assumes ⌘. */
export function useModKey() {
  return useSyncExternalStore(noSubscribe, () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl "), () => "⌘");
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");

function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-grid h-5 min-w-5 place-items-center rounded-md bg-fill px-1 font-sans text-[11px] font-semibold text-muted-foreground shadow-[inset_0_-1px_0_rgb(18_24_32/0.1)]", className)}>
      {children}
    </kbd>
  );
}

function Tile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-fill text-foreground/70 transition group-aria-selected/item:bg-card group-aria-selected/item:text-primary group-aria-selected/item:shadow-sheet">
      <Icon className="size-[18px]" />
    </span>
  );
}

function Item({
  value,
  keywords,
  onSelect,
  lead,
  title,
  sub,
  trail,
}: {
  value: string;
  keywords?: string[];
  onSelect: () => void;
  lead: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  trail?: ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className="group/item flex min-h-13 cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2 outline-none select-none aria-selected:bg-fill"
    >
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{title}</span>
        {sub && <span className="block truncate text-[12.5px] text-muted-foreground">{sub}</span>}
      </span>
      {trail}
      <CornerDownLeft className="size-4 shrink-0 text-ink-3 opacity-0 transition group-aria-selected/item:opacity-100 max-sm:hidden" aria-hidden />
    </Command.Item>
  );
}

export function CommandPalette({ open, onOpenChange, nav }: { open: boolean; onOpenChange: (open: boolean) => void; nav: NavItem[] }) {
  const { data } = useStaff();
  const router = useRouter();
  const pathname = usePathname();
  const me = data?.me ?? null;
  const meId = me?.id;
  const canIntake = canAccess(me, "intake");
  const { t } = useStaffLang();

  // Cases opened from anywhere (queue, inbox, links) feed the "Recent" group.
  useEffect(() => {
    const id = pathname.match(/^\/barangay\/cases\/([^/]+)/)?.[1];
    if (id && meId) rememberCase(meId, id);
  }, [pathname, meId]);

  const jumps = useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of nav) map[n.jump] = n.href;
    if (canIntake) map.w = "/barangay/intake/new";
    return map;
  }, [nav, canIntake]);

  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }
      // Single-key shortcuts never fire while typing or while any dialog owns the keyboard.
      if (open || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector("[role=dialog],[role=alertdialog]")) return;
      if (e.key === "/") {
        e.preventDefault();
        onOpenChange(true);
        return;
      }
      const key = e.key.toLowerCase();
      if (gAt && e.timeStamp - gAt < 1200) {
        gAt = 0;
        const href = jumps[key];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }
      if (key === "g") gAt = e.timeStamp;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, jumps, router]);

  if (!me) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-3 max-w-[calc(100%-1.5rem)] translate-y-0 gap-0 overflow-hidden rounded-[24px] bg-card p-0 text-foreground shadow-float ring-0 sm:top-[12vh] sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">{t("Search Tugon")}</DialogTitle>
        <DialogDescription className="sr-only">{t("Find a case by reference, words, place or person, jump to a page, or run an action.")}</DialogDescription>
        <PaletteBody nav={nav} close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while open, so the query and recent list start fresh each time. */
function PaletteBody({ nav, close }: { nav: NavItem[]; close: () => void }) {
  const { data } = useStaff();
  const snap = data!;
  const me = snap.me!;
  const router = useRouter();
  const { act } = useAct();
  const now = useNow(60_000);
  const mod = useModKey();
  const [q, setQ] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const [recentIds] = useState(() => recentCases.get(me.id) ?? []);
  const searching = q.trim().length > 0;
  const seesCases = canAccess(me, "case");
  const { lang, t } = useStaffLang();

  const go = (href: string) => {
    close();
    router.push(href);
  };
  const openCase = (r: StaffRequest) => {
    rememberCase(me.id, r.id);
    go(canAccess(me, "inbox") && !r.redacted && INTAKE_STATUSES.includes(r.status) ? `/barangay/inbox?id=${r.id}` : `/barangay/cases/${r.id}`);
  };

  const cases = useMemo(() => (seesCases ? [...snap.requests].sort((a, b) => b.updatedAt - a.updatedAt) : []), [snap.requests, seesCases]);

  const attention = useMemo(() => {
    const rows: { r: StaffRequest; reason: Reason }[] = [];
    for (const r of cases) {
      if (r.redacted || !isOpen(r)) continue;
      const reason: Reason | null =
        r.dangerNow && INTAKE_STATUSES.includes(r.status) && canAccess(me, "inbox")
          ? "danger"
          : isOverdue(r, snap.settings.targets, now) && (me.role === "supervisor" || r.assigneeId === me.id || (me.role === "handler" && r.team === me.team))
            ? "overdue"
            : r.assigneeId === me.id
              ? "yours"
              : null;
      if (reason) rows.push({ r, reason });
    }
    return rows.sort((a, b) => REASON[a.reason].rank - REASON[b.reason].rank).slice(0, 5);
  }, [cases, me, snap.settings.targets, now]);

  const recent = useMemo(() => {
    const shown = new Set(attention.map((x) => x.r.id));
    return recentIds.flatMap((id) => cases.filter((r) => r.id === id && !shown.has(id))).slice(0, 4);
  }, [recentIds, cases, attention]);

  const actions: { value: string; icon: LucideIcon; title: string; sub?: string; jump?: string; run: () => void }[] = [];
  const listed = (r: StaffRequest) => attention.some((a) => a.r.id === r.id);
  const nextReport = canAccess(me, "inbox") ? inboxOrder(snap.requests).find((r) => r.status !== "needs_info") : undefined;
  if (nextReport && !listed(nextReport))
    actions.push({
      value: "action:triage-next",
      icon: Sparkles,
      title: t("Triage the next report"),
      sub: `${nextReport.ref} · ${nextReport.redacted ? t("Restricted") : nextReport.text}`,
      run: () => openCase(nextReport),
    });
  const nextClaim = canAccess(me, "queue") ? rankQueue(snap.requests.filter((r) => can(me, "claim", r)), now)[0]?.req : undefined;
  if (nextClaim && !listed(nextClaim))
    actions.push({
      value: "action:claim-next",
      icon: UserPlus,
      title: t("Open the next case to claim"),
      sub: `${nextClaim.ref} · ${nextClaim.redacted ? t("Restricted") : nextClaim.text}`,
      run: () => openCase(nextClaim),
    });
  if (canAccess(me, "intake")) actions.push({ value: "action:walk-in", icon: Plus, title: t("Record a walk-in or phone request"), jump: "w", run: () => go("/barangay/intake/new") });
  if (canAccess(me, "admin"))
    actions.push({ value: "action:invite", icon: UserPlus, title: t("Invite a staff member"), sub: t("Email invitation with authenticator setup"), run: () => go("/barangay/admin?tab=staff&invite=1") });
  actions.push({
    value: "action:sign-out",
    icon: LogOut,
    title: t("Sign out"),
    run: () => {
      close();
      void act("out", signOutPortal).then((r) => {
        if (r.ok) { recentCases.delete(me.id); router.replace("/barangay/signin"); }
      });
    },
  });

  const caseItem = (r: StaffRequest, reason?: Reason) => {
    const place = placeLabel(r, lang);
    const keywords = r.redacted
      ? [STATUS[r.status][lang], teamName(snap, r.team)]
      : [
          r.text,
          place,
          CATEGORY[r.triage?.category ?? r.prediction.category][lang],
          STATUS[r.status][lang],
          teamName(snap, r.team),
          r.assigneeId ? staffName(snap, r.assigneeId) : null,
          r.residentId ? snap.residents[r.residentId]?.name : null,
          r.contact?.name,
        ].filter((x): x is string => !!x);
    return (
      <Item
        key={`${reason ?? "case"}-${r.id}`}
        value={r.ref}
        keywords={keywords}
        onSelect={() => openCase(r)}
        lead={r.redacted ? <Tile icon={Lock} /> : <CategoryIcon category={r.triage?.category ?? r.prediction.category} size="sm" className="size-9 rounded-xl" />}
        title={r.redacted ? t("Restricted case") : r.text}
        sub={
          <>
            <span className="font-mono text-[11.5px]">{r.ref}</span>
            {place && ` · ${place}`}
          </>
        }
        trail={
          <span className="flex shrink-0 items-center gap-3">
            <span className="grid justify-items-end gap-0.5 max-sm:hidden">
              <StatusText status={r.status} className="text-[12px]" lang={lang} />
              <span className="text-[11.5px] text-ink-3 tabular">{rel(r.updatedAt, lang, now)}</span>
            </span>
            {reason && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", REASON[reason].className)}>{t(REASON[reason].label)}</span>}
          </span>
        }
      />
    );
  };

  const tip = nav[0];

  return (
    <Command label={t("Search Tugon")} loop filter={matchScore} className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-hairline px-4">
        <Search className="size-5 shrink-0 text-ink-3" />
        <Command.Input
          value={q}
          onValueChange={(v) => {
            setQ(v);
            list.current?.scrollTo({ top: 0 });
          }}
          placeholder={seesCases ? t("Search cases or jump to…") : t("Search people or settings…")}
          className="h-14 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3"
        />
        <button type="button" onClick={close} className="text-[14px] font-semibold text-primary sm:hidden">
          {t("Cancel")}
        </button>
        <Kbd className="px-1.5 max-sm:hidden">esc</Kbd>
      </div>

      <Command.List
        ref={list}
        className="h-(--cmdk-list-height) max-h-[min(62dvh,480px)] scroll-py-2 overflow-y-auto overscroll-contain transition-[height] duration-150 ease-out"
      >
        <Command.Empty className="grid justify-items-center gap-1 px-6 py-10 text-center">
          <p className="text-[14px] font-semibold">{t("No matches for “{q}”", { q: q.trim() })}</p>
          <p className="max-w-xs text-[13px] text-muted-foreground">
            {seesCases ? t("Try the last digits of a reference (0142), a purok, a resident's name, or a word from the report.") : t("Try a page or setting name.")}
          </p>
        </Command.Empty>

        {!searching && attention.length > 0 && (
          <Command.Group heading={t("Needs attention")} className={GROUP}>
            {attention.map(({ r, reason }) => caseItem(r, reason))}
          </Command.Group>
        )}
        {!searching && recent.length > 0 && (
          <Command.Group heading={t("Recent")} className={GROUP}>
            {recent.map((r) => caseItem(r))}
          </Command.Group>
        )}
        {searching && cases.length > 0 && (
          <Command.Group heading={t("Cases")} className={GROUP}>
            {cases.map((r) => caseItem(r))}
          </Command.Group>
        )}

        <Command.Group heading={t("Go to")} className={GROUP}>
          {nav.map((n) => (
            <Item
              key={n.href}
              value={`page:${n.href}`}
              keywords={[n.label, n.short, "go", "open", "page"]}
              onSelect={() => go(n.href)}
              lead={<Tile icon={n.icon} />}
              title={n.label}
              sub={n.count ? (n.area === "inbox" ? t("{n} waiting for a decision", { n: n.count }) : n.area === "mine" ? t("{n} open", { n: n.count }) : t("{n} waiting", { n: n.count })) : undefined}
              trail={
                <span className="flex gap-1 max-sm:hidden">
                  <Kbd>G</Kbd>
                  <Kbd>{n.jump.toUpperCase()}</Kbd>
                </span>
              }
            />
          ))}
        </Command.Group>

        {searching && canAccess(me, "admin") && (
          <Command.Group heading={t("People")} className={GROUP}>
            {snap.staff.map((s) => (
              <Item
                key={s.id}
                value={`person:${s.id}`}
                keywords={[s.name, s.email, t(ROLE[s.role].en), s.team ? teamName(snap, s.team) : ""]}
                onSelect={() => go(`/barangay/admin?tab=staff&person=${s.id}`)}
                lead={<Avatar name={s.name} className="size-9 text-[11px]" />}
                title={s.name}
                sub={[t(ROLE[s.role].en), s.team && teamName(snap, s.team), !s.active ? t("Deactivated") : s.invited ? t("Invited") : null].filter(Boolean).join(" · ")}
              />
            ))}
          </Command.Group>
        )}
        {canAccess(me, "admin") && (
          <Command.Group heading={t("Administration")} className={GROUP}>
            {(Object.keys(ADMIN_TABS) as AdminTab[]).map((tab) => (
              <Item
                key={tab}
                value={`admin:${tab}`}
                keywords={[t(ADMIN_TABS[tab]), "settings", "administration"]}
                onSelect={() => go(`/barangay/admin?tab=${tab}`)}
                lead={<Tile icon={ADMIN_ICON[tab]} />}
                title={t(ADMIN_TABS[tab])}
              />
            ))}
          </Command.Group>
        )}

        <Command.Group heading={t("Actions")} className={GROUP}>
          {actions.map((a) => (
            <Item
              key={a.value}
              value={a.value}
              keywords={[a.title, a.sub ?? ""]}
              onSelect={a.run}
              lead={<Tile icon={a.icon} />}
              title={a.title}
              sub={a.sub}
              trail={
                a.jump && (
                  <span className="flex gap-1 max-sm:hidden">
                    <Kbd>G</Kbd>
                    <Kbd>{a.jump.toUpperCase()}</Kbd>
                  </span>
                )
              }
            />
          ))}
        </Command.Group>

      </Command.List>

      <div className="flex items-center gap-4 border-t border-hairline bg-sunken/50 px-4 py-2.5 text-[12px] text-muted-foreground max-sm:hidden">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <span className="ml-0.5">{t("move")}</span>
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd>
          <span className="ml-0.5">{t("open")}</span>
        </span>
        {tip && (
          <span className="ml-auto flex items-center gap-1">
            {t("Anywhere:")} <Kbd>{mod.trim()}</Kbd>
            <Kbd>K</Kbd> {t("or")} <Kbd>/</Kbd> {t("to search ·")} <Kbd>G</Kbd>
            <Kbd>{tip.jump.toUpperCase()}</Kbd> {tip.short}
          </span>
        )}
      </div>
    </Command>
  );
}
