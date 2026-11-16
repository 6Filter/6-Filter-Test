/**
 * Part 141 D72 / D74 — the improvement panel reads the verdict, not the percentage:
 * a score above 80 held at WATCH by a weak check never headlines "GO", and the suggestion
 * carries the web finding + source of the item that holds it back.
 */
import assert from "node:assert/strict";
import { buildPathToGo } from "../lib/improvementPoints.js";
import { computeGoNoGo, hasGoCap, scoreAdvisoryChecks } from "../lib/goNoGo.js";

let checks = 0;
const ok = (fn) => {
  fn();
  checks += 1;
};

const F1_SLOTS = ["benchmark", "gap", "attributes", "derivation", "parity", "route", "argument"];
const TEXTS = {
  f1: [
    "Benchmark relevant: Brand",
    "Declared gap 3.0 clears the 2.0 floor",
    "Attribute claim read as strong on the web check",
    "Gap derivation entered",
    "Parity exceptions entered",
    "Growth route penetration selected",
    "Growth argument entered",
  ],
  f2: ["Net margin 55% clears the division minimum", "Pack size 50 g entered with a unit", "GST rate 18% entered"],
  f3: ["Filter 2 MRP sits within the safe range"],
  f4: Array.from({ length: 7 }, (_, i) => `Dim ${i} Low risk`),
};

const SRC = "https://example.com/parity-source";
const FINDING = "Competitor packs already carry the same parity claim";

function cleared(key) {
  return {
    checkLabel: "Cleared",
    items: TEXTS[key].map((text, i) => ({
      status: "done",
      text,
      credit: 1,
      level: "strong",
      ...(key === "f1" ? { slot: F1_SLOTS[i] } : {}),
      ...(key === "f3" ? { slot: "resilience" } : {}),
    })),
  };
}

function capped({ withSource = true } = {}) {
  const advisory = { f1: cleared("f1"), f2: cleared("f2"), f3: cleared("f3"), f4: cleared("f4") };
  // Parity: weak (credit > 0) — caps GO at WATCH while the score stays in the GO band.
  // status "pending": a weak item is partly credited but still open, so it appears as a suggestion.
  advisory.f1.items[4] = {
    status: "pending",
    text: "Parity exceptions entered",
    slot: "parity",
    level: "weak",
    credit: 0.4,
    ...(withSource ? { finding: FINDING, source_url: SRC, quote: "same claim on pack", reason: FINDING } : {}),
  };
  return advisory;
}

ok(() => {
  const advisory = capped();
  const scored = scoreAdvisoryChecks(advisory);
  assert.ok(scored.pct > 80, `score is in the GO band (${scored.pct})`);
  assert.equal(hasGoCap(advisory), true);
  assert.equal(computeGoNoGo(advisory), "WATCH", "verdict is WATCH");

  const path = buildPathToGo({ advisoryChecks: advisory, scoreStatus: "current" });
  assert.notEqual(path.kind, "go", "path is not a GO panel");
  assert.equal(path.capped, true);
  assert.match(path.headline, /WATCH at/);
  assert.doesNotMatch(path.headline, /^GO/, "headline never leads with GO as the outcome");
  assert.match(path.headline, new RegExp(`WATCH at ${path.currentPct}%`));
  assert.equal(path.message, path.headline);
});

ok(() => {
  // Sealed score above 80 + cap still headlines WATCH.
  const advisory = capped();
  const path = buildPathToGo({
    advisoryChecks: advisory,
    sealedScore: { pct: 91, done: 16, total: 18 },
    scoreStatus: "current",
  });
  assert.match(path.headline, /WATCH at 91%/);
  assert.doesNotMatch(path.headline, /^GO/);
});

ok(() => {
  // Suggestions cite the finding + source of the capping item.
  const path = buildPathToGo({ advisoryChecks: capped(), scoreStatus: "current" });
  const rows = [...(path.actions || []), ...(path.allActions || [])];
  const row = rows.find((a) => a.source_url === SRC);
  assert.ok(row, "a suggestion carries the item's source_url");
  assert.equal(row.finding, FINDING);
  assert.equal(row.sourceUrl, SRC);
  assert.equal(row.capsGo, true, "the capping row is flagged");
  assert.equal(row.filter, "F1");
});

ok(() => {
  // Without a source on the item, the suggestion has no source_url.
  const path = buildPathToGo({ advisoryChecks: capped({ withSource: false }), scoreStatus: "current" });
  const rows = [...(path.actions || []), ...(path.allActions || [])];
  assert.ok(rows.length, "still a suggestion");
  assert.ok(rows.every((a) => !a.source_url));
});

ok(() => {
  // Control: no cap and everything strong → verdict GO and the panel says so.
  const advisory = { f1: cleared("f1"), f2: cleared("f2"), f3: cleared("f3"), f4: cleared("f4") };
  assert.equal(computeGoNoGo(advisory), "GO");
  const path = buildPathToGo({ advisoryChecks: advisory, scoreStatus: "current" });
  assert.equal(path.kind, "go");
  assert.match(path.headline, /^GO/);
});

console.log(`PASS testPart141ImprovementVerdict (${checks} checks)`);
