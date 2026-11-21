import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();
export async function runAuthorizedJob<T>(request: Request, job: () => Promise<T>) {
  const headers = { "Cache-Control": "no-store" };
  const secret = process.env.TUGON_JOBS_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !timingSafeEqual(digest(`Bearer ${secret}`), digest(authorization))) {
    return Response.json({ status: "not_found" }, { status: 404, headers });
  }
  try { return Response.json(await job(), { headers }); }
  catch { return Response.json({ status: "unavailable" }, { status: 503, headers }); }
}
