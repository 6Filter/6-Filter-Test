import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  filterLogRows,
  isUntouchedDraft,
  logRowForCsv,
  researchWasUsed,
} from "../lib/logStatus.js";

assert.equal(researchWasUsed({}), false);
assert.equal(researchWasUsed({ researchRunAt: null }), false);
assert.equal(researchWasUsed({ researchRunAt: "2026-09-04T10:00:00.000Z" }), true);

assert.equal(isUntouchedDraft({}), true, "blank row is an untouched draft");
assert.equal(isUntouchedDraft({ name: "", ideaDescription: "  " }), true, "whitespace-only idea is still empty");
assert.equal(isUntouchedDraft({ name: "Cooling mist" }), false, "name-only draft survives cleanup");
assert.equal(isUntouchedDraft({ ideaDescription: "menthol cooling spray" }), false, "idea-only draft survives cleanup");
assert.equal(
  isUntouchedDraft({ name: "", ideaDescription: "", researchRunAt: "2026-09-04T10:00:00.000Z" }),
  false,
  "researched row is never an untouched draft"
);

const mixed = [
  { id: "blank", name: "", ideaDescription: "" },
  { id: "named", name: "Herbal oil", ideaDescription: "" },
  { id: "researched", name: "", ideaDescription: "", researchRunAt: "2026-09-01T00:00:00.000Z" },
  { id: "costly", name: "Deo", ideaDescription: "aerosol", researchRunAt: "2026-09-02T00:00:00.000Z" },
];
assert.equal(filterLogRows(mixed, { status: "ai-used" }).length, 2);
assert.deepEqual(
  filterLogRows(mixed, { status: "ai-used" }).map((r) => r.id),
  ["researched", "costly"]
);
assert.equal(filterLogRows(mixed, { status: "OPEN" }).length, 4, "ai-used is not a proposition status");

const csvRow = logRowForCsv({ name: "Deo", researchRunAt: "2026-09-02T00:00:00.000Z" });
assert.equal(csvRow.research, "AI used");
assert.equal(logRowForCsv({ name: "Blank" }).research, "No API calls");

const logSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
assert.match(logSrc, /research-badge/);
assert.doesNotMatch(logSrc, /No API calls/);
assert.match(logSrc, /AI used/); // status filter pill still lists AI-used ideas
assert.doesNotMatch(logSrc, /usedAi \? "AI used"/);
assert.match(logSrc, /Clean up untouched drafts/);
assert.match(logSrc, /\.research-badge\.used/);
assert.match(logSrc, /id: "GO"/);
assert.match(logSrc, /canDeleteRow/);
assert.match(logSrc, /ADMIN or Master can delete|allowDelete/);

const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.match(appSrc, /cleanup-untouched/);
assert.match(appSrc, /confirmAndDeleteUntouchedDrafts/);
assert.match(appSrc, /createPropositionRecord\(\)/);
assert.match(appSrc, /apiFetch\("\/api\/propositions", \{ method: "POST" \}\)/);

const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
assert.match(dbSrc, /export async function deleteUntouchedDrafts/);
assert.match(dbSrc, /research_run_at IS NULL/);
assert.match(dbSrc, /research_run_at/);
assert.match(dbSrc, /researchRunAt: r\.research_run_at/);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /handlePropositionsCleanupUntouched/);
assert.match(apiSrc, /const proposition = await createProposition\(/);

const routerSrc = readFileSync(new URL("../lib/apiRouter.js", import.meta.url), "utf8");
assert.match(routerSrc, /\/api\/propositions\/cleanup-untouched/);
const cleanupIdx = routerSrc.indexOf("/api/propositions/cleanup-untouched");
const idIdx = routerSrc.indexOf("const propositionMatch");
assert.ok(cleanupIdx > 0 && cleanupIdx < idIdx, "cleanup route must be registered before /:id");

console.log("PASS Part 67 research badge, AI used filter, untouched-draft cleanup");
