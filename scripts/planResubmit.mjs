/**
 * Dry run of what a Submit would research. Reads the restored export only.
 * refuseModelCall throws and this script never invokes it, so nothing is spent.
 */
import { createReadStream, readFileSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ledgerFromCalls, planResearch, refuseModelCall } from "../lib/researchProgress.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const focusId = "870271a6-d242-4f20-8b20-47302da8cf5f";

function parse(raw) {
  if (!raw) return {};
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export function backupDir() {
  const rootDir = path.join(root, "data", "backups");
  const names = readdirSync(rootDir).filter((name) => /^\d{8}T\d{6}Z$/.test(name)).sort();
  if (!names.length) throw new Error("No restored export under data/backups.");
  return path.join(rootDir, names[names.length - 1]);
}

export async function loadRestoredRows(dir = backupDir()) {
  const file = path.join(dir, "propositions.jsonl");
  const rows = [];
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    rows.push({
      id: row.id,
      researchRunAt: row.research_run_at || null,
      f1: parse(row.f1_json),
      f2: parse(row.f2_json),
      f3: parse(row.f3_json),
      f4: parse(row.f4_json),
      f5: parse(row.f5_json),
      researchFindings: parse(row.research_findings_json),
    });
  }
  rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return { file, rows };
}

export function readCallLedger() {
  try {
    const rows = JSON.parse(readFileSync(path.join(root, "data", "llm_usage_calls.json"), "utf8"));
    return Array.isArray(rows) ? ledgerFromCalls(rows) : null;
  } catch {
    return null;
  }
}

export function formatPlan(rows, ledger) {
  const plans = rows.map((doc) => ({ id: doc.id, ...planResearch(doc, ledger) }));
  const source = ledger ? "per-label ledger" : "measured-fresh-idea";
  const lines = [`cost source: ${source}`, "id | researchState | steps | estUsd"];
  for (const row of plans) {
    lines.push(`${row.id} | ${row.researchState} | ${row.steps.join(",") || "-"} | ${row.usd.toFixed(4)}`);
  }
  const repair = plans.filter((row) => row.researchState === "incomplete" || row.researchState === "failed");
  const missing = {};
  for (const row of repair) {
    for (const step of row.steps) missing[step] = (missing[step] || 0) + 1;
  }
  const credits = repair.reduce((sum, row) => sum + row.usd, 0);
  lines.push(
    `totals incomplete=${plans.filter((row) => row.researchState === "incomplete").length} ` +
      `failed=${plans.filter((row) => row.researchState === "failed").length} ` +
      `steps=${Object.entries(missing).map(([step, n]) => `${step}:${n}`).join(",") || "-"} ` +
      `estUsd=${credits.toFixed(4)}`
  );
  const focus = plans.find((row) => row.id === focusId);
  lines.push(
    `planned ${focusId} steps=${focus ? focus.steps.join(",") || "-" : "missing"} state=${focus?.researchState || "missing"}`
  );
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (typeof refuseModelCall !== "function") {
    throw new Error("model stub missing");
  }
  const { rows } = await loadRestoredRows();
  console.log(formatPlan(rows, readCallLedger()));
}
