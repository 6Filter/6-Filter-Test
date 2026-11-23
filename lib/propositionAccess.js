/**
 * Visibility for Log + every proposition/idea handler.
 * ONE function — canAccessIdea — must gate list and by-id paths.
 *
 * Layers (first match wins after ADMIN / own-idea):
 * 1. business_head_teams → BH sees mapped idea teams
 * 2. BH_SEES_HOME_TEAM → BH sees ideas created by people whose home team is theirs
 * 3. org_roster BUSINESS_HEAD → BH sees ideas from everyone on their roster team (division)
 * 4. org_roster TEAM_LEAD → lead sees direct reports' ideas
 * 5. R&D org chart (legacy) → department / unit / team lead reportees
 * 6. Otherwise → own ideas only
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
import {
  ideaSubmitterDisplayName,
  orgAccessForViewer,
  orgChartAllowsAccess,
} from "./orgHierarchy.js";
import {
  BH_SEES_HOME_TEAM,
  loadRosterAccessContext,
  rosterAllowsBhDivisionAccess,
  rosterAllowsBhHomeTeamAccess,
  rosterAllowsLeadAccess,
} from "./orgRoster.js";
import { ORG_ROLE_BUSINESS_HEAD } from "./orgRosterConstants.js";
export { BH_SEES_HOME_TEAM } from "./orgRosterConstants.js";

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

async function resolveIdeaOwnerName(proposition, ownerEmail, nameByEmail = null) {
  const fromIdea = ideaSubmitterDisplayName(proposition);
  if (fromIdea) return fromIdea;
  if (!ownerEmail) return "";
  if (nameByEmail && nameByEmail.has(ownerEmail)) return nameByEmail.get(ownerEmail) || "";
  try {
    const { getUserByEmail } = await import("./db.js");
    const row = await getUserByEmail(ownerEmail);
    return String(row?.name || "").trim();
  } catch {
    return "";
  }
}

async function resolveIdeaTeam(proposition) {
  let resolvedTeam = ideaTeamRaw(proposition);
  try {
    if (!isCanonicalTeam(resolvedTeam) && resolvedTeam) {
      resolvedTeam = (await resolveCanonicalTeam(resolvedTeam)) || resolvedTeam;
    }
  } catch {
    /* keep raw */
  }
  return resolvedTeam;
}

/**
 * Async guard — loads BH mapping, legacy_team_map, and R&D org chart as needed.
 * Business-head status is decided from business_head_teams (not only stored role).
 * Used by EVERY handler that takes an idea id or lists ideas.
 */
export async function canAccessIdea(
  user,
  proposition,
  { orgAccess = undefined, nameByEmail = null, rosterCtx = undefined } = {}
) {
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

  let ctx = rosterCtx;
  if (ctx === undefined) {
    try {
      ctx = await loadRosterAccessContext(user.email);
    } catch {
      ctx = null;
    }
  }

  let bhTeams = ctx?.bhHomeTeams?.length ? ctx.bhHomeTeams : [];
  let resolvedTeam = ideaTeamRaw(proposition);
  if (!bhTeams.length) {
    try {
      bhTeams = await teamsForBusinessHead(user.email);
    } catch {
      bhTeams = [];
    }
  }
  const treatAsBh = bhTeams.length > 0;
  if (treatAsBh || String(user.role || "").trim() === "BH FORUM") {
    resolvedTeam = await resolveIdeaTeam(proposition);
    if (!owner) {
      const mapped = isCanonicalTeam(resolvedTeam)
        ? resolvedTeam
        : (await resolveCanonicalTeam(ideaTeamRaw(proposition)).catch(() => "")) || "";
      if (mapped && bhTeams.includes(mapped)) return true;
      return false;
    }
    if (canAccessIdeaSync(user, proposition, { bhTeams, resolvedTeam, treatAsBh: true })) {
      return true;
    }
    if (BH_SEES_HOME_TEAM && rosterAllowsBhHomeTeamAccess(ctx || { bhHomeTeams: bhTeams, byEmail: new Map() }, owner)) {
      return true;
    }
    // Home team from users table when creator is not yet on the roster
    if (BH_SEES_HOME_TEAM && owner) {
      try {
        const { getUserByEmail } = await import("./db.js");
        const creator = await getUserByEmail(owner);
        const home = String(creator?.team || "").trim();
        if (home && bhTeams.includes(home)) return true;
      } catch {
        /* optional */
      }
    }
  }

  if (ctx && rosterAllowsBhDivisionAccess(ctx, owner)) {
    return true;
  }
  if (ctx?.viewerRoster?.orgRole === ORG_ROLE_BUSINESS_HEAD) {
    resolvedTeam = resolvedTeam || (await resolveIdeaTeam(proposition));
    const home = String(ctx.viewerRoster.team || "").trim();
    if (home && resolvedTeam === home) return true;
  }

  if (ctx && rosterAllowsLeadAccess(ctx, owner)) {
    return true;
  }

  const access =
    orgAccess !== undefined
      ? orgAccess
      : orgAccessForViewer({
          email: user.email,
          name: String(user.name || "").trim(),
        });
  if (access && access.kind !== "member") {
    resolvedTeam = resolvedTeam || (await resolveIdeaTeam(proposition));
    const ownerName = await resolveIdeaOwnerName(proposition, owner, nameByEmail);
    if (orgChartAllowsAccess(access, { ownerName, ownerEmail: owner, ideaTeam: resolvedTeam })) {
      return true;
    }
  }

  return canAccessIdeaSync(user, proposition, { bhTeams, resolvedTeam, treatAsBh: false });
}

export async function filterAccessibleIdeas(user, propositions) {
  const rows = Array.isArray(propositions) ? propositions : [];
  if (!rows.length) return [];
  const orgAccess = orgAccessForViewer({
    email: user?.email,
    name: String(user?.name || "").trim(),
  });
  let rosterCtx = null;
  try {
    rosterCtx = await loadRosterAccessContext(user?.email);
  } catch {
    rosterCtx = null;
  }
  const nameByEmail = new Map();
  const emails = new Set();
  for (const p of rows) {
    const e = ideaOwnerEmail(p);
    if (e && !ideaSubmitterDisplayName(p)) emails.add(e);
  }
  if (emails.size) {
    try {
      const { getUserByEmail } = await import("./db.js");
      for (const e of emails) {
        const row = await getUserByEmail(e);
        if (row?.name) nameByEmail.set(e, String(row.name).trim());
      }
    } catch {
      /* name lookup optional */
    }
  }
  const out = [];
  for (const p of rows) {
    if (await canAccessIdea(user, p, { orgAccess, nameByEmail, rosterCtx })) out.push(p);
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
  const raw = String(sessionOrUser?.department || "").trim();
  if (isCanonicalTeam(raw)) return raw;
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

/** Log deletes: role ADMIN only (Part 129 — Master unlock grants no admin rights). */
export function canDeleteLogProposition(sessionOrUser) {
  return String(sessionOrUser?.role || "").trim() === "ADMIN";
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
