/**
 * The Log page has the same text size control as the input form (minus, a percentage, plus), drawn in the top
 * bar's slot, sharing the form's saved size. 78% changes nothing; any other size zooms the Log page evenly
 * (size / 78) and the control itself, outside the page, never scales. Mounted for real in jsdom.
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  HTMLAnchorElement: window.HTMLAnchorElement,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  Blob: window.Blob,
  FileReader: window.FileReader,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
Object.defineProperty(globalThis, "localStorage", { value: window.localStorage, configurable: true });
globalThis.fetch = async () => ({ json: async () => ({}) });

const out = await build({
  stdin: {
    contents: `
      import React, { act } from "react";
      import { createRoot } from "react-dom/client";
      import LogPage from "./src/LogPage.jsx";
      export { React, act, createRoot, LogPage };
    `,
    resolveDir: root,
    sourcefile: "log-text-size-entry.jsx",
    loader: "jsx",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "silent",
});
const dir = mkdtempSync(path.join(tmpdir(), "primus-log-text-size-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, out.outputFiles[0].text);
const { React, act, createRoot, LogPage } = await import(pathToFileURL(file).href);
const h = React.createElement;

const props = {
  rows: [],
  unlockedDepartment: "CIA",
  currentUser: { role: "ADMIN", email: "asha@x.com", team: "CIA" },
  onRefresh() {},
  onDeleteAll() {},
  onCleanupUntouched() {},
  onDeleteRow() {},
  onOpen() {},
};

async function mount({ withSlot = true } = {}) {
  document.body.innerHTML = "";
  if (withSlot) {
    const slot = document.createElement("div");
    slot.id = "primus-masthead-slot";
    document.body.appendChild(slot);
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const rootNode = createRoot(host);
  await act(async () => {
    rootNode.render(h(LogPage, props));
  });
  return {
    host,
    slot: document.getElementById("primus-masthead-slot"),
    async unmount() {
      await act(async () => rootNode.unmount());
    },
  };
}
const click = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })); });
const page = () => document.querySelector("main.log-page");
const plus = () => document.querySelector('button[aria-label="Increase text size"]');
const minus = () => document.querySelector('button[aria-label="Decrease text size"]');
const pct = () => document.querySelector('[data-testid="text-size-value"]').textContent.trim();

window.localStorage.clear();
let m = await mount();

await check("the Log page shows the control in the top bar's slot, starting at 78%", () => {
  assert.ok(m.slot.querySelector('[data-testid="text-size-control"]'), "control is in the masthead slot");
  assert.equal(pct(), "78%");
  assert.ok(plus() && minus());
});

await check("at 78% nothing changes: no zoom on the page", () => {
  const zoom = page().style.zoom;
  assert.ok(zoom === "" || zoom === undefined, `zoom is ${JSON.stringify(zoom)}`);
});

await check("the control sits outside the zoomed page, so it never shrinks", () => {
  assert.equal(page().querySelector('[data-testid="text-size-control"]'), null);
});

await check("pressing minus zooms the page by size / 78 and remembers it for the form", async () => {
  await click(minus());
  assert.equal(pct(), "75%");
  assert.ok(Math.abs(Number(page().style.zoom) - 75 / 78) < 1e-6, `zoom ${page().style.zoom}`);
  assert.equal(page().getAttribute("data-text-scale"), "75");
  assert.equal(window.localStorage.getItem("primus.textSizePct"), "75");
});

await check("pressing plus past the default zooms the page bigger", async () => {
  await click(plus());
  assert.equal(pct(), "80%");
  assert.ok(Number(page().style.zoom) > 1);
});

await check("the percentage button resets to 78% and the page is back to normal", async () => {
  await click(document.querySelector('[data-testid="text-size-reset"]'));
  assert.equal(pct(), "78%");
  const zoom = page().style.zoom;
  assert.ok(zoom === "" || zoom === undefined, `zoom is ${JSON.stringify(zoom)}`);
});

await check("a size saved from the form (60%) is used when the Log opens", async () => {
  await m.unmount();
  window.localStorage.setItem("primus.textSizePct", "60");
  m = await mount();
  assert.equal(pct(), "60%");
  assert.ok(Math.abs(Number(page().style.zoom) - 60 / 78) < 1e-6);
});

await check("the control still works at 1% and 100%, and plus is disabled only at 100%", async () => {
  window.localStorage.setItem("primus.textSizePct", "1");
  await m.unmount();
  m = await mount();
  assert.equal(pct(), "1%");
  assert.equal(minus().disabled, true);
  assert.equal(plus().disabled, false);
  window.localStorage.setItem("primus.textSizePct", "100");
  await m.unmount();
  m = await mount();
  assert.equal(pct(), "100%");
  assert.equal(plus().disabled, true);
});

await check("leaving the Log removes the control from the top bar", async () => {
  await m.unmount();
  assert.equal(document.querySelector('[data-testid="text-size-control"]'), null);
});

await check("with no top bar (tests), the control is still drawn on the page", async () => {
  window.localStorage.clear();
  m = await mount({ withSlot: false });
  assert.ok(document.querySelector('[data-testid="text-size-control"]'));
  await m.unmount();
});

await check("source: the Log page uses the shared control and the top-bar slot", () => {
  const src = read("src/LogPage.jsx");
  assert.match(src, /import TextSizeControl\b/);
  assert.match(src, /primus-masthead-slot/);
  assert.match(src, /createPortal\(textSizeControl, headerSlot\)/);
});

await check("source: the Stats page uses the same shared control and top-bar slot", () => {
  const src = read("src/StatsPage.jsx");
  assert.match(src, /import TextSizeControl\b/);
  assert.match(src, /primus-masthead-slot/);
  assert.match(src, /createPortal\(textSizeControl, headerSlot\)/);
});

console.log(`PASS testTextSizeLog — ${checks} checks`);
process.exit(0);
