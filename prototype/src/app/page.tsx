import { ArrowRight, Columns2, Monitor, ShieldUser, Smartphone } from "lucide-react";
import Link from "next/link";
import { Mark, Seal } from "@/components/tugon/marks";
import { MODEL_CARD } from "@/lib/classifier";

export const metadata = { title: "Tugon prototype" };

const STEPS: [string, string, string][] = [
  ["/resident/signin", "Sign in as Liza (resident)", "Email code 246810. She already has a request waiting on her reply."],
  ["/resident/report", "File a new report", "Write it in Taglish, drop a pin, add a photo. Try the prototype toggle that drops the connection, then retry."],
  ["/barangay/signin", "Sign in as Jessa (intake)", "Your report appears in the inbox instantly, with the model's suggestion to confirm or correct."],
  ["/barangay/queue", "Switch to Arnel (Peace & Order handler)", "Open the Purok 4 Gym case and send a tanod from the Field team card."],
  ["/tanod/signin", "Sign in as Joel (tanod)", "Code 246810. Accept the assignment, mark arrival, and file a field report with a photo."],
  ["/resident/requests", "Watch Liza's phone", "Status, history and notifications update live, including when a tanod is on the way."],
  ["/barangay/tanods", "Switch to Kgwd. Ramon (supervisor)", "See who's on duty and edit the roster. On Insights, four flood reports by the public market form a hotspot: start an incident, message every reporter at once, then close it."],
  ["/barangay/lupon", "Switch to Arnel again: Lupon docket", "Open the noise dispute. Schedule a hearing for now, record a settlement, and print the summons or settlement."],
  ["/barangay/reports", "Switch to Jessa: monthly report", "The month's numbers for the Punong Barangay and the DILG, ready to print or save as PDF."],
  ["/barangay/admin?tab=privacy", "Switch to Paolo (administrator)", "Set the retention period and DPO, anonymize old closed cases, and check the SMS log."],
  ["/resident/privacy", "Back on Liza's phone", "See the DPO and retention period, download her data, or delete her account. Staff can switch the portal to Filipino from the account menu."],
];

