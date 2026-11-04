/**
 * Regenerates scripts/golden/scoring-golden.json and scripts/scoringFingerprint.json.
 * Only run when the owner approved a ruleset bump.
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
} from "../lib/lockedConstants.js";
import { scoreAdvisoryChecks, computeGoNoGo } from "../lib/goNoGo.js";
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

function pack(id, checks, note = "") {
  const score = scoreAdvisoryChecks(checks);
  return {
    id,
    note,
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

const clearedF1 = {
  checkLabel: "Cleared",
  items: [
    { status: "done", text: "Attribute 1 declared" },
    { status: "done", text: "Benchmark verified: X" },
    { status: "done", text: "Declared gap 3 clears the 2.0 floor" },
    { status: "done", text: "Growth route recorded" },
  ],
};
const clearedF2 = {
  checkLabel: "Cleared",
  items: [
    { status: "done", text: "MRP ok" },
    { status: "done", text: "Net margin clears floor" },
    { status: "done", text: "Qcom recorded" },
    { status: "pending", text: "Finance unsigned", formAdmin: true },
  ],
};
const clearedF3 = { checkLabel: "Cleared", items: [{ status: "done", text: "in range" }] };
const clearedF4 = {
  checkLabel: "Cleared",
  items: Array.from({ length: 7 }, (_, i) => ({ status: "done", text: `d${i}` })),
};
const empty = { checkLabel: "Not yet run", items: [] };

const ideas = [];
ideas.push(pack("stage-0", { f1: empty, f2: empty, f3: empty, f4: empty }, "empty"));
ideas.push(pack("stage-1", { f1: clearedF1, f2: empty, f3: empty, f4: empty }, "f1 only"));
ideas.push(pack("stage-2", { f1: clearedF1, f2: clearedF2, f3: empty, f4: empty }, "f1+f2"));
ideas.push(pack("stage-3", { f1: clearedF1, f2: clearedF2, f3: clearedF3, f4: empty }, "f1-f3"));
ideas.push(pack("stage-4", { f1: clearedF1, f2: clearedF2, f3: clearedF3, f4: clearedF4 }, "all cleared"));

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
      pack(
        `margin-${div.replace(/[^a-z0-9]+/gi, "_")}-${tag}`,
        { f1: clearedF1, f2, f3: clearedF3, f4: clearedF4 },
        `${div} margin ${tag} (${floor})`
      )
    );
  }
}

ideas.push(
  pack(
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
  pack(
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
ideas.push(
  pack(
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
  pack(
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
  pack(
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
  pack(
    "f4-partial",
    {
      f1: clearedF1,
      f2: clearedF2,
      f3: clearedF3,
      f4: {
        checkLabel: "Evidence missing",
        items: Array.from({ length: 7 }, (_, i) => ({
          status: i < 3 ? "done" : "pending",
          text: `d${i}`,
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
    { status: n > 2 ? "done" : "pending", text: "Gap" },
    { status: n > 3 ? "done" : "pending", text: "Growth" },
  ];
  ideas.push(
    pack(
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

let pad = 0;
while (ideas.length < 40) {
  const i = pad++;
  ideas.push(
    pack(
      `pad-${i}`,
      {
        f1: clearedF1,
        f2: {
          checkLabel: "Cleared",
          items: [
            { status: "done", text: "MRP" },
            { status: i % 2 ? "done" : "pending", text: "Margin" },
            { status: "done", text: "Qcom" },
          ],
        },
        f3: i % 3 ? clearedF3 : empty,
        f4: i % 4 ? clearedF4 : empty,
      },
      "pad"
    )
  );
}

writeFileSync(
  new URL("./golden/scoring-golden.json", import.meta.url),
  JSON.stringify(
    {
      rulesetVersion: SCORING_RULESET_VERSION,
      denominatorMode: SCORE_DENOMINATOR_MODE,
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

console.log(`generated golden ideas=${ideas.length} fingerprint=${fingerprint.slice(0, 8)}`);
