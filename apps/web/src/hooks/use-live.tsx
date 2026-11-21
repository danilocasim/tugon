"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { DeskSnapshot, ResidentSnapshot, TanodSnapshot } from "@/lib/snapshot";
import type { Result } from "@/lib/result";
import type { Portal } from "@/lib/auth-path";
import { useInvalidations } from "./invalidation";
type Snapshot = ResidentSnapshot | DeskSnapshot | TanodSnapshot;

interface Live<T> {
  data: T | null;
  refresh: () => Promise<void>;
  connected: boolean;
}

const LiveContext = createContext<Live<Snapshot> | null>(null);

export function LiveProvider({ portal, initial, incidentId, children }: { portal: Portal; initial: Snapshot; incidentId?: string; children: ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(initial);
  const [connected, setConnected] = useState(false);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const query = new URLSearchParams({ portal });
      if (incidentId) query.set("incident", incidentId);
      const res = await fetch(`/api/state?${query}`, { cache: "no-store" });
      if (id !== requestId.current) return;
      if (res.status === 401 || res.status === 403) setData(null);
      if (!res.ok) { setConnected(false); return; }
      const json = (await res.json()) as Snapshot;
      if (id === requestId.current) {
        setData(json);
      }
    } catch {
      if (id === requestId.current) setConnected(false);
    }
  }, [portal, incidentId]);

  useEffect(() => {
    const onOnline = () => { void refresh(); };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  useInvalidations(portal, !!data?.me, refresh, setConnected);

  return <LiveContext.Provider value={{ data, refresh, connected }}>{children}</LiveContext.Provider>;
}

function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used inside <LiveProvider>");
  return ctx;
}

export const useResident = () => useLive() as Live<ResidentSnapshot>;
export const useStaff = () => useLive() as Live<DeskSnapshot>;
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
