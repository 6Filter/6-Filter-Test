import { authRequired } from "./auth.js";
import { canApproveManagerRole } from "./managerReview.js";
import { isMasterUnlock, matchesUnlockedDepartment, normalizeLogUnlock } from "./departmentAuth.js";

/**
 * Visibility for Log + proposition APIs.
 *
 * Department-password sessions (R&D / CIA / Marketing / NPD) filter by
 * submitter department — not by auto-detected CavinKare division (Foods,
 * Personal Care, …). Those two taxonomies are not mapped to each other.
 *
 * Master unlock sees every submitter team and is the only Log password that
 * may delete propositions (row or bulk). Team unlocks are view/export only.
 *
 * Named-account login (REQUIRE_AUTH) still uses role + user.division.
 * Auth parked and no department unlock: form create/edit stays open.
 */
export function canViewProposition(sessionOrUser, proposition) {
  if (canApproveManagerRole(sessionOrUser?.role)) return true;

  const unlockedDepartment = normalizeLogUnlock(sessionOrUser?.department);
  if (unlockedDepartment) {
    return matchesUnlockedDepartment(proposition, unlockedDepartment);
  }

  if (!authRequired()) return true;
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

/** Team-scoped wipe — retired for Log passwords; teams no longer delete. */
export function canRunDepartmentWipe(sessionOrUser) {
  return false;
}

/** Log deletes (row / bulk / untouched cleanup): Master unlock only. */
export function canDeleteLogProposition(sessionOrUser) {
  if (authRequired() && sessionOrUser?.role === "ADMIN") return true;
  return isMasterUnlock(unlockedDepartmentOf(sessionOrUser));
}
