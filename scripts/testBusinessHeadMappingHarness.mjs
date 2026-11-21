/**
 * R3: Settings → Roster import mapping screen, through uiHarness.
 * Skips when uiHarness.mjs is not in scripts/ (CI without the supplied harness).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!fs.existsSync(path.join(root, "scripts", "uiHarness.mjs"))) {
  console.log("SKIP testBusinessHeadMappingHarness — uiHarness.mjs not present");
  process.exit(0);
}

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log("SKIP testBusinessHeadMappingHarness — TEST_DATABASE_URL not set");
  process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0);
}

const { createHarness, sleep } = await import("./uiHarness.mjs");
const H = await createHarness();
const session = H.boot({ as: "admin" });
await H.nav.settings(session.w);
const roster = [...session.w.document.querySelectorAll("button")].find((b) => /Roster import/i.test(b.textContent || ""));
assert.ok(roster, "Roster import tab is on Settings");
H.click(session.w, roster);
await sleep(800);
const body = H.text(session.w);
assert.match(body, /Business head teams/);
assert.match(body, /Download roster template/);
assert.match(body, /Save mapping/);
await H.close();
console.log("PASS testBusinessHeadMappingHarness");
