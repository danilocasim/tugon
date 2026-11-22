import { Suspense } from "react";
import { ResidentSignIn } from "@/features/resident/signin";

export const metadata = { title: "Sign in" };

export default function ResidentSignInPage() {
  return (
    <Suspense>
      <ResidentSignIn />
    </Suspense>
  );
}
