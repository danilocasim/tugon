"use server";

import { CATEGORIES, CATEGORY, type Category, type LocationInfo } from "@/lib/domain";
import { inBounds, landmarkById, purokAt } from "@/lib/geo";
import { failure, success } from "@/lib/result";
import { isUUID } from "@/lib/uuid";
import { evidenceBucket, reportEvidenceKey, sanitizeReportPhoto } from "./evidence";
import { portalIdentity } from "./identity";
import { requestAuth } from "./supabase";

function validatedLocation(loc: LocationInfo): LocationInfo | null {
  if (loc?.method === "purok" && loc.purok && /^P[1-5]$/u.test(loc.purok)) {
    return { method: "purok", purok: loc.purok, lat: null, lon: null, landmarkId: null };
  }
  if (loc?.method === "landmark" && typeof loc.landmarkId === "string") {
    const place = landmarkById(loc.landmarkId);
    return place ? { method: "landmark", purok: place.purok, lat: place.lat, lon: place.lon, landmarkId: place.id } : null;
  }
  if ((loc?.method === "device" || loc?.method === "pin") && typeof loc.lat === "number" && typeof loc.lon === "number" && inBounds(loc.lat, loc.lon)) {
    return { method: loc.method, purok: purokAt(loc.lat, loc.lon), lat: loc.lat, lon: loc.lon, landmarkId: null };
  }
  return null;
}

type Draft = {
  idemKey: string;
  text: string;
  residentCategory: Category | null;
  dangerNow: boolean;
  location: LocationInfo | null;
  photo: string | null;
};

export async function submitReport(input: Draft) {
  const identity = await portalIdentity("resident");
  if (!identity) return failure("auth", "Sign in again to send your report.");
  if (!isUUID(input?.idemKey)) return failure("invalid", "Start a report before submitting.");
  const client = await requestAuth();
  const submission = input.idemKey.toLowerCase();
  const { data: existing, error: existingError } = await client.from("service_requests").select("id,ref")
    .eq("resident_id", identity.subject).eq("submission_key", submission).maybeSingle();
  if (existingError) return failure("network", "We could not check your submission. Try again.");
  if (existing) return success({ ...existing, replayed: true });
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (text.length < 10 || text.length > 1000 || typeof input.dangerNow !== "boolean") return failure("invalid", "Check the description and danger question.");
  const category = input.residentCategory;
  if (category !== null && !CATEGORIES.includes(category)) return failure("invalid", "Choose a category from the list or Not sure.");
  const location = input.location === null ? null : validatedLocation(input.location);
  if (!location && (input.location !== null || category === null || CATEGORY[category].located)) {
    return failure("invalid", "Choose a location inside the barangay or select a purok.", "location");
  }
  const hasPhoto = input.photo !== null;
  if (hasPhoto) {
    const jpeg = await sanitizeReportPhoto(input.photo);
    if (!jpeg) return failure("invalid", "Choose a valid JPEG photo under 600 KB, or remove the photo and try again.", "photo");
    const bucket = evidenceBucket();
    const key = reportEvidenceKey(identity.subject, submission);
    const { error } = await bucket.upload(key, jpeg, { contentType: "image/jpeg", upsert: false });
    if (error && (await bucket.info(key)).error) return failure("network", "The photo could not be saved. Try again.");
  }
  const { data, error } = await client.rpc("submit_resident_report", {
    p_key: submission, p_description: text, p_category: category!, p_danger: input.dangerNow,
    p_location: location && { ...location }, p_photo: hasPhoto,
  }).single();
  if (error?.code === "42501") return failure("auth", "Sign in again to send your report.");
  if (error?.code === "22023") return failure("invalid", "Check the report details before submitting.");
  if (error || !data) return failure("network", "We could not confirm your submission. Try again.");
  return success(data);
}
