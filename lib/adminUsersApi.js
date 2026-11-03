import { readJsonBody, redactSecrets, sendJson } from "./http.js";
import { USER_ROLES, normalizeEmail } from "./auth.js";
import {
  adminUpdateUser,
  assignPropositionOwner,
  bumpUserTokenVersion,
  getUserByEmail,
  getUserById,
  listLegacyTeamPropositions,
  listUnassignedPropositions,
  listUsers,
  query,
  reassignPropositionTeams,
  usingPostgres,
} from "./db.js";
import {
  listBusinessHeadTeams,
  listLegacyTeamMap,
  replaceBusinessHeadTeams,
  upsertLegacyTeamMap,
  writeUserAudit,
} from "./accessDb.js";
import { canManageUsers, canDeleteLogProposition } from "./propositionAccess.js";
import {
  isCanonicalTeam,
  normalizeNewTeamSelection,
  SUBMITTER_DEPARTMENTS,
} from "./propositionFields.js";
import { isMasterUnlock } from "./departmentAuthConstants.js";
import {
  applyOrgRosterImport,
  listOrgRoster,
  listUsersNotInRoster,
  previewOrgRosterImport,
  setRosterLead,
} from "./orgRoster.js";

function requireAdmin(req, res) {
  if (!canManageUsers(req.user)) {
    sendJson(res, 404, { error: "Not found." });
    return false;
  }
  if (!usingPostgres()) {
    sendJson(res, 503, { error: "Database unavailable." });
    return false;
  }
  return true;
}

function requireMaster(req, res) {
  if (!canDeleteLogProposition(req.user) && !isMasterUnlock(req.user?.department)) {
    // ADMIN role also allowed for unassigned tools when auth is on
    if (req.user?.role !== "ADMIN") {
      sendJson(res, 403, { error: "Master or Admin only." });
      return false;
    }
  }
  if (!usingPostgres()) {
    sendJson(res, 503, { error: "Database unavailable." });
    return false;
  }
  return true;
}

