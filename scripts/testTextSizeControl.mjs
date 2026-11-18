/**
 * Part 146 — the text size control (minus, percentage, plus; 1% to 100%), mounted for real in jsdom.
 * NOTE: the owner's attached testTextSizeControl.mjs / TextSizeControl.reference.jsx were not on disk when this
 * was built, so this file is the author's equivalent. Replace it with the attached file if you have it.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
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

const out = await build({
  stdin: {
    contents: `
      import React, { act } from "react";
      import { createRoot } from "react-dom/client";
      import TextSizeControl, * as T from "./src/TextSizeControl.jsx";
      export { React, act, createRoot, TextSizeControl, T };
    `,
    resolveDir: root,
    sourcefile: "text-size-entry.jsx",
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
const dir = mkdtempSync(path.join(tmpdir(), "primus-text-size-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, out.outputFiles[0].text);
const { React, act, createRoot, TextSizeControl, T } = await import(pathToFileURL(file).href);
const h = React.createElement;

async function mountPage(props = {}) {
  window.document.body.innerHTML = "";
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const rootNode = createRoot(host);
  await act(async () => {
    // The control is a SIBLING of the scaled page, never inside it.
    rootNode.render(
      h(
        "main",
        null,
        h(TextSizeControl, props),
        h("div", { "data-text-scale-target": true }, h("p", { id: "content" }, "Page text"))
      )
    );
  });
  const q = (sel) => host.querySelector(sel);
  const pctText = () => q('[aria-live="polite"]').textContent.trim();
  const target = () => q("[data-text-scale-target]");
  async function click(el, init = {}) {
    await act(async () => {
      el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
    });
  }
  return {
    host,
    q,
    pctText,
    target,
    click,
    plus: () => q('button[aria-label="Increase text size"]'),
    minus: () => q('button[aria-label="Decrease text size"]'),
    reset: () => q('[data-testid="text-size-reset"]'),
    async unmount() {
      await act(async () => rootNode.unmount());
    },
  };
}

window.localStorage.clear();

await check("no presets: no Compact, Comfortable, Large or View size", async () => {
  const p = await mountPage();
  assert.doesNotMatch(p.host.textContent, /Compact|Comfortable|Large|View size/);
  assert.equal(p.host.querySelectorAll("button").length, 3, "a minus, the percentage and a plus");
  await p.unmount();
});

await check("starts at 78% (the old Compact) and marks the page with data-text-scale and --text-scale", async () => {
  window.localStorage.clear();
  const p = await mountPage();
  assert.equal(p.pctText(), "78%");
  assert.equal(p.target().getAttribute("data-text-scale"), "78");
  assert.equal(p.target().style.getPropertyValue("--text-scale"), "0.78");
  await p.unmount();
});

await check("plus steps to the next multiple of 5 and stops at 100%, where it disables", async () => {
  window.localStorage.clear();
  const p = await mountPage();
  const seen = [];
  for (let i = 0; i < 8; i += 1) {
    if (p.plus().disabled) break;
    await p.click(p.plus());
    seen.push(p.pctText());
  }
  assert.deepEqual(seen, ["80%", "85%", "90%", "95%", "100%"]);
  assert.equal(p.plus().disabled, true);
  assert.equal(p.minus().disabled, false);
  await p.click(p.plus());
  assert.equal(p.pctText(), "100%");
  assert.equal(p.target().style.getPropertyValue("--text-scale"), "1");
  await p.unmount();
});

await check("minus steps down by 5s to 1% and stops, where it disables", async () => {
  window.localStorage.clear();
  const p = await mountPage();
  const seen = [];
  for (let i = 0; i < 30 && !p.minus().disabled; i += 1) {
    await p.click(p.minus());
    seen.push(p.pctText());
  }
  assert.equal(seen[0], "75%");
  assert.deepEqual(seen.slice(-3), ["10%", "5%", "1%"], "5 goes to 1");
  assert.equal(p.minus().disabled, true);
  assert.equal(p.plus().disabled, false);
  assert.equal(p.target().style.getPropertyValue("--text-scale"), "0.01");
  await p.click(p.plus());
  assert.equal(p.pctText(), "5%", "from 1% the plus can always be pressed");
  await p.unmount();
});

await check("Shift moves by exactly 1, and the percentage button resets to 78%", async () => {
  window.localStorage.clear();
  const p = await mountPage();
  await p.click(p.plus(), { shiftKey: true });
  assert.equal(p.pctText(), "79%");
  await p.click(p.minus(), { shiftKey: true });
  await p.click(p.minus(), { shiftKey: true });
  assert.equal(p.pctText(), "77%");
  await p.click(p.plus());
  assert.equal(p.pctText(), "80%");
  await p.click(p.reset());
  assert.equal(p.pctText(), "78%");
  assert.equal(p.target().getAttribute("data-text-scale"), "78");
  await p.unmount();
});

await check("the choice is remembered after a reload (localStorage primus.textSizePct)", async () => {
  window.localStorage.clear();
  let p = await mountPage();
  await p.click(p.plus());
  await p.click(p.plus());
  assert.equal(window.localStorage.getItem("primus.textSizePct"), "85");
  await p.unmount();
  p = await mountPage();
  assert.equal(p.pctText(), "85%");
  assert.equal(p.target().getAttribute("data-text-scale"), "85");
  await p.unmount();
});

await check("bad stored values are safe: missing or text gives 78, 0 or less gives 1, over 100 gives 100, decimals round", async () => {
  const cases = [
    [null, 78], ["", 78], ["abc", 78], ["NaN", 78], ["0", 1], ["-12", 1], ["0.4", 1], ["150", 100], ["100.4", 100],
    ["62.4", 62], ["62.6", 63],
  ];
  for (const [stored, want] of cases) {
    window.localStorage.clear();
    if (stored !== null) window.localStorage.setItem("primus.textSizePct", stored);
    assert.equal(T.readStoredTextSize(), want, `stored ${JSON.stringify(stored)}`);
    const p = await mountPage();
    assert.equal(p.pctText(), `${want}%`, `shown for ${JSON.stringify(stored)}`);
    await p.unmount();
  }
  // storage that throws must not break anything
  const real = window.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } },
    configurable: true,
  });
  const p = await mountPage();
  assert.equal(p.pctText(), "78%");
  await p.click(p.plus());
  assert.equal(p.pctText(), "80%", "still works with storage unavailable");
  await p.unmount();
  Object.defineProperty(globalThis, "localStorage", { value: real, configurable: true });
});

await check("the control sits outside the scaled page and nothing in it reads the scale", async () => {
  window.localStorage.clear();
  const p = await mountPage();
  const control = p.q('[data-testid="text-size-control"]');
  assert.ok(control);
  assert.equal(control.closest("[data-text-scale-target]"), null, "not inside the scaled page");
  assert.ok(p.target().contains(p.q("#content")));
  assert.doesNotMatch(T.TEXT_SIZE_CSS, /text-scale|--ts|var\(--fs-/, "fixed-size text");
  assert.match(T.TEXT_SIZE_CSS, /min-height:44px/);
  assert.match(T.TEXT_SIZE_CSS, /font:600 14px/);
  await p.unmount();
});

await check("real buttons with spoken names; the group and the percentage are labelled; Enter/Space are native", async () => {
  const p = await mountPage();
  const group = p.q('[role="group"]');
  assert.equal(group.getAttribute("aria-label"), "Text size");
  assert.equal(p.minus().tagName, "BUTTON");
  assert.equal(p.minus().getAttribute("type"), "button");
  assert.equal(p.plus().tagName, "BUTTON");
  assert.equal(p.plus().getAttribute("type"), "button");
  assert.equal(p.q('[aria-live="polite"]').textContent.trim(), "78%");
  assert.equal(p.reset().tagName, "BUTTON");
  assert.match(p.reset().getAttribute("aria-label"), /Reset text size/);
  await p.unmount();
});

await check("press and hold repeats; letting go stops it; the echo click does not double-step", async () => {
  window.localStorage.clear();
  const p = await mountPage();
  const fire = (el, type) => act(async () => { el.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true })); });
  await fire(p.plus(), "pointerdown");
  assert.equal(p.pctText(), "80%", "the press itself steps once");
  await p.click(p.plus());
  assert.equal(p.pctText(), "80%", "the click that follows the press is not a second step");
  await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
  const held = Number.parseInt(p.pctText(), 10);
  assert.ok(held >= 90, `holding repeated (at ${held}%)`);
  await fire(p.plus(), "pointerup");
  const after = p.pctText();
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  assert.equal(p.pctText(), after, "no more steps after letting go");
  await p.unmount();
});

await check("the arithmetic: clampTextSize and nextTextSize", () => {
  assert.equal(T.TEXT_SIZE_MIN, 1);
  assert.equal(T.TEXT_SIZE_MAX, 100);
  assert.equal(T.TEXT_SIZE_DEFAULT, 78);
  assert.equal(T.clampTextSize(0), 1);
  assert.equal(T.clampTextSize(-5), 1);
  assert.equal(T.clampTextSize(101), 100);
  assert.equal(T.clampTextSize("55.5"), 56);
  assert.equal(T.clampTextSize(undefined), 78);
  assert.equal(T.clampTextSize("x"), 78);
  const up = [[78, 80], [80, 85], [95, 100], [100, 100], [1, 5], [4, 5], [5, 10]];
  for (const [from, to] of up) assert.equal(T.nextTextSize(from, 1), to, `up from ${from}`);
  const down = [[78, 75], [80, 75], [10, 5], [5, 1], [3, 1], [1, 1], [100, 95]];
  for (const [from, to] of down) assert.equal(T.nextTextSize(from, -1), to, `down from ${from}`);
  assert.equal(T.nextTextSize(78, 1, true), 79);
  assert.equal(T.nextTextSize(78, -1, true), 77);
  assert.equal(T.nextTextSize(1, -1, true), 1);
  assert.equal(T.nextTextSize(100, 1, true), 100);
});

console.log(`PASS testTextSizeControl — ${checks} checks`);
process.exit(0);
