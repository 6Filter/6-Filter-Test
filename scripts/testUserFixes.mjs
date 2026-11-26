import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { displayCopy } from "../lib/displayCopy.js";
import { checkF2Sync } from "../lib/filter2Check.js";
import { checkF4 } from "../lib/filterChecks.js";
import { computeGoNoGo, previewAdvisoryChecks, scoreAdvisoryChecks } from "../lib/goNoGo.js";
import { lockedFloorForProposition } from "../lib/divisionMargin.js";
import { easeScreeningChecks, f4Improvement, liftSealedChecks, scoringDocForEnteredCredit } from "../lib/enteredFieldCredit.js";
import { researchHashFor } from "../lib/researchCache.js";
import { researchStepFields, stepFingerprint as stepFp } from "../lib/researchStepCache.js";
import { parseIdeaAnalysis, buildIdeaAnalysisUser } from "../lib/ideaWorkAnalysis.js";
import { typedResearchBrief } from "../lib/propositionAiFirstPass.js";

const none = displayCopy("Gap derivation none", {});
assert.match(none, /Write a full sentence/);
assert.equal(none.includes("Gap derivation none"), false);
const nas = "For health conscious people RTD options are usually considered as bad since it has lot of sugar. But with our NAS range we are bridging the gap for health conscious people";
const readBack = displayCopy("Gap derivation none", {
  f1: { benchmark: "Tropicana 200ml PET Bottles", gapDerivation: nas },
});
assert.match(readBack, /You entered/);
assert.match(readBack, /NAS range/);
assert.equal(/does not count in this box/.test(readBack), false);
assert.match(
  displayCopy("Parity exceptions none", { f1: { parityExceptions: "taste matches the bottle, colour does not" } }),
  /taste matches the bottle/
);
assert.match(displayCopy("Growth argument none", { f1: { growthArgument: "none" } }), /one paragraph/);
const brief = typedResearchBrief("Fruit drink in a tetra pack", {
  f1: { benchmark: "Tropicana 200ml PET Bottles", gapDerivation: nas, growthArgument: "9.5 Mn households" },
});
assert.match(brief, /What the team will beat that benchmark on: For health conscious/);
assert.match(brief, /Named benchmark: Tropicana 200ml PET Bottles/);
const claimSrc = readFileSync(new URL("../lib/f1Research.js", import.meta.url), "utf8");
assert.match(claimSrc, /A filled sentence is never a missing field/);
assert.match(claimSrc, /gapDerivation:/);
assert.match(displayCopy("Parity exceptions none", {}), /no, none or yes do not count/i);
assert.match(displayCopy("Growth argument none", {}), /one paragraph/);
assert.match(displayCopy("Growth argument weak", {}), /too vague/);
assert.match(displayCopy('Growth route "new market" — none', {}), /new set of buyers/);
assert.match(
  displayCopy('Growth route mismatch — AI expects "new market"', {}),
  /Growth route mismatch/
);

const base = {
  ideaDescription: "electrolyte drink for daily hydration",
  category: "Beverages",
  f1: {
    benchmark: "Electral",
    declaredAttribute: "hydration",
    gapDerivation: "none",
    parityExceptions: "none",
    growthRoute: "penetration",
    growthArgument: "first draft",
  },
  f2: { grammage: "100g", gstRatePct: 12, mrpInr: 20 },
};
assert.notEqual(
  researchHashFor(base),
  researchHashFor({ ...base, f1: { ...base.f1, gapDerivation: "stays cold two hours longer than Electral" } })
);
assert.notEqual(
  researchHashFor(base),
  researchHashFor({ ...base, f1: { ...base.f1, parityExceptions: "taste is the same" } })
);
assert.notEqual(
  researchHashFor(base),
  researchHashFor({ ...base, f1: { ...base.f1, growthRoute: "new-market" } })
);
assert.notEqual(
  researchHashFor(base),
  researchHashFor({ ...base, f2: { ...base.f2, grammage: "200g" } })
);
assert.equal(
  researchHashFor(base),
  researchHashFor({ ...base, f2: { ...base.f2, cogsAtScale: 40, netMarginAtScale: 18 } })
);

