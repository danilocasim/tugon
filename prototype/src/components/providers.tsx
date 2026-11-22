"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}>
      <TooltipProvider delayDuration={250}>
        {children}
        <Toaster theme="light" position="top-center" richColors={false} closeButton />
      </TooltipProvider>
    </MotionConfig>
  );
}
