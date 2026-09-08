/**
 * Shared department-password gate for the Log page (server-only).
 *
 * R&D / CIA / Marketing / NPD are submitter teams, not CavinKare business
 * divisions (Foods, Personal Care, …). Unlocking R&D shows rows whose
 * submitterDepartment is R&D — never a mapping onto auto-detected division.
 *
 * Browser code must import LOG_UNLOCK_DEPARTMENTS from
 * ./departmentAuthConstants.js — never this file (pulls node:crypto via auth.js).
 *
 * Password hashes live in the department_passwords table (or local file store).
 * Rotate with scripts/seedDepartmentPasswords.mjs — no redeploy required.
 */
import { scryptVerify } from "./auth.js";
import { getDepartmentPasswordHash } from "./db.js";
import { normalizeSubmitterDepartment } from "./propositionFields.js";
import { rowTeam } from "./logStatus.js";
import { LOG_UNLOCK_DEPARTMENTS } from "./departmentAuthConstants.js";

export { LOG_UNLOCK_DEPARTMENTS };

export async function verifyDepartmentPassword(department, plaintextPassword) {
  const dept = normalizeSubmitterDepartment(department);
  const hash = dept ? await getDepartmentPasswordHash(dept) : "";
  if (!dept || !hash) {
    scryptVerify(String(plaintextPassword || ""), "0".repeat(32) + ":" + "0".repeat(128));
    return false;
  }
  return scryptVerify(String(plaintextPassword || ""), hash);
}

export function matchesUnlockedDepartment(proposition, department) {
  const dept = normalizeSubmitterDepartment(department);
  if (!dept) return false;
  return rowTeam(proposition) === dept;
}
