import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ideaWipeAt } from "../lib/dbExpiry.js";
import {
  ideaNameFromText,
  mapIdeaVerdict,
  ideaScaleFromLegacy,
  propositionDocFromIdea,
  mergeIdeaHistoryIntoLog,
} from "../lib/ideaHistoryBackfill.js";

assert.equal(ideaNameFromText("Herbal cooling hair oil"), "Herbal cooling hair oil");
assert.ok(ideaNameFromText("x".repeat(120)).endsWith("…"));
assert.equal(mapIdeaVerdict({ overallVerdict: "CLEARED" }), "GO");
assert.equal(mapIdeaVerdict({ overallVerdict: "FAIL" }), "NO-GO");
assert.equal(mapIdeaVerdict({ overallVerdict: "NEEDS_INPUT" }), "WATCH");
assert.equal(mapIdeaVerdict({ overallVerdict: "GO" }), "GO");
assert.equal(ideaScaleFromLegacy({ gramClass: "1000g" }), "1000g");
assert.equal(ideaScaleFromLegacy({}), "10g");

const doc = propositionDocFromIdea({
  id: "idea-1",
  idea: "Gel Hair Colour with plex bond booster",
  overallVerdict: "CLEARED",
  gramClass: "100g",
  ts: Date.parse("2026-01-15T10:00:00.000Z"),
});
assert.equal(doc.id, "idea-1");
assert.equal(doc.goNoGo.classification, "GO");
assert.equal(doc.goNoGo.ideaScale, "100g");
assert.ok(doc.researchRunAt, "historical rows must not look like untouched drafts");

const merged = mergeIdeaHistoryIntoLog(
  [{ id: "p1", name: "New screen", updatedAt: "2026-09-01T00:00:00.000Z" }],
  [
    { id: "p1", idea: "duplicate", overallVerdict: "FAIL" },
    { id: "idea-2", idea: "Older pickle variant", overallVerdict: "FAIL", ts: Date.parse("2025-01-01T00:00:00.000Z") },
  ],
  2000
);
assert.equal(merged.length, 2);
assert.ok(merged.some((r) => r.id === "idea-2" && r.classification === "NO-GO"));
assert.equal(merged.filter((r) => r.id === "p1").length, 1);

const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
assert.match(dbSrc, /backfillIdeasIntoPropositions/);
assert.match(dbSrc, /upsertPropositionFromIdea/);
assert.doesNotMatch(dbSrc, /rows\.slice\(0,\s*200\)/);

const ideasApi = readFileSync(new URL("../lib/ideasApi.js", import.meta.url), "utf8");
assert.match(ideasApi, /LIST_PROPOSITIONS_CAP/);
assert.doesNotMatch(ideasApi, /Math\.min\(100,/);

delete process.env.DB_EXPIRES_AT;
assert.equal(ideaWipeAt({ createdAt: "2026-01-15T10:00:00.000Z" }), "");
assert.equal(
  ideaWipeAt({ createdAt: "2026-09-25T06:00:00.000Z" }, "2026-10-25T04:52:34.053Z"),
  "2026-11-08T04:52:34.053Z"
);
assert.equal(ideaWipeAt({ wipeAt: "2026-12-01T00:00:00.000Z" }), "2026-12-01T00:00:00.000Z");

console.log("PASS idea history auto-populates the Log from stored screens");
