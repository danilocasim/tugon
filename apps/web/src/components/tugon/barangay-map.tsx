"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { BarangayMapProps } from "./barangay-map-impl";

export type { MapCluster, MapPin } from "./barangay-map-impl";

/** MapLibre needs the browser; render a quiet placeholder of the same size meanwhile. */
export const BarangayMap = dynamic<BarangayMapProps>(() => import("./barangay-map-impl"), {
  ssr: false,
  loading: () => <div className={cn("h-full min-h-48 w-full animate-pulse rounded-2xl bg-sunken")} />,
});
