/**
 * Part 145 D105–D109 — the short input form, mounted for real (jsdom, real React, the real PropositionForm)
 * at a phone width. Checks what a person actually sees, then the source for what must not come back.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

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

// ───────────── mount the real form at 360 px ─────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
window.innerWidth = 360;
window.matchMedia = window.matchMedia || ((q) => ({ matches: /max-width/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
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

const entry = `
  import React, { act } from "react";
  import { createRoot } from "react-dom/client";
  import PropositionForm from "./src/PropositionForm.jsx";
  export { React, act, createRoot, PropositionForm };
`;
const out = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: "short-form-entry.jsx", loader: "jsx" },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  loader: { ".png": "dataurl", ".svg": "dataurl", ".css": "empty" },
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "silent",
});
const dir = mkdtempSync(path.join(tmpdir(), "primus-short-form-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, out.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href);
const { React, act, createRoot, PropositionForm } = mod;
const h = React.createElement;

async function mount(props) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const rootNode = createRoot(host);
  await act(async () => {
    rootNode.render(h(PropositionForm, props));
  });
  return {
    host,
    async rerender(next) {
      await act(async () => rootNode.render(h(PropositionForm, next)));
    },
    async unmount() {
      await act(async () => rootNode.unmount());
      host.remove();
    },
  };
}
async function click(el) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

const user = { id: "u1", name: "Asha Rao", email: "asha@example.com", team: "Marketing", department: "Marketing" };
const props = {
  initial: { id: "short-1", name: "", category: "", ideaDescription: "" },
  onSave: async () => {},
  onSaveDraft: async () => {},
  onUnsavedChange: () => {},
  saving: false,
  savedFlash: false,
  error: "",
  currentUser: user,
  onProcessingChange: () => {},
};

const m = await mount(props);
const text = () => m.host.textContent.replace(/\s+/g, " ");
const q = (sel) => m.host.querySelector(sel);
const qa = (sel) => [...m.host.querySelectorAll(sel)];

// ───────────── D105 name and team are not boxes ─────────────
await check("D105 no Your name box; the team shows as a chip with a Change button", () => {
  assert.equal(q('[data-field="submitterName"]'), null, "no name box");
  assert.doesNotMatch(text(), /Your name/);
  const chip = q('[data-testid="team-chip"]');
  assert.ok(chip, "team chip");
  assert.match(chip.textContent, /Marketing/);
  assert.ok(q('[data-testid="team-change"]'), "Change button");
  assert.equal(q('[data-testid="team-select"]'), null, "the picker stays closed until Change is pressed");
});

await check("D105 the Change button opens the team picker", async () => {
  await click(q('[data-testid="team-change"]'));
  assert.ok(q('[data-testid="team-select"]'), "picker open");
});

// ───────────── the twelve typed Required boxes ─────────────
await check("D105 the typed Required boxes are exactly the twelve (Filter 2 opened with its header)", async () => {
  for (const header of qa('[data-filter-open="no"] .prop-filter-h')) await click(header);
  const required = new Set(qa('[data-role="required"][data-role-for]').map((b) => b.getAttribute("data-role-for")));
  const want = [
    "name", "category", "ideaDescription",
    "f1.declaredAttribute", "f1.benchmark", "f1.declaredGap", "f1.gapDerivation", "f1.parityExceptions",
    "f1.growthRoute", "f1.growthArgument", "f2.grammage", "f2.gstRatePct",
  ];
  assert.deepEqual([...required].sort(), want.sort());
});

// ───────────── D108 what is gone ─────────────
await check("D108 the removed boxes and loose text are not on the form", () => {
  for (const path of ["f1.evidenceSourceDate", "f1.targetConsumer", "f1.pureCommodity", "f2.qcomTrajectory", "f2.financeSigned", "f3.plannedAnnualIncreasePct"]) {
    assert.equal(q(`[data-field="${path}"]`), null, `${path} is not a box`);
    assert.equal(q(`[data-role-for="${path}"]`), null, `${path} has no badge`);
  }
  for (const gone of [
    /Evidence source/i,
    /Upload source file/i,
    /Who is this for/i,
    /Pure commodity/i,
    /Quick-commerce/i,
    /Finance sign-?off/i,
    /Three fields\. Research fills the rest/,
    /One idea or many/,
    /Optional\. Read on Submit/,
    /Opens once the idea reads GO/,
    /Opens together with Filter 5/,
    /Submit for a GO read, or request manager review/,
    /Upload concept card/,
  ]) {
    assert.doesNotMatch(text(), gone, String(gone));
  }
  assert.equal(q(".teaser-card"), null, "no empty Filter 5 / Filter 6 cards before the proof stage");
});

// ───────────── D107 one upload ─────────────
await check("D107 one upload, and the template link sits inside it", () => {
  const uploads = qa('[data-testid="import-upload"]');
  assert.equal(uploads.length, 1, "one upload button");
  assert.match(uploads[0].textContent, /Upload your idea/);
  assert.ok(q('[data-testid="import-template-link"]'));
  assert.equal(qa('input[type="file"]').filter((i) => !/import/.test(i.getAttribute("data-testid") || "")).length, 0, "no other file input");
});

// ───────────── D106 cost and margin ─────────────
await check("D106 cost, margin and MRP sit behind 'Adjust cost and margin' and open on press", async () => {
  const btn = q('[data-testid="adjust-cost-margin"]');
  assert.ok(btn, "button present");
  for (const path of ["f2.cogsAtScale", "f2.netMarginAtScale", "f2.mrpInr"]) {
    assert.equal(q(`[data-field="${path}"]`), null, `${path} hidden at first`);
  }
  await click(btn);
  const opened = ["f2.cogsAtScale", "f2.netMarginAtScale"].filter((p) => q(`[data-field="${p}"]`));
  assert.equal(opened.length, 2, "COGS and net margin show after the press");
  assert.equal(q('[data-field="f2.cogsAtScale"] [data-role="required"]'), null, "never Required");
});

// ───────────── D109 parity tick ─────────────
await check("D109 parity is one Required tick; unticked opens the box; ticked hides it", async () => {
  const tickWrap = q('[data-testid="parity-tick"]');
  assert.ok(tickWrap, "tick present");
  assert.match(tickWrap.textContent, /Parity or better on the remaining attributes/);
  const box = () => q('textarea[data-field="f1.parityExceptions"], input[data-field="f1.parityExceptions"], [data-field="f1.parityExceptions"] textarea');
  assert.equal(box(), null, "unanswered shows no box");
  const tick = tickWrap.querySelector('input[type="checkbox"]');
  await click(tick);
  assert.equal(tick.checked, true, "ticked");
  assert.equal(box(), null, "ticked shows no box");
  await click(tick);
  assert.equal(tick.checked, false, "unticked");
  assert.ok(box() || q('[data-field="f1.parityExceptions"]'), "unticked opens the exceptions box");
});

await check("D109 existing parity text opens with the tick off and the text showing", async () => {
  await m.unmount();
  const withText = await mount({
    ...props,
    initial: { id: "short-2", name: "Oil", category: "Hair oils", ideaDescription: "x", f1: { parityExceptions: "Fragrance may be weaker" } },
  });
  const tick = withText.host.querySelector('[data-testid="parity-tick"] input[type="checkbox"]');
  assert.equal(tick.checked, false, "tick off");
  assert.match(withText.host.innerHTML + [...withText.host.querySelectorAll("textarea,input")].map((e) => e.value).join("|"), /Fragrance may be weaker/);
  await withText.unmount();
});

await check("D109 a stored 'none' opens with the tick on", async () => {
  const done = await mount({
    ...props,
    initial: { id: "short-3", name: "Oil", category: "Hair oils", ideaDescription: "x", f1: { parityExceptions: "none" } },
  });
  const tick = done.host.querySelector('[data-testid="parity-tick"] input[type="checkbox"]');
  assert.equal(tick.checked, true);
  await done.unmount();
});

// ───────────── phone width ─────────────
await check("phone width: the form's own CSS wraps rows and keeps tap targets", () => {
  const form = read("src/PropositionForm.jsx");
  assert.match(form, /@media \(max-width:760px\)/);
  assert.match(form, /\.prop-label\{[^}]*flex-wrap:wrap/s);
  assert.match(form, /\.team-chip/);
  assert.match(form, /\.cost-adjust-row|adjust-cost-margin/);
  assert.equal(window.innerWidth, 360);
});

// ───────────── source: what must not come back ─────────────
await check("source: no concept-card handler, teaser card, name box or finance tick on the form", () => {
  const form = read("src/PropositionForm.jsx");
  for (const gone of [/handleConceptCardFile/, /FilterTeaserCard/, /Upload concept card/, /unlockHint/, /hasSubmitterIdentity/]) {
    assert.doesNotMatch(form, gone, String(gone));
  }
  assert.match(form, /data-testid="finance-signoff"/, "the Finance tick lives in the manager review panel");
  assert.ok(form.indexOf('data-testid="finance-signoff"') > form.indexOf("function ManagerReviewPanel"), "inside ManagerReviewPanel");
});

console.log(`PASS testShortForm — ${checks} checks`);
process.exit(0);
