/**
 * Shared department-password gate for the Log page (server-only).
 *
 * R&D / CIA / Marketing / NPD are submitter teams, not CavinKare business
 * divisions (Foods, Personal Care, …). Unlocking R&D shows rows whose
 * submitterDepartment is R&D — never a mapping onto auto-detected division.
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
  LOG_UNLOCK_DEPARTMENTS,
  LOG_UNLOCK_OPTIONS,
  LOG_MASTER_UNLOCK,
  normalizeLogUnlock,
} from "./departmentAuthConstants.js";
import { rowTeam } from "./logStatus.js";

export {
  isMasterUnlock,
  LOG_UNLOCK_DEPARTMENTS,
  LOG_UNLOCK_OPTIONS,
  LOG_MASTER_UNLOCK,
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
  if (isMasterUnlock(department)) return true;
  const dept = normalizeLogUnlock(department);
  if (!dept || isMasterUnlock(dept)) return false;
  return rowTeam(proposition) === dept;
}
