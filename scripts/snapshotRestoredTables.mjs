/**
 * Record a checksum for every table in primus_restored.
 * Read-only on that schema. Writes data/restored/manifest.json, which stays untracked.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checksumSchemaTables, withRestoredClient } from "./restoredCopy.mjs";

const manifestPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "restored", "manifest.json");
const current = JSON.parse(readFileSync(manifestPath, "utf8"));
const tables = await withRestoredClient((client) => checksumSchemaTables(client));
current.tables = tables;
writeFileSync(manifestPath, `${JSON.stringify(current, null, 2)}\n`);
const names = Object.keys(tables).sort();
console.log(`tables=${names.length}`);
for (const name of names) console.log(`${name} rows=${tables[name].rows}`);
process.exit(0);
