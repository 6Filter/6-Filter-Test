/**
 * Fail the build when server-only markers land in the browser bundle.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "dist", "assets");
const markers = [
  "createCipheriv",
  "createDecipheriv",
  "scryptSync",
  "DATABASE_URL",
  "POSTGRES_URL",
  "SESSION_SECRET",
  "DEPT_PASSWORD_HASH",
  "DEPT_API_KEY",
  "DEPARTMENT_KEY_ENCRYPTION_SECRET",
  "sk-ant-",
  "pg_dump",
  "pg-pool",
  "pg-protocol",
];

let files = [];
try {
  files = readdirSync(assets).filter((name) => name.endsWith(".js"));
} catch {
  console.error("checkClientBundle: dist/assets is missing. Run npm run build first.");
  process.exit(1);
}

const hits = [];
for (const name of files) {
  const text = readFileSync(path.join(assets, name), "utf8");
  for (const marker of markers) {
    if (text.includes(marker)) hits.push({ marker, file: name });
  }
  if (/(?:from|import)\s*["']pg["']/.test(text) || text.includes('require("pg")')) {
    hits.push({ marker: "pg", file: name });
  }
}

if (hits.length) {
  for (const hit of hits) {
    console.error(`checkClientBundle: ${hit.marker} in ${hit.file}`);
  }
  process.exit(1);
}

console.log(`checkClientBundle: ${files.length} bundle file(s) clean`);
