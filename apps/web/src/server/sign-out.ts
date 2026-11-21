"use server";

import { failure, success } from "@/lib/result";
import { requestAuth } from "./supabase";

export async function signOutPortal() {
  const client = await requestAuth();
  const { error } = await client.auth.signOut({ scope: "local" });
  return error ? failure("auth", "Couldn't sign out. Try again.") : success(null);
}
