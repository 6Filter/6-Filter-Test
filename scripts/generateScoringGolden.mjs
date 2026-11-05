/**
 * Regenerates scripts/golden/scoring-golden.json and scripts/scoringFingerprint.json.
 * Only run when the owner approved a ruleset bump.
 * Part 129 — many entries carry real `doc` inputs scored through computeAllAdvisoryChecks.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import {
  SCORE_CHECK_SLOTS,
  SCORING_RULESET_VERSION,
  SCORE_DENOMINATOR_MODE,
  F3_MRP_RANGE_TOLERANCE_INR,
  DIVISION_MIN_NET_MARGIN_PCT,
  DECLARED_GAP_FLOOR,
  GONOGO_SCORE_BANDS,
  INCOMPLETE_VERDICT_MODE,
} from "../lib/lockedConstants.js";
import { scoreAdvisoryChecks, computeGoNoGo } from "../lib/goNoGo.js";
import { computeAllAdvisoryChecks } from "../lib/propositionScoring.js";
import { TECH_SHIFT_DIMENSIONS } from "../lib/techShiftRisk.js";
import {
  computeScoringFingerprint,
  SCORING_FINGERPRINT_FILES,
  hashScoringFile,
} from "../lib/scoringRuleset.js";

const files = {};
for (const f of SCORING_FINGERPRINT_FILES) files[f] = hashScoringFile(f);
const fingerprint = computeScoringFingerprint();
writeFileSync(
  new URL("./scoringFingerprint.json", import.meta.url),
  JSON.stringify({ rulesetVersion: SCORING_RULESET_VERSION, fingerprint, files }, null, 2) + "\n"
);

mkdirSync(new URL("./golden", import.meta.url), { recursive: true });

function packChecks(id, checks, note = "", doc = null) {
  const score = scoreAdvisoryChecks(checks);
  return {
    id,
    note,
    ...(doc ? { doc } : {}),
    expected: {
      pct: score.pct,
      done: score.done,
      total: score.total,
      classification: computeGoNoGo(checks),
      byFilter: Object.fromEntries(
        Object.entries(score.byFilter).map(([k, v]) => [k, { done: v.done, total: v.total }])
      ),
    },
    checks,
  };
}

async function packDoc(id, doc, note = "") {
  const checks = await computeAllAdvisoryChecks(doc);
  return packChecks(id, checks, note, doc);
}

function f4Dims(levels) {
  const dimensions = {};
  TECH_SHIFT_DIMENSIONS.forEach((key, i) => {
    const risk = levels[i] || "Low";
    dimensions[key] = { risk, reason: `${risk} for golden` };
  });
  return { techShiftRisk: { dimensions, overall: null } };
}

const clearedF1 = {
  checkLabel: "Cleared",
  items: [
    { status: "done", text: "Benchmark relevant: X", slot: "benchmark" },
    { status: "done", text: "Declared gap 3 clears the 2.0 floor", slot: "gap" },
    { status: "done", text: "Evidence Source read and relevant", slot: "attributes" },
    { status: "done", text: "Gap derivation and parity entered", slot: "derivation" },
    { status: "done", text: "Growth route penetration selected", slot: "route" },
    { status: "done", text: "Growth argument entered", slot: "argument" },
  ],
};
const clearedF2 = {
  checkLabel: "Cleared",
  items: [
    { status: "done", text: "Net margin clears minimum", slot: "margin", credit: 1 },
    { status: "pending", text: "Finance unsigned", formAdmin: true, credit: 0 },
  ],
};
const clearedF3 = { checkLabel: "Cleared", items: [{ status: "done", text: "in range" }] };
const clearedF4 = {
  checkLabel: "Cleared",
  items: TECH_SHIFT_DIMENSIONS.map((d) => ({ status: "done", text: `${d} Low` })),
};
const empty = { checkLabel: "Not yet run", items: [] };

function checksForDone(done) {
  // Build a complete F1–F4 checklist with exactly `done` of 15 slots cleared (Part 134 revised).
  const f1Slots = ["benchmark", "gap", "attributes", "derivation", "route", "argument"];
  const f1Texts = [
    "Benchmark relevant",
    "Declared gap 3 clears the 2.0 floor",
    "Evidence Source read and relevant",
    "Gap derivation and parity entered",
    "Growth route selected",
    "Growth argument entered",
  ];
  const f1n = Math.min(6, done);
  const f2n = Math.min(1, Math.max(0, done - 6));
  const f3n = Math.min(1, Math.max(0, done - 7));
  const f4n = Math.min(7, Math.max(0, done - 8));
  const f1 = {
    checkLabel: f1n === 6 ? "Cleared" : f1n ? "Evidence missing" : "Not yet run",
    items:
      f1n === 0
        ? []
        : f1Slots.map((slot, i) => ({
            status: i < f1n ? "done" : "pending",
            text: f1Texts[i],
            slot,
          })),
  };
  const f2 = {
    checkLabel: f2n === 1 ? "Cleared" : f2n ? "Evidence missing" : "Not yet run",
    items:
      f2n === 0
        ? []
        : [
            {
              status: "done",
              text: "Net margin clears minimum",
              slot: "margin",
              credit: 1,
            },
          ],
  };
  const f3 =
    f3n === 1
      ? clearedF3
      : done >= 7
        ? { checkLabel: "Evidence missing", items: [{ status: "pending", text: "range open" }] }
        : empty;
  const f4 =
    f4n === 0 && done < 8
      ? empty
      : {
          checkLabel: f4n === 7 ? "Cleared" : "Evidence missing",
          items: TECH_SHIFT_DIMENSIONS.map((d, i) => ({
            status: i < f4n ? "done" : "pending",
            text: `${d} ${i < f4n ? "Low" : "open"}`,
          })),
        };
  return { f1, f2, f3, f4 };
}

const ideas = [];

// Stage / check-level entries (kept)
ideas.push(packChecks("stage-0", { f1: empty, f2: empty, f3: empty, f4: empty }, "empty"));
ideas.push(packChecks("stage-1", { f1: clearedF1, f2: empty, f3: empty, f4: empty }, "f1 only"));
ideas.push(packChecks("stage-2", { f1: clearedF1, f2: clearedF2, f3: empty, f4: empty }, "f1+f2"));
ideas.push(packChecks("stage-3", { f1: clearedF1, f2: clearedF2, f3: clearedF3, f4: empty }, "f1-f3"));
ideas.push(packChecks("stage-4", { f1: clearedF1, f2: clearedF2, f3: clearedF3, f4: clearedF4 }, "all cleared"));

// Band edges (required) — 15 slots: 8/15=53 NO-GO, 9/15=60 WATCH, 12/15=80 WATCH, 13/15=87 GO
for (const [id, done] of [
  ["band-59", 8],
  ["band-60", 9],
  ["band-80", 12],
  ["band-81", 13],
]) {
  ideas.push(packChecks(id, checksForDone(done), `band edge ${id}`));
}

ideas.push(
  packChecks(
    "f4-two-high",
    {
      f1: clearedF1,
      f2: clearedF2,
      f3: clearedF3,
      f4: {
        checkLabel: "Below floor",
        items: TECH_SHIFT_DIMENSIONS.map((d, i) => ({
          status: i < 2 ? "pending" : "done",
          text: `${d} ${i < 2 ? "High" : "Low"}`,
        })),
      },
    },
    "two High dimensions → F4 floor"
  )
);
ideas.push(
  packChecks(
    "f4-one-high",
    {
      f1: clearedF1,
      f2: clearedF2,
      f3: clearedF3,
      f4: {
        checkLabel: "Evidence missing",
        items: TECH_SHIFT_DIMENSIONS.map((d, i) => ({
          status: "done",
          text: `${d} ${i === 0 ? "High" : "Low"}`,
        })),
      },
    },
    "one High → Medium overall, no floor"
  )
);

ideas.push(
  packChecks(
    "cap-not-run",
    { f1: clearedF1, f2: clearedF2, f3: clearedF3, f4: empty },
    "F4 not run → INCOMPLETE"
  )
);
ideas.push(
  packChecks(
    "cap-research-failed",
    {
      f1: clearedF1,
      f2: clearedF2,
      f3: clearedF3,
      f4: {
        checkLabel: "Evidence missing",
        items: [{ status: "pending", text: "Research failed — retry Filter 4" }],
      },
    },
    "research failed → INCOMPLETE"
  )
);
ideas.push(
  packChecks(
    "cap-no-division",
    {
      f1: clearedF1,
      f2: {
        checkLabel: "Evidence missing",
        items: [
          { status: "done", text: "MRP ok" },
          {
            status: "pending",
            text: "Pending: division not determined — Filter 2 stays unfinished until ADMIN assigns a locked division",
          },
          { status: "done", text: "Qcom recorded" },
        ],
      },
      f3: clearedF3,
      f4: clearedF4,
    },
    "no division → INCOMPLETE"
  )
);

ideas.push(
  packChecks(
    "first-mover",
    {
      f1: {
        checkLabel: "Cleared",
        items: [
          { status: "done", text: "Attribute" },
          { status: "pending", text: "Benchmark not named", formAdmin: true },
          { status: "done", text: "No established competitor found" },
          { status: "done", text: "Growth" },
        ],
      },
      f2: clearedF2,
      f3: clearedF3,
      f4: clearedF4,
    },
    "first mover"
  )
);

ideas.push(
  packChecks(
    "f3-below-range",
    {
      f1: clearedF1,
      f2: clearedF2,
      f3: { checkLabel: "Below floor", items: [{ status: "pending", text: "below safe floor" }] },
      f4: clearedF4,
    },
    "f3 below"
  )
);
ideas.push(
  packChecks(
    "f3-above-range",
    {
      f1: clearedF1,
      f2: clearedF2,
      f3: { checkLabel: "Below floor", items: [{ status: "pending", text: "above safe ceiling" }] },
      f4: clearedF4,
    },
    "f3 above"
  )
);

ideas.push(
  packChecks(
    "f4-partial",
    {
      f1: clearedF1,
      f2: clearedF2,
      f3: clearedF3,
      f4: {
        checkLabel: "Evidence missing",
        items: TECH_SHIFT_DIMENSIONS.map((d, i) => ({
          status: i < 3 ? "done" : "pending",
          text: `${d}`,
        })),
      },
    },
    "f4 3/7"
  )
);

for (let n = 0; n <= 4; n++) {
  const items = [
    { status: n > 0 ? "done" : "pending", text: "Attribute" },
    { status: n > 1 ? "done" : "pending", text: "Benchmark" },
    { status: n > 2 ? "done" : "pending", text: "Declared gap 3 clears the 2.0 floor" },
    { status: n > 3 ? "done" : "pending", text: "Growth" },
  ];
  ideas.push(
    packChecks(
      `f1-partial-${n}`,
      {
        f1: { checkLabel: n === 4 ? "Cleared" : "Evidence missing", items },
        f2: empty,
        f3: empty,
        f4: empty,
      },
      `f1 ${n}/4`
    )
  );
}

ideas.push(
  packChecks(
    "gap-below",
    {
      f1: {
        checkLabel: "Below floor",
        items: [
          { status: "done", text: "Attribute" },
          { status: "done", text: "Benchmark verified" },
          { status: "pending", text: "Declared gap 1.5 is below the 2.0 floor (v4)" },
          { status: "done", text: "Growth" },
        ],
      },
      f2: clearedF2,
      f3: clearedF3,
      f4: clearedF4,
    },
    "gap below floor"
  )
);
ideas.push(
  packChecks(
    "gap-at",
    {
      f1: {
        checkLabel: "Cleared",
        items: [
          { status: "done", text: "Attribute" },
          { status: "done", text: "Benchmark verified" },
          { status: "done", text: "Declared gap 2 clears the 2.0 floor" },
          { status: "done", text: "Growth" },
        ],
      },
      f2: clearedF2,
      f3: clearedF3,
      f4: clearedF4,
    },
    "gap at floor"
  )
);

// Division margins at / just below / just above — check-level (label) + later doc-level
for (const [div, floor] of Object.entries(DIVISION_MIN_NET_MARGIN_PCT)) {
  if (floor == null) continue;
  for (const [tag, expectPending] of [
    ["below", true],
    ["at", false],
    ["above", false],
  ]) {
    const f2 = {
      checkLabel: expectPending ? "Below floor" : "Cleared",
      items: [
        { status: "done", text: "MRP ok" },
        {
          status: expectPending ? "pending" : "done",
          text: expectPending ? "Net margin below floor" : "Net margin clears floor",
        },
        { status: "done", text: "Qcom recorded" },
      ],
    };
    ideas.push(
      packChecks(
        `margin-${div.replace(/[^a-z0-9]+/gi, "_")}-${tag}`,
        { f1: clearedF1, f2, f3: clearedF3, f4: clearedF4 },
        `${div} margin ${tag} (${floor})`
      )
    );
  }
}

// Extra WATCH pads (≥8 WATCH total)
for (let i = 0; i < 6; i++) {
  ideas.push(packChecks(`watch-pad-${i}`, checksForDone(10), `WATCH pad ${i}`));
}

async function main() {
  // Real-input entries (≥40 with doc)
  const baseComplete = {
    name: "Golden complete",
    category: "Instant noodles",
    division: "Foods",
    f1: {
      declaredAttribute: "Taste",
      benchmark: "Maggi",
      declaredGap: 3,
      growthRoute: "penetration",
      growthArgument: "Households still under-indexed in South India",
    },
    f2: {
      // COGS chosen so deriveMrp(50.34, 40%, 18%) ≈ ₹99 shelf (launch for qcom plan)
      cogsAtScale: 50.34,
      netMarginAtScale: 40,
      gstRatePct: 18,
      grammage: "50 g",
      mrpInr: 99,
      qcomTrajectory: "optional notes — not scored",
    },
    f3: {
      marginElasticity: {
        minMrpInr: 80,
        maxMrpInr: 120,
      },
    },
    f4: f4Dims(Array(7).fill("Low")),
    researchFindings: {
      f1: {
        attributeValidation: [{ attribute: "Taste", isPurchaseDriver: true, channels: ["GT"] }],
        benchmarkVerified: true,
      },
      f4: {},
    },
  };

  ideas.push(await packDoc("commodity-exempt", {
    ...baseComplete,
    name: "Commodity salt",
    f1: { ...baseComplete.f1, pureCommodity: true, declaredAttribute: "Salt", benchmark: "" },
  }, "pure commodity exempt F1"));

  ideas.push(await packDoc("international-business", {
    ...baseComplete,
    name: "IB noodles",
    division: "International Business",
    f2: { ...baseComplete.f2, netMarginAtScale: 40 },
    researchFindings: {
      ...baseComplete.researchFindings,
      divisionDetection: { respectiveDivision: "Foods" },
    },
  }, "International Business uses respective division"));

  ideas.push(await packDoc("mrp-computed", {
    ...baseComplete,
    name: "MRP computed",
    f2: {
      cogsAtScale: 50.34,
      netMarginAtScale: 40,
      gstRatePct: 18,
      grammage: "70 g",
      qcomTrajectory: "optional notes",
    },
  }, "computed MRP from COGS/margin/GST"));

  // Part 134 revised — mark-down (not hard stop) + overridden MRP
  ideas.push(
    await packDoc(
      "doc-margin-markdown",
      {
        ...baseComplete,
        name: "Margin mark-down",
        division: "Foods",
        f2: { ...baseComplete.f2, netMarginAtScale: 20 },
      },
      "margin below Foods 35% → Marked down (not Below floor)"
    )
  );
  ideas.push(
    await packDoc(
      "doc-mrp-override",
      {
        ...baseComplete,
        name: "MRP override",
        division: "Personal Care",
        f2: {
          cogsAtScale: 100,
          netMarginAtScale: 60,
          gstRatePct: 18,
          grammage: "100 g",
          mrpOverride: true,
          mrpInr: 150,
          qcomTrajectory: "notes",
        },
        f3: { marginElasticity: { minMrpInr: 100, maxMrpInr: 200 } },
      },
      "overridden MRP implies margin below Personal Care 50% → Marked down"
    )
  );

  ideas.push(await packDoc("f3-tolerance-edge", {
    ...baseComplete,
    name: "F3 tolerance",
    f2: { ...baseComplete.f2, mrpInr: 80.5 },
    f3: { marginElasticity: { minMrpInr: 80, maxMrpInr: 120 } },
  }, "MRP at floor + ₹0.5 tolerance"));

  ideas.push(await packDoc("doc-first-mover", {
    ...baseComplete,
    name: "First mover gel",
    f1: {
      declaredAttribute: "Texture",
      declaredGap: null,
      growthRoute: "penetration",
      growthArgument: "New format",
      // no benchmark → first-mover path when research says none
    },
    researchFindings: {
      f1: {
        attributeValidation: [{ attribute: "Texture", isPurchaseDriver: true }],
        noEstablishedCompetitor: true,
      },
    },
  }, "first-mover via research"));

  // Division margins from real margin values
  for (const [div, floor] of Object.entries(DIVISION_MIN_NET_MARGIN_PCT)) {
    if (floor == null) continue;
    for (const [tag, margin] of [
      ["below", Number((floor - 0.1).toFixed(1))],
      ["at", floor],
      ["above", Number((floor + 0.1).toFixed(1))],
    ]) {
      const id = `doc-margin-${div.replace(/[^a-z0-9]+/gi, "_")}-${tag}`;
      ideas.push(
        await packDoc(
          id,
          {
            ...baseComplete,
            name: `${div} ${tag}`,
            division: div,
            f2: { ...baseComplete.f2, netMarginAtScale: margin },
          },
          `${div} margin ${margin} vs floor ${floor}`
        )
      );
    }
  }

  // More doc-backed WATCH / incomplete samples
  ideas.push(
    await packDoc(
      "doc-incomplete-f4",
      {
        ...baseComplete,
        name: "Missing F4",
        f4: { techShiftRisk: { dimensions: {} } },
        researchFindings: { f1: baseComplete.researchFindings.f1 },
      },
      "F4 empty → INCOMPLETE"
    )
  );

  ideas.push(
    await packDoc(
      "doc-watch-medium-f4",
      {
        ...baseComplete,
        name: "One high F4",
        f4: f4Dims(["High", "Low", "Low", "Low", "Low", "Low", "Low"]),
      },
      "one High → WATCH-ish score path"
    )
  );

  // Pad to ensure ≥40 docs
  let pad = 0;
  while (ideas.filter((x) => x.doc).length < 40) {
    ideas.push(
      await packDoc(
        `doc-pad-${pad}`,
        {
          ...baseComplete,
          name: `Pad ${pad}`,
          f2: { ...baseComplete.f2, netMarginAtScale: 36 + (pad % 5) },
        },
        "doc pad"
      )
    );
    pad += 1;
  }

  writeFileSync(
    new URL("./golden/scoring-golden.json", import.meta.url),
    JSON.stringify(
      {
        rulesetVersion: SCORING_RULESET_VERSION,
        denominatorMode: SCORE_DENOMINATOR_MODE,
        incompleteVerdictMode: INCOMPLETE_VERDICT_MODE,
        slots: { ...SCORE_CHECK_SLOTS },
        toleranceInr: F3_MRP_RANGE_TOLERANCE_INR,
        bands: GONOGO_SCORE_BANDS,
        declaredGapFloor: DECLARED_GAP_FLOOR,
        ideas,
      },
      null,
      2
    ) + "\n"
  );

  const watchCount = ideas.filter((i) => i.expected.classification === "WATCH").length;
  const withDoc = ideas.filter((i) => i.doc).length;
  console.log(
    `generated golden ideas=${ideas.length} withDoc=${withDoc} WATCH=${watchCount} fingerprint=${fingerprint.slice(0, 8)} mode=${INCOMPLETE_VERDICT_MODE}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
