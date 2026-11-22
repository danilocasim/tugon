import { readDb, subscribe } from "@/server/db";

export const dynamic = "force-dynamic";

/** Server-Sent Events: pushes the store revision after every commit so open portals refetch. */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send(`retry: 2000\ndata: ${readDb().rev}\n\n`);
      const unsubscribe = subscribe((rev) => send(`data: ${rev}\n\n`));
      const heartbeat = setInterval(() => send(`: keep-alive\n\n`), 20_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" },
  });
}
