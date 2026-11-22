import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Mark } from "@/components/tugon/marks";
import { DemoPhone } from "./phone";
import { DemoReset } from "./reset";

export const metadata = { title: "Side-by-side demo" };

/** Resident phone and barangay desk in one view, both live against the same backend. */
export default function Demo() {
  return (
    <div className="flex h-dvh flex-col bg-[#ebe8e0]">
      <header className="flex h-14 shrink-0 items-center gap-3 bg-background/80 px-4 backdrop-blur-xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <Mark size={26} />
        <span className="text-[14px] font-bold">Side-by-side demo</span>
        <span className="hidden text-[12.5px] text-muted-foreground md:inline">Submit a report on the phone; it lands in the barangay inbox within a second.</span>
        <span className="ml-auto flex items-center gap-2">
          <DemoReset />
          <a href="/resident" target="_blank" className="hidden h-8 items-center gap-1.5 rounded-full bg-fill px-3 text-[12.5px] font-semibold transition hover:bg-fill-strong sm:inline-flex">
            Resident <ExternalLink className="size-3.5" />
          </a>
          <a href="/barangay" target="_blank" className="hidden h-8 items-center gap-1.5 rounded-full bg-fill px-3 text-[12.5px] font-semibold transition hover:bg-fill-strong sm:inline-flex">
            Barangay <ExternalLink className="size-3.5" />
          </a>
        </span>
      </header>

      <div className="hidden min-h-0 flex-1 gap-5 p-5 lg:flex">
        <DemoPhone />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 items-center gap-1.5 rounded-t-2xl bg-[#dcd8ce] px-3" aria-hidden>
            <span className="size-2.5 rounded-full bg-[#e46b5e]" />
            <span className="size-2.5 rounded-full bg-[#e7b54f]" />
            <span className="size-2.5 rounded-full bg-[#5fb06f]" />
            <span className="mx-auto rounded-md bg-background/70 px-6 py-0.5 font-mono text-[11px] text-ink-3">tugon.local/barangay</span>
          </div>
          <iframe src="/barangay" title="Barangay portal" className="min-h-0 flex-1 rounded-b-2xl bg-background shadow-float" />
        </div>
      </div>

      <div className="grid flex-1 place-items-center p-6 text-center lg:hidden">
        <div className="max-w-sm">
          <p className="text-[17px] font-bold">Side-by-side needs a wider screen</p>
          <p className="mt-2 text-[14px] text-muted-foreground">Open each portal on its own — they still sync live, even across two devices on the same network.</p>
          <div className="mt-5 grid gap-2">
            <Link href="/resident" className="inline-flex h-12 items-center justify-center rounded-full bg-primary text-[15px] font-bold text-primary-foreground shadow-press">
              Resident portal
            </Link>
            <Link href="/barangay" className="inline-flex h-12 items-center justify-center rounded-full bg-card text-[15px] font-semibold shadow-sheet">
              Barangay portal
            </Link>
            <Link href="/tanod" className="inline-flex h-12 items-center justify-center rounded-full bg-card text-[15px] font-semibold shadow-sheet">
              Tanod app
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
