/**
 * Punch list 2.1–2.5 — the old "Replace X with a closer competitor" sentence is gone from every render path of the
 * output page, three more placeholders are refused, advice never points at the hidden Target consumer box, and the
 * form shows Required/Optional on every box with cost and margin behind one button in the cream-and-brown theme.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
async function check(name, fn) {
  try {
    await fn();
    checks += 1;
    console.log(`  ok ${checks} — ${name}`);
  } catch (e) {
    e.message = `${name}: ${e.message}`;
    throw e;
  }
}
const read = (p) => readFileSync(path.join(root, p), "utf8");

const { answerProblem, isPlaceholderAnswer, PLAIN_BENCHMARK_INSTRUCTION } = await import("../lib/answerGuard.js");
const { displayCopy, audienceCopy } = await import("../lib/displayCopy.js");

await check("2.2 the three placeholders are refused as a benchmark; the older ones stay refused", () => {
  for (const t of ["Currently not available", "Currently unavailable", "Benchmark not available", "Not yet identified", "Nothing available", "currently NOT available."]) {
    assert.ok(isPlaceholderAnswer(t), t);
    assert.match(answerProblem("benchmark", t), /is not an answer/, t);
  }
});

await check("2.2 real answers stay accepted", () => {
  for (const t of [
    "No palm oil, made with rice bran oil",
    "Dove, which is available in India",
    "Available in 5 cities through modern trade",
    "Not available in sachets, so we launch sachets first",
    "Parachute Advansed Jasmine, not available below 100 ml",
  ]) assert.equal(answerProblem("benchmark", t), null, t);
});

await check("2.1 displayCopy never says replace X with a closer competitor when X is a placeholder", () => {
  const doc = { f1: { benchmark: "No benchmark available currently" } };
  const old = 'Replace "No benchmark available currently" with a closer competitor in the same category and segment as this idea';
  assert.equal(displayCopy(old, doc), PLAIN_BENCHMARK_INSTRUCTION);
  const para = `The benchmark is weak. ${old}. Gap is 3.`;
  const shown = displayCopy(para, doc);
  assert.doesNotMatch(shown, /No benchmark available currently/);
  assert.match(shown, /Name the closest competitor you know in the same category and pack size/);
  assert.match(shown, /Gap is 3/);
  // A real but weak benchmark keeps the real advice.
  const real = { f1: { benchmark: "Brand X" } };
  assert.equal(displayCopy('Replace "Brand X" with a closer competitor in the same category and segment as this idea', real),
    'Replace "Brand X" with a closer competitor in the same category and segment as this idea');
});

await check("2.3 advice never names the hidden Target consumer box", () => {
  assert.equal(audienceCopy("Clarify who this is for in Target consumer so the route check can be decisive"),
    "Clarify who this is for in your idea description so the route check can be decisive");
  assert.equal(audienceCopy('Growth route "penetration" matches the target consumer'),
    'Growth route "penetration" matches the audience described in your idea');
  assert.doesNotMatch(audienceCopy("A route that matches the owner's definitions for the target consumer earns full credit."), /target consumer/i);
  assert.equal(audienceCopy("Select a growth route"), "Select a growth route");
});

// ───────────── the real pages ─────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
window.innerWidth = 1200;
window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
window.fetch = globalThis.fetch;

const out = await build({
  stdin: {
    contents: `
      import React, { act } from "react";
      import { createRoot } from "react-dom/client";
      import PropositionForm, { GoNoGoResultPage } from "./src/PropositionForm.jsx";
      export { React, act, createRoot, PropositionForm, GoNoGoResultPage };
    `,
    resolveDir: root,
    sourcefile: "punch153-entry.jsx",
    loader: "jsx",
  },
  bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic",
  loader: { ".png": "dataurl", ".svg": "dataurl", ".css": "empty" },
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "silent",
});
const dir = mkdtempSync(path.join(tmpdir(), "primus-punch153-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, out.outputFiles[0].text);
const { React, act, createRoot, PropositionForm, GoNoGoResultPage } = await import(pathToFileURL(file).href);
const h = React.createElement;
const user = { id: "u1", name: "Asha Rao", email: "asha@example.com", team: "Marketing", department: "Marketing" };

const OLD = 'Replace "No benchmark available currently" with a closer competitor in the same category and segment as this idea';
function doc153() {
  return {
    id: "p153-1", name: "Cooling hair oil", category: "Hair oils",
    ideaDescription: "A light hair oil with menthol and amla that cools the scalp in summer, for working women aged 25 to 40.",
    f1: {
      declaredAttribute: "Cools the scalp for hours", benchmark: "No benchmark available currently", declaredGap: 3,
      gapDerivation: "Cools longer than the benchmark in a 40 home test.", parityExceptions: "none",
      growthRoute: "penetration", growthArgument: "Summer sales lift pulls new buyers into the brand.",
    },
    f2: { grammage: "100 ml", gstRatePct: 18 },
  };
}

await check("2.1 the output page prints the old sentence nowhere (list, filter card, narrative, why) and says the plain one", async () => {
  const doc = doc153();
  const checks = {
    f1: {
      checkLabel: "Marked down",
      markedDown: true,
      items: [
        { status: "pending", slot: "benchmark", level: "none", credit: 0, code: "F1_BENCHMARK_NOT_RELEVANT", reasons: ["NOT_RELEVANT"], text: OLD },
        { status: "pending", slot: "route", level: "adequate", credit: 0.5, code: "F1_ROUTE_UNCLEAR", reasons: [], text: 'Growth route "penetration" matches the target consumer' },
      ],
    },
    f2: { checkLabel: "Cleared", items: [{ status: "done", text: "Net margin 52% clears the 50% floor", slot: "margin", credit: 1 }] },
    f3: { checkLabel: "Cleared", items: [{ status: "done", text: "MRP sits inside the safe range", slot: "resilience", credit: 1 }] },
    f4: { checkLabel: "Cleared", items: [] },
  };
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const rootNode = createRoot(host);
  await act(async () =>
    rootNode.render(
      h(GoNoGoResultPage, {
        result: {
          classification: "WATCH",
          score: { pct: 55, total: 18, points: 10, done: 10 },
          rationale: `Cooling hair oil is WATCH at 55%. ${OLD}.`,
          screenedAt: new Date().toISOString(),
          filterNarratives: { f1: `Benchmark is weak. ${OLD}.` },
        },
        advisoryChecks: checks,
        category: "Hair oils",
        ideaName: "Cooling hair oil",
        doc,
        savedDoc: doc,
        onBack() {},
        onSubmit() {},
        saving: false,
        currentUser: user,
        legacyView: false,
        hideFilterCards: false,
      })
    )
  );
  const text = host.textContent.replace(/\s+/g, " ");
  assert.doesNotMatch(text, /Replace\s*[“"]?No benchmark available currently/i, "old sentence still shown");
  assert.doesNotMatch(text, /with a closer competitor in the same category and segment/i);
  assert.match(text, /Name the closest competitor you know in the same category and pack size/);
  assert.doesNotMatch(text, /target consumer/i, "advice still names the hidden box");
  await act(async () => rootNode.unmount());
  host.remove();
});

const emptyDoc = { id: "p153-2", name: "", category: "", ideaDescription: "", f1: {}, f2: {} };
async function mountForm(initial) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const rootNode = createRoot(host);
  await act(async () =>
    rootNode.render(
      h(PropositionForm, {
        initial, onSave: async (d) => ({ proposition: d, status: 200 }), onSaveDraft: async () => {}, onUnsavedChange: () => {},
        saving: false, savedFlash: false, error: "", currentUser: user, onProcessingChange: () => {},
      })
    )
  );
  return { host, q: (s) => host.querySelector(s), qa: (s) => [...host.querySelectorAll(s)], async unmount() { await act(async () => rootNode.unmount()); host.remove(); } };
}
async function click(el) {
  await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })));
}

await check("2.4 every shown box carries Required or Optional, and the twelve Required boxes say Required", async () => {
  const m = await mountForm(emptyDoc);
  for (const header of m.qa('[data-filter-open="no"] .prop-filter-h')) await click(header);
  const required = new Set(m.qa('[data-role="required"][data-role-for]').map((b) => b.getAttribute("data-role-for")));
  const optional = m.qa('[data-role="optional"][data-role-for]');
  assert.ok(required.size >= 10, `Required labels: ${required.size}`);
  assert.ok(optional.length >= 1, "Optional labels");
  for (const p of ["name", "category", "ideaDescription", "f1.benchmark", "f1.gapDerivation", "f2.grammage", "f2.gstRatePct"]) {
    assert.ok(required.has(p), `${p} says Required`);
  }
  assert.match(read("src/FieldRoleBadge.jsx"), /displayRoleKey/);
  await m.unmount();
});

await check("2.5 cost and margin sit behind one Adjust cost and margin button; pack size and GST stay shown", async () => {
  const m = await mountForm(emptyDoc);
  for (const header of m.qa('[data-filter-open="no"] .prop-filter-h')) await click(header);
  const btn = m.q('[data-testid="adjust-cost-margin"]');
  assert.ok(btn, "button");
  for (const p of ["f2.cogsAtScale", "f2.netMarginAtScale", "f2.mrpInr"]) assert.equal(m.q(`[data-field="${p}"]`), null, `${p} hidden`);
  assert.equal(m.qa('[data-ai-fills]').length, 0, "no AI fills this panel before the press");
  assert.ok(m.q('[data-field="f2.grammage"]') || m.q("#fld-f2-grammage"), "pack size shown");
  assert.ok(m.q('[data-field="f2.gstRatePct"]') || m.q("#fld-f2-gstRatePct"), "GST shown");
  await click(btn);
  assert.ok(m.q('[data-field="f2.cogsAtScale"]') && m.q('[data-field="f2.netMarginAtScale"]'), "open on press");
  await m.unmount();
});

await check("2.5 the AI-fills panels use the cream-and-brown theme: no teal anywhere in the form CSS", () => {
  const css = read("src/PropositionForm.jsx");
  assert.doesNotMatch(css, /#2dd4bf|45,\s*212,\s*191|#5eead4|#0f766e|#042f2e/i);
});

console.log(`PASS punch list 153 (${checks} checks)`);
process.exit(0);
