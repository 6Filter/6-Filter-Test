/**
 * Part 150 — placeholder answers are refused, the AI never suggests a placeholder or what is already there, the
 * improvement panel never says "replace X with X", and the Submit bar, the Why panel and the Submit press agree.
 *
 * Part 1 is pure (the guard, the suggestion filter, the bar line, the shared lists, the improvement wording).
 * Part 2 mounts the real PropositionForm in jsdom.
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

const { answerProblem, sanitizeSuggestion, submitBarSummary, isPlaceholderAnswer } = await import("../lib/answerGuard.js");
const { invalidIssuesForDoc } = await import("../lib/f1Research.js");
const { reviewInputs } = await import("../lib/inputReview.js");
const { submitProblems, submitBarLine, unconfirmedAiTexts } = await import("../lib/fieldRoleDisplay.js");
const { instructionIsCircular, PLAIN_BENCHMARK_INSTRUCTION } = await import("../lib/answerGuard.js");


// ───────────── Part 1 — pure ─────────────
const PLACEHOLDERS = [
  "No benchmark available currently", "No direct competitor found", "There is no benchmark", "Not applicable", "TBD",
  "unknown", "nil", "None", "N/A", "no benchmark", "NO BENCHMARK AVAILABLE", "Not available", "No data", "To be decided",
  "We have no competitor", "Cannot find any competitor", "-", "...",
];
const REAL = [
  "No palm oil, made with rice bran oil",
  "Not available in metros today, so we grow by penetration of tier-2 towns",
  "No added sugar",
  "Nothing else on the shelf cools the scalp for six hours, tested in 40 homes",
  "Cooling that lasts longer than the benchmark",
];

await check("D135 every placeholder phrase is refused for the benchmark, attribute, gap derivation and growth argument", () => {
  for (const field of ["benchmark", "declaredAttribute", "gapDerivation", "growthArgument"]) {
    for (const text of PLACEHOLDERS) {
      const message = answerProblem(field, text);
      assert.ok(message, `${field}: "${text}" should be refused`);
    }
  }
});

await check("D135 real sentences are never refused, even when they contain no / not available", () => {
  for (const field of ["benchmark", "declaredAttribute", "gapDerivation", "growthArgument", "parityExceptions"]) {
    for (const text of REAL) assert.equal(answerProblem(field, text), null, `${field}: "${text}"`);
  }
  assert.equal(answerProblem("f1.benchmark", "Parachute Advansed Cooling 100 ml"), null);
});

await check("D135 parity may say none, no exceptions or nil — nothing else of that kind", () => {
  for (const text of ["none", "None", "NIL", "no exceptions", "No exceptions.", "N/A", "“none”"]) {
    assert.equal(answerProblem("parityExceptions", text), null, text);
  }
  for (const text of ["TBD", "unknown", "No benchmark available currently"]) {
    assert.ok(answerProblem("parityExceptions", text), text);
  }
});

await check("D135 case, punctuation and curly quotes do not matter; the message names the field and the parity rule", () => {
  for (const text of ["  “None”  ", "none.", "NONE!!", "‘n/a’", "No Benchmark Available, Currently."]) {
    assert.ok(answerProblem("gapDerivation", text), text);
  }
  const m = answerProblem("gapDerivation", "None");
  assert.match(m, /Gap derivation/);
  assert.match(m, /only for parity/);
  assert.match(answerProblem("benchmark", "No benchmark available currently"), /Benchmark/);
});

await check("D135 only short phrases count: a long sentence that begins like a placeholder is a real answer", () => {
  const long = "No direct competitor found in the cooling oil aisle but the closest is a bigger coconut oil brand";
  assert.ok(long.split(/\s+/).length > 8);
  assert.equal(answerProblem("benchmark", long), null);
  assert.equal(isPlaceholderAnswer(long), false);
});

await check("D135 the input review (live form, Submit gate and server) refuses them, so invalidIssuesForDoc does too", () => {
  const doc = { f1: { benchmark: "No benchmark available currently", gapDerivation: "None", parityExceptions: "none", growthArgument: REAL[1] } };
  const issues = invalidIssuesForDoc(doc);
  assert.ok(issues.benchmark && issues.gapDerivation, "benchmark and gap derivation refused");
  assert.equal(issues.parityExceptions, undefined, "parity none is a real answer");
  assert.equal(issues.growthArgument, undefined, "a real sentence is kept");
  assert.match(issues.gapDerivation.message, /only for parity/);
  assert.equal(reviewInputs(doc).blocking, true);
});

await check("D136 a suggestion that is a placeholder, or equals the text already there, is never offered", () => {
  assert.equal(sanitizeSuggestion({ field: "benchmark", suggested: "No benchmark available currently", current: "" }), null);
  assert.equal(sanitizeSuggestion({ field: "benchmark", suggested: "Brand X Cooling 100 ml", current: " brand x cooling 100 ML. " }), null);
  assert.equal(sanitizeSuggestion({ field: "benchmark", suggested: "Brand X Cooling 100 ml", current: "No benchmark available currently" }), "Brand X Cooling 100 ml");
  assert.equal(sanitizeSuggestion({ field: "gapDerivation", suggested: "None", current: "" }), null);
  assert.equal(sanitizeSuggestion({ field: "f1.growthArgument", suggested: REAL[1], current: "" }), REAL[1]);
  assert.equal(sanitizeSuggestion({ field: "benchmark", suggested: null, current: "x" }), null);
});

await check("D137 the improvement panel never says replace X with X", () => {
  assert.equal(instructionIsCircular('Replace "No benchmark available currently" with a closer competitor in the same category', "No benchmark available currently"), true);
  assert.equal(instructionIsCircular("Name one of the competitors found (for example Brand X) instead of claiming first-mover", "brand x."), true);
  assert.equal(instructionIsCircular('Replace "Brand X" with a closer competitor in the same category', "Brand X"), false, "a real but weak benchmark still gets the real advice");
  assert.equal(PLAIN_BENCHMARK_INSTRUCTION, "Name the closest competitor you know in the same category and pack size");
});

await check("D138 the bar says Ready only when nothing blocks; counts and names what does; shortens long lists", () => {
  assert.equal(submitBarSummary({}), "Ready to submit.");
  assert.equal(submitBarSummary({ requiredEmpty: [{ label: "a" }] }), "1 required box left before you can submit.");
  assert.equal(submitBarSummary({ requiredEmpty: [{ label: "a" }, { label: "b" }, { label: "c" }] }), "3 required boxes left before you can submit.");
  const two = submitBarSummary({ invalid: [{ label: "Benchmark" }, { label: "Gap derivation" }] });
  assert.match(two, /2 answers to fix/);
  assert.match(two, /Benchmark, Gap derivation/);
  assert.doesNotMatch(two, /Ready/);
  const long = submitBarSummary({ invalid: ["a", "b", "c", "d", "e"].map((label) => ({ label })) });
  assert.match(long, /a, b, c and 2 more/);
  assert.match(submitBarSummary({ unconfirmed: [{ label: "Gap derivation" }] }), /1 AI-written text to confirm or edit: Gap derivation/);
  assert.doesNotMatch(submitBarSummary({ unconfirmed: ["x"] }), /Ready/);
});

await check("D138 the bar and the Why panel read the same three lists: invalid answers and AI text nobody confirmed", () => {
  const doc = {
    name: "Cooling oil",
    f1: { benchmark: "No benchmark available currently", gapDerivation: "AI wrote this sentence about cooling.", growthArgument: REAL[1] },
    researchFindings: { autofillStatus: { "f1.gapDerivation": { aiSuggested: "AI wrote this sentence about cooling." } } },
  };
  const p = submitProblems(doc);
  assert.deepEqual(p.invalid.map((x) => x.label), ["Benchmark"]);
  assert.deepEqual(unconfirmedAiTexts(doc).map((x) => x.label), ["Gap derivation"]);
  assert.equal(submitBarLine(doc), submitBarSummary(p));
  // Edited or confirmed text is no longer pending.
  const edited = { ...doc, f1: { ...doc.f1, gapDerivation: "Cools longer than the benchmark, tested in 40 homes." } };
  assert.deepEqual(unconfirmedAiTexts(edited), []);
  const confirmed = { ...doc, researchFindings: { autofillStatus: { "f1.gapDerivation": { aiSuggested: doc.f1.gapDerivation, confirmed: true } } } };
  assert.deepEqual(unconfirmedAiTexts(confirmed), []);
  // With only empty required boxes the line is unchanged.
  assert.equal(submitBarLine({}), "12 required boxes left before you can submit.");
});

// ───────────── Part 2 — the real form ─────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
window.innerWidth = 1200;
window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
window.fetch = globalThis.fetch;

const out = await build({
  stdin: {
    contents: `
      import React, { act } from "react";
      import { createRoot } from "react-dom/client";
      import PropositionForm from "./src/PropositionForm.jsx";
      export { React, act, createRoot, PropositionForm };
    `,
    resolveDir: root,
    sourcefile: "part150-entry.jsx",
    loader: "jsx",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  loader: { ".png": "dataurl", ".svg": "dataurl", ".css": "empty" },
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "silent",
});
const dir = mkdtempSync(path.join(tmpdir(), "primus-part150-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, out.outputFiles[0].text);
const { React, act, createRoot, PropositionForm } = await import(pathToFileURL(file).href);
const h = React.createElement;

const user = { id: "u1", name: "Asha Rao", email: "asha@example.com", team: "Marketing", department: "Marketing" };
function idea(over = {}) {
  return {
    id: "p150-1",
    name: "Cooling hair oil",
    category: "Hair oils",
    ideaDescription: "A light hair oil with menthol and amla that cools the scalp in summer.",
    f1: {
      declaredAttribute: "Cools the scalp for hours",
      benchmark: "No benchmark available currently",
      declaredGap: 3,
      gapDerivation: "None",
      parityExceptions: "none",
      growthRoute: "penetration",
      growthArgument: "Summer sales lift pulls new buyers into the brand.",
    },
    f2: { grammage: "100 ml", gstRatePct: 18 },
    ...over,
  };
}
const saves = [];
async function mount(initial) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const rootNode = createRoot(host);
  const props = {
    initial,
    onSave: async (doc) => {
      saves.push(doc);
      return { proposition: { ...doc, version: 2, updatedAt: new Date().toISOString() }, status: 200 };
    },
    onSaveDraft: async () => {},
    onUnsavedChange: () => {},
    saving: false,
    savedFlash: false,
    error: "",
    currentUser: user,
    onProcessingChange: () => {},
  };
  await act(async () => rootNode.render(h(PropositionForm, props)));
  const api = {
    host,
    q: (sel) => host.querySelector(sel),
    qa: (sel) => [...host.querySelectorAll(sel)],
    text: () => host.textContent.replace(/\s+/g, " "),
    async unmount() {
      await act(async () => rootNode.unmount());
      host.remove();
    },
  };
  return api;
}
const settle = (ms = 40) => act(async () => new Promise((r) => setTimeout(r, ms)));
async function click(el) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}
async function typeInto(el, value) {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
const submitButton = (m) => m.qa('[data-testid="submit-bar"] button').find((b) => /^Submit/i.test(b.textContent.trim()));

const m = await mount(idea());
await settle();

await check("(a) with two invalid answers the bar line equals the helper's output, and the Why panel lists the same two", async () => {
  const bar = m.q('[data-testid="submit-bar-message"]').textContent.trim();
  const expected = submitBarSummary({ invalid: [{ label: "Benchmark" }, { label: "Gap derivation" }] });
  assert.equal(bar, expected);
  assert.doesNotMatch(bar, /Ready to submit/);
  await click(m.q('[data-testid="why-cant-submit"]'));
  const rows = m.qa('[data-testid="why-blocked-panel"] li').map((li) => li.textContent);
  const invalidRows = rows.filter((r) => /is not an answer/.test(r));
  assert.equal(invalidRows.length, 2, rows.join(" | "));
  assert.ok(invalidRows.some((r) => /^Benchmark:/.test(r)) && invalidRows.some((r) => /^Gap derivation:/.test(r)));
  await click(m.qa('[data-testid="why-blocked-panel"] button').find((b) => /Close/.test(b.textContent)));
});

await check("(b) pressing Submit while blocked sends no request, focuses the first invalid box and shows its message beside it", async () => {
  const before = saves.length;
  await click(submitButton(m));
  await settle();
  assert.equal(saves.length, before, "no request was sent");
  const active = window.document.activeElement;
  assert.equal(active?.getAttribute?.("data-field"), "f1.benchmark", `focused ${active?.id || active?.tagName}`);
  const wrap = active.closest(".prop-field-wrap") || active.closest(".prop-field")?.parentElement;
  assert.ok(wrap, "the box has a wrapper");
  assert.match(wrap.textContent, /Benchmark: “No benchmark available currently” is not an answer/, "its message is beside it");
});

await check("D140 under the box, while it is empty or refused, the rule is said before the mistake", () => {
  const hints = m.qa('[data-testid="rule-hint"]').map((e) => e.getAttribute("data-rule-hint"));
  assert.ok(hints.includes("f1.benchmark") && hints.includes("f1.gapDerivation"), hints.join(","));
  assert.ok(!hints.includes("f1.growthArgument"), "a real growth argument shows no rule");
  assert.equal(m.q('[data-testid="rule-hint"]').textContent, "Write a sentence. “None” is accepted only for parity.");
});

await check("(c) after the answers are corrected the same press sends the request and returns 200", async () => {
  await typeInto(m.q('[data-field="f1.benchmark"]'), "Parachute Advansed Cooling 100 ml");
  await typeInto(m.q('[data-field="f1.gapDerivation"]'), "A cooling feel that lasts longer than the benchmark");
  await settle();
  assert.equal(m.q('[data-testid="submit-bar-message"]').textContent.trim(), "Ready to submit.");
  assert.equal(m.q('[data-testid="why-cant-submit"]'), null, "no blocked-button left");
  const before = saves.length;
  await click(submitButton(m));
  await settle(80);
  assert.equal(saves.length, before + 1, "the request was sent");
  assert.equal(saves.at(-1).f1.benchmark, "Parachute Advansed Cooling 100 ml");
});
await m.unmount();

await check("(d) an AI suggestion equal to the current text is not shown; a placeholder suggestion is replaced by one plain line", async () => {
  const same = await mount(
    idea({
      f1: { ...idea().f1, benchmark: "Brand X Cooling 100 ml", gapDerivation: "Cools longer than the benchmark in tests." },
      suggestions: { f1: { benchmark: "Brand X Cooling 100 ml" } },
    })
  );
  await settle();
  assert.equal(same.qa(".ai-suggestion-chip").filter((c) => /Brand X Cooling/.test(c.textContent)).length, 0, "identical suggestion hidden");
  assert.equal(same.q('[data-testid="no-suggestion"]'), null, "and no 'no suggestion' line either: the answer is already there");
  await same.unmount();

  const placeholder = await mount(
    idea({ f1: { ...idea().f1, benchmark: "", gapDerivation: "Cools longer than the benchmark in tests." }, suggestions: { f1: { benchmark: "No benchmark available currently" } } })
  );
  await settle();
  assert.equal(placeholder.qa(".ai-suggestion-chip").filter((c) => /No benchmark available/.test(c.textContent)).length, 0, "placeholder never offered");
  assert.equal(placeholder.q('[data-field="f1.benchmark"]').value, "", "and never written into the empty box");
  assert.equal(placeholder.q('[data-testid="no-suggestion"]')?.textContent, "No suggestion found: name the closest competitor you know");
  await placeholder.unmount();
});

await check("source: the suggestion filter runs on the server (first pass, concept card) and the bar uses one helper", () => {
  const read = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
  assert.match(read("lib/propositionAiFirstPass.js"), /sanitizeSuggestion\(\{ field: key, suggested: suggestions\.f1\[key\]/);
  assert.match(read("lib/propositionsApi.js"), /sanitizeSuggestion\(\{ field: "benchmark"/);
  assert.match(read("src/PropositionForm.jsx"), /\{submitBarLine\(doc\)\}/);
  assert.doesNotMatch(read("src/PropositionForm.jsx"), /submitBarMessageTwoLabels/);
});

console.log(`PASS Part 150 placeholder answers and the Submit bar (${checks} checks)`);
process.exit(0);
