import { ArrowRight, Monitor, ShieldUser, Smartphone } from "lucide-react";
import Link from "next/link";
import { Mark, Seal } from "@/components/tugon/marks";

const portals = [
  { href: "/resident", title: "Resident portal", subtitle: "Mobile-first · Filipino and English", icon: Smartphone, mark: Seal,
    items: ["Report a concern or request a barangay service", "Choose a map pin, location, landmark, or purok", "Track progress and reply when staff need details"], action: "Open resident portal" },
  { href: "/barangay", title: "Barangay portal", subtitle: "Intake · handler · supervisor · admin", icon: Monitor, mark: Mark,
    items: ["Review intake and prioritize cases", "Coordinate field work and send resident updates", "Manage cases, incidents, reports, and barangay settings"], action: "Open barangay portal" },
  { href: "/tanod", title: "Tanod app", subtitle: "Mobile-first · Filipino and English", icon: ShieldUser, mark: Mark,
    items: ["Check duty coverage and upcoming shifts", "Accept assignments and record arrival", "File an outcome for the barangay desk"], action: "Open tanod app" },
] as const;

export default function PortalEntry() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-5 sm:px-8">
        <Mark size={34} />
        <span className="leading-tight">
          <span className="block text-[16px] font-bold tracking-tight">Munti Report</span>
          <span className="block text-[12px] text-muted-foreground">Barangay service requests</span>
        </span>
      </header>
      <main className="mx-auto grid max-w-6xl gap-10 px-5 pt-6 pb-16 sm:px-8 sm:pt-10">
        <div>
          <h1 className="max-w-3xl text-[36px] leading-[1.05] font-bold tracking-[-0.03em] text-balance sm:text-[52px]">From a resident&apos;s phone to the barangay&apos;s queue.</h1>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted-foreground">Report a concern, follow its progress, or open your barangay workspace.</p>
        </div>
        <nav aria-label="Munti Report portals" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {portals.map(({ href, title, subtitle, icon: Icon, mark: PortalMark, items, action }) => (
            <Link key={href} href={href} className="group grid gap-5 rounded-[28px] bg-card p-6 shadow-sheet transition motion-safe:hover:-translate-y-0.5 hover:shadow-lift sm:p-7">
              <span className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <PortalMark size={40} />
                  <span><span className="block text-[18px] font-bold">{title}</span><span className="block text-[13px] text-muted-foreground">{subtitle}</span></span>
                </span>
                <Icon aria-hidden className="size-5 shrink-0 text-ink-3" />
              </span>
              <ul className="grid gap-2 text-[14px] text-foreground/85 [&>li]:flex [&>li]:gap-2.5 [&>li]:before:mt-[9px] [&>li]:before:size-1 [&>li]:before:shrink-0 [&>li]:before:rounded-full [&>li]:before:bg-primary/50 [&>li]:before:content-['']">
                {items.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-primary">{action} <ArrowRight className="size-4" aria-hidden /></span>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
