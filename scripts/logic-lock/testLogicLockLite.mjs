/**
 * Part 147 — logic lock (lite). Fails, naming the cause, if a restyle touched logic or changed a word.
 * Approved changes go in approved.json (owner only): { "files": ["lib/x.js"], "words": ["src/App.jsx\tText"] }.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectAll } from "./collectLite.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(path.join(here, "baselineLite.json"), "utf8"));
const approvedPath = path.join(here, "approved.json");
const approved = existsSync(approvedPath) ? JSON.parse(readFileSync(approvedPath, "utf8")) : {};
const okFiles = new Set(approved.files || []);
const okWords = new Set(approved.words || []);
const now = collectAll();

let failed = 0;
function check(name, problems) {
  if (problems.length) {
    failed += 1;
    console.error(`FAIL ${name}`);
    for (const p of problems.slice(0, 25)) console.error(`  - ${p}`);
    if (problems.length > 25) console.error(`  … and ${problems.length - 25} more`);
  } else console.log(`ok   ${name}`);
}

const changed = [];
const removedFiles = [];
const addedFiles = [];
for (const [f, h] of Object.entries(baseline.fingerprints)) {
  if (!(f in now.fingerprints)) removedFiles.push(`${f} was removed`);
  else if (now.fingerprints[f] !== h && !okFiles.has(f)) changed.push(`${f} changed`);
}
for (const f of Object.keys(now.fingerprints)) {
  if (!(f in baseline.fingerprints) && !okFiles.has(f)) addedFiles.push(`${f} is new`);
}
check("no file in lib/, api/ or server.js changed", changed);
check("no logic file removed", removedFiles);
check("no logic file added", addedFiles);

function counts(list) {
  const m = new Map();
  for (const w of list) m.set(w, (m.get(w) || 0) + 1);
  return m;
}
const before = counts(baseline.words);
const after = counts(now.words);
const lost = [];
const gained = [];
for (const [w, n] of before) if ((after.get(w) || 0) < n && !okWords.has(w)) lost.push(`word lost (${n - (after.get(w) || 0)}×): ${w.replace("\t", "  →  ")}`);
for (const [w, n] of after) if ((before.get(w) || 0) < n && !okWords.has(w)) gained.push(`word added (${n - (before.get(w) || 0)}×): ${w.replace("\t", "  →  ")}`);
check("no button, heading, label or placeholder text removed or renamed", lost);
check("no new button, heading, label or placeholder text", gained);

if (failed) {
  console.error(`\nlogic lock (lite): ${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nlogic lock (lite): all checks passed");