const before = researchStepFields({
  idea: "electrolyte drink",
  category: "Beverages",
  benchmark: "Electral",
  attributes: ["hydration"],
  gapDerivation: "none",
});
const after = researchStepFields({
  idea: "electrolyte drink",
  category: "Beverages",
  benchmark: "Electral",
  attributes: ["hydration"],
  gapDerivation: "stays cold two hours longer",
});
assert.notEqual(stepFp("f1", before.f1), stepFp("f1", after.f1));
assert.equal(stepFp("f4", before.f4), stepFp("f4", after.f4));

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const keyFn = form.slice(form.indexOf("function researchInputKey"), form.indexOf("function preferOutputView"));
for (const field of ["gapDerivation", "parityExceptions", "growthRoute", "growthArgument", "grammage"]) {
  assert.match(keyFn, new RegExp(field));
}
// Derived GST/MRP must stay out of the forceResearch key so Filter 4 does not re-roll.
assert.doesNotMatch(keyFn, /\bmrpInr\b/);
assert.doesNotMatch(keyFn, /\bgstRatePct\b/);
assert.doesNotMatch(form, /AI analysis/);
assert.match(form, /How the 10% volume-loss rule is met/);
assert.match(form, /data-f4-block="web-check"/);
assert.doesNotMatch(form, /Select risk/);
assert.doesNotMatch(form, /Web check rating/);
assert.match(form, /Your view/);
assert.doesNotMatch(form, /Respond on Medium/);
assert.match(form, /forceResearch: Boolean\(submitOpts\.forceResearch\) \|\| ideaChanged/);

const parsed = parseIdeaAnalysis(
  'Here you go {"summary":"Name a drink people already buy.","suggestions":["Write the gap as a shopper-visible difference.","Pick new market if the buyer is not an athlete.",""]}'
);
assert.equal(parsed.suggestions.length, 2);
assert.match(buildIdeaAnalysisUser({ ideaDescription: "a daily electrolyte drink" }), /daily electrolyte/);
assert.throws(() => parseIdeaAnalysis("not json"), /did not return a suggestion/);

const suggestion = "stays cold for two hours longer than the named drink";
const aiDoc = {
  division: "Personal Care",
  f1: {
    benchmark: "Electral",
    gapDerivation: suggestion,
    parityExceptions: "taste matches the bottle",
    growthRoute: "penetration",
    growthArgument: "9.5 Mn households will try it in year one",
  },
  f2: {
    cogsAtScale: 30,
    netMarginAtScale: 55,
    gstRatePct: 18,
    grammage: "100 ml",
    mrpInr: 10,
    mrpOverride: true,
  },
  researchFindings: {
    autofillStatus: {
      "f1.gapDerivation": { aiSuggested: suggestion, confirmed: false },
      "f1.parityExceptions": { aiSuggested: "taste matches the bottle", confirmed: false },
      "f1.growthArgument": { aiSuggested: "9.5 Mn households will try it in year one", confirmed: false },
      "f1.growthRoute": { aiSuggested: "penetration", confirmed: false },
    },
    f1: {
      assessments: {
        argument: {
          status: "ok",
          searchUsed: true,
          raw: {
            relevance: "none",
            specific: true,
            contradicted: true,
            supported: false,
            source_url: "https://example.com/study",
            quote: "category is flat",
          },
          returnedSources: ["https://example.com/study"],
        },
      },
    },
    f2: {
      assessments: {
        gst: { contradicted: true, raw: { contradicted: true, verdict: "contradicted" } },
      },
    },
  },
};
const credited = scoringDocForEnteredCredit(aiDoc);
const preview = previewAdvisoryChecks(credited);
for (const slot of ["derivation", "parity", "argument", "route"]) {
  const item = preview.f1.items.find((it) => it.slot === slot);
  assert.equal(item.status, "done", slot);
  assert.equal(item.credit, 1, slot);
}
const floor = lockedFloorForProposition(credited);
const f2 = checkF2Sync(credited.f2, {
  floor,
  divisionLabel: "Personal Care",
  findings: credited.researchFindings,
});
assert.equal(f2.markedDown, false);
assert.equal(f2.checkLabel, "Cleared");
assert.equal(f2.items.find((it) => it.slot === "margin").credit, 1);
assert.equal(f2.items.find((it) => it.slot === "gst").credit, 1);
assert.equal(credited.f2.mrpOverride, false);
assert.equal(aiDoc.f2.mrpOverride, true);

