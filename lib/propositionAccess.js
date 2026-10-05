import { authRequired } from "./auth.js";
import { canApproveManagerRole } from "./managerReview.js";
import { isMasterUnlock, matchesUnlockedDepartment, normalizeLogUnlock } from "./departmentAuth.js";

/**
 * Visibility for Log + proposition APIs.
 *
 * Department-password sessions (R&D / CIA / Marketing / NPD) see every stored
 * idea. Unlock is not mapped onto auto-detected CavinKare division (Foods,
 * Personal Care, …). Those two taxonomies stay separate.
 *
 * Master unlock sees every submitter team and is the only Log password that
 * may delete propositions (row or bulk). Team unlocks are view/export only.
 *
 * Named-account login (REQUIRE_AUTH) still uses role + user.division.
 * Part 93: the whole platform requires a team unlock before research/create;
 * auth-parked open form access without unlock is retired.
 */
export function canViewProposition(sessionOrUser, proposition) {
  if (canApproveManagerRole(sessionOrUser?.role)) return true;

  const unlockedDepartment = normalizeLogUnlock(sessionOrUser?.department);
  if (unlockedDepartment) {
    return matchesUnlockedDepartment(proposition, unlockedDepartment);
  }

  if (!authRequired()) return false;
  if (!sessionOrUser) return false;
  if (proposition?.createdByUserId && proposition.createdByUserId === sessionOrUser.id) return true;
  if (!proposition?.division) return false;
  return proposition.division === sessionOrUser.division;
}

export function visiblePropositions(user, propositions) {
  const rows = Array.isArray(propositions) ? propositions : [];
  return rows.filter((p) => canViewProposition(user, p));
}

export function unlockedDepartmentOf(sessionOrUser) {
  return normalizeLogUnlock(sessionOrUser?.department) || null;
}

/** Verified session team required before create / research / billing. */
export function requireUnlockedDepartment(sessionOrUser) {
  const dept = unlockedDepartmentOf(sessionOrUser);
  if (!dept) {
    const err = new Error("Unlock with your department password before continuing.");
    err.status = 401;
    err.code = "DEPARTMENT_UNLOCK_REQUIRED";
    throw err;
  }
  return dept;
}

/** Team-scoped wipe — retired for Log passwords; teams no longer delete. */
export function canRunDepartmentWipe(sessionOrUser) {
  return false;
}

/** Log deletes (row / bulk / untouched cleanup): Master unlock only. */
export function canDeleteLogProposition(sessionOrUser) {
  if (authRequired() && sessionOrUser?.role === "ADMIN") return true;
  return isMasterUnlock(unlockedDepartmentOf(sessionOrUser));
}
