/**
 * Part 141 — findings (reason / source link / quote) reach the page.
 *  (a) buildSealedOutput + advisoryChecksFromOutput carry reason / source_url / quote / guard.
 *  (b) filter1 computeF1 attaches the finding from the stored web assessment.
 *  (c) jsdom: the REAL WebCheckList from src/PropositionForm.jsx (bundled with esbuild, nothing exported
 *      or edited — an export line is appended in memory only) renders "Web check: …" with an <a href>.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { buildSealedOutput, advisoryChecksFromOutput } from "../lib/sealOutput.js";
import { computeF1 } from "../lib/filter1Check.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (fn) => Promise.resolve(fn()).then(() => {
  checks += 1;
});

const SRC = "https://example.com/report";
const QUOTE = "Cooling hair oils grew 14% in 2025";
const REASON = "Parachute Advansed Cooling is a close like-for-like benchmark";

// ───────────────────────── (a) sealed output ─────────────────────────
const advisoryChecks = {
  f1: {
    checkLabel: "Cleared",
    items: [
      {
        status: "done",
        slot: "benchmark",
        text: "Benchmark relevant: Parachute Advansed Cooling",
        level: "strong",
        credit: 1,
        reason: REASON,
        source_url: SRC,
        quote: QUOTE,
      },
      {
        status: "pending",
        slot: "derivation",
        text: "Fix this input before it can score",
        level: "none",
        credit: 0,
        reasons: ["INPUT_INVALID"],
        guard: "input-invalid",
        reason: "Looks like keyboard mashing",
      },
    ],
  },
  f2: { checkLabel: "Cleared", items: [] },
  f3: { checkLabel: "Cleared", items: [] },
  f4: { checkLabel: "Cleared", items: [] },
};
const goNoGo = { classification: "WATCH", score: { pct: 40, done: 7, total: 18, byFilter: {} } };
const sealed = buildSealedOutput({ advisoryChecks, goNoGo, doc: { name: "x" }, sealedAt: "2026-11-01T00:00:00.000Z" });

await ok(() => {
  const [bench, deriv] = sealed.filters.f1.items;
  assert.equal(bench.reason, REASON);
  assert.equal(bench.source_url, SRC);
  assert.equal(bench.quote, QUOTE);
  assert.ok(bench.sources.includes(SRC), "source_url also lands in sources[]");
  assert.equal(deriv.guard, "input-invalid");
  assert.equal(deriv.reason, "Looks like keyboard mashing");
  assert.equal(deriv.source_url, undefined, "no source_url invented");
  assert.equal(deriv.quote, undefined);
  assert.equal(sealed.score.pct, 40);
});

await ok(() => {
  const back = advisoryChecksFromOutput(sealed);
  const [bench, deriv] = back.f1.items;
  assert.equal(bench.reason, REASON);
  assert.equal(bench.source_url, SRC);
  assert.equal(bench.quote, QUOTE);
  assert.equal(deriv.guard, "input-invalid");
});

// ───────────────────────── (b) filter 1 attaches findings ─────────────────────────
await ok(() => {
  const f1 = {
    benchmark: "Parachute Advansed Cooling 100 ml",
    declaredGap: 3,
    declaredAttribute: "cools the scalp for hours",
    gapDerivation: "A cooling feel that lasts longer",
    parityExceptions: "fragrance may be weaker",
    growthRoute: "Penetration",
    growthArgument: "summer lift brings new buyers",
  };
  const findings = {
    assessments: {
      benchmark: {
        raw: { relevance: "strong", source_url: SRC, reason: REASON, quote: QUOTE },
        returnedSources: [SRC],
      },
    },
  };
  const out = computeF1(f1, findings, {});
  const bench = out.items.find((i) => i.slot === "benchmark");
  assert.ok(bench, "benchmark item exists");
  assert.equal(bench.reason, REASON);
  assert.equal(bench.source_url, SRC);
  assert.equal(bench.quote, QUOTE);
});

// ───────────────────────── (c) real WebCheckList in jsdom ─────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
for (const k of ["HTMLElement", "Node", "Event", "MouseEvent", "localStorage", "sessionStorage"]) {
  try {
    globalThis[k] = window[k];
  } catch {
    /* ignore */
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const formSource = readFileSync(path.join(root, "src/PropositionForm.jsx"), "utf8");
assert.match(formSource, /function WebCheckList\(/, "production component still present");

const entry = `
${formSource}
export { WebCheckList as __WebCheckList };
export { default as __React } from "react";
export { createRoot as __createRoot } from "react-dom/client";
export { act as __act } from "react";
`;
const out = await build({
  stdin: { contents: entry, resolveDir: path.join(root, "src"), sourcefile: "PropositionForm.jsx", loader: "jsx" },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
  logLevel: "silent",
});
const dir = mkdtempSync(path.join(tmpdir(), "primus-findings-ui-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, out.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href);
const h = mod.__React.createElement;

async function mount(element) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const rootNode = mod.__createRoot(host);
  await mod.__act(async () => {
    rootNode.render(element);
  });
  return {
    host,
    async unmount() {
      await mod.__act(async () => rootNode.unmount());
      host.remove();
    },
  };
}

await ok(async () => {
  const items = advisoryChecksFromOutput(sealed).f1.items;
  const m = await mount(h(mod.__WebCheckList, { items, specKey: "f1" }));
  const lines = m.host.querySelectorAll('[data-testid="web-check"]');
  assert.equal(lines.length, 1, "only the sourced finding is listed (the guarded input row has no source)");
  assert.match(lines[0].textContent, /Web check:/);
  assert.ok(lines[0].textContent.includes(REASON), "finding text is on the page");
  const a = lines[0].querySelector("a[href]");
  assert.ok(a, "source is a link");
  assert.equal(a.getAttribute("href"), SRC);
  assert.equal(a.getAttribute("target"), "_blank");
  assert.match(a.getAttribute("rel"), /noopener/);
  await m.unmount();
});

await ok(async () => {
  // Nothing sourced → nothing rendered.
  const m = await mount(h(mod.__WebCheckList, { items: [{ text: "no source here" }], specKey: "f1" }));
  assert.equal(m.host.querySelector('[data-testid="web-check-list"]'), null);
  await m.unmount();
});

console.log(`PASS testPart141FindingsOnPage (${checks} checks)`);
process.exit(0);
