/**
 * Shared department-password gate for the Log page (server-only).
 *
 * R&D / CIA / Marketing / NPD are submitter teams, not CavinKare business
 * divisions (Foods, Personal Care, …). Any unlocked team sees every stored
 * idea in the Log. Unlock never maps onto auto-detected division.
 *
 * Master unlock sees every submitter team. It is not a form submitter value.
 *
 * Browser code must import unlock constants from
 * ./departmentAuthConstants.js — never this file (pulls node:crypto via auth.js).
 *
 * Password hashes live in the department_passwords table (or local file store).
 * Rotate with scripts/seedDepartmentPasswords.mjs — no redeploy required.
 */
import { scryptVerify } from "./auth.js";
import { departmentPasswordHashFallbacks, getDepartmentPasswordHash } from "./db.js";
import {
  isMasterUnlock,
  isOpenAccessTeam,
  LOG_UNLOCK_DEPARTMENTS,
  LOG_UNLOCK_OPTIONS,
  LOG_MASTER_UNLOCK,
  OPEN_ACCESS_TEAM,
  PLATFORM_TEAM_LOCK_ENABLED,
  normalizeLogUnlock,
} from "./departmentAuthConstants.js";

export {
  isMasterUnlock,
  isOpenAccessTeam,
  LOG_UNLOCK_DEPARTMENTS,
  LOG_UNLOCK_OPTIONS,
  LOG_MASTER_UNLOCK,
  OPEN_ACCESS_TEAM,
  PLATFORM_TEAM_LOCK_ENABLED,
  normalizeLogUnlock,
};

export async function verifyDepartmentPassword(department, plaintextPassword) {
  const dept = normalizeLogUnlock(department);
  const password = String(plaintextPassword || "");
  const hashes = [];
  try {
    const stored = dept ? await getDepartmentPasswordHash(dept) : "";
    if (stored) hashes.push(stored);
  } catch (e) {
    console.warn(`[primus/dept-auth] store lookup failed (${e.code || e.message})`);
  }
  const fallback = dept ? departmentPasswordHashFallbacks()[dept] || "" : "";
  if (fallback && !hashes.includes(fallback)) hashes.push(fallback);
  if (!dept || !hashes.length) {
    scryptVerify(password, "0".repeat(32) + ":" + "0".repeat(128));
    return false;
  }
  return hashes.some((hash) => scryptVerify(password, hash));
}

export function matchesUnlockedDepartment(proposition, department) {
  if (isMasterUnlock(department) || isOpenAccessTeam(department)) return true;
  const dept = normalizeLogUnlock(department);
  if (!dept || isMasterUnlock(dept) || isOpenAccessTeam(dept)) return false;
  // Every unlocked team sees every stored idea. A business division name is not an unlock.
  return Boolean(dept) && proposition !== undefined;
}
