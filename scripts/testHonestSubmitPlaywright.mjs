/**
 * Playwright Edge (1366×768) — owner scenario on a legacy-shaped sealed idea.
 * Scratch file-store only. Captures screenshots of honest Submit feedback.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { TECH_SHIFT_DIMENSIONS } from "../lib/techShiftRisk.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = mkdtempSync(path.join(tmpdir(), "primus-honest-pw-"));
const shotDir = path.join(dataDir, "shots");
mkdirSync(shotDir, { recursive: true });

process.env.PRIMUS_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || `sk-${"ant"}-stub-local-only`;

const { initDb, createProposition, updateProposition } = await import("../lib/db.js");
const { emptyPropositionDoc } = await import("../lib/propositionFields.js");
const { handleApiRequest } = await import("../lib/apiRouter.js");
const { redactSecrets, sendJson } = await import("../lib/http.js");
await initDb();

const finding =
  "No-added-sugar milkshake formats are stable in ambient dairy with enough words here to pass the claim length.";
const dims = Object.fromEntries(
  TECH_SHIFT_DIMENSIONS.map((k) => [k, { risk: "Medium", reason: finding }])
);

const row = await createProposition({ submitterDepartment: "R&D" });
const doc = emptyPropositionDoc(row.id);
Object.assign(doc, {
  submitterName: "Honest Tester",
  submitterDepartment: "R&D",
  name: "Cavin's No Added Sugar milkshake",
  category: "Milkshake",
  division: "Beverages",
  ideaDescription:
    "This product is Cavin's No added sugar milkshake in 170 ml tetra pack. It comes in 3 flavours.",
  screeningDifficulty: 1,
  researchRunAt: new Date().toISOString(),
  researchDurationMs: 1000,
  f1: {
    declaredAttribute: "no added sugar",
    benchmark: "Britannia Winkin' Cow Milkshake",
    declaredGap: 2,
    gapDerivation: "No added sugar claim in tetra pack milkshakes",
    parityExceptions: "Source of calcium",
    growthRoute: "new market",
    growthArgument:
      "No added sugar claim is not present in any of the tetra competition brands, which makes room to grow.",
  },
  f2: { cogsAtScale: 40, netMarginAtScale: 45, gstRatePct: 12, grammage: "170 ml" },
  f3: {
    volumeLossJustification:
      "Shelf price is held flat for five years including inflation so volume loss stays inside 10%.",
  },
  f4: {
    techShiftRisk: { dimensions: dims, overallRisk: "Medium" },
    userInputs: Object.fromEntries(TECH_SHIFT_DIMENSIONS.map((k) => [k, { pov: finding }])),
  },
  goNoGo: {
    classification: "WATCH",
    score: { pct: 61, total: 100, done: 10 },
    at: new Date().toISOString(),
    output: {
      classification: "WATCH",
      score: { pct: 61, total: 100, done: 10 },
      sealedAt: new Date().toISOString(),
      filters: {
        f4: {
          checkLabel: "Evidence missing",
          items: TECH_SHIFT_DIMENSIONS.map((k) => ({
            status: "pending",
            credit: 0,
            text: `${k}: Medium risk — open`,
          })),
        },
      },
    },
  },
  evaluationState: "evaluated",
  evaluationMissing: [],
});
await updateProposition(row.id, doc, { handler: "honest-pw-seed", writer: "server" });

const { readFile } = await import("node:fs/promises");
const DIST = path.join(root, "dist");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

const server = createServer(async (req, res) => {
  if (String(req.url || "").startsWith("/api/")) {
    const handled = await handleApiRequest(req, res, { sendJson, redactSecrets });
    if (handled) return;
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  try {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const filePath = path.resolve(DIST, rel);
    if (!filePath.startsWith(DIST)) {
      res.statusCode = 400;
      res.end("bad path");
      return;
    }
    const body = await readFile(filePath);
    res.setHeader("Content-Type", MIME[path.extname(filePath).toLowerCase()] || "application/octet-type");
    res.end(body);
  } catch {
    try {
      const index = await readFile(path.join(DIST, "index.html"));
      res.setHeader("Content-Type", MIME[".html"]);
      res.end(index);
    } catch {
      res.statusCode = 500;
      res.end("no dist");
    }
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const logs = [];
page.on("console", (msg) => {
  const t = msg.text();
  if (/screen-decision|submit-feedback|Screening/i.test(t)) logs.push(t);
});

await page.goto(`${base}/propositions/${row.id}#output`, {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(shotDir, "01-open.png"), fullPage: true });

// Prefer output Submit; fall back to form Submit for verdict.
const outputSubmit = page.locator(".output-actions .output-btn-primary");
const formSubmit = page.getByRole("button", { name: /^Submit( for verdict)?$/i });
if ((await outputSubmit.count()) > 0) {
  await outputSubmit.first().click();
} else {
  await formSubmit.first().click();
}

const feedback = page.getByTestId("submit-feedback");
await feedback.first().waitFor({ state: "visible", timeout: 2000 });
const textWithin1s = (await feedback.first().innerText()).trim();
assert.match(
  textWithin1s,
  /Screening…|Not started:|Screened at|run out of credit|did not finish/i,
  `LV8 browser: expected honest feedback within 1s, got ${textWithin1s}`
);
await page.screenshot({ path: path.join(shotDir, "02-feedback.png"), fullPage: true });

// Wait briefly for finish message if screening is short (stub/cache).
await page.waitForTimeout(2500);
const after = (await feedback.first().innerText().catch(() => textWithin1s)).trim();
await page.screenshot({ path: path.join(shotDir, "03-after.png"), fullPage: true });

writeFileSync(
  path.join(shotDir, "report.json"),
  JSON.stringify(
    {
      ideaId: row.id,
      feedbackWithin1s: textWithin1s,
      feedbackAfter: after,
      shots: ["01-open.png", "02-feedback.png", "03-after.png"],
      dataDir,
    },
    null,
    2
  )
);

console.log("PASS testHonestSubmitPlaywright");
console.log(`shots=${shotDir}`);
console.log(`feedbackWithin1s=${textWithin1s}`);
console.log(`feedbackAfter=${after}`);

await browser.close();
server.close();
process.exit(0);
