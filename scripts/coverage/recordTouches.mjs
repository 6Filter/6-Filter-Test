#!/usr/bin/env node
/**
 * RECORD WHAT THE TESTS REALLY DO. Runs every test file named in coverage-map.json (one at a time, up to 4 minutes each) with PRIMUS_TOUCH_LOG set, so the page harness records each real click, edit, key press and HTTP request together with the test's name.
 *   node scripts/coverage/recordTouches.mjs [--out scripts/coverage/touches.jsonl] [--only testA.mjs,testB.mjs]
 * A test that fails is still recorded (what it touched before failing counts). Any custom jsdom harness must call installDomRecorder(window) from scripts/coverage/touches.mjs right after creating the window, or its clicks are invisible to the gate.
 */
import fs from "node:fs"; import path from "node:path"; import { spawn } from "node:child_process"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)); const scripts = path.join(here, ".."); const arg = (k, d = "") => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg("out", path.join(here, "touches.jsonl"))); const only = new Set(arg("only").split(",").filter(Boolean));
const map = JSON.parse(fs.readFileSync(path.join(here, "coverage-map.json"), "utf8")); let tests = [...new Set([...Object.values(map.routes || {}), ...Object.values(map.controls || {})].flat().map((f) => path.basename(f)))].filter((f) => fs.existsSync(path.join(scripts, f)) && (!only.size || only.has(f))).sort();
fs.writeFileSync(out, ""); const run = (f) => new Promise((resolve) => { const p = spawn(process.execPath, [path.join(scripts, f)], { cwd: path.join(scripts, ".."), env: { ...process.env, PRIMUS_TOUCH_LOG: out }, stdio: "ignore" }); const timer = setTimeout(() => p.kill("SIGKILL"), 240000); p.on("close", (code) => { clearTimeout(timer); resolve(code); }); });
let ok = 0, failed = 0; for (const f of tests) { const code = await run(f); if (code === 0) ok++; else failed++; console.log(`${code === 0 ? "ok  " : "exit " + code}  ${f}`); }
const n = fs.readFileSync(out, "utf8").split("\n").filter(Boolean).length; console.log(`\n${tests.length} test file(s) run (${ok} passed, ${failed} did not); ${n} touches recorded in ${out}`); process.exitCode = 0;
