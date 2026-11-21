import { redirect } from "next/navigation";
import { ResidentSignIn } from "@/features/resident/signin";
import { portalReturnPath } from "@/lib/auth-path";
import { readIdentity } from "@/server/identity";

export const metadata = { title: "Sign in" };

export default async function ResidentSignInPage({ searchParams }: PageProps<"/resident/signin">) {
  const [identity, { next: requestedPath }] = await Promise.all([readIdentity(), searchParams]);
  const next = portalReturnPath("resident", requestedPath);
  if (identity?.member?.role === "resident") redirect(next);
  return <ResidentSignIn next={next} pendingProfile={!!identity?.email && !identity.member} />;
}
