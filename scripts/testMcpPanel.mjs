/**
 * Settings, MCP connector: the admin panel, mounted for real in jsdom with a stand-in API.
 * It shows on or off, who may sign in, the token counts, the people holding a token with a Revoke button,
 * and the audit rows with the person's email; Revoke calls the revoke action and says what happened.
 * (The server side, admin only, is tested in testMcpOwnAccount.mjs.)
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

const out = await build({
  stdin: {
    contents: `
      import React, { act } from "react";
      import { createRoot } from "react-dom/client";
      import AdminMcpPanel, { allowlistText } from "./src/AdminMcpPanel.jsx";
      export { React, act, createRoot, AdminMcpPanel, allowlistText };
    `,
    resolveDir: root,
    sourcefile: "mcp-panel-entry.jsx",
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
const dir = mkdtempSync(path.join(tmpdir(), "primus-mcp-panel-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, out.outputFiles[0].text);
const { React, act, createRoot, AdminMcpPanel, allowlistText } = await import(pathToFileURL(file).href);
const h = React.createElement;

const state = {
  enabled: true,
  allowlist: { mode: "list", count: 2 },
  tokens: { issued: 5, valid: 2 },
  people: [{ userId: "u1", email: "tanmay.v@cavinkare.com", name: "Tanmay", validTokens: 2 }],
  retentionDays: 90,
  records: [
    { created_at: "2026-11-20T11:00:00Z", user_id: "u1", email: "tanmay.v@cavinkare.com", tool_name: "list_ideas", idea_id: "", result_count: 3, ok: true },
    { created_at: "2026-11-20T11:05:00Z", user_id: "", email: "someone@cavinkare.com", tool_name: "sign_in_refused", idea_id: "", result_count: 0, ok: false },
  ],
};
const calls = [];
async function apiFetch(url, opts = {}) {
  calls.push({ url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
  if (url === "/api/admin/mcp/status") return JSON.parse(JSON.stringify(state));
  if (url === "/api/admin/mcp/revoke") {
    state.people = [];
    state.tokens = { issued: 5, valid: 0 };
    return { revoked: true, userId: "u1", email: "tanmay.v@cavinkare.com" };
  }
  throw new Error("unexpected " + url);
}

document.body.innerHTML = "";
const host = document.createElement("div");
document.body.appendChild(host);
await act(async () => {
  createRoot(host).render(h(AdminMcpPanel, { apiFetch }));
});
const q = (id) => host.querySelector(`[data-testid="${id}"]`);
const text = () => host.textContent.replace(/\s+/g, " ");

await check("the panel shows whether the connector is on, who may sign in, and the token counts", () => {
  assert.equal(q("mcp-enabled").textContent, "On");
  assert.equal(q("mcp-allowlist").textContent, "2 people");
  assert.equal(q("mcp-tokens-issued").textContent, "5");
  assert.equal(q("mcp-tokens-valid").textContent, "2");
});

await check("the allowlist reads as nobody, one person, a count, or everyone", () => {
  assert.equal(allowlistText({ mode: "nobody", count: 0 }), "Nobody");
  assert.equal(allowlistText({ mode: "list", count: 1 }), "1 person");
  assert.equal(allowlistText({ mode: "list", count: 2 }), "2 people");
  assert.equal(allowlistText({ mode: "everyone", count: 0 }), "Everyone signed in");
});

await check("the audit rows show who (by email), what, how many results and the outcome", () => {
  const rows = q("mcp-audit").querySelectorAll("tbody tr");
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /tanmay\.v@cavinkare\.com/);
  assert.match(rows[0].textContent, /list_ideas/);
  assert.match(rows[1].textContent, /someone@cavinkare\.com/);
  assert.match(rows[1].textContent, /sign_in_refused/);
  assert.match(rows[1].textContent, /Refused or failed/);
});

await check("each person holding a token has a Revoke button", () => {
  assert.equal(q("mcp-people").querySelectorAll('[data-testid="mcp-revoke"]').length, 1);
  assert.match(q("mcp-people").textContent, /tanmay\.v@cavinkare\.com/);
});

await check("Revoke calls the revoke action for that person and says what happened", async () => {
  await act(async () => {
    q("mcp-revoke").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  const post = calls.find((c) => c.url === "/api/admin/mcp/revoke");
  assert.ok(post, "revoke was called");
  assert.equal(post.method, "POST");
  assert.deepEqual(post.body, { userId: "u1" });
  assert.match(q("mcp-revoke-note").textContent, /Revoked tanmay\.v@cavinkare\.com\. Their connector token now fails on its next call\./);
});

await check("after a revoke the panel reloads: nobody holds a token and the valid count drops", () => {
  assert.equal(q("mcp-tokens-valid").textContent, "0");
  assert.match(text(), /Nobody holds a valid token/);
  assert.equal(host.querySelectorAll('[data-testid="mcp-revoke"]').length, 0);
});

await check("a refused request shows the server's message instead of the panel", async () => {
  document.body.innerHTML = "";
  const host2 = document.createElement("div");
  document.body.appendChild(host2);
  await act(async () => {
    createRoot(host2).render(h(AdminMcpPanel, { apiFetch: async () => { throw new Error("Only ADMIN can do this."); } }));
  });
  assert.match(host2.textContent, /Only ADMIN can do this\./);
  assert.equal(host2.querySelector('[data-testid="mcp-enabled"]'), null);
});

await check("source: the panel is a Settings tab and never prints a token", () => {
  const page = read("src/AdminUsersPage.jsx");
  assert.match(page, /label: "MCP connector"/);
  assert.match(page, /<AdminMcpPanel apiFetch=\{apiFetch\}/);
  assert.doesNotMatch(read("src/AdminMcpPanel.jsx"), /access_token|refresh_token|Bearer/);
});

console.log(`PASS testMcpPanel — ${checks} checks`);
process.exit(0);
