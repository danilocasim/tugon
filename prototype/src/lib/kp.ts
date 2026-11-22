/**
 * Katarungang Pambarangay timelines (RA 7160 sec. 410): the Punong Barangay has
 * 15 days to mediate; a Pangkat then has 15 days to conciliate, extendable once
 * by 15 days. A settlement can be repudiated within 10 days (sec. 418).
 * The barangay should confirm these against its own Lupon practice and DILG forms.
 */
import type { KpCase } from "./domain";
import { DAY } from "./format";

export const MEDIATION_DAYS = 15;
export const CONCILIATION_DAYS = 15;
export const REPUDIATION_DAYS = 10;

export function kpDeadline(kp: KpCase) {
  if (kp.stage === "mediation") return kp.mediationStart + MEDIATION_DAYS * DAY;
  if (kp.stage === "conciliation" && kp.conciliationStart) return kp.conciliationStart + (kp.extended ? 2 : 1) * CONCILIATION_DAYS * DAY;
  return null;
}

/** A CFA is issued when conciliation fails or runs out, or when the respondent refuses to appear. */
export function canIssueCfa(kp: KpCase, now = Date.now()) {
  if (kp.stage !== "mediation" && kp.stage !== "conciliation") return false;
  if (kp.hearings.some((h) => h.result === "respondent_absent")) return true;
  if (kp.stage !== "conciliation") return false;
  const deadline = kpDeadline(kp);
  return kp.hearings.some((h) => h.kind === "conciliation" && h.result === "failed") || (deadline !== null && now > deadline);
}

/** The complaint may be dismissed when the complainant fails to appear. */
export const canDismiss = (kp: KpCase) => (kp.stage === "mediation" || kp.stage === "conciliation") && kp.hearings.some((h) => h.result === "complainant_absent");

export const nextHearing = (kp: KpCase, now = Date.now()) =>
  kp.hearings.filter((h) => !h.result && h.at > now - 3 * 60 * 60 * 1000).sort((a, b) => a.at - b.at)[0] ?? null;
