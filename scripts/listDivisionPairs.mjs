/**
 * Prints distinct category → detectDivision pairs from the Log.
 * A person reviews this list before any pair is added to DIVISION_KEYWORDS.
 * This script does not edit the map.
 */
import { initDb, listPropositions } from "../lib/db.js";
import { detectDivision } from "../lib/npdMaster.js";

await initDb();
const rows = await listPropositions(5000);
const seen = new Map();
for (const row of rows) {
  const category = String(row.category || "").trim();
  if (!category) continue;
  const idea = [row.name, row.ideaDescription, category].filter(Boolean).join("\n");
  const division = detectDivision(idea) || "(no static match)";
  const key = `${category.toLowerCase()} → ${division}`;
  seen.set(key, (seen.get(key) || 0) + 1);
}
const lines = [...seen.entries()].sort((a, b) => b[1] - a[1]);
console.log(`pairs=${lines.length} propositions=${rows.length}`);
for (const [pair, count] of lines) console.log(`${count}\t${pair}`);
