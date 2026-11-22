"use client";

/**
 * Prototype controls. Deliberately styled unlike the product (dashed, mono,
 * notepad yellow) so nobody mistakes it for a real feature.
 */
import { FlaskConical, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { resetDemo } from "@/server/actions";

export const DROP_NEXT_KEY = "tugon.proto.dropNextSubmit";

export function PrototypeBar({ className, children, onReset }: { className?: string; children?: ReactNode; onReset?: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Prototype controls"
          title="Prototype controls"
          className={cn(
            "fixed z-40 grid size-9 place-items-center rounded-full border-[1.5px] border-dashed border-[#a99d84] bg-[#fffbe9]/90 text-[#5b5240] shadow-sm backdrop-blur transition hover:scale-105 hover:bg-[#fff3c4]",
            className,
          )}
        >
          <FlaskConical className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-3 rounded-xl border-[1.5px] border-dashed border-[#8a7f6a] bg-[#fffbe9] p-3.5 font-mono text-[12px] text-[#3e3829]">
        <p className="text-[10.5px] font-semibold tracking-[0.12em] text-[#8a7f6a] uppercase">Prototype controls</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            ["/", "Hub"],
            ["/resident", "Resident"],
            ["/barangay", "Barangay"],
            ["/tanod", "Tanod"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-md border border-[#c9bd9f] bg-white px-2 py-1.5 text-center hover:bg-[#f6efd6]">
              {label}
            </Link>
          ))}
        </div>
        {children}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!confirm("Reset all demo data to the starting state? Every change made in either portal will be lost.")) return;
            setBusy(true);
            await resetDemo();
            setBusy(false);
            onReset?.();
            toast("Demo data reset");
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#c9bd9f] bg-white px-2 py-1.5 hover:bg-[#f6efd6] disabled:opacity-60"
        >
          <RotateCcw className="size-3.5" /> Reset demo data
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** Simulates a lost response on the next report submission, to demonstrate safe retries. */
export function DropNextToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(sessionStorage.getItem(DROP_NEXT_KEY) === "1"), []);
  return (
    <label className="flex cursor-pointer items-start gap-2 leading-snug">
      <input
        type="checkbox"
        className="mt-0.5 accent-[#5b5240]"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          if (e.target.checked) sessionStorage.setItem(DROP_NEXT_KEY, "1");
          else sessionStorage.removeItem(DROP_NEXT_KEY);
        }}
      />
      <span>Drop the connection on the next report submit (server saves it; reply is lost)</span>
    </label>
  );
}