const below = scoringDocForEnteredCredit({
  ...aiDoc,
  f2: { ...aiDoc.f2, netMarginAtScale: 40, mrpOverride: false },
});
const belowCheck = checkF2Sync(below.f2, {
  floor: lockedFloorForProposition(below),
  divisionLabel: "Personal Care",
  findings: below.researchFindings,
});
assert.equal(belowCheck.items.find((it) => it.slot === "margin").credit, 0);
assert.equal(belowCheck.items.find((it) => it.slot === "gst").reasons.includes("CONTRADICTED"), true);

const suggestedOnly = scoringDocForEnteredCredit({
  f1: { gapDerivation: "", parityExceptions: "", growthArgument: "" },
  researchFindings: {
    autofillStatus: {
      "f1.gapDerivation": { aiSuggested: suggestion, confirmed: false },
    },
  },
});
assert.equal(suggestedOnly.f1.gapDerivation, suggestion);
assert.equal(suggestedOnly.researchFindings.autofillStatus["f1.gapDerivation"].confirmed, true);
const stubbed = scoringDocForEnteredCredit({
  f1: { gapDerivation: "none", parityExceptions: "yes" },
  researchFindings: {
    autofillStatus: {
      "f1.gapDerivation": { aiSuggested: suggestion, confirmed: false },
    },
  },
});
assert.equal(stubbed.f1.gapDerivation, "none");

const sealed = {
  f1: {
    items: [
      { slot: "derivation", status: "pending", credit: 0, text: "Gap derivation none", level: "none" },
      { slot: "parity", status: "pending", credit: 0, text: "Parity exceptions none", level: "none" },
      {
        slot: "argument",
        status: "pending",
        credit: 0,
        text: "A claim in growth argument was contradicted",
        level: "none",
        reasons: ["CONTRADICTED"],
      },
    ],
  },
  f2: {
    checkLabel: "Marked down",
    markedDown: true,
    items: [
      { slot: "margin", status: "pending", credit: 0, text: "Net margin 10% is below the 50% minimum", reasons: ["BELOW_MINIMUM"] },
      { slot: "packSize", status: "done", credit: 1, text: "Pack size 100 ml entered with a unit" },
      { slot: "gst", status: "pending", credit: 0, text: "GST rate 18% is marked down — the web check contradicts it", reasons: ["CONTRADICTED", "MARKED_DOWN"] },
      { slot: "finance", status: "pending", credit: 0, formAdmin: true, text: "The margin computation hasn't been confirmed by Finance yet — until it is, this number can't count as verified evidence" },
    ],
  },
};
const lifted = liftSealedChecks(sealed, aiDoc);
assert.equal(lifted.creditRaised, true);
assert.equal(lifted.checks.f1.items.every((it) => it.credit === 1 && it.status === "done"), true);
assert.equal(lifted.checks.f2.markedDown, false);
assert.equal(lifted.checks.f2.checkLabel, "Cleared");
assert.match(lifted.checks.f2.items.find((it) => it.slot === "finance").text, /does not change this score/);
assert.match(
  displayCopy("Correct the contradicted data in the growth argument, or attach Evidence Source proof", aiDoc),
  /not marked down/
);
assert.match(
  displayCopy("The margin computation hasn't been confirmed by Finance yet — until it is, this number can't count as verified evidence", aiDoc),
  /does not ask for more evidence/
);

