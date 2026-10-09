/**
 * Read-only counts of blocked-clobber and blocked-key-removal audit rows.
 * Prints team, week, handler, and key name. Never prints values.
 *
 *   node scripts/reportBlockedWrites.mjs data/backups/live-cache-readonly
 */
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

const exportDir = path.resolve(process.argv[2] || path.join("data", "backups", "live-cache-readonly"));
const file = path.join(exportDir, "proposition_audit.jsonl");

function weekOf(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function parseIds(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

if (!existsSync(file)) {
  console.log(`blocked-write export missing ${file}`);
  console.log("counts=0");
  process.exit(0);
}

const rows = [];
const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
for await (const line of rl) {
  const text = line.replace(/^\uFEFF/, "").trim();
  if (text) rows.push(JSON.parse(text));
}

const wanted = new Set(["blocked-clobber", "blocked-key-removal"]);
const counts = new Map();
let n = 0;
for (const row of rows) {
  const action = String(row.action || "");
  if (!wanted.has(action)) continue;
  n += 1;
  const actor = String(row.actor || "");
  const splitAt = actor.lastIndexOf("|");
  const handler = splitAt >= 0 ? actor.slice(0, splitAt) : actor || "unknown";
  const team = splitAt >= 0 ? actor.slice(splitAt + 1) : "(none)";
  const week = weekOf(row.at);
  for (const id of parseIds(row.ids_json)) {
    const colon = id.indexOf(":");
    const key = colon >= 0 ? id.slice(colon + 1) : id;
    const bagKey = `${team}|${week}|${handler}|${key}`;
    counts.set(bagKey, (counts.get(bagKey) || 0) + 1);
  }
}

console.log("team | week | handler | key | n");
for (const key of [...counts.keys()].sort()) {
  console.log(`${key.replace(/\|/g, " | ")} | ${counts.get(key)}`);
}
console.log(`blockedRows=${n} groups=${counts.size}`);
