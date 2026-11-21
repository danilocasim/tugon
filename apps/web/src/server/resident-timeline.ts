"use server";

import { failure, success } from "@/lib/result";
import { isUUID } from "@/lib/uuid";
import { portalIdentity } from "./identity";
import { requestAuth } from "./supabase";

async function update(id: unknown, action: "reply" | "follow_up" | "withdraw", message: unknown = "") {
  if (!isUUID(id) || typeof message !== "string" || message.length > 1000) return failure("invalid", "Check the request details.");
  if (!(await portalIdentity("resident"))) return failure("auth", "Sign in to update a request.");
  const client = await requestAuth();
  const { error } = await client.rpc("update_my_request", { p_id: id, p_action: action, p_message: message });
  if (error?.code === "42501") return failure("not_found", "Request not found.");
  if (error?.code === "22023") return failure("invalid", "This action is no longer available. Refresh the request before trying again.");
  return error ? failure("network", "We could not save the update.") : success(null);
}

export async function replyToRequest(input: { id: string; text: string }) { return update(input?.id, "reply", input?.text); }
export async function requestFollowUp(input: { id: string; text: string }) { return update(input?.id, "follow_up", input?.text); }
export async function withdrawRequest(input: { id: string }) { return update(input?.id, "withdraw"); }

export async function markNotificationsRead(ids?: string[]) {
  if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || !ids.every(isUUID))) return failure("invalid", "Select valid updates.");
  if (!(await portalIdentity("resident"))) return failure("auth", "Sign in to read updates.");
  const client = await requestAuth();
  const { error } = await client.rpc("read_my_notifications", ids ? { p_ids: ids } : {});
  return error ? failure("network", "We could not mark the updates read.") : success(null);
}