const finding = "The tetra-pack format faces growing pressure from chilled PET and cup formats favoured by q-commerce.";
const f4Doc = {
  f4: {
    userInputs: { functionalCoreStability: { rating: "Medium", pov: finding } },
    techShiftRisk: {
      dimensions: {
        functionalCoreStability: { risk: "Medium", reason: finding },
      },
    },
  },
  researchFindings: {
    f4: {
      assessments: {
        functionalCoreStability: {
          status: "ok",
          searchUsed: true,
          raw: { rating: "Medium", supported: false, quote: finding, contradicted: true },
          returnedSources: ["https://example.com/f4"],
        },
      },
    },
  },
};
const f4Credited = scoringDocForEnteredCredit(f4Doc);
const f4Check = checkF4(f4Credited.f4, f4Credited.researchFindings.f4);
const f4Item = f4Check.items.find((it) => /functional core stability/i.test(it.text));
assert.equal(f4Item.status, "done");
assert.doesNotMatch(f4Item.text, /Still open/);
assert.match(
  displayCopy(`Clear the open Filter 4 dimension "Functional core stability" with a mitigation response`, f4Doc),
  /cleared/i
);
const other = {
  ...f4Doc,
  f4: {
    ...f4Doc.f4,
    userInputs: { functionalCoreStability: { rating: "Medium", pov: "We already signed a pack contract for the year." } },
  },
};
assert.equal(f4Improvement(other, "functionalCoreStability"), "", "Level 1 does not ask to re-paste after a mismatch");
assert.match(
  f4Improvement({ ...other, screeningDifficulty: 2 }, "functionalCoreStability"),
  /Put that finding in this box/
);
assert.equal(f4Improvement(f4Doc, "functionalCoreStability"), "");
const otherEased = easeScreeningChecks(
  {
    f4: {
      checkLabel: "Evidence missing",
      items: [{ status: "pending", credit: 0, text: "Functional core stability: Medium risk — open" }],
    },
  },
  other
).checks;
assert.equal(otherEased.f4.items[0].credit, 1, "Level 1 contradiction is not marked down");
assert.match(otherEased.f4.items[0].text, /contradicts what was found online/i);

const easy = {
  division: "Personal Care",
  f1: {
    declaredAttribute: "soft hair",
    benchmark: "Dove",
    declaredGap: 1.5,
    gapDerivation: "stays cold longer than the bottle",
    parityExceptions: "no added sugar versus the named drink",
    growthRoute: "penetration",
    growthArgument: "none",
  },
  f2: { cogsAtScale: 30, netMarginAtScale: 40, gstRatePct: 18, grammage: "100 ml" },
  f3: { volumeLossJustification: "Price stays flat for five years and inflation still leaves volume loss inside the rule." },
};
const easyChecks = easeScreeningChecks(previewAdvisoryChecks(scoringDocForEnteredCredit(easy)), easy).checks;
for (const slot of ["attributes", "benchmark", "gap", "derivation", "parity", "route", "argument"]) {
  const item = easyChecks.f1.items.find((it) => it.slot === slot);
  assert.equal(item.status, "done", slot);
  assert.equal(item.credit, 1, slot);
}
assert.equal(easyChecks.f2.markedDown, true);
assert.equal(easyChecks.f2.items.find((it) => it.slot === "margin").credit, 0);
assert.equal(easyChecks.f2.items.find((it) => it.slot === "packSize").credit, 1);
assert.equal(easyChecks.f2.items.find((it) => it.slot === "gst").credit, 1);
assert.equal(easyChecks.f3.markedDown, false);
assert.equal(easyChecks.f3.items.find((it) => it.slot === "resilience").credit, 1);

const gapOne = easeScreeningChecks(previewAdvisoryChecks({ division: "Personal Care", f1: { declaredGap: 1, benchmark: "Dove", growthRoute: "penetration" } }), {
  division: "Personal Care",
  f1: { declaredGap: 1, benchmark: "Dove", growthRoute: "penetration" },
}).checks;
assert.equal(gapOne.f1.items.find((it) => it.slot === "gap").credit, 0);
assert.equal(gapOne.f1.markedDown, true);

const gapZero = easeScreeningChecks(
  previewAdvisoryChecks({ division: "Personal Care", f1: { declaredGap: 0, growthRoute: "new market", benchmark: "Dove" } }),
  { division: "Personal Care", f1: { declaredGap: 0, growthRoute: "new market", benchmark: "Dove" } }
).checks;
assert.equal(gapZero.f1.items.find((it) => it.slot === "gap").credit, 1);

