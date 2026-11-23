/**
 * Server-only title attachment (needs the business-head mapping table).
 * R&D chart kind is an exception: department head / team lead titles come from
 * lib/orgHierarchy.js when roster org_role is absent.
 */
import { displayTitle } from "./displayTitle.js";
import { normalizeEmail } from "./auth.js";
import { orgAccessForViewer } from "./orgHierarchy.js";

function chartKindFor(user) {
  try {
    return orgAccessForViewer({
      email: user?.email,
      name: String(user?.name || "").trim(),
    })?.kind || null;
  } catch {
    return null;
  }
}

export async function attachTitle(user) {
  if (!user) return user;
  let mapped = false;
  try {
    const { isBusinessHeadEmail } = await import("./accessDb.js");
    mapped = await isBusinessHeadEmail(user.email);
  } catch {
    mapped = false;
  }
  return {
    ...user,
    title: displayTitle(user, { mappedBusinessHead: mapped, orgChartKind: chartKindFor(user) }),
  };
}

export async function titlesOnUserRows(rows) {
  let mapped = new Set();
  try {
    const { listBusinessHeadTeams } = await import("./accessDb.js");
    mapped = new Set((await listBusinessHeadTeams()).map((r) => normalizeEmail(r.email)));
  } catch {
    mapped = new Set();
  }
  return (rows || []).map((u) => ({
    ...u,
    title: displayTitle(u, {
      mappedBusinessHead: mapped.has(normalizeEmail(u.email)),
      orgChartKind: chartKindFor(u),
    }),
  }));
}