export async function handleAdminUsers(req, res, url) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (url === "/api/admin/users" && req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      const users = await listUsers();
      const roster = await listOrgRoster({ includeInactive: true });
      const rosterByEmail = new Map(roster.map((r) => [r.email, r]));
      sendJson(res, 200, {
        users: users.map((u) => {
          const r = rosterByEmail.get(normalizeEmail(u.email));
          return {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            team: u.team,
            status: u.status,
            lastSignInAt: u.lastSignInAt,
            inRoster: Boolean(r),
            rosterActive: r ? r.active : null,
            orgRole: r?.orgRole || null,
            reportsToEmail: r?.reportsToEmail || null,
          };
        }),
        teams: SUBMITTER_DEPARTMENTS,
        roles: USER_ROLES,
      });
      return;
    }

    if (url === "/api/admin/users/roster" && req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      sendJson(res, 200, {
        roster: await listOrgRoster({ includeInactive: true }),
        notInRoster: await listUsersNotInRoster(),
        teams: SUBMITTER_DEPARTMENTS,
      });
      return;
    }

    if (url === "/api/admin/users/roster/preview" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const preview = await previewOrgRosterImport(body?.csv || body?.text || "");
      sendJson(res, preview.ok ? 200 : 400, { preview });
      return;
    }

    if (url === "/api/admin/users/roster/apply" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      if (!body?.confirm) {
        sendJson(res, 400, { error: "Set confirm: true after reviewing the preview." });
        return;
      }
      try {
        const result = await applyOrgRosterImport(body?.csv || body?.text || "", {
          deactivateMissing: Boolean(body?.deactivateMissing),
          actorUserId: req.user.id,
        });
        sendJson(res, 200, result);
      } catch (e) {
        sendJson(res, e.status || 400, { error: redactSecrets(e.message), preview: e.preview || null });
      }
      return;
    }

    if (url === "/api/admin/users/roster/set-lead" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const row = await setRosterLead(body?.email, body?.leadEmail, { actorUserId: req.user.id });
      sendJson(res, 200, { row });
      return;
    }

    if (url === "/api/admin/users/audit" && req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      const rows = await query(
        `SELECT id, actor_user_id, action, target_user_id, target_email, detail_json, created_at
         FROM user_audit ORDER BY created_at DESC LIMIT 200`
      );
      sendJson(res, 200, {
        audit: rows.map((r) => ({
          id: r.id,
          actorUserId: r.actor_user_id,
          action: r.action,
          targetUserId: r.target_user_id,
          targetEmail: r.target_email,
          detail: (() => {
            try {
              return JSON.parse(r.detail_json || "{}");
            } catch {
              return {};
            }
          })(),
          createdAt: r.created_at,
        })),
      });
      return;
    }

    const patchMatch = url.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (patchMatch && req.method === "PATCH") {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(patchMatch[1]);
      const body = await readJsonBody(req);
      const before = await getUserById(id);
      if (!before) {
        sendJson(res, 404, { error: "User not found." });
        return;
      }
      const patch = {};
      if (body?.role !== undefined) {
        if (!USER_ROLES.includes(String(body.role))) {
          sendJson(res, 400, { error: "Unknown role." });
          return;
        }
        patch.role = body.role;
      }
      if (body?.team !== undefined) {
        const team = normalizeNewTeamSelection(body.team);
        if (!isCanonicalTeam(team)) {
          sendJson(res, 400, { error: "Choose one of the listed teams." });
          return;
        }
        patch.team = team;
      }
      if (body?.status !== undefined) {
        if (!["active", "disabled"].includes(String(body.status))) {
          sendJson(res, 400, { error: "Status must be active or disabled." });
          return;
        }
        patch.status = body.status;
      }
      let user = await adminUpdateUser(id, patch);
      if (body?.signOutEverywhere || patch.status === "disabled") {
        user = await bumpUserTokenVersion(id);
      }
      await writeUserAudit({
        actorUserId: req.user.id,
        action: "admin-update-user",
        targetUserId: id,
        targetEmail: before.email,
        detail: { patch, signOutEverywhere: Boolean(body?.signOutEverywhere) },
      });
      sendJson(res, 200, { user });
      return;
    }

    if (url === "/api/admin/users/business-head-teams" && req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      sendJson(res, 200, {
        rows: await listBusinessHeadTeams(),
        legacyMap: await listLegacyTeamMap(),
        teams: SUBMITTER_DEPARTMENTS,
      });
      return;
    }

    if (url === "/api/admin/users/business-head-teams" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      if (body?.previewOnly) {
        const preview = (body.rows || []).map((r) => ({
          email: normalizeEmail(r.email),
          team: String(r.team || "").trim(),
          note: String(r.note || "").trim(),
          ok: Boolean(normalizeEmail(r.email) && isCanonicalTeam(String(r.team || "").trim())),
        }));
        sendJson(res, 200, { preview, count: preview.length });
        return;
      }
      const saved = await replaceBusinessHeadTeams(body?.rows || [], { actorUserId: req.user.id });
      // Ensure each BH email has role BH FORUM
      for (const row of saved) {
        const u = await getUserByEmail(row.email);
        if (u && u.role !== "BH FORUM" && u.role !== "ADMIN") {
          await adminUpdateUser(u.id, { role: "BH FORUM", team: row.team });
        } else if (u && !u.team) {
          await adminUpdateUser(u.id, { team: row.team });
        }
      }
      sendJson(res, 200, { rows: saved });
      return;
    }

    if (url === "/api/admin/users/legacy-team-map" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      await upsertLegacyTeamMap(body?.alias, body?.team, { actorUserId: req.user.id });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url === "/api/admin/users/unassigned" && req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      const propositions = await listUnassignedPropositions();
      const legacy = await listLegacyTeamPropositions();
      sendJson(res, 200, { propositions, legacy });
      return;
    }

    if (url === "/api/admin/users/reassign-team" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const ids = Array.isArray(body?.propositionIds)
        ? body.propositionIds
        : body?.propositionId
          ? [body.propositionId]
          : [];
      const updated = await reassignPropositionTeams(ids, body?.team);
      await writeUserAudit({
        actorUserId: req.user.id,
        action: "reassign-team",
        detail: {
          team: normalizeNewTeamSelection(body?.team),
          propositionIds: updated.map((p) => p.id),
          count: updated.length,
        },
      });
      sendJson(res, 200, { propositions: updated });
      return;
    }

    if (url === "/api/admin/users/assign-owner" && req.method === "POST") {
      if (!requireMaster(req, res)) return;
      const body = await readJsonBody(req);
      if (body?.previewOnly && Array.isArray(body.rows)) {
        const preview = body.rows.map((r) => ({
          submitterName: String(r.submitter_name || r.submitterName || "").trim(),
          email: normalizeEmail(r.email),
        }));
        sendJson(res, 200, { preview });
        return;
      }
      if (body?.propositionId && body?.email) {
        const prop = await assignPropositionOwner(body.propositionId, {
          email: body.email,
          actorUserId: req.user.id,
        });
        await writeUserAudit({
          actorUserId: req.user.id,
          action: "assign-owner",
          targetEmail: normalizeEmail(body.email),
          detail: { propositionId: body.propositionId },
        });
        sendJson(res, 200, { proposition: prop });
        return;
      }
      sendJson(res, 400, { error: "propositionId and email required, or preview rows." });
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (e) {
    sendJson(res, e.status || 500, { error: redactSecrets(e.message) });
  }
}