const gapZeroOld = easeScreeningChecks(
  previewAdvisoryChecks({ division: "Personal Care", f1: { declaredGap: 0, growthRoute: "penetration", benchmark: "Dove" } }),
  { division: "Personal Care", f1: { declaredGap: 0, growthRoute: "penetration", benchmark: "Dove" } }
).checks;
assert.equal(gapZeroOld.f1.items.find((it) => it.slot === "gap").credit, 0);

const stubChecks = easeScreeningChecks(
  {
    f1: {
      items: [
        { slot: "derivation", status: "done", credit: 1, text: "Gap derivation none", level: "strong" },
        { slot: "parity", status: "done", credit: 1, text: "Parity exceptions yes", level: "strong" },
      ],
    },
  },
  { f1: { gapDerivation: "no", parityExceptions: "yes" } }
).checks;
assert.equal(stubChecks.f1.items.find((it) => it.slot === "derivation").credit, 0);
assert.equal(stubChecks.f1.items.find((it) => it.slot === "parity").credit, 0);

const noFile = easeScreeningChecks(
  {
    f1: {
      checkLabel: "Evidence missing",
      items: [
        {
          slot: "attributes",
          status: "pending",
          credit: 0,
          code: "F1_ATTRIBUTES_NO_EVIDENCE",
          text: "Upload a study or paste a link in Evidence Source",
          reasons: ["NO_EVIDENCE"],
        },
        {
          slot: "gap",
          status: "pending",
          credit: 0,
          code: "F1_GAP_BELOW_FLOOR",
          text: "Declared gap 1 is marked down",
          reasons: ["BELOW_FLOOR", "MARKED_DOWN"],
        },
      ],
    },
    f3: {
      checkLabel: "Marked down",
      markedDown: true,
      capsGo: true,
      items: [
        {
          slot: "resilience",
          status: "pending",
          credit: 0,
          code: "F3_RESILIENCE_CANNOT_ASSESS",
          text: "Cannot assess: no verified volume evidence when comparable packs crossed ₹10.",
          reasons: ["NO_EVIDENCE_FOR_POINT_10"],
        },
      ],
    },
  },
  { f1: { declaredGap: 1 } }
).checks;
assert.equal(noFile.f1.items.find((it) => it.slot === "attributes").credit, 1);
assert.equal(noFile.f1.items.find((it) => it.slot === "gap").credit, 0);
assert.equal(noFile.f1.markedDown, true);
assert.equal(noFile.f3.items[0].credit, 1);
assert.equal(noFile.f3.markedDown, false);
assert.equal(noFile.f3.checkLabel, "Cleared");

const lossStill = easeScreeningChecks(
  {
    f3: {
      checkLabel: "Marked down",
      markedDown: true,
      items: [
        {
          slot: "resilience",
          status: "pending",
          credit: 0,
          code: "F3_RESILIENCE_FAIL",
          text: "Crossing ₹10 models about 18% volume loss — above the 10% limit.",
          reasons: ["ABOVE_CEILING"],
        },
      ],
    },
  },
  {}
).checks;
assert.equal(lossStill.f3.items[0].credit, 0);
assert.equal(lossStill.f3.markedDown, true);

