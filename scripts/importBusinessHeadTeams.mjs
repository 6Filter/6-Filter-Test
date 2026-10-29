/**
 * Import Primus-AI_BusinessHeads_TeamMapping.csv into business_head_teams.
 * Usage:
 *   node scripts/importBusinessHeadTeams.mjs [path/to.csv] [--preview]
 * Needs DATABASE_URL (or TEST_DATABASE_URL). Never commits the CSV.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { SUBMITTER_DEPARTMENTS, isCanonicalTeam } from "../lib/propositionFields.js";
import { normalizeEmail } from "../lib/auth.js";

function loadLocalEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

loadLocalEnv();

const args = process.argv.slice(2).filter((a) => a !== "--preview");
const previewOnly = process.argv.includes("--preview");
const csvPath =
  args[0] ||
  path.join("data", "Primus-AI_BusinessHeads_TeamMapping.csv");

if (!process.env.DATABASE_URL && process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL (or TEST_DATABASE_URL) is required.");
  process.exit(1);
}

function parseCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const start = /^email\s*,/i.test(lines[0]) ? 1 : 0;
  const rows = [];
  for (const line of lines.slice(start)) {
    // team names may contain commas only inside notes after second comma
    const first = line.indexOf(",");
    if (first < 0) continue;
    const email = normalizeEmail(line.slice(0, first));
    const rest = line.slice(first + 1);
    const second = rest.indexOf(",");
    const team = (second < 0 ? rest : rest.slice(0, second)).trim();
    const note = second < 0 ? "" : rest.slice(second + 1).trim();
    rows.push({ email, team, note });
  }
  return rows;
}

const raw = readFileSync(csvPath, "utf8");
const parsed = parseCsv(raw);
const preview = parsed.map((r) => ({
  ...r,
  ok: Boolean(r.email && isCanonicalTeam(r.team)),
}));

console.log(`file=${csvPath}`);
console.log(`rows=${preview.length} canonicalTeams=${SUBMITTER_DEPARTMENTS.length}`);
for (const r of preview) {
  console.log(`${r.ok ? "OK" : "BAD"} ${r.email} → ${r.team}`);
}
const bad = preview.filter((r) => !r.ok);
if (bad.length) {
  console.error(`${bad.length} row(s) failed validation.`);
  process.exit(1);
}
if (preview.length !== 18) {
  console.error(`Expected 18 heads, got ${preview.length}.`);
  process.exit(1);
}
const teams = new Set(preview.map((r) => r.team));
if (teams.size !== 18) {
  console.error(`Expected 18 distinct teams, got ${teams.size}.`);
  process.exit(1);
}
if (previewOnly) {
  console.log("Preview only — nothing written.");
  process.exit(0);
}

const { initDb, usingPostgres, getUserByEmail, adminUpdateUser } = await import("../lib/db.js");
const { replaceBusinessHeadTeams } = await import("../lib/accessDb.js");
await initDb();
if (!usingPostgres()) {
  console.error("Postgres required.");
  process.exit(1);
}
const saved = await replaceBusinessHeadTeams(preview, { actorUserId: null });
for (const row of saved) {
  const u = await getUserByEmail(row.email);
  if (!u) continue;
  const patch = {};
  if (u.role !== "ADMIN" && u.role !== "BH FORUM") patch.role = "BH FORUM";
  if (!u.team) patch.team = row.team;
  if (Object.keys(patch).length) await adminUpdateUser(u.id, patch);
}
console.log(`Imported ${saved.length} business_head_teams rows.`);
