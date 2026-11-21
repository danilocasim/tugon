/**
 * Filipino staff copy, keyed by the English source text used in components.
 * One file per area so translators (and reviewers) work on one part at a time.
 */
import cases from "./cases";
import manage from "./manage";
import programs from "./programs";
import server from "./server";
import shell from "./shell";

export const FIL: Record<string, string> = { ...server, ...shell, ...cases, ...manage, ...programs };
