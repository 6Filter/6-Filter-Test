const SECRET_TABLES = ["department_passwords", "department_api_keys"];
const ALWAYS_EXCLUDED = ["research_cache"];
const IMPORT_FIRST = [
  "users",
  "business_head_teams",
  "legacy_team_map",
  "user_audit",
  "login_codes",
  "login_attempts",
  "department_passwords",
  "department_api_keys",
  "division_thresholds",
  "syndicated_rows",
  "ideas",
  "propositions",
];

export function selectExportTables(tableNames, { excludeSecrets = false, includeResearchCache = false } = {}) {
  const skip = new Set(includeResearchCache ? [] : ALWAYS_EXCLUDED);
  if (excludeSecrets) {
    for (const name of SECRET_TABLES) skip.add(name);
  }
  return [...tableNames]
    .filter((name) => !skip.has(name))
    .sort();
}

export function excludedTables({ excludeSecrets = false, includeResearchCache = false } = {}) {
  const names = includeResearchCache ? [] : [...ALWAYS_EXCLUDED];
  if (excludeSecrets) names.push(...SECRET_TABLES);
  return names;
}

export function importOrder(tableNames) {
  const present = new Set(tableNames);
  const ordered = IMPORT_FIRST.filter((name) => present.has(name));
  for (const name of [...tableNames].sort()) {
    if (!ordered.includes(name)) ordered.push(name);
  }
  return ordered;
}

export function assertEmptyPropositions(count) {
  if (Number(count) > 0) {
    const err = new Error("Refusing to import: propositions already has rows.");
    err.status = 409;
    throw err;
  }
}

export function safeIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(String(name || ""))) {
    throw new Error(`Refusing table name ${JSON.stringify(String(name || ""))}.`);
  }
  return name;
}
