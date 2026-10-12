/**
 * Import Nielsen or Kantar rows. Dry run unless --apply.
 * node scripts/importSyndicated.mjs --file rows.json [--apply]
 * The file is the example-file array, or { source, asOf, rows }.
 * Every row must have source and as_of after the file-level stamp.
 */
import { readFileSync } from "node:fs";
import { normalizeSyndicatedImport, previewSyndicatedImport } from "../lib/syndicatedImport.js";
import { replaceSyndicatedRows } from "../lib/syndicatedStore.js";

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

const file = argValue("--file");
if (!file) {
  console.error("Pass --file.");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const body = JSON.parse(readFileSync(file, "utf8"));
const rows = normalizeSyndicatedImport(body);
const preview = previewSyndicatedImport(rows);
console.log(`rows=${preview.rows}`);
for (const [key, count] of Object.entries(preview.byCategory)) {
  console.log(`${key}=${count}`);
}
if (!apply) {
  console.log("dry-run only");
  process.exit(0);
}
const result = await replaceSyndicatedRows(rows, { actor: "importSyndicated" });
console.log(`written=${result.written}`);
process.exit(0);
