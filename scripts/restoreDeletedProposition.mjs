/**
 * Re-insert an archived proposition when its id is no longer in the table.
 * node scripts/restoreDeletedProposition.mjs <id>
 * node scripts/restoreDeletedProposition.mjs --since YYYY-MM-DD
 */
import { restoreDeletedProposition, restoreDeletedSince } from "../lib/db.js";

const arg = process.argv[2];
const sinceFlag = arg === "--since" ? process.argv[3] : "";
if (!arg) {
  console.error("Usage: node scripts/restoreDeletedProposition.mjs <id | --since YYYY-MM-DD>");
  process.exit(1);
}

if (sinceFlag || arg === "--since") {
  const result = await restoreDeletedSince(sinceFlag);
  console.log(`restored=${result.restored.length} skipped=${result.skipped.length}`);
} else {
  const id = await restoreDeletedProposition(arg);
  console.log(`restored=${id}`);
}
