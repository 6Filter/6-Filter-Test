/**
 * Part 146 — the form page with the text size control, mounted for real (jsdom, real React, the real
 * PropositionForm) at a phone width: the control is there, the presets are gone, the page scales and the
 * control does not, and the control stays pressable at every percentage from 1 to 100.
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
Object.defineProperty(globalThis, "localStorage", { value: window.localStorage, configurable: true });
globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
window.fetch = globalThis.fetch;

const entry = `
  import React, { act } from "react";
  import { createRoot } from "react-dom/client";
  import PropositionForm, { PROP_CSS } from "./src/PropositionForm.jsx";
  export { React, act, createRoot, PropositionForm, PROP_CSS };
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
window.localStorage.clear();
const m = await mount({
  initial: { id: "ts-1", name: "", category: "", ideaDescription: "" },
  onSave: async () => {},
  onSaveDraft: async () => {},
  onUnsavedChange: () => {},
  saving: false,
  savedFlash: false,
  error: "",
  currentUser: user,
  onProcessingChange: () => {},
});
const q = (sel) => m.host.querySelector(sel);
const control = () => q('[data-testid="text-size-control"]');
const target = () => q("[data-text-scale-target]");
const plus = () => q('button[aria-label="Increase text size"]');
const minus = () => q('button[aria-label="Decrease text size"]');
const visibleText = () => {
  const clone = m.host.cloneNode(true);
  clone.querySelectorAll("style").forEach((s) => s.remove());
  return clone.textContent.replace(/\s+/g, " ");
};
const pct = () => q('[data-testid="text-size-value"]').textContent.trim();

await check("the form page shows the control, and none of Compact, Comfortable, Large or View size", () => {
  assert.ok(control(), "control present");
  assert.doesNotMatch(visibleText(), /Compact|Comfortable|Large|View size/);
  assert.equal(q('[data-testid="form-zoom-out"]'), null);
  assert.equal(q(".prop-form-zoom-bar"), null);
  assert.equal(pct(), "78%", "starts at the old Compact, so nothing looks different");
});

await check("the page content is the scaled wrapper; the control is outside it", () => {
  assert.ok(target(), "wrapper marked data-text-scale-target");
  assert.equal(target().getAttribute("data-text-scale"), "78");
  assert.equal(target().style.getPropertyValue("--text-scale"), "0.78");
  assert.equal(control().closest("[data-text-scale-target]"), null);
  assert.ok(target().querySelector(".prop-form-shell"), "the form itself is inside");
  assert.ok(target().querySelector('[data-testid="team-chip"]'), "page content is inside");
});

await check("a press scales the page wrapper, not the control", async () => {
  await click(plus());
  assert.equal(pct(), "80%");
  assert.equal(target().getAttribute("data-text-scale"), "80");
  assert.equal(target().style.getPropertyValue("--text-scale"), "0.8");
  assert.equal(control().hasAttribute("data-text-scale"), false);
  assert.equal(window.localStorage.getItem("primus.textSizePct"), "80");
});

await check("the control stays pressable at every percentage from 1 to 100 (and never reads the scale)", async () => {
  const shiftClick = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true })); });
  let guard = 0;
  while (!minus().disabled && guard < 200) { await shiftClick(minus()); guard += 1; }
  assert.equal(pct(), "1%");
  assert.equal(target().style.getPropertyValue("--text-scale"), "0.01");
  for (let want = 1; want <= 100; want += 1) {
    assert.equal(pct(), `${want}%`);
    assert.equal(target().getAttribute("data-text-scale"), String(want));
    assert.equal(plus().disabled, want === 100, `plus at ${want}%`);
    assert.equal(minus().disabled, want === 1, `minus at ${want}%`);
    assert.ok(control().closest("[data-text-scale-target]") === null);
    if (want < 100) await shiftClick(plus());
  }
});

await check("phone width: the control fits (three buttons, 44 px targets, wraps instead of overflowing)", () => {
  assert.equal(window.innerWidth, 360);
  const css = read("src/TextSizeControl.jsx");
  assert.match(css, /min-width:44px;min-height:44px;height:44px/);
  assert.match(css, /max-width:100%/);
  // 44 + 64 + 44 of buttons, two 6px gaps, 4px padding each side, 1px border each side
  const widest = 44 + 64 + 44 + 2 * 6 + 2 * 4 + 2;
  assert.ok(widest <= 320, `the control needs ${widest}px, less than the narrowest phone`);
  assert.doesNotMatch(css.slice(css.indexOf("export const TEXT_SIZE_CSS")), /--ts|--text-scale|var\(--fs-/);
});

await check("the form's CSS reads the scale: every text size is a multiple of --ts / --text-scale", async () => {
  const { PROP_CSS } = mod;
  assert.ok(PROP_CSS, "PROP_CSS available");
  assert.match(PROP_CSS, /--ts:calc\(var\(--text-scale\) \/ \.78\)/);
  for (const v of ["--fs-section", "--fs-label", "--fs-input", "--fs-placeholder", "--fs-badge", "--fs-status"]) {
    assert.match(PROP_CSS, new RegExp(`${v}:calc\\(\\d+(\\.\\d+)?px \\* var\\(--ts\\)\\)`), v);
  }
  const bare = PROP_CSS.match(/font-size:\s*[0-9.]+px/g) || [];
  assert.deepEqual(bare, [], "no fixed-pixel font sizes left in the form's CSS");
  assert.doesNotMatch(PROP_CSS, /data-form-zoom|form-zoom-chip|prop-form-zoom-bar/, "the preset CSS is gone");
});

await check("source: the preset code is gone from the form", () => {
  const form = read("src/PropositionForm.jsx");
  for (const gone of [/FORM_ZOOM/, /formZoom/, /readFormZoom/, /setFormZoomLevel/, /View size/, /form-zoom/]) {
    assert.doesNotMatch(form, gone, String(gone));
  }
  assert.match(form, /<TextSizeControl\b/);
  assert.match(form, /data-text-scale-target/);
  assert.ok(form.indexOf("<TextSizeControl") < form.indexOf("data-text-scale-target"), "control is rendered before, outside, the scaled wrapper");
});

console.log(`PASS testTextSizeForm — ${checks} checks`);
process.exit(0);