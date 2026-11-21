import { runAuthorizedJob } from "@/server/job-auth";
import { processDeliveryQueue } from "@/server/delivery";

export function POST(request: Request) { return runAuthorizedJob(request, processDeliveryQueue); }
