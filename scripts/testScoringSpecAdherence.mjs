/**
 * Live scoring must match docs/SCORING_SPEC.md v5.4 (fixed 15 slots, INCOMPLETE,
 * web-verified F1, no gram badge on INCOMPLETE, explainer not teaching WATCH-cap).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkF1 } from "../lib/filterChecks.js";
import { computeGoNoGo, scoreAdvisoryChecks, applyLocalGate } from "../lib/goNoGo.js";
import {
  INCOMPLETE_VERDICT_MODE,
  SCORING_RULESET_VERSION,
  SCORE_CHECK_SLOTS_TOTAL,
  SCORE_DENOMINATOR_MODE,
  GONOGO_SCORE_BANDS,
} from "../lib/lockedConstants.js";
import { ideaSizeForResult } from "../lib/ideaScale.js";
import { scoreExplainerMarkdown, scoreExplainerSections } from "../lib/scoreExplainer.js";
import { flattenProposition } from "../lib/logExport.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const howDoc = readFileSync(path.join(root, "../docs/HOW_THE_SCORE_WORKS.md"), "utf8");

assert.equal(SCORING_RULESET_VERSION, "v5.4");
assert.equal(SCORE_DENOMINATOR_MODE, "fixed-slots");
assert.equal(INCOMPLETE_VERDICT_MODE, "incomplete");
assert.equal(SCORE_CHECK_SLOTS_TOTAL, 15);
assert.equal(GONOGO_SCORE_BANDS.NOGO_MAX, 60);
assert.equal(GONOGO_SCORE_BANDS.WATCH_MAX, 80);

const F1_SLOTS = ["benchmark", "gap", "attributes", "derivation", "route", "argument"];
const SLOT_TEXTS = {
  f1: [
    "Benchmark relevant: Brand",
    "Declared gap 3.0 clears the 2.0 floor",
    "Evidence Source read and relevant",
    "Gap derivation and parity entered",
    "Growth route penetration selected",
    "Growth argument entered",
  ],
  f2: ["Net margin 55% clears the division minimum"],
  f3: ["Filter 2 MRP sits within the safe range"],
  f4: Array.from({ length: 7 }, (_, i) => `Dim ${i} Low risk`),
};

function cleared(filterKey) {
  const texts = SLOT_TEXTS[filterKey] || [];
  return {
    checkLabel: "Cleared",
    items: texts.map((text, i) =>
      filterKey === "f1"
        ? { status: "done", text, slot: F1_SLOTS[i], code: `F1_${F1_SLOTS[i].toUpperCase()}` }
        : { status: "done", text }
    ),
  };
}

// Unfinished → INCOMPLETE (not WATCH)
{
  const incomplete = computeGoNoGo({
    f1: cleared("f1"),
    f2: cleared("f2"),
    f3: cleared("f3"),
    f4: { checkLabel: "Not yet run", items: [] },
  });
  assert.equal(incomplete, "INCOMPLETE");
}

// Floor beats unfinished
{
  assert.equal(
    computeGoNoGo({
      f1: { checkLabel: "Below floor", items: [{ status: "pending", text: "gap below floor" }] },
      f2: { checkLabel: "Not yet run", items: [] },
      f3: { checkLabel: "Not yet run", items: [] },
      f4: { checkLabel: "Not yet run", items: [] },
    }),
    "NO-GO"
  );
}

// F1 typed inputs alone clear only the gap (≥2); benchmark/route/argument/evidence stay open
{
  const f1 = checkF1(
    {
      declaredAttribute: "taste",
      benchmark: "Maaza mango fruit drink",
      declaredGap: 3,
      gapDerivation: "Beat on taste",
      parityExceptions: "none",
      growthRoute: "new-market",
      growthArgument: "new occasions",
      evidenceSourceDate: "https://example.com/study",
    },
    {}
  );
  assert.equal(f1.items.filter((i) => i.status === "done").length, 1);
  assert.ok(f1.items.some((i) => i.slot === "gap" && i.status === "done"));
  assert.ok(f1.items.some((i) => i.slot === "benchmark" && i.status === "pending"));
  assert.ok(f1.items.some((i) => i.slot === "route" && i.status === "pending"));
}

// Complete 100% → GO
{
  assert.equal(
    computeGoNoGo({
      f1: cleared("f1"),
      f2: cleared("f2"),
      f3: cleared("f3"),
      f4: cleared("f4"),
    }),
    "GO"
  );
  assert.equal(
    scoreAdvisoryChecks({
      f1: cleared("f1"),
      f2: cleared("f2"),
      f3: cleared("f3"),
      f4: cleared("f4"),
    }).pct,
    100
  );
}

// INCOMPLETE: no gram badge (helper + export + local gate)
{
  const doc = {
    goNoGo: { classification: "INCOMPLETE", score: { pct: 40, done: 6, total: 15 } },
    f5: {},
  };
  assert.equal(ideaSizeForResult(doc), null);
  const flat = flattenProposition(doc);
  assert.equal(flat.ideaSizeTier, "");
  const preview = applyLocalGate({
    name: "X",
    category: "Y",
    f1: { declaredAttribute: "a", benchmark: "b", declaredGap: 3, growthRoute: "penetration", growthArgument: "g" },
    f2: {},
    f3: {},
    f4: {},
  });
  assert.equal(preview.classification, "INCOMPLETE");
  assert.equal(preview.ideaScale, undefined);
}

// Explainer + HOW_THE_SCORE_WORKS teach INCOMPLETE, not unfinished→WATCH
{
  const body = scoreExplainerSections()
    .map((s) => s.body)
    .join("\n");
  assert.match(body, /INCOMPLETE/i);
  assert.doesNotMatch(body, /keeps the idea at WATCH/i);
  assert.equal(howDoc.replace(/\r\n/g, "\n").trim(), scoreExplainerMarkdown().trim());
}

console.log("PASS testScoringSpecAdherence — v5.4 live logic matches SCORING_SPEC");
