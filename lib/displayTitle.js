/**
 * People-facing titles. Stored roles (BM, BH FORUM, CMI, …) do not change.
 * Admin / Business Head / Team Lead / Individual contributor only.
 */
import { ORG_ROLE_BUSINESS_HEAD, ORG_ROLE_TEAM_LEAD } from "./orgRosterConstants.js";

export const DISPLAY_TITLES = Object.freeze([
  "Admin",
  "Business Head",
  "Team Lead",
  "Individual contributor",
]);

/** Stored USER_ROLES shown in choosers. Functional roles keep their names. */
export function storedRoleLabel(role) {
  const r = String(role || "").trim();
  if (r === "ADMIN") return "Admin";
  if (r === "BH FORUM") return "Business Head";
  if (r === "BM") return "Individual contributor";
  return r;
}

/**
 * @param {object} user
 * @param {{ mappedBusinessHead?: boolean }} [opts]
 */
export function displayTitle(user, { mappedBusinessHead = false } = {}) {
  const role = String(user?.role || "").trim();
  if (role === "ADMIN") return "Admin";
  const orgRole = String(user?.orgRole || user?.org_role || "").trim();
  if (mappedBusinessHead || role === "BH FORUM" || orgRole === ORG_ROLE_BUSINESS_HEAD) return "Business Head";
  if (orgRole === ORG_ROLE_TEAM_LEAD) return "Team Lead";
  return "Individual contributor";
}

/** Log list default: IC → Mine, team lead → My team's, business head / admin → All I can see. */
export function assignedLogView(user) {
  const role = String(user?.role || "").trim();
  const title = String(user?.title || "").trim();
  const orgRole = String(user?.orgRole || user?.org_role || "").trim();
  if (role === "ADMIN" || title === "Admin") return "all";
  if (role === "BH FORUM" || title === "Business Head" || orgRole === ORG_ROLE_BUSINESS_HEAD) return "all";
  if (title === "Team Lead" || orgRole === ORG_ROLE_TEAM_LEAD) return "team";
  return "mine";
}

/** Team lead / business head / admin: "My team's" is the server-assigned set, not a second client filter. */
export function logViewUsesAssignedScope(user) {
  return assignedLogView(user) !== "mine";
}
