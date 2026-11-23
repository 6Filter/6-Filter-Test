/**
 * Org roster — home team + reporting line for role-based visibility (Part 125).
 * Postgres only (same posture as accessDb).
 */
import { normalizeEmail } from "./auth.js";
import { initDb, query, usingPostgres, withPgTransaction, getUserByEmail, setUserTeam } from "./db.js";
import { writeUserAudit, listBusinessHeadTeams } from "./accessDb.js";
import { isCanonicalTeam, SUBMITTER_DEPARTMENTS } from "./propositionFields.js";
import {
  BH_SEES_HOME_TEAM,
  ORG_ROLE_BUSINESS_HEAD,
  ORG_ROLE_MEMBER,
  ORG_ROLE_TEAM_LEAD,
  ORG_ROSTER_ROLES,
} from "./orgRosterConstants.js";

export {
  BH_SEES_HOME_TEAM,
  NOTIFY_TEAM_LEAD_ON_REVIEW,
  ORG_ROSTER_ROLES,
  ORG_ROLE_BUSINESS_HEAD,
  ORG_ROLE_TEAM_LEAD,
  ORG_ROLE_MEMBER,
} from "./orgRosterConstants.js";

function requirePg() {
  if (!usingPostgres()) {
    const err = new Error("Database unavailable.");
    err.status = 503;
    err.code = "DB_UNAVAILABLE";
    throw err;
  }
}

/**
 * Part 152 — org_roster.
 * initDb() creates this table and its indexes once at start-up, so a request runs no CREATE, ALTER or DROP.
 */
export async function ensureOrgRosterSchema() {
  await initDb();
  requirePg();
}

