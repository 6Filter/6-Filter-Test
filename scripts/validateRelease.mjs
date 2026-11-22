#!/usr/bin/env node
/**
 * IS IT BUILT? Runs every acceptance test for the recent parts against a BUILD (an unzipped copy of the repository) and reports, per part, IMPLEMENTED, PARTLY or NOT YET.
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/primus_test node validateRelease.mjs <path to the build folder> [--only 139,140]
 * Needs: the build's dependencies installed (npm ci --include=dev, plus: npm i -D jsdom), a LOCAL Postgres, Node 20+. Takes about 8 minutes. The tests and the harness sit beside this file.
 * It copies the tests into <build>/scripts (never the reference code: a part counts as built only if the BUILD has it), runs each in turn, and writes validation_report.json beside this file.
 * "Live" is a separate question: run liveCheck.mjs against the site from a computer that can reach it.
 */
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)); const build = path.resolve(process.argv[2] || ""); const only = (process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : "").split(",").filter(Boolean);
if (!process.argv[2] || !fs.existsSync(path.join(build, "package.json"))) { console.error("Usage: node validateRelease.mjs <build folder> [--only 139,140]"); process.exit(2); }
if (!process.env.TEST_DATABASE_URL) { console.error("Set TEST_DATABASE_URL to a LOCAL Postgres (never the live database)."); process.exit(2); }
const PARTS = [
  ["138", "Spec compliance: required fields, concept card, evidence, GST and pack size by the person, COGS and margin auto-filled, Filter 4 verified", ["testSpecRequirements.mjs", "testAutoPopulate.mjs"]],
  ["139", "Mandatory and optional labels on every box, legend, live checklist", ["testFieldRoles.mjs", "testFieldLabelsOnPage.mjs"]],
  ["140", "Drafts always save, Filter 4 views kept, failed saves loud, upload an idea from a file", ["testDraftSaveAndFilter4.mjs", "testIdeaImportApi.mjs", "testTeamAndFieldAccess.mjs"]],
  ["150", "Placeholder answers refused, never suggested, and the Submit bar tells the truth", ["testAnswerGuard.mjs"]],
  ["148", "The Log by team, month, person and date, with charts and insights", ["testLogInsights.mjs", "testLogCharts.mjs"]],
  ["147", "Reskin to the light cream-and-brown design, logic locked", ["testThemeTokens.mjs", "testFormTypography.mjs", "logic-lock/testLogicLock.mjs"]],
  ["146", "Text size: a minus, a percentage and a plus, 1% to 100%", ["testTextSizeControl.mjs"]],
  ["145", "The short input form: 12 typed boxes, pure commodity as a research finding", ["testRoleDisplay.mjs", "testShortForm.mjs", "testPureCommodityExemption.mjs"]],
  ["hotfix", "Delete after a database move, and the not-entered list shows only what a person can type", ["testSequenceDrift.mjs", "testMissingInputsWording.mjs"]],
  ["144", "Proof file analysis and the final verdict over Filters 1 to 5", ["testProofAnalysis.mjs", "testFinalScoring.mjs", "testProofFlowApi.mjs"]],
  ["143", "A clean input form: two labels, one line per field, one benefit and a plus, collapsible filters, a clear type scale", ["testRoleDisplay.mjs", "testFormTypography.mjs", "testFieldLabelsOnPage.mjs", "testFormDeclutter.mjs", "testFilterAccordion.mjs"]],
  ["142", "Closing the gaps: junk scores nothing, a truthful improvement panel, evidence read once and reported, full coverage", ["testQualityNotQuantity.mjs", "testImprovementPathValid.mjs", "testPathToGo.mjs", "testPathToGoActionCopy.mjs", "testEvidenceReading.mjs", "testTypedValuesNeverRevert.mjs"]],
  ["141", "One number for score and verdict, an honest output, typed values never revert, the last upload gaps", ["testScoreDeterminism.mjs", "testImprovementPathValid.mjs", "testQualityNotQuantity.mjs", "testTypedValuesNeverRevert.mjs", "testIdeaImportPolish.mjs"]],
];
const scripts = path.join(build, "scripts"); fs.mkdirSync(scripts, { recursive: true });
// The supplied tests are the authority. Before a supplied file replaces the repo's file of the same name, the repo's copy is kept in scripts/.repo-versions/ and any DIFFERENCE is reported as DRIFT, so a changed test can never go unnoticed. --keep leaves the repo's files alone.
const keep = process.argv.includes("--keep"); const drift = []; const backup = path.join(scripts, ".repo-versions");
for (const f of fs.readdirSync(here)) if (/^(test.*|uiHarness)\.mjs$/.test(f)) {
  const src = path.join(here, f), dst = path.join(scripts, f);
  if (path.resolve(src) === path.resolve(dst)) continue;                      // the runner lives in the repo's scripts folder: nothing to copy
  if (fs.existsSync(dst)) { if (Buffer.compare(fs.readFileSync(src), fs.readFileSync(dst)) === 0) continue; drift.push(f); if (keep) continue; fs.mkdirSync(backup, { recursive: true }); fs.copyFileSync(dst, path.join(backup, f)); }
  fs.copyFileSync(src, dst);
}
if (drift.length) console.log(`\nDRIFT: ${drift.length} supplied test file(s) differ from the repo's copy of the same name: ${drift.join(", ")}.${keep ? " (kept the repo's versions: --keep)" : " The supplied versions were used; the repo's versions are saved in scripts/.repo-versions/."}`);
const report = []; const t0 = Date.now();
for (const [part, title, tests] of PARTS) { if (only.length && !only.includes(part)) continue; console.log(`\n=== Part ${part}: ${title}`); const rows = [];
  for (const t of tests) { const r = spawnSync("node", [path.join("scripts", t)], { cwd: build, env: process.env, encoding: "utf8", timeout: 420000, maxBuffer: 64 * 1024 * 1024 }); const out = `${r.stdout || ""}\n${r.stderr || ""}`; const lines = out.split("\n");
    const pass = lines.filter((l) => /^PASS\s/.test(l)).length, fail = lines.filter((l) => /^FAIL\s/.test(l)).length, skip = lines.filter((l) => /^SKIP/.test(l)).length; const missing = /missing|MODULE_NOT_FOUND|Cannot find module/.test(out) && pass === 0;
    const crashed = !r.error && r.status !== 0 && pass + fail > 0 && fail === 0; /* printed some PASS lines then died: that is a failure, not a pass */
    const status = r.error || (r.status !== 0 && pass + fail === 0) ? "ERROR" : skip && !pass && !fail ? "SKIPPED" : fail === 0 && !crashed ? "PASS" : "FAIL";
    const firstFail = (lines.find((l) => /^FAIL\s/.test(l)) || (crashed ? "CRASHED after " + pass + " checks: " + lines.filter((l) => /Error/.test(l)).slice(0, 1).join("").slice(0, 100) : "")).slice(0, 170); rows.push({ test: t, pass, fail: crashed ? fail + 1 : fail, skip, status, missing, firstFail, tail: status === "ERROR" ? lines.filter(Boolean).slice(-3).join(" | ").slice(0, 200) : "" });
    console.log(`  ${status.padEnd(7)} ${t.padEnd(34)} pass ${String(pass).padStart(3)}  fail ${String(fail).padStart(3)}${firstFail ? "\n          first failure: " + firstFail : ""}${rows.at(-1).tail ? "\n          " + rows.at(-1).tail : ""}`); }
  const allPass = rows.every((x) => x.status === "PASS"); const nonePass = rows.every((x) => x.pass === 0 || x.missing); report.push({ part, title, verdict: allPass ? "IMPLEMENTED" : nonePass ? "NOT YET" : "PARTLY", rows }); }
console.log("\n==================== SUMMARY ====================");
for (const p of report) { const t = p.rows.reduce((a, r) => ({ pass: a.pass + r.pass, fail: a.fail + r.fail }), { pass: 0, fail: 0 }); console.log(`${p.verdict.padEnd(12)} Part ${p.part.padEnd(10)} ${t.pass} of ${t.pass + t.fail} checks pass   ${p.title.slice(0, 60)}`); }
fs.writeFileSync(path.join(here, "validation_report.json"), JSON.stringify({ build, drift, at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), report }, null, 1));
process.exit(report.every((p) => p.verdict === "IMPLEMENTED") ? 0 : 1);
