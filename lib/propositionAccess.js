/**
 * Visibility for Log + every proposition/idea handler.
 * ONE function — canAccessIdea — must gate list and by-id paths.
 */
import { authRequired, normalizeEmail } from "./auth.js";
import { canApproveManagerRole } from "./managerReview.js";
import { isMasterUnlock, matchesUnlockedDepartment, normalizeLogUnlock } from "./departmentAuth.js";
import {
  OPEN_ACCESS_TEAM,
  PLATFORM_TEAM_LOCK_ENABLED,
} from "./departmentAuthConstants.js";
import { isCanonicalTeam, preserveSubmitterDepartment, teamIsLegacy } from "./propositionFields.js";
import { resolveCanonicalTeam, teamsForBusinessHead } from "./accessDb.js";

export function ideaOwnerEmail(proposition = {}) {
  return normalizeEmail(proposition.createdByEmail || proposition.created_by_email || "");
}

export function ideaTeamRaw(proposition = {}) {
  return preserveSubmitterDepartment(
    proposition.submitterDepartment || proposition.submitter_department || proposition.team || ""
  );
}

/**
 * Map a screen `ideas` row into the subject shape canAccessIdea expects.
 */
export function ideaAccessSubject(idea = {}) {
  return {
    createdByEmail: idea.createdByEmail || idea.created_by_email || "",
    createdByUserId: idea.createdByUserId || idea.created_by_user_id || null,
    submitterDepartment: idea.submitterDepartment || idea.submitter_department || "",
  };
}

/**
 * Synchronous core used when BH team set + resolved team are already known.
 * Prefer canAccessIdea / filterAccessibleIdeas for handlers.
 */
export function canAccessIdeaSync(user, proposition, { bhTeams = [], resolvedTeam = "", treatAsBh = false } = {}) {
  if (!authRequired()) {
    if (!PLATFORM_TEAM_LOCK_ENABLED) return true;
    const unlockedDepartment = normalizeLogUnlock(user?.department);
    if (unlockedDepartment) return matchesUnlockedDepartment(proposition, unlockedDepartment);
    return false;
  }
  if (!user) return false;
  if (String(user.status || "active") === "disabled") return false;
  if (String(user.role || "").trim() === "ADMIN") return true;

  const myEmail = normalizeEmail(user.email);
  const owner = ideaOwnerEmail(proposition);
  if (owner && myEmail && owner === myEmail) return true;
  if (proposition?.createdByUserId && String(proposition.createdByUserId) === String(user.id)) {
    return true;
  }

  const role = String(user.role || "").trim();
  if (treatAsBh || role === "BH FORUM") {
    const team = resolvedTeam || ideaTeamRaw(proposition);
    if (team && bhTeams.includes(team)) return true;
    if (!owner && team && bhTeams.includes(team)) return true;
  }

  return false;
}

/**
 * Async guard — loads BH mapping and legacy_team_map as needed.
 * Business-head status is decided from business_head_teams (not only stored role).
 * Used by EVERY handler that takes an idea id or lists ideas.
 */
export async function canAccessIdea(user, proposition) {
  if (!authRequired()) {
    return canAccessIdeaSync(user, proposition);
  }
  if (!user) return false;
  if (String(user.role || "").trim() === "ADMIN") return true;

  const owner = ideaOwnerEmail(proposition);
  const myEmail = normalizeEmail(user.email);
  if (owner && myEmail && owner === myEmail) return true;
  if (proposition?.createdByUserId && String(proposition.createdByUserId) === String(user.id)) {
    return true;
  }

  let bhTeams = [];
  let resolvedTeam = ideaTeamRaw(proposition);
  try {
    bhTeams = await teamsForBusinessHead(user.email);
  } catch {
    bhTeams = [];
  }
  const treatAsBh = bhTeams.length > 0;
  if (treatAsBh || String(user.role || "").trim() === "BH FORUM") {
    try {
      if (!isCanonicalTeam(resolvedTeam) && resolvedTeam) {
        resolvedTeam = (await resolveCanonicalTeam(resolvedTeam)) || resolvedTeam;
      }
    } catch {
      /* keep raw */
    }
    if (!owner) {
      const mapped = isCanonicalTeam(resolvedTeam)
        ? resolvedTeam
        : (await resolveCanonicalTeam(ideaTeamRaw(proposition)).catch(() => "")) || "";
      if (mapped && bhTeams.includes(mapped)) return true;
      return false;
    }
    return canAccessIdeaSync(user, proposition, { bhTeams, resolvedTeam, treatAsBh: true });
  }
  return canAccessIdeaSync(user, proposition, { bhTeams, resolvedTeam, treatAsBh: false });
}

export async function filterAccessibleIdeas(user, propositions) {
  const rows = Array.isArray(propositions) ? propositions : [];
  const out = [];
  for (const p of rows) {
    if (await canAccessIdea(user, p)) out.push(p);
  }
  return out;
}

/** @deprecated Prefer filterAccessibleIdeas — sync path used only when auth parked. */
export function canViewProposition(sessionOrUser, proposition) {
  return canAccessIdeaSync(sessionOrUser, proposition);
}

export function visiblePropositions(user, propositions) {
  const rows = Array.isArray(propositions) ? propositions : [];
  return rows.filter((p) => canAccessIdeaSync(user, p));
}

export function unlockedDepartmentOf(sessionOrUser) {
  const dept = normalizeLogUnlock(sessionOrUser?.department);
  if (dept) return dept;
  if (!PLATFORM_TEAM_LOCK_ENABLED) return OPEN_ACCESS_TEAM;
  return null;
}

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

export function canRunDepartmentWipe() {
  return false;
}

/** Log deletes: ADMIN (auth) or Master unlock. */
export function canDeleteLogProposition(sessionOrUser) {
  if (authRequired() && sessionOrUser?.role === "ADMIN") return true;
  return isMasterUnlock(unlockedDepartmentOf(sessionOrUser));
}

export function canManageUsers(sessionOrUser) {
  return authRequired() && sessionOrUser?.role === "ADMIN";
}

/** Manager review request/approve only on ideas the actor can see. */
export async function canManagerReviewIdea(user, proposition) {
  if (!(await canAccessIdea(user, proposition))) return false;
  return canApproveManagerRole(user?.role) || Boolean(user);
}

export { teamIsLegacy, isCanonicalTeam };
