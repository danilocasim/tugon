import { Suspense } from "react";
import { Administration } from "@/features/barangay/admin";

export const metadata = { title: "Administration" };

export default function AdminPage() {
  return (
    <Suspense>
      <Administration />
    </Suspense>
  );
}
