"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect } from "react";
import type { Portal } from "@/lib/auth-path";
import type { Database } from "@/lib/database.types";

type Bootstrap = { url: string; key: string; accessToken: string; expiresAt: number; topics: string[] };
export function useInvalidations(portal: Portal, enabled: boolean, refresh: () => void, onConnection: (connected: boolean) => void) {
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    let client: SupabaseClient<Database> | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let bearer: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activeTopics: string[] = [];
    const subscribed = new Set<string>();
    const invalidate = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 100);
    };
    async function connect() {
      try {
        const res = await fetch(`/api/realtime?portal=${portal}`, { cache: "no-store", signal: abort.signal });
        if (abort.signal.aborted) return;
        if (res.status === 401) { onConnection(false); void client?.removeAllChannels(); refresh(); return; }
        if (!res.ok) throw new Error("Live updates are unavailable");
        const config = await res.json() as Bootstrap;
        if (abort.signal.aborted) return;
        bearer = config.accessToken;
        if (client && activeTopics.join() !== config.topics.join()) {
          subscribed.clear();
          onConnection(false);
          await client.removeAllChannels();
          client = null;
        }
        if (!config.topics.length) return;
        if (!client) {
          const socket = createClient<Database>(config.url, config.key, { accessToken: async () => bearer });
          await socket.realtime.setAuth(config.accessToken);
          if (abort.signal.aborted) return;
          client = socket;
          activeTopics = config.topics;
          for (const topic of activeTopics) {
            socket.channel(topic, { config: { private: true } }).on("broadcast", { event: "changed" }, invalidate)
              .subscribe((status) => {
                if (abort.signal.aborted) return;
                if (status === "SUBSCRIBED") { subscribed.add(topic); invalidate(); }
                else subscribed.delete(topic);
                onConnection(subscribed.size === activeTopics.length);
              });
          }
        } else {
          await client.realtime.setAuth(config.accessToken);
        }
        timeout = setTimeout(connect, Math.max(5_000, config.expiresAt * 1000 - Date.now() - 30_000));
      } catch {
        onConnection(false);
        if (!abort.signal.aborted) timeout = setTimeout(connect, 30_000);
      }
    }
    void connect();
    return () => {
      abort.abort();
      clearTimeout(timeout);
      clearTimeout(timer);
      void client?.removeAllChannels();
    };
  }, [portal, enabled, refresh, onConnection]);
}
