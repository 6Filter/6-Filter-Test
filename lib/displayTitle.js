/**
 * People-facing titles. Stored roles (BM, BH FORUM, CMI, …) do not change.
 * Admin / Business Head / Team Lead / Individual contributor only.
 */
import { ORG_ROLE_TEAM_LEAD } from "./orgRosterConstants.js";

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
  if (mappedBusinessHead || role === "BH FORUM") return "Business Head";
  if (orgRole === ORG_ROLE_TEAM_LEAD) return "Team Lead";
  return "Individual contributor";
}
