/**
 * Shared department-password gate for the Log page (server-only).
 *
 * R&D / CIA / Marketing / NPD are submitter teams, not CavinKare business
 * divisions (Foods, Personal Care, …). Unlocking R&D shows rows whose
 * submitterDepartment is R&D — never a mapping onto auto-detected division.
 *
 * Browser code must import LOG_UNLOCK_DEPARTMENTS from
 * ./departmentAuthConstants.js — never this file (pulls node:crypto via auth.js).
 */
import { scryptVerify } from "./auth.js";
import { normalizeSubmitterDepartment } from "./propositionFields.js";
import { rowTeam } from "./logStatus.js";
import { LOG_UNLOCK_DEPARTMENTS } from "./departmentAuthConstants.js";

export { LOG_UNLOCK_DEPARTMENTS };

const HASH_ENV = {
  "R&D": "DEPT_PASSWORD_HASH_RD",
  CIA: "DEPT_PASSWORD_HASH_CIA",
  Marketing: "DEPT_PASSWORD_HASH_MARKETING",
  NPD: "DEPT_PASSWORD_HASH_NPD",
};

export function departmentPasswordHash(department) {
  const key = HASH_ENV[normalizeSubmitterDepartment(department)];
  return key ? String(process.env[key] || "").trim() : "";
}

export function verifyDepartmentPassword(department, plaintextPassword) {
  const dept = normalizeSubmitterDepartment(department);
  const hash = departmentPasswordHash(dept);
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
