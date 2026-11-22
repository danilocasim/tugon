import { redirect } from "next/navigation";
import { StaffSignIn } from "@/features/barangay/signin";
import { portalReturnPath } from "@/lib/auth-path";
import { portalIdentity, readIdentity } from "@/server/identity";
import { publicSettings } from "@/server/resident-data";
import { consumePasswordSetup } from "@/server/staff-password";
import { requestAuth } from "@/server/supabase";

export const metadata = { title: "Sign in" };

export default async function StaffSignInPage({ searchParams }: PageProps<"/barangay/signin">) {
  const { next, setup } = await searchParams;
  const redirectTo = portalReturnPath("staff", next);
  const [staff, settings] = await Promise.all([portalIdentity("staff"), publicSettings()]);
  if (staff) redirect(redirectTo);
  const identity = await readIdentity();
  const startingName = identity?.password && identity.member && identity.member.role !== "resident" && identity.member.role !== "tanod" ? identity.member.name : null;
  const canSetPassword = setup === "password" && await consumePasswordSetup();
  const factors = canSetPassword ? await (await requestAuth()).auth.mfa.listFactors() : null;
  return <StaffSignIn next={redirectTo} barangay={settings.barangay} startingName={startingName} canSetPassword={canSetPassword && !factors?.error} passwordMfa={!!factors?.data?.totp.length} expired={setup === "expired" || (setup === "password" && (!canSetPassword || !!factors?.error))} />;
}
