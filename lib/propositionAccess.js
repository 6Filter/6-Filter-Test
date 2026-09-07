import { authRequired } from "./auth.js";
import { canApproveManagerRole } from "./managerReview.js";

/**
 * Division-scoped visibility. Managers (ADMIN, BH FORUM) see everything.
 * Everyone else sees their own rows plus the same division.
 * When login is parked, nothing is hidden.
 */
export function canViewProposition(user, proposition) {
  if (!authRequired()) return true;
  if (!user) return false;
  if (canApproveManagerRole(user.role)) return true;
  if (proposition?.createdByUserId && proposition.createdByUserId === user.id) return true;
  if (!proposition?.division) return false;
  return proposition.division === user.division;
}

export function visiblePropositions(user, propositions) {
  const rows = Array.isArray(propositions) ? propositions : [];
  return rows.filter((p) => canViewProposition(user, p));
}
