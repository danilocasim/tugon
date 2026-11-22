"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const APPS = {
  resident: { src: "/resident", title: "Resident portal", label: "Resident" },
  tanod: { src: "/tanod", title: "Tanod app", label: "Tanod" },
} as const;
type App = keyof typeof APPS;

/** One phone, two apps: both stay mounted so switching keeps each app's place and live connection. */
export function DemoPhone() {
  const [app, setApp] = useState<App>("resident");
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-3">
      <div role="tablist" aria-label="Phone app" className="inline-flex rounded-full bg-card/70 p-[3px] shadow-sheet">
        {(Object.keys(APPS) as App[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={app === k}
            onClick={() => setApp(k)}
            className={cn("h-8 rounded-full px-4 text-[13px] font-semibold transition", app === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          >
            {APPS[k].label}
          </button>
        ))}
      </div>
      <div className="relative h-[min(844px,calc(100dvh-160px))] w-[calc(min(844px,calc(100dvh-160px))*0.4621)] rounded-[44px] bg-[#16191f] p-[10px] shadow-float">
        <div className="flex size-full flex-col overflow-hidden rounded-[34px] bg-background">
          {/* Status bar keeps the island clear of the app, like a real safe area. */}
          <div className="relative flex h-[34px] shrink-0 items-center justify-between px-7 text-[12px] font-semibold tabular" aria-hidden>
            <span>9:41</span>
            <span className="absolute top-[9px] left-1/2 h-[20px] w-[78px] -translate-x-1/2 rounded-full bg-[#16191f]" />
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-4 rounded-[3px] border border-foreground/70 p-[1px]">
                <span className="block h-full w-3/4 rounded-[1px] bg-foreground/80" />
              </span>
            </span>
          </div>
          {(Object.keys(APPS) as App[]).map((k) => (
            <iframe key={k} src={APPS[k].src} title={APPS[k].title} className={cn("min-h-0 w-full flex-1", app !== k && "hidden")} />
          ))}
        </div>
      </div>
      <p className="text-[12px] font-medium text-ink-3">{APPS[app].label} · 390 × 844</p>
    </div>
  );
}
