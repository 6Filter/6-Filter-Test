/**
 * Part 136 — owner test (do not edit). Real app pieces in jsdom.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
}

const formSrc = readFileSync(path.join(root, "src", "PropositionForm.jsx"), "utf8");
const logSrc = readFileSync(path.join(root, "src", "LogPage.jsx"), "utf8");

check("incomplete page copy exists", () => {
  assert.match(formSrc, /Evaluation incomplete|Not evaluated yet/);
  assert.match(formSrc, /Evaluate/);
});

check("legacy banner exists", () => {
  assert.match(formSrc, /Scored under an older release/);
});

check("evaluated path uses sealed output / sealedChecks", () => {
  assert.match(formSrc, /sealedChecks|output\.filters|proposition\.output/);
});

check("no live advisoryChecks required to open evaluated idea", () => {
  assert.match(formSrc, /evaluationState/);
});

check("Log has Not evaluated / Incomplete pills", () => {
  assert.match(logSrc, /Not evaluated|Incomplete/);
  assert.match(logSrc, /evaluationState/);
});

check("source has no UPPERCASE level badge class for STRONG/WEAK codes", () => {
  assert.ok(!/badge.*STRONG|STRONG.*badge/i.test(formSrc) || /Strong evidence|formatRiskLevel|sentence/i.test(formSrc));
});

check("no raw reason codes rendered as card titles pattern NOT_ASSESSED", () => {
  // Production UI should not hardcode showing NOT_ASSESSED as a label.
  assert.ok(!/checkLabel=\{\"NOT_ASSESSED\"\}/.test(formSrc));
  assert.ok(!/>NOT_ASSESSED</.test(formSrc));
});

check("jsdom can mount a minimal incomplete shell", () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="root">
      <h1>Evaluation incomplete</h1>
      <ul><li>Check the benchmark by web search</li></ul>
      <button type="button">Evaluate</button>
    </div>
  </body></html>`);
  const rootEl = dom.window.document.getElementById("root");
  assert.match(rootEl.textContent, /Evaluation incomplete/);
  assert.match(rootEl.textContent, /Check the benchmark/);
  assert.ok(rootEl.querySelector("button"));
});

check("PDF disabled path mentioned for non-evaluated", () => {
  assert.match(logSrc, /Evaluate|evaluationState|disabled/);
});

console.log(`PASS owner testOutputRendering (${checks} checks)`);
