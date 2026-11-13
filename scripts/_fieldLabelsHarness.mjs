/**
 * Shared helper for the Part 139 field-label tests (not a test itself — run-all-tests only runs test*.mjs).
 * Bundles src/FieldRoleBadge.jsx with esbuild and mounts it in jsdom with the real React.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function loadFieldRoleUi() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const entry = `
    import React, { act } from "react";
    import { createRoot } from "react-dom/client";
    export * from "./src/FieldRoleBadge.jsx";
    export { React, act, createRoot };
  `;
  const out = await build({
    stdin: { contents: entry, resolveDir: root, sourcefile: "field-labels-entry.jsx", loader: "jsx" },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "silent",
  });
  const dir = mkdtempSync(path.join(tmpdir(), "primus-field-labels-"));
  const file = path.join(dir, "bundle.mjs");
  writeFileSync(file, out.outputFiles[0].text);
  const mod = await import(pathToFileURL(file).href);

  async function mount(element) {
    const host = window.document.createElement("div");
    window.document.body.appendChild(host);
    const rootNode = mod.createRoot(host);
    await mod.act(async () => {
      rootNode.render(element);
    });
    return {
      host,
      async unmount() {
        await mod.act(async () => rootNode.unmount());
        host.remove();
      },
    };
  }

  return { window, mod, mount, h: mod.React.createElement, act: mod.act };
}