function mapRosterRow(row) {
  if (!row) return null;
  return {
    email: normalizeEmail(row.email),
    name: String(row.name || "").trim(),
    team: String(row.team || "").trim(),
    orgRole: String(row.org_role || row.orgRole || "").trim(),
    reportsToEmail: row.reports_to_email || row.reportsToEmail
      ? normalizeEmail(row.reports_to_email || row.reportsToEmail)
      : null,
    active: row.active !== false && row.active !== "f" && row.active !== 0,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

export async function listOrgRoster({ includeInactive = true } = {}) {
  await ensureOrgRosterSchema();
  const rows = includeInactive
    ? await query(`SELECT * FROM org_roster ORDER BY team, org_role, email`)
    : await query(`SELECT * FROM org_roster WHERE active = TRUE ORDER BY team, org_role, email`);
  return rows.map(mapRosterRow);
}

export async function getOrgRosterByEmail(email) {
  await ensureOrgRosterSchema();
  const e = normalizeEmail(email);
  if (!e) return null;
  const rows = await query(`SELECT * FROM org_roster WHERE email = $1`, [e]);
  return mapRosterRow(rows[0]);
}

export async function listActiveReportsTo(leadEmail) {
  await ensureOrgRosterSchema();
  const e = normalizeEmail(leadEmail);
  if (!e) return [];
  const rows = await query(
    `SELECT email FROM org_roster WHERE active = TRUE AND reports_to_email = $1`,
    [e]
  );
  return rows.map((r) => normalizeEmail(r.email)).filter(Boolean);
}

/**
 * One load per request for visibility.
 * @returns {{
 *   byEmail: Map<string, object>,
 *   reportEmails: Set<string>,
 *   divisionEmails: Set<string>,
 *   bhHomeTeams: string[],
 *   viewerRoster: object|null,
 * }}
 */
export async function loadRosterAccessContext(viewerEmail) {
  await ensureOrgRosterSchema();
  const me = normalizeEmail(viewerEmail);
  const rows = (await query(`SELECT * FROM org_roster WHERE active = TRUE`)).map(mapRosterRow);
  const byEmail = new Map();
  for (const r of rows) byEmail.set(r.email, r);
  const viewerRoster = me ? byEmail.get(me) || null : null;
  const reportEmails = new Set();
  const divisionEmails = new Set();
  if (me && viewerRoster?.orgRole === ORG_ROLE_TEAM_LEAD) {
    const seesDepartment = String(process.env.TEAM_LEAD_SEES_DEPARTMENT || "").trim().toLowerCase() === "true";
    if (seesDepartment) {
      const home = String(viewerRoster.team || "").trim();
      for (const r of rows) {
        if (home && r.team === home) reportEmails.add(r.email);
      }
    } else {
      for (const r of rows) {
        if (r.reportsToEmail === me) reportEmails.add(r.email);
      }
    }
  }
  if (me && viewerRoster?.orgRole === ORG_ROLE_BUSINESS_HEAD) {
    const home = String(viewerRoster.team || "").trim();
    divisionEmails.add(me);
    for (const r of rows) {
      if (home && r.team === home) divisionEmails.add(r.email);
    }
  }
  let bhHomeTeams = [];
  try {
    const { teamsForBusinessHead } = await import("./accessDb.js");
    bhHomeTeams = me ? await teamsForBusinessHead(me) : [];
  } catch {
    bhHomeTeams = [];
  }
  return { byEmail, reportEmails, divisionEmails, bhHomeTeams, viewerRoster };
}

export function rosterAllowsLeadAccess(ctx, ownerEmail) {
  if (!ctx || !ownerEmail) return false;
  return ctx.reportEmails.has(normalizeEmail(ownerEmail));
}

export function rosterAllowsBhHomeTeamAccess(ctx, ownerEmail) {
  if (!BH_SEES_HOME_TEAM || !ctx?.bhHomeTeams?.length || !ownerEmail) return false;
  const owner = ctx.byEmail.get(normalizeEmail(ownerEmail));
  const homeTeam = owner?.team || "";
  return Boolean(homeTeam && ctx.bhHomeTeams.includes(homeTeam));
}

/** Roster BUSINESS_HEAD sees every active person on their roster team (their division). */
export function rosterAllowsBhDivisionAccess(ctx, ownerEmail) {
  if (!ctx?.divisionEmails?.size || !ownerEmail) return false;
  return ctx.divisionEmails.has(normalizeEmail(ownerEmail));
}

/**
 * Part 126: roster team is NOT the account default.
 * Only attach roster metadata for visibility; never overwrite users.team.
 */
export async function syncUserTeamFromRoster(user) {
  if (!user?.email || !usingPostgres()) return user;
  const row = await getOrgRosterByEmail(user.email);
  if (!row || !row.active) {
    return { ...user, rosterLocked: false, rosterTeam: null, teamSource: user.team ? "self" : "" };
  }
  return {
    ...user,
    rosterLocked: false,
    rosterTeam: row.team,
    orgRole: row.orgRole,
    teamSource: user.team ? "self" : "",
  };
}

/** Part 126: import does not rewrite account teams. */
export async function applyRosterTeamsToAllUsers() {
  await ensureOrgRosterSchema();
  const rows = await listOrgRoster({ includeInactive: false });
  return { changed: 0, rostered: rows.length };
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseOrgRosterCsv(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { header: [], rows: [], error: "Empty file." };
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const need = ["email", "name", "team", "org_role", "reports_to_email"];
  for (const col of need) {
    if (!header.includes(col)) {
      return { header, rows: [], error: `Missing column: ${col}` };
    }
  }
  const idx = Object.fromEntries(need.map((c) => [c, header.indexOf(c)]));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    rows.push({
      line: i + 1,
      email: normalizeEmail(cells[idx.email] || ""),
      name: String(cells[idx.name] || "").trim(),
      team: String(cells[idx.team] || "").trim(),
      orgRole: String(cells[idx.org_role] || "").trim().toUpperCase().replace(/\s+/g, "_"),
      reportsToEmail: normalizeEmail(cells[idx.reports_to_email] || "") || null,
    });
  }
  return { header, rows, error: null };
}

/**
 * Validate + build preview. Does not write.
 */
export async function previewOrgRosterImport(csvText) {
  await ensureOrgRosterSchema();
  const parsed = parseOrgRosterCsv(csvText);
  if (parsed.error) {
    return { ok: false, error: parsed.error, rows: [], issues: [], missingFromFile: [], bhDisagreements: [] };
  }

  const existing = await listOrgRoster({ includeInactive: true });
  const existingByEmail = new Map(existing.map((r) => [r.email, r]));
  const bhRows = await listBusinessHeadTeams();
  const bhTeamsByEmail = new Map();
  for (const r of bhRows) {
    const e = normalizeEmail(r.email);
    if (!bhTeamsByEmail.has(e)) bhTeamsByEmail.set(e, new Set());
    bhTeamsByEmail.get(e).add(String(r.team || "").trim());
  }

  const byEmail = new Map();
  const issues = [];
  const bhDisagreements = [];

  for (const row of parsed.rows) {
    const rowIssues = [];
    if (!row.email || !row.email.includes("@")) rowIssues.push("Invalid email");
    if (!row.name) rowIssues.push("Name required");
    if (!isCanonicalTeam(row.team)) rowIssues.push(`Team must be one of the 18 (got ${row.team || "empty"})`);
    if (!ORG_ROSTER_ROLES.includes(row.orgRole)) {
      rowIssues.push(`org_role must be BUSINESS_HEAD, TEAM_LEAD or MEMBER`);
    }
    if (byEmail.has(row.email)) rowIssues.push("Duplicate email in file");
    if (rowIssues.length) {
      issues.push({ line: row.line, email: row.email, reasons: rowIssues });
      continue;
    }
    byEmail.set(row.email, row);
  }

  for (const row of byEmail.values()) {
    const reasons = [];
    if (row.orgRole === ORG_ROLE_BUSINESS_HEAD) {
      if (row.reportsToEmail) reasons.push("BUSINESS_HEAD must not report to anyone");
      const mapped = bhTeamsByEmail.get(row.email);
      if (!mapped || !mapped.has(row.team)) {
        bhDisagreements.push({
          email: row.email,
          team: row.team,
          reason: mapped
            ? `business_head_teams has ${[...mapped].join(", ")} but roster says ${row.team}`
            : "email not in business_head_teams for this team",
        });
      }
    } else if (row.orgRole === ORG_ROLE_TEAM_LEAD) {
      if (!row.reportsToEmail) reasons.push("TEAM_LEAD must report to a BUSINESS_HEAD");
      else {
        const mgr = byEmail.get(row.reportsToEmail) || existingByEmail.get(row.reportsToEmail);
        if (!mgr) reasons.push("reports_to_email not found");
        else {
          const role = mgr.orgRole || mgr.org_role;
          if (role !== ORG_ROLE_BUSINESS_HEAD) reasons.push("TEAM_LEAD must report to a BUSINESS_HEAD");
          if (mgr.team && mgr.team !== row.team) {
            reasons.push("TEAM_LEAD must report to a BUSINESS_HEAD of the same team");
          }
        }
      }
    } else if (row.orgRole === ORG_ROLE_MEMBER) {
      if (!row.reportsToEmail) reasons.push("MEMBER must report to a TEAM_LEAD or BUSINESS_HEAD");
      else {
        const mgr = byEmail.get(row.reportsToEmail) || existingByEmail.get(row.reportsToEmail);
        if (!mgr) reasons.push("reports_to_email not found");
        else {
          const role = mgr.orgRole || mgr.org_role;
          if (role !== ORG_ROLE_TEAM_LEAD && role !== ORG_ROLE_BUSINESS_HEAD) {
            reasons.push("MEMBER must report to a TEAM_LEAD or BUSINESS_HEAD");
          }
          if (mgr.team && mgr.team !== row.team) reasons.push("MEMBER must report to someone on the same team");
        }
      }
    }
    if (reasons.length) issues.push({ line: row.line, email: row.email, reasons });
  }

  // Cycle check (reports_to within file + existing)
  const resolveMgr = (email, seen = new Set()) => {
    if (!email || seen.has(email)) return seen.has(email) ? "cycle" : null;
    seen.add(email);
    const row = byEmail.get(email) || existingByEmail.get(email);
    if (!row) return null;
    const mgr = row.reportsToEmail || row.reports_to_email;
    if (!mgr) return null;
    return resolveMgr(normalizeEmail(mgr), seen);
  };
  for (const email of byEmail.keys()) {
    if (resolveMgr(email) === "cycle") {
      issues.push({ line: byEmail.get(email).line, email, reasons: ["Reporting cycle detected"] });
    }
  }

  // Lead cannot report to another lead — already enforced (lead → BH only)

  const missingFromFile = existing
    .filter((r) => r.active && !byEmail.has(r.email))
    .map((r) => ({ email: r.email, name: r.name, team: r.team, orgRole: r.orgRole }));

  const wouldChange = [];
  for (const row of byEmail.values()) {
    const prev = existingByEmail.get(row.email);
    if (
      !prev ||
      prev.name !== row.name ||
      prev.team !== row.team ||
      prev.orgRole !== row.orgRole ||
      (prev.reportsToEmail || null) !== (row.reportsToEmail || null) ||
      !prev.active
    ) {
      wouldChange.push(row.email);
    }
  }

  const ok = issues.length === 0 && bhDisagreements.length === 0;
  return {
    ok,
    error: ok ? null : "Fix the issues below before applying.",
    rowCount: byEmail.size,
    wouldChange: wouldChange.length,
    unchanged: byEmail.size - wouldChange.length,
    issues,
    bhDisagreements,
    missingFromFile,
    rows: [...byEmail.values()],
    teams: SUBMITTER_DEPARTMENTS,
  };
}

/**
 * Apply a previously previewed CSV. deactivateMissing requires explicit confirm.
 */
export async function applyOrgRosterImport(csvText, { deactivateMissing = false, actorUserId = null } = {}) {
  const preview = await previewOrgRosterImport(csvText);
  if (!preview.ok) {
    const err = new Error(preview.error || "Roster import rejected.");
    err.status = 400;
    err.preview = preview;
    throw err;
  }

  await withPgTransaction(async (client) => {
    for (const row of preview.rows) {
      await client.query(
        `INSERT INTO org_roster (email, name, team, org_role, reports_to_email, active, updated_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           team = EXCLUDED.team,
           org_role = EXCLUDED.org_role,
           reports_to_email = EXCLUDED.reports_to_email,
           active = TRUE,
           updated_at = NOW()`,
        [row.email, row.name, row.team, row.orgRole, row.reportsToEmail]
      );
    }
    if (deactivateMissing && preview.missingFromFile.length) {
      for (const miss of preview.missingFromFile) {
        await client.query(
          `UPDATE org_roster SET active = FALSE, updated_at = NOW() WHERE email = $1`,
          [miss.email]
        );
      }
    }
  });

  const sync = await applyRosterTeamsToAllUsers({ actorUserId });
  await writeUserAudit({
    actorUserId,
    action: "org-roster-import",
    targetUserId: null,
    targetEmail: null,
    detail: {
      rowCount: preview.rowCount,
      wouldChange: preview.wouldChange,
      deactivateMissing,
      deactivated: deactivateMissing ? preview.missingFromFile.length : 0,
      teamsSynced: sync.changed,
    },
  });

  return { applied: true, ...preview, sync };
}

export async function listUsersNotInRoster() {
  await ensureOrgRosterSchema();
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.role, u.team, u.status, u.last_sign_in_at
     FROM users u
     LEFT JOIN org_roster r ON r.email = lower(u.email)
     WHERE r.email IS NULL
     ORDER BY u.email`
  );
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    team: u.team,
    status: u.status,
    lastSignInAt: u.last_sign_in_at || null,
  }));
}

export async function setRosterLead(memberEmail, leadEmail, { actorUserId = null } = {}) {
  await ensureOrgRosterSchema();
  const member = await getOrgRosterByEmail(memberEmail);
  if (!member || !member.active) {
    const err = new Error("Person is not in the active roster.");
    err.status = 404;
    throw err;
  }
  const lead = await getOrgRosterByEmail(leadEmail);
  if (!lead || !lead.active || lead.orgRole !== ORG_ROLE_TEAM_LEAD) {
    const err = new Error("Lead must be an active TEAM_LEAD in the roster.");
    err.status = 400;
    throw err;
  }
  if (lead.team !== member.team) {
    const err = new Error("Lead must be on the same team.");
    err.status = 400;
    throw err;
  }
  if (member.orgRole === ORG_ROLE_BUSINESS_HEAD) {
    const err = new Error("Cannot set a lead for a business head.");
    err.status = 400;
    throw err;
  }
  if (member.orgRole === ORG_ROLE_TEAM_LEAD) {
    const err = new Error("A team lead cannot report to another lead.");
    err.status = 400;
    throw err;
  }
  await query(
    `UPDATE org_roster SET reports_to_email = $2, updated_at = NOW() WHERE email = $1`,
    [member.email, lead.email]
  );
  await writeUserAudit({
    actorUserId,
    action: "roster-set-lead",
    targetUserId: null,
    targetEmail: member.email,
    detail: { leadEmail: lead.email, previousLead: member.reportsToEmail },
  });
  return getOrgRosterByEmail(member.email);
}