export default function Hub() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-5 sm:px-8">
        <Mark size={34} />
        <span className="leading-tight">
          <span className="block text-[16px] font-bold tracking-tight">Tugon</span>
          <span className="block text-[12px] text-muted-foreground">Prototype · Barangay Sampaguita (fictional), Muntinlupa City</span>
        </span>
        <span className="ml-auto hidden rounded-full border border-dashed border-[#8a7f6a] bg-[#fffbe9] px-3 py-1 font-mono text-[11px] text-[#5b5240] sm:block">demo data · nothing here is real</span>
      </header>

      <main className="mx-auto grid max-w-6xl gap-12 px-5 pt-6 pb-16 sm:px-8 sm:pt-10">
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-end">
          <div>
            <h1 className="text-[36px] leading-[1.05] font-bold tracking-[-0.03em] text-balance sm:text-[52px]">From a resident&apos;s phone to the barangay&apos;s queue.</h1>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
              Two portals on one live backend. Report something as a resident, then watch it arrive for barangay staff, get triaged, ranked, worked, and answered.
            </p>
          </div>
          <Link
            href="/demo"
            className="group flex items-center gap-4 rounded-3xl bg-brand-deep p-5 text-primary-foreground shadow-float transition hover:bg-[#063a2f] sm:p-6"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/12">
              <Columns2 className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[19px] font-bold">Side-by-side demo</span>
              <span className="mt-0.5 block text-[14px] text-primary-foreground/75">Resident phone on the left, barangay desk on the right, syncing live.</span>
            </span>
            <ArrowRight className="size-5 transition group-hover:translate-x-1" />
          </Link>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Link href="/resident" className="group grid gap-5 rounded-[28px] bg-card p-6 shadow-sheet transition hover:-translate-y-0.5 hover:shadow-lift sm:p-7">
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-3">
                <Seal size={40} />
                <span>
                  <span className="block text-[18px] font-bold">Resident portal</span>
                  <span className="block text-[13px] text-muted-foreground">Mobile-first · Filipino and English</span>
                </span>
              </span>
              <Smartphone className="size-5 text-ink-3" />
            </span>
            <ul className="grid gap-2 text-[14px] text-foreground/85 [&>li]:flex [&>li]:gap-2.5 [&>li]:before:mt-[9px] [&>li]:before:size-1 [&>li]:before:shrink-0 [&>li]:before:rounded-full [&>li]:before:bg-primary/50 [&>li]:before:content-['']">
              <li>Report in four steps: what, where, photo, review</li>
              <li>Map pin, device location, or landmark; photos stripped of GPS</li>
              <li>Receipts that say received, not dispatched</li>
              <li>Live status, history, replies, withdrawal, follow-ups</li>
            </ul>
            <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-primary">
              Open resident portal <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
          <Link href="/barangay" className="group grid gap-5 rounded-[28px] bg-card p-6 shadow-sheet transition hover:-translate-y-0.5 hover:shadow-lift sm:p-7">
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-3">
                <Mark size={40} />
                <span>
                  <span className="block text-[18px] font-bold">Barangay portal</span>
                  <span className="block text-[13px] text-muted-foreground">Intake · handler · supervisor · admin</span>
                </span>
              </span>
              <Monitor className="size-5 text-ink-3" />
            </span>
            <ul className="grid gap-2 text-[14px] text-foreground/85 [&>li]:flex [&>li]:gap-2.5 [&>li]:before:mt-[9px] [&>li]:before:size-1 [&>li]:before:shrink-0 [&>li]:before:rounded-full [&>li]:before:bg-primary/50 [&>li]:before:content-['']">
              <li>Intake inbox with model suggestions staff confirm</li>
              <li>Work queue ranked by urgency, weight, and aging</li>
              <li>Case workspace with resident messages, proof photos and internal notes</li>
              <li>Incidents, Lupon docket, monthly report, SMS log, data privacy</li>
              <li>English or Filipino, per staff member</li>
            </ul>
            <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-primary">
              Open barangay portal <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
          <Link href="/tanod" className="group grid gap-5 rounded-[28px] bg-card p-6 shadow-sheet transition hover:-translate-y-0.5 hover:shadow-lift sm:p-7 md:col-span-2 xl:col-span-1">
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-[13px] bg-brand-deep text-white">
                  <ShieldUser className="size-5" />
                </span>
                <span>
                  <span className="block text-[18px] font-bold">Tanod app</span>
                  <span className="block text-[13px] text-muted-foreground">Field officers · Filipino first</span>
                </span>
              </span>
              <Smartphone className="size-5 text-ink-3" />
            </span>
            <ul className="grid gap-2 text-[14px] text-foreground/85 [&>li]:flex [&>li]:gap-2.5 [&>li]:before:mt-[9px] [&>li]:before:size-1 [&>li]:before:shrink-0 [&>li]:before:rounded-full [&>li]:before:bg-primary/50 [&>li]:before:content-['']">
              <li>Assignments from handlers, with map and directions</li>
              <li>Accept, mark arrival, or decline with a reason</li>
              <li>Field reports with a result and an optional photo</li>
              <li>Duty schedule and who else is on shift</li>
            </ul>
            <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-primary">
              Open tanod app <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        </section>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div>
            <h2 className="text-[20px] font-bold tracking-[-0.015em]">Try this walkthrough</h2>
            <ol className="mt-3 grid gap-1">
              {STEPS.map(([href, title, body], i) => (
                <li key={title}>
                  <Link href={href} className="group grid grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-2xl p-3 transition hover:bg-card hover:shadow-sheet">
                    <span className="grid size-9 place-items-center rounded-full bg-fill text-[14px] font-bold tabular transition group-hover:bg-primary group-hover:text-primary-foreground">{i + 1}</span>
                    <span>
                      <span className="block text-[15px] font-semibold group-hover:text-primary">{title}</span>
                      <span className="block text-[13.5px] text-muted-foreground">{body}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid content-start gap-4">
            <h2 className="text-[20px] font-bold tracking-[-0.015em]">What&apos;s real here</h2>
            <dl className="grid rounded-[24px] bg-card px-5 py-1 text-[13.5px] shadow-sheet [&>div]:border-b [&>div]:border-hairline [&>div]:py-3.5 [&>div:last-child]:border-0">
              <div>
                <dt className="font-semibold">Taglish classifier</dt>
                <dd className="text-muted-foreground">
                  {MODEL_CARD.name}, {MODEL_CARD.params}. Trained on {MODEL_CARD.trainedOn} demo examples; suggests category and urgency, never decides.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Priority queue with aging</dt>
                <dd className="text-muted-foreground">0.5·U/3 + 0.3·W/3 + 0.2·min(1, wait/300 min), with overdue escalation for what aging can&apos;t fix.</dd>
              </div>
              <div>
                <dt className="font-semibold">Haversine + DBSCAN hotspots</dt>
                <dd className="text-muted-foreground">ε 100 m, MinPts 4 by default, with a K-Means (k=3) comparison and silhouette score.</dd>
              </div>
              <div>
                <dt className="font-semibold">Server-enforced roles and live sync</dt>
                <dd className="text-muted-foreground">Each portal receives only what its user may see. Changes stream to every open screen, including phones on your network.</dd>
              </div>
            </dl>
            <p className="rounded-2xl bg-sunken p-4 text-[12.5px] leading-relaxed text-muted-foreground">
              Simulated: sign-in codes, email, the barangay and every report. Not included by design: emergency dispatch, public incident maps, payments, digital certificate issuance, or offline submission.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
