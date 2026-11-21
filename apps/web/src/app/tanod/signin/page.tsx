import { redirect } from "next/navigation";
import { TanodSignIn } from "@/features/tanod/signin";
import { portalReturnPath } from "@/lib/auth-path";
import { portalIdentity } from "@/server/identity";

export const metadata = { title: "Sign in" };

export default async function TanodSignInPage({ searchParams }: PageProps<"/tanod/signin">) {
  const next = portalReturnPath("tanod", (await searchParams).next);
  if (await portalIdentity("tanod")) redirect(next);
  return <TanodSignIn next={next} />;
}
