"use client";

/**
 * Live data for a portal: fetches the role-scoped snapshot, then listens to the
 * server's revision stream (SSE) and refetches whenever another tab, device, or
 * user commits a change. Actions go through `useAct`, which refreshes on success
 * and surfaces failures without losing input.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { ResidentSnapshot, StaffSnapshot, TanodSnapshot } from "@/lib/snapshot";
import type { Result } from "@/server/actions";

type Portal = "resident" | "staff" | "tanod";
type Snapshot = ResidentSnapshot | StaffSnapshot | TanodSnapshot;

interface Live<T> {
  data: T | null;
  refresh: () => Promise<void>;
  connected: boolean;
}

const LiveContext = createContext<Live<Snapshot> | null>(null);

export function LiveProvider({ portal, children }: { portal: Portal; children: ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const rev = useRef(-1);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/state?portal=${portal}`, { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as Snapshot;
    rev.current = json.rev;
    setData(json);
  }, [portal]);

  useEffect(() => {
    void refresh();
    const es = new EventSource("/api/events");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      if (Number(e.data) !== rev.current) void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      es.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return <LiveContext.Provider value={{ data, refresh, connected }}>{children}</LiveContext.Provider>;
}

function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used inside <LiveProvider>");
  return ctx;
}

export const useResident = () => useLive() as Live<ResidentSnapshot>;
export const useStaff = () => useLive() as Live<StaffSnapshot>;
export const useTanod = () => useLive() as Live<TanodSnapshot>;

/**
 * Rewrites toast text from `useAct` (success copy and server messages) into the
 * portal's display language. Identity unless a portal provides one.
 */
export const ActMessages = createContext<(message: string) => string>((m) => m);

/**
 * Run a server action with one pending key at a time per component.
 * Success refreshes live data; failure shows the server's message unless the
 * caller handles it (quiet), so field-level errors can be shown inline instead.
 */
export function useAct() {
  const { refresh } = useLive();
  const tr = useContext(ActMessages);
  const [pending, setPending] = useState<string | null>(null);

  const act = useCallback(
    async <T,>(key: string, fn: () => Promise<Result<T>>, opts: { success?: string; quiet?: boolean } = {}): Promise<Result<T>> => {
      setPending(key);
      try {
        const r = await fn();
        if (r.ok) {
          await refresh();
          if (opts.success) toast.success(tr(opts.success));
        } else if (!opts.quiet) {
          toast.error(tr(r.message));
        }
        return r;
      } catch {
        const message = "Can't reach the barangay server. Check your connection and try again.";
        if (!opts.quiet) toast.error(tr(message));
        return { ok: false, code: "network", message };
      } finally {
        setPending(null);
      }
    },
    [refresh, tr],
  );

  return { act, pending };
}

/** Re-render on an interval so waiting times and aging scores stay current. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
