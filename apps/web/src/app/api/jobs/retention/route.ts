import { runAuthorizedJob } from "@/server/job-auth";
import { processRetention } from "@/server/retention";

export function POST(request: Request) { return runAuthorizedJob(request, processRetention); }
