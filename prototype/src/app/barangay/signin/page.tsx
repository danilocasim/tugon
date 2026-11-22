import { Suspense } from "react";
import { StaffSignIn } from "@/features/barangay/signin";

export const metadata = { title: "Sign in" };

export default function StaffSignInPage() {
  return (
    <Suspense>
      <StaffSignIn />
    </Suspense>
  );
}
