import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { displayCopy } from "../lib/displayCopy.js";
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
assert.match(displayCopy("Parity exceptions none", {}), /type none if you are not giving anything up/i);
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
for (const field of ["gapDerivation", "parityExceptions", "growthRoute", "growthArgument", "grammage", "mrpInr"]) {
  assert.match(keyFn, new RegExp(field));
}
assert.match(form, /AI analysis/);
assert.match(form, /forceResearch: Boolean\(submitOpts\.forceResearch\) \|\| ideaChanged/);

const parsed = parseIdeaAnalysis(
  'Here you go {"summary":"Name a drink people already buy.","suggestions":["Write the gap as a shopper-visible difference.","Pick new market if the buyer is not an athlete.",""]}'
);
assert.equal(parsed.suggestions.length, 2);
assert.match(buildIdeaAnalysisUser({ ideaDescription: "a daily electrolyte drink" }), /daily electrolyte/);
assert.throws(() => parseIdeaAnalysis("not json"), /did not return a suggestion/);

console.log("user fixes ok");
