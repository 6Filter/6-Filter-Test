/**
 * Set probe=true on an explicit id list. Dry run unless --apply.
 * Writes one proposition_audit row per id (id and action only). Deletes nothing.
 *
 *   node scripts/flagProbes.mjs --ids <file>
 *   node scripts/flagProbes.mjs --ids <file> --apply
 *
 * A CSV with a likelyProbe column flags only the yes rows.
 * A text file flags one id per line.
 * Refuses a non-local database unless FLAG_PROBES_ALLOW_REMOTE=1.
 */
import { readFileSync } from "node:fs";

const apply = process.argv.includes("--apply");
const idsAt = process.argv.indexOf("--ids");
const file = idsAt >= 0 ? process.argv[idsAt + 1] : "";
if (!file) {
  console.error("Usage: node scripts/flagProbes.mjs --ids <file> [--apply]");
  process.exit(1);
}

const url = String(process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || "").trim();
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
let host = "";
try {
  host = new URL(url).hostname;
} catch {
  host = "";
}
const local = host === "127.0.0.1" || host === "localhost" || host === "::1";
if (!local && process.env.FLAG_PROBES_ALLOW_REMOTE !== "1") {
  console.error("Refusing a non-local database. The owner sets FLAG_PROBES_ALLOW_REMOTE=1 to run this.");
  process.exit(1);
}
process.env.DATABASE_URL = url;

function splitCsv(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted && ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i += 1;
    } else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function idsFrom(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const header = splitCsv(lines[0]).map((cell) => cell.trim().toLowerCase());
  if (header.includes("likelyprobe")) {
    const idCol = header.indexOf("id");
    const probeCol = header.indexOf("likelyprobe");
    const ids = [];
    for (const line of lines.slice(1)) {
      const cols = splitCsv(line);
      if (String(cols[probeCol] || "").trim().toLowerCase() !== "yes") continue;
      const id = String(cols[idCol] || "").trim();
      if (id) ids.push(id);
    }
    return [...new Set(ids)];
  }
  return [...new Set(lines.map((line) => line.trim()).filter((line) => line && !line.startsWith("#")))];
}

const ids = idsFrom(readFileSync(file, "utf8"));
if (!ids.length) {
  console.error("The id list is empty.");
  process.exit(1);
}

const { initDb, query, countPropositions, flagPropositionsAsProbe } = await import("../lib/db.js");
await initDb();
const found = await query(`SELECT id FROM propositions WHERE id = ANY($1::text[])`, [ids]);
const have = new Set(found.map((row) => row.id));
const missing = ids.filter((id) => !have.has(id));
console.log(`ids=${ids.length} found=${have.size} missing=${missing.length} apply=${apply}`);
if (missing.length) {
  console.error(`Refusing ${missing.length} id(s) that are not in the table.`);
  process.exit(1);
}
if (!apply) {
  console.log("dry-run only");
  process.exit(0);
}
const before = await countPropositions();
const auditBefore = Number((await query(`SELECT COUNT(*)::int AS n FROM proposition_audit WHERE action = 'flag-probe'`))[0]?.n || 0);
const result = await flagPropositionsAsProbe(ids);
const after = await countPropositions();
const auditAfter = Number((await query(`SELECT COUNT(*)::int AS n FROM proposition_audit WHERE action = 'flag-probe'`))[0]?.n || 0);
console.log(`flagged=${result.flagged} rowsBefore=${before} rowsAfter=${after} auditRows=${auditAfter - auditBefore}`);
process.exit(0);
