/**
 * Browser-safe Log unlock constants only.
 * Do not import server password verification here — that stays in departmentAuth.js.
 */

/**
 * Team-password gate for the whole platform. Set true to restore Unlock Primus.AI.
 * While false, everyone can use the form and Log; research bills ANTHROPIC_API_KEY.
 */
export const PLATFORM_TEAM_LOCK_ENABLED = false;

/** Synthetic session team when the password gate is off. */
export const OPEN_ACCESS_TEAM = "Open";

/** Cross-department Log unlock — not a form submitter value. */
export const LOG_MASTER_UNLOCK = "Master";

/**
 * Password-unlock teams (when PLATFORM_TEAM_LOCK_ENABLED is true).
 * Kept separate from the form's submitter department list.
 */
export const LOG_UNLOCK_DEPARTMENTS = ["R&D", "NPD", "CIA", "Marketing"];

/** Dropdown options: unlock teams + Master (sees every submitter team). */
export const LOG_UNLOCK_OPTIONS = [...LOG_UNLOCK_DEPARTMENTS, LOG_MASTER_UNLOCK];

export function isMasterUnlock(department) {
  return String(department || "").trim() === LOG_MASTER_UNLOCK;
}

export function isOpenAccessTeam(department) {
  return String(department || "").trim() === OPEN_ACCESS_TEAM;
}

/** Normalize a Log unlock identity (team, Master, or open-access). */
export function normalizeLogUnlock(value) {
  const s = String(value || "").trim();
  if (s === LOG_MASTER_UNLOCK) return LOG_MASTER_UNLOCK;
  if (s === OPEN_ACCESS_TEAM) return OPEN_ACCESS_TEAM;
  return LOG_UNLOCK_DEPARTMENTS.includes(s) ? s : "";
}
