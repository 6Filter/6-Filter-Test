import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RESEARCH_PROCESS_MS,
  SAVE_PROCESS_MS,
  asResearchDurationMs,
  expectedProcessMs,
  formatCountdown,
  processTimerCopy,
} from "../lib/processTimer.js";

assert.equal(expectedProcessMs({ researchRunAt: null }), RESEARCH_PROCESS_MS);
assert.equal(expectedProcessMs({ forceResearch: true, researchRunAt: "now" }), RESEARCH_PROCESS_MS);
assert.equal(expectedProcessMs({ researchRunAt: "now", ideaChanged: true }), RESEARCH_PROCESS_MS);
assert.equal(expectedProcessMs({ researchRunAt: "now", ideaChanged: false }), SAVE_PROCESS_MS);

assert.equal(formatCountdown(125000), "2:05");
assert.equal(formatCountdown(5000), "0:05");
assert.equal(formatCountdown(-1000), "0:00");

const mid = processTimerCopy({ elapsedMs: 30000, expectedMs: 150000 });
assert.equal(mid.status, "counting");
assert.equal(mid.remainingLabel, "2:00");
assert.match(mid.text, /2:00/);

const done = processTimerCopy({ elapsedMs: 160000, expectedMs: 150000 });
assert.equal(done.status, "overtime");
assert.equal(done.remainingLabel, "Finishing…");

assert.equal(asResearchDurationMs(12345), 12345);
assert.equal(asResearchDurationMs(null), null);
assert.equal(asResearchDurationMs(-1), null);
assert.equal(asResearchDurationMs(5_000_000), 3_600_000);

const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.match(appSrc, /process-eta/);
assert.match(appSrc, /onProcessingChange/);
assert.match(appSrc, /About .* left|processTimerCopy/);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /onProcessingChange/);
assert.match(formSrc, /expectedProcessMs/);
assert.match(formSrc, /durationOnly: true/);
assert.match(formSrc, /researchDurationMs: elapsedMs/);
assert.match(formSrc, /formatScreenedDuration\(doc\?\.researchDurationMs\)/);
assert.doesNotMatch(formSrc, /result\.screenedMs/);

const gateSrc = readFileSync(new URL("../lib/propositionGateApi.js", import.meta.url), "utf8");
assert.match(gateSrc, /durationOnly/);
assert.match(gateSrc, /setResearchDurationMs/);

console.log("PASS Part 53 process timer expected-time copy");
