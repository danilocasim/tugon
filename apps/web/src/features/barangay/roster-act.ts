"use client";

import { useState } from "react";
import { toast } from "sonner";
import { failure, type Result } from "@/lib/result";
import { useStaffLang } from "./i18n";

export function useRosterAction() {
  const [pending, setPending] = useState<string | null>(null);
  const { localize } = useStaffLang();
  async function act<T>(key: string, operation: () => Promise<Result<T>>, opts?: { success?: string }) {
    setPending(key);
    try {
      const result = await operation();
      if (!result.ok) toast.error(localize(result.message));
      else if (opts?.success) toast.success(opts.success);
      return result;
    } catch {
      const result = failure("network", "Can't reach the barangay server. Check your connection and try again.");
      if (!result.ok) toast.error(localize(result.message));
      return result;
    } finally {
      setPending(null);
    }
  }
  return { act, pending };
}