// One real mark-down, and the other slots only at partial credit, must not stay near 40% NO-GO.
const partialSlot = (slot, credit) => ({
  slot,
  status: "done",
  credit,
  level: "adequate",
  text: `${slot} entered`,
  reasons: [],
});
const aligned = easeScreeningChecks(
  {
    f1: {
      checkLabel: "Marked down",
      markedDown: true,
      items: [
        partialSlot("benchmark", 2 / 3),
        {
          slot: "gap",
          status: "pending",
          credit: 0,
          level: "none",
          text: "Declared gap 1 is marked down",
          reasons: ["BELOW_FLOOR", "MARKED_DOWN"],
        },
        partialSlot("attributes", 1 / 3),
        partialSlot("derivation", 2 / 3),
        partialSlot("parity", 2 / 3),
        partialSlot("route", 2 / 3),
        partialSlot("argument", 2 / 3),
      ],
    },
    f2: {
      checkLabel: "Cleared",
      items: [partialSlot("margin", 1), partialSlot("packSize", 1), partialSlot("gst", 1)],
    },
    f3: { checkLabel: "Cleared", items: [partialSlot("resilience", 1)] },
    f4: {
      checkLabel: "Cleared",
      items: [
        "Functional core stability",
        "Consumption context stability",
        "Manufacturing disruption risk",
        "User habit shift potential",
        "Adjacent substitution threat",
        "Purchase frequency shift",
        "Regulatory disruption risk",
      ].map((label) => ({ status: "done", credit: 1, level: "strong", text: `${label}: low risk` })),
    },
  },
  {
    division: "Personal Care",
    f1: {
      declaredGap: 1,
      benchmark: "Dove",
      declaredAttribute: "soft hair",
      gapDerivation: "stays cold longer than the bottle",
      parityExceptions: "no added sugar versus the named drink",
      growthRoute: "penetration",
      growthArgument: "buyers add a second pack each month",
    },
  }
).checks;
assert.equal(aligned.f1.items.find((it) => it.slot === "gap").credit, 0);
assert.equal(aligned.f1.items.filter((it) => it.slot !== "gap").every((it) => it.credit === 1), true);
const alignedScore = scoreAdvisoryChecks(aligned);
assert.equal(alignedScore.pct, 94);
assert.equal(alignedScore.points, 17);
assert.equal(computeGoNoGo(aligned), "WATCH");
assert.equal(computeGoNoGo(aligned) === "NO-GO", false);

// Level 2 — Apprentice: tighten gap, argument, pack, GST, volume-loss note, and F4 views.
const apprenticeDoc = {
  screeningDifficulty: 2,
  division: "Personal Care",
  f1: {
    declaredAttribute: "soft hair",
    benchmark: "Dove",
    declaredGap: 1.5,
    gapDerivation: "stays cold longer than the bottle",
    parityExceptions: "no added sugar versus the named drink",
    growthRoute: "penetration",
    growthArgument: "none",
  },
  f2: { cogsAtScale: 30, netMarginAtScale: 55, gstRatePct: 7, grammage: "100" },
  f3: { volumeLossJustification: "Price stays flat for five years." },
  f4: {
    userInputs: { functionalCoreStability: { rating: "Medium", pov: "" } },
    techShiftRisk: {
      dimensions: {
        functionalCoreStability: { risk: "Medium", reason: "Pack format may shift" },
      },
    },
  },
};
const apprentice = easeScreeningChecks(
  {
    ...previewAdvisoryChecks(scoringDocForEnteredCredit(apprenticeDoc)),
    f4: {
      checkLabel: "Evidence missing",
      items: [
        {
          status: "done",
          credit: 1,
          level: "strong",
          text: "Functional core stability: Medium risk — Pack format may shift",
        },
      ],
    },
  },
  apprenticeDoc
).checks;
assert.equal(apprentice.f1.items.find((it) => it.slot === "gap").credit, 0);
assert.equal(apprentice.f1.items.find((it) => it.slot === "argument").credit, 0);
assert.equal(apprentice.f2.items.find((it) => it.slot === "packSize").credit, 0);
assert.equal(apprentice.f2.items.find((it) => it.slot === "gst").credit, 0);
assert.equal(apprentice.f3.items.find((it) => it.slot === "resilience").credit, 0);
assert.equal(apprentice.f4.items[0].credit, 0);

