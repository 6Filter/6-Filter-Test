/**
 * Server-only field write gates (imports accessDb). Do not import from client bundles.
 */
import { teamsForBusinessHead } from "./accessDb.js";
import { ideaTeamRaw } from "./propositionAccess.js";
import {
  canEditIdeaInputs,
  changedOwnedFields,
  isServerOwnedField,
} from "./fieldOwnership.js";

export async function canWriteForumVerdict(user, idea, { bhTeams = null } = {}) {
  if (!user) return false;
  if (String(user.role || "").trim() === "ADMIN") return true;
  const teams = Array.isArray(bhTeams) ? bhTeams : await teamsForBusinessHead(user.email);
  const team = ideaTeamRaw(idea);
  return Boolean(team && teams.includes(team));
}

export async function firstForbiddenField(user, idea, current, incoming) {
  const changed = changedOwnedFields(current, incoming);
  if (!changed.length) return null;

  const canEdit = canEditIdeaInputs(user, idea);
  const bhTeams = await teamsForBusinessHead(user?.email || "");

  for (const key of changed) {
    if (key === "forumVerdict" || key === "verdictNote") {
      if (!(await canWriteForumVerdict(user, idea, { bhTeams }))) return key;
      continue;
    }
    if (isServerOwnedField(key)) return key;
    if (!canEdit) return key;
  }
  return null;
}
