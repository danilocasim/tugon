"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { resetDemo } from "@/server/actions";

export function DemoReset() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!confirm("Reset all demo data? Changes in both portals will be lost.")) return;
        setBusy(true);
        await resetDemo();
        // Both frames follow the live stream; reload them so sessions see fresh seed data.
        document.querySelectorAll("iframe").forEach((f) => f.contentWindow?.location.reload());
        setBusy(false);
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-[#8a7f6a] bg-[#fffbe9] px-2.5 font-mono text-[11.5px] text-[#5b5240] disabled:opacity-50"
    >
      <RotateCcw className="size-3.5" /> Reset data
    </button>
  );
}