const apprenticePass = easeScreeningChecks(
  previewAdvisoryChecks(
    scoringDocForEnteredCredit({
      screeningDifficulty: 2,
      division: "Personal Care",
      f1: {
        declaredAttribute: "soft hair",
        benchmark: "Dove",
        declaredGap: 2,
        gapDerivation: "stays cold longer than the bottle",
        parityExceptions: "no added sugar versus the named drink",
        growthRoute: "penetration",
        growthArgument: "buyers add a second pack each month from the summer lift",
      },
      f2: { cogsAtScale: 30, netMarginAtScale: 55, gstRatePct: 18, grammage: "100 ml" },
      f3: {
        volumeLossJustification:
          "Shelf price is held flat for five years including inflation so volume loss stays inside 10%.",
      },
    })
  ),
  {
    screeningDifficulty: 2,
    division: "Personal Care",
    f1: {
      declaredAttribute: "soft hair",
      benchmark: "Dove",
      declaredGap: 2,
      gapDerivation: "stays cold longer than the bottle",
      parityExceptions: "no added sugar versus the named drink",
      growthRoute: "penetration",
      growthArgument: "buyers add a second pack each month from the summer lift",
    },
    f2: { cogsAtScale: 30, netMarginAtScale: 55, gstRatePct: 18, grammage: "100 ml" },
    f3: {
      volumeLossJustification:
        "Shelf price is held flat for five years including inflation so volume loss stays inside 10%.",
    },
  }
).checks;
assert.equal(apprenticePass.f1.items.find((it) => it.slot === "gap").credit, 1);
assert.equal(apprenticePass.f1.items.find((it) => it.slot === "argument").credit, 1);
assert.equal(apprenticePass.f2.items.find((it) => it.slot === "packSize").credit, 1);
assert.equal(apprenticePass.f2.items.find((it) => it.slot === "gst").credit, 1);
assert.equal(apprenticePass.f3.items.find((it) => it.slot === "resilience").credit, 1);

// Level 3 — Professional: no Rookie soft credit; F4 match still clears; mismatch stays open with no paste tip.
const professionalBase = {
  screeningDifficulty: 3,
  division: "Personal Care",
  f1: {
    declaredAttribute: "soft hair",
    benchmark: "Dove",
    declaredGap: 2,
    gapDerivation: "stays cold longer than the bottle",
    parityExceptions: "no added sugar versus the named drink",
    growthRoute: "penetration",
    growthArgument: "buyers add a second pack each month from the summer lift",
  },
  f2: { cogsAtScale: 30, netMarginAtScale: 55, gstRatePct: 18, grammage: "100 ml" },
  f3: {
    volumeLossJustification:
      "Shelf price is held flat for five years including inflation so volume loss stays inside 10%.",
  },
  f4: {
    userInputs: {
      functionalCoreStability: { rating: "Medium", pov: "Pack format may shift" },
    },
    techShiftRisk: {
      dimensions: {
        functionalCoreStability: { risk: "Medium", reason: "Pack format may shift" },
      },
    },
  },
};
const professional = easeScreeningChecks(
  {
    ...previewAdvisoryChecks(scoringDocForEnteredCredit(professionalBase)),
    f4: {
      checkLabel: "Evidence missing",
      items: [
        {
          status: "pending",
          credit: 0,
          level: "none",
          text: "Functional core stability: Medium risk — Pack format may shift",
        },
      ],
    },
  },
  professionalBase
).checks;
assert.equal(professional.f1.items.find((it) => it.slot === "attributes").credit, 0);
assert.equal(professional.f1.items.find((it) => it.slot === "benchmark").credit, 0);
assert.equal(professional.f1.items.find((it) => it.slot === "derivation").credit, 0);
assert.equal(professional.f1.items.find((it) => it.slot === "parity").credit, 0);
assert.equal(professional.f1.items.find((it) => it.slot === "route").credit, 0);
assert.equal(professional.f1.items.find((it) => it.slot === "argument").credit, 0);
assert.equal(professional.f1.items.find((it) => it.slot === "gap").credit, 1, "gap floor stays a local rule");
assert.equal(professional.f2.items.find((it) => it.slot === "packSize").credit, 1, "pack unit stays a local rule");
assert.equal(professional.f2.items.find((it) => it.slot === "gst").credit, 0, "GST waits for the web check");
assert.equal(professional.f4.items[0].credit, 1);
assert.equal(
  f4Improvement(
    {
      ...professionalBase,
      f4: {
        ...professionalBase.f4,
        userInputs: {
          functionalCoreStability: { rating: "Medium", pov: "Something else entirely" },
        },
      },
    },
    "functionalCoreStability"
  ),
  "",
  "Level 3 does not tip the person to paste a hidden finding"
);

console.log("user fixes ok");
