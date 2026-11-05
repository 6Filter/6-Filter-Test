/**
 * Part 136 — owner test (do not edit). Source scan for forbidden user-facing phrases.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCAN_DIRS = ["lib", "src"];
const SKIP_NAME = /(^|\/)(node_modules|\.git|dist|data)\b/;

/** Files where version/history comments are allowed. */
const COMMENT_OK = new Set([
  path.join(root, "lib", "lockedConstants.js"),
  path.join(root, "lib", "filterNarrativeText.js"),
  path.join(root, "lib", "improvementPoints.js"),
  path.join(root, "lib", "f2Derived.js"),
  path.join(root, "lib", "goNoGo.js"),
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (SKIP_NAME.test(full.replace(/\\/g, "/"))) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(path.join(root, d)));
let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

check("no (vN) version tags in person-facing string literals under lib/src", () => {
  const bad = [];
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const src = COMMENT_OK.has(file) ? stripComments(raw) : stripComments(raw);
    // String literals containing (v4) or (v5.x, …
    const re = /["'`][^"'`]*\(v\d[^"'`]*["'`]/g;
    const hits = src.match(re) || [];
    for (const h of hits) {
      // Allow property keys / technical ids
      if (/v4Test|rulesetVersion|SCORING_RULESET/.test(h)) continue;
      bad.push(`${path.relative(root, file)}: ${h.slice(0, 80)}`);
    }
  }
  assert.equal(bad.length, 0, bad.slice(0, 10).join("\n"));
});

check("no non-negotiable in user-facing copy (except legacy severity regex)", () => {
  const bad = [];
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    if (file.endsWith("improvementPoints.js") && /non-negotiable/.test(raw)) {
      // Allowed only inside a RegExp for detecting legacy stored text.
      const withoutRegex = raw.replace(/\/[^/\n]*non-negotiable[^/\n]*\/[gimsuy]*/g, "");
      if (/non-negotiable/.test(stripComments(withoutRegex))) {
        bad.push(path.relative(root, file));
      }
      continue;
    }
    if (/non-negotiable/i.test(stripComments(raw))) bad.push(path.relative(root, file));
  }
  assert.equal(bad.length, 0, bad.join(", "));
});

check("no 'not unfinished paperwork' paragraph", () => {
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    assert.ok(!/not unfinished paperwork/i.test(raw), path.relative(root, file));
  }
});

check("no 'has not been run yet' in production copy", () => {
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const body = stripComments(raw);
    assert.ok(!/has not been run yet/i.test(body), path.relative(root, file));
  }
});

check("filterNarrativeText has no forbidden phrases", () => {
  const raw = readFileSync(path.join(root, "lib", "filterNarrativeText.js"), "utf8");
  const body = stripComments(raw);
  assert.ok(!/non-negotiable/i.test(body));
  assert.ok(!/has not been run yet/i.test(body));
  assert.ok(!/not unfinished paperwork/i.test(body));
});

const { EVALUATION_STEP_LABELS } = await import("../../lib/evaluationStatus.js");
check("evaluationStatus labels are plain words", () => {
  for (const label of Object.values(EVALUATION_STEP_LABELS)) {
    assert.ok(label.length > 5);
    assert.ok(!/^[A-Z0-9_]+$/.test(label));
  }
});

console.log(`PASS owner testUserFacingCopy (${checks} checks)`);
