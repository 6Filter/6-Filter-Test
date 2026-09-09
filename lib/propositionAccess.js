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
 * Master unlock sees every submitter team. Bulk wipe stays blocked for Master
 * so an empty normalize cannot turn into an unscoped DELETE.
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

/** Master may view everything but must not run scoped wipe with a blank department. */
export function canRunDepartmentWipe(sessionOrUser) {
  const unlocked = unlockedDepartmentOf(sessionOrUser);
  return Boolean(unlocked) && !isMasterUnlock(unlocked);
}
