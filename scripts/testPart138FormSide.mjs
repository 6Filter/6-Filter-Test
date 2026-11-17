/**
 * Part 138 — form/API side: required fields, GST D52, net-margin default, narrative guard,
 * concept-card grounding, evidence F5/F6 topics, GST migration.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { firstMissingRequiredField } from "../lib/propositionsApi.js";
import { narrativeGuardMode } from "../lib/narrativeGuard.js";
import { validateNarrativeParagraph } from "../lib/narrativeCheck.js";
import { groundConceptCardFields, normalizeForMatch } from "../lib/filters/extractConceptCard.js";
import { f5f6FromFacts, f5f6SuggestionsFromEvidence, verifyEvidenceFacts } from "../lib/evidenceRead.js";
import { applyDivisionMinimumMargin } from "../lib/netMarginDefault.js";
import { assessGstRate, clearPlaceholderGst, gstRateForSave, resolveGst } from "../lib/gstRate.js";
import { f2SuggestionsFromCostEstimate } from "../lib/researchFindings.js";
import { SIX_FILTERS_FORM } from "../lib/propositionFields.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// --- A: required fields (all display-Required boxes gate Submit) ---
assert.equal(firstMissingRequiredField({ name: " ", category: "x", ideaDescription: "y" }).field, "submitterName");
assert.equal(
  firstMissingRequiredField({
    submitterName: "A",
    submitterDepartment: "CIA",
    name: "a",
    category: "  ",
    ideaDescription: "y",
  }).field,
  "category"
);
assert.equal(
  firstMissingRequiredField({
    submitterName: "A",
    submitterDepartment: "CIA",
    name: "a",
    category: "b",
    ideaDescription: "\n",
  }).field,
  "ideaDescription"
);
const allRequired = {
  submitterName: "A",
  submitterDepartment: "CIA",
  name: "a",
  category: "b",
  ideaDescription: "c",
  f1: {
    declaredAttribute: "cool",
    benchmark: "Brand X 100ml",
    declaredGap: 2,
    gapDerivation: "lasts",
    parityExceptions: "none",
    growthRoute: "penetration",
    growthArgument: "grow",
  },
  f2: { cogsAtScale: 10, netMarginAtScale: 20, gstRatePct: 18, grammage: "100 ml" },
};
assert.equal(firstMissingRequiredField(allRequired), null);
assert.equal(
  firstMissingRequiredField(
    { name: "a", f1: allRequired.f1, f2: allRequired.f2 },
    {
      submitterName: "A",
      submitterDepartment: "CIA",
      category: "b",
      ideaDescription: "c",
    }
  ),
  null
);
{
  const api = read("../lib/propositionsApi.js");
  const put = api.indexOf('if (req.method === "PUT")');
  const required = api.indexOf("firstMissingRequiredField(payload, opened)", put);
  const research = api.indexOf("runPropositionResearch({", put);
  assert.ok(put > 0 && required > put && required < research, "required-field check runs before research");
}

// --- E: GST D52 ---
{
  const api = read("../lib/propositionsApi.js");
  assert.doesNotMatch(api, /REFRESH_FIELDS = new Set\(\[[^\]]*gstRatePct/);
  assert.doesNotMatch(api, /REFRESH_FIELDS = new Set\(\[[^\]]*grammage/);
  assert.doesNotMatch(api, /tryFill\(\s*"f2\.gstRatePct"/);
  assert.match(api, /for \(const key of \["cogsAtScale", "qcomTrajectory"\]\)/);
  const plain = resolveGst({ name: "Mystery" });
  assert.equal(plain.basis, "default");
  assert.equal(gstRateForSave(plain), null, "placeholder 18 is never saved");
  const cited = resolveGst({ aiProposal: { gstRatePct: 5, source: "https://x.gov.in", asOf: "2025-09-22" } });
  assert.equal(gstRateForSave(cited), 5);
  assert.equal(assessGstRate({ searchUsed: true, resolved: plain }).searchUsed, true);
  assert.equal(assessGstRate({ resolved: plain }).searchUsed, false);
  assert.equal(f2SuggestionsFromCostEstimate({ estimatedCogsPerUnitInr: 10, estimatedGstRatePct: 18 }).gstRatePct, undefined);

  const f2 = SIX_FILTERS_FORM.find((s) => s.key === "f2").fields;
  const gst = f2.find((f) => f.key === "gstRatePct");
  assert.equal(
    gst.helper,
    "Food is usually 5% or 18%; packaged snacks typically 18%. Confirm against the actual HSN rate."
  );
  assert.equal(gst.placeholder, "Enter GST % — e.g. 18");
  const margin = f2.find((f) => f.key === "netMarginAtScale");
  assert.doesNotMatch(margin.helper, /hard stop/i);
  assert.match(margin.helper, /marked down/i);
  assert.match(margin.helper, /Net Margin \(%\) = \(Net Profit ÷ Net Revenue\) × 100/);

  const form = read("../src/PropositionForm.jsx");
  assert.doesNotMatch(form, /resolveGstRate/);
  assert.match(form, /handleRefreshField\("cogsAtScale"\)/);
}

// --- E5: net margin default ---
{
  const empty = applyDivisionMinimumMargin({ division: "Foods", f2: {} });
  assert.equal(empty.changed, true);
  assert.equal(empty.f2.netMarginSource, "division-minimum");
  assert.equal(empty.f2.netMarginAtScale, empty.floor);
  const typed = applyDivisionMinimumMargin({ division: "Foods", f2: { netMarginAtScale: 31, netMarginSource: "user" } });
  assert.equal(typed.changed, false);
  const legacy = applyDivisionMinimumMargin({ division: "Foods", f2: { netMarginAtScale: 31 } });
  assert.equal(legacy.changed, false, "a value with no source flag is never overwritten");
  const moved = applyDivisionMinimumMargin({
    division: "Personal Care",
    f2: { netMarginAtScale: empty.floor, netMarginSource: "division-minimum" },
  });
  if (moved.floor !== empty.floor) assert.equal(moved.f2.netMarginAtScale, moved.floor);
  const none = applyDivisionMinimumMargin({ division: "", f2: {} });
  assert.equal(none.changed, false);
}

// --- H: narrative guard ---
{
  const keep = process.env.NARRATIVE_GUARD;
  delete process.env.NARRATIVE_GUARD;
  assert.equal(narrativeGuardMode(), "enforce");
  process.env.NARRATIVE_GUARD = "shadow";
  assert.equal(narrativeGuardMode(), "shadow");
  if (keep === undefined) delete process.env.NARRATIVE_GUARD;
  else process.env.NARRATIVE_GUARD = keep;

  const checks = { f1: { items: [{ status: "pass", text: "Category size ₹500 Cr in 2024 per Nielsen." }] } };
  const ok = validateNarrativeParagraph("The category is ₹500 Cr in 2024.", { checks, check: checks.f1 });
  assert.equal(ok.ok, true);
  const badDate = validateNarrativeParagraph("The category grew in 2031.", { checks, check: checks.f1 });
  assert.ok(badDate.reasons.includes("unknown-date"));
  const badReg = validateNarrativeParagraph("This needs FSSAI approval.", { checks, check: checks.f1 });
  assert.ok(badReg.reasons.includes("unknown-regulation"));
  const groundedReg = validateNarrativeParagraph("This needs FSSAI approval.", {
    checks,
    check: checks.f1,
    groundText: "FSSAI licence required for packaged foods",
  });
  assert.equal(groundedReg.ok, true);
  const badNumber = validateNarrativeParagraph("It reaches 40 million households.", { checks, check: checks.f1 });
  assert.ok(badNumber.reasons.includes("unknown-number"));
}

// --- B: concept card grounding ---
{
  const doc = "Concept card\nCategory: Hair Oils\nBenchmark: Dabur Amla 90 ml\nGap vs benchmark: 1.5 points";
  const out = groundConceptCardFields(
    {
      category: "hair oils",
      benchmark: "Dabur  Amla, 90 ml",
      declaredAttribute: "Cooling feel",
      declaredGap: 1.5,
    },
    doc
  );
  assert.deepEqual(Object.keys(out.kept).sort(), ["benchmark", "category", "declaredGap"]);
  assert.deepEqual(out.droppedKeys, ["declaredAttribute"]);
  assert.equal(out.droppedCount, 1);
  assert.equal(out.provenance.category.source, "concept-card");
  assert.equal(groundConceptCardFields({ declaredGap: 4 }, doc).droppedCount, 1);
  assert.equal(normalizeForMatch("  A,  B! "), "a b");
}

// --- D: evidence F5/F6 ---
{
  const text =
    "Year 3 households reached: 12.5 million. Trial rate 8%. Lab gap vs benchmark 1.2 points. Panel beaters 14 of 20.";
  const facts = verifyEvidenceFacts(
    [
      { topic: "f5.householdsReachedY3Mn", statement: "hh", quote: "households reached: 12.5 million", figure: 12.5 },
      { topic: "f5.trialRatePct", statement: "trial", quote: "Trial rate 8%", figure: 8 },
      { topic: "f6.labGapVsBenchmark", statement: "lab", quote: "Lab gap vs benchmark 1.2 points", figure: 1.2 },
      { topic: "f6.consumerPanelBeaters", statement: "panel", quote: "Panel beaters 14 of 20", figure: 99 },
      { topic: "f5.repeatConversionPct", statement: "rep", quote: "not in the document", figure: 20 },
    ],
    text,
    {}
  );
  const byTopic = Object.fromEntries(facts.map((f) => [f.topic, f.verified]));
  assert.equal(byTopic["f5.householdsReachedY3Mn"], true);
  assert.equal(byTopic["f5.trialRatePct"], true);
  assert.equal(byTopic["f6.labGapVsBenchmark"], true);
  assert.equal(byTopic["f6.consumerPanelBeaters"], false, "figure must be in the quote");
  assert.equal(byTopic["f5.repeatConversionPct"], false, "quote must be in the document");
  const { found, notFound } = f5f6FromFacts(facts);
  assert.equal(found.filter((h) => h.filter === "f5").length, 2);
  assert.equal(found.filter((h) => h.filter === "f6").length, 1);
  assert.equal(notFound.length, 8 - 3);
  const sug = f5f6SuggestionsFromEvidence({ facts });
  assert.equal(sug.f5.householdsReachedY3Mn, 12.5);
  assert.equal(sug.f6.labGapVsBenchmark, 1.2);
}

// --- I: migration ---
{
  const ai = clearPlaceholderGst({ gstRatePct: 18, gstBasis: "No rate was found. 18% is a placeholder." }, { f2: {} });
  assert.equal(ai.changed, true);
  assert.equal(ai.f2.gstRatePct, "");
  assert.equal(ai.researchFindings.gstNeeded, true);
  assert.equal(ai.researchFindings.f2.assessments.gst.needed, true);
  const viaStatus = clearPlaceholderGst(
    { gstRatePct: "18", gstBasis: "" },
    { autofillStatus: { "f2.gstRatePct": { status: "filled", value: 18 } } }
  );
  assert.equal(viaStatus.changed, true);
  assert.equal(viaStatus.researchFindings.autofillStatus["f2.gstRatePct"], undefined);
  assert.equal(clearPlaceholderGst({ gstRatePct: 18, gstBasis: "" }, null).changed, false, "human 18 stays");
  assert.equal(clearPlaceholderGst({ gstRatePct: 5, gstBasis: "AI" }, null).changed, false);
  assert.equal(clearPlaceholderGst({ gstRatePct: 18, gstBasis: "Finance rate table: 18%." }, null).changed, false);
  assert.equal(
    clearPlaceholderGst(
      { gstRatePct: 18, gstBasis: "AI" },
      { autofillStatus: { "f2.gstRatePct": { status: "filled", confirmed: true } } }
    ).changed,
    false
  );
  assert.equal(clearPlaceholderGst(ai.f2, ai.researchFindings).changed, false, "idempotent");
  const db = read("../lib/db.js");
  assert.match(db, /export async function migratePart138GstDefault/);
  assert.match(db, /await migratePart138GstDefault\(\{ postgres: true \}\)/);
}

console.log("PASS testPart138FormSide");
