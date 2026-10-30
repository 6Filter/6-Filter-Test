/**
 * Decrypt a Primus encrypted backup (.bk) into a folder importExport.mjs can load.
 * node scripts/decryptBackup.mjs <file.bk> [--out data/backups/<stamp>]
 *
 * Requires BACKUP_ENCRYPTION_KEY. Never prints the key.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decryptBackupPayload } from "../lib/backupCrypto.js";

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* optional */
  }
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

loadEnv(".env.local");

const inFile = path.resolve(process.argv[2] || "");
if (!inFile || process.argv[2] == null) {
  console.error("Usage: node scripts/decryptBackup.mjs <file.bk> [--out data/backups/<stamp>]");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const outDir = path.resolve(argValue("--out") || path.join("data", "backups", `decrypted-${stamp}`));

const blob = readFileSync(inFile);
const { manifest, jsonl } = decryptBackupPayload(blob);

await mkdir(outDir, { recursive: true });
const byTable = new Map();
for (const line of jsonl.split(/\n/)) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  if (row.type !== "row" || !row.table) continue;
  const list = byTable.get(row.table) || [];
  list.push(row.record);
  byTable.set(row.table, list);
}

const tables = [];
for (const [name, rows] of [...byTable.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const file = `${name}.jsonl`;
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  await writeFile(path.join(outDir, file), body, "utf8");
  tables.push({ name, file, rows: rows.length });
}

await writeFile(
  path.join(outDir, "manifest.json"),
  JSON.stringify(
    {
      version: manifest.version || 1,
      createdAt: manifest.createdAt,
      sha256: manifest.sha256,
      tables,
    },
    null,
    2
  ),
  "utf8"
);

console.log(`decrypted=${outDir} tables=${tables.length} sha256=${manifest.sha256 || ""}`);
