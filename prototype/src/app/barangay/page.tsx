"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ROLE_HOME } from "@/features/barangay/ui";
import { useStaff } from "@/hooks/use-live";

export default function BarangayIndex() {
  const { data } = useStaff();
  const router = useRouter();
  useEffect(() => {
    if (data?.me) router.replace(ROLE_HOME[data.me.role]);
  }, [data, router]);
  return null;
}
