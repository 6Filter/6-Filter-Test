/**
 * Browser-safe Log unlock constants only.
 * Do not import server password verification here — that stays in departmentAuth.js.
 */
import { SUBMITTER_DEPARTMENTS } from "./propositionFields.js";

/** Cross-department Log unlock — not a submitter team on the form. */
export const LOG_MASTER_UNLOCK = "Master";

/** R&D / CIA / Marketing / NPD — submitter teams, not CavinKare business divisions. */
export const LOG_UNLOCK_DEPARTMENTS = SUBMITTER_DEPARTMENTS;

/** Dropdown options: four teams + Master (sees every submitter team). */
export const LOG_UNLOCK_OPTIONS = [...LOG_UNLOCK_DEPARTMENTS, LOG_MASTER_UNLOCK];

export function isMasterUnlock(department) {
  return String(department || "").trim() === LOG_MASTER_UNLOCK;
}

/** Normalize a Log unlock identity (team or Master). */
export function normalizeLogUnlock(value) {
  const s = String(value || "").trim();
  if (s === LOG_MASTER_UNLOCK) return LOG_MASTER_UNLOCK;
  return LOG_UNLOCK_DEPARTMENTS.includes(s) ? s : "";
}
