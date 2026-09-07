import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF1, evaluateDeclaredGap, isClaimingNoCompetitor } from "../lib/filterChecks.js";

const patchF1 = {
  declaredAttribute: "temperature-adaptive odour control",
  benchmark: "a currently-selling fragrance-patch format in personal care",
  declaredGap: 0,
  growthRoute: "penetration",
  growthArgument: "no incumbent owns a temperature-adaptive patch",
};

const unverifiedFindings = {
  benchmarkVerified: false,
  benchmarkEvidence: "Research did not verify a currently-selling fragrance-patch format as a named brand.",
  noCompetitorCheck: {
    majorCompetitorsFound: [],
    searchSummary: "no established temperature-adaptive fragrance patch brand found in India retail",
  },
  categorySizeFound: true,
};

assert.equal(
  isClaimingNoCompetitor(patchF1, unverifiedFindings),
  true,
  "unverified AI placeholder in benchmark must still trigger the no-competitor check"
);
assert.equal(isClaimingNoCompetitor(patchF1, {}), true);
assert.equal(isClaimingNoCompetitor(patchF1, { benchmarkVerified: false }), true);

const patchCheck = checkF1(patchF1, unverifiedFindings);
const gapItem = patchCheck.items.find((it) => /first-mover|below the 2\.0 floor/i.test(it.text));
assert.ok(gapItem);
assert.equal(gapItem.status, "done");
assert.match(gapItem.text, /first-mover/);
assert.doesNotMatch(gapItem.text, /below the 2\.0 floor/);
assert.notEqual(patchCheck.checkLabel, "Below floor");

const benchmarkItem = patchCheck.items.find((it) => /benchmark/i.test(it.text));
assert.ok(benchmarkItem);
assert.equal(benchmarkItem.status, "pending");
assert.match(benchmarkItem.text, /not verified/);
assert.match(gapItem.text, /first-mover/, "unverified benchmark item and first-mover gap must coexist");

const novelF1 = {
  declaredAttribute: "enzyme-stable probiotic sachet for ambient dal",
  declaredGap: 0,
  growthRoute: "penetration",
  growthArgument: "first-mover in ambient probiotic dal",
};
assert.equal(
  evaluateDeclaredGap(novelF1, {
    noCompetitorCheck: {
      majorCompetitorsFound: ["Local Kirana Mix (unbranded)"],
      searchSummary: "one ambiguous regional mix, not a major brand",
    },
  }).status,
  "done"
);

const crowded = checkF1(novelF1, {
  noCompetitorCheck: {
    majorCompetitorsFound: ["MTR", "iD Fresh", "ITC Aashirvaad"],
    searchSummary: "ready-to-cook dal kits already on shelf",
  },
});
assert.equal(crowded.checkLabel, "Below floor");
assert.match(crowded.items.find((it) => /established competitors/i.test(it.text)).text, /MTR/);

const shortGap = {
  declaredAttribute: "cooling",
  declaredGap: 1.5,
  growthRoute: "penetration",
  growthArgument: "share take",
};
assert.equal(isClaimingNoCompetitor(shortGap, { benchmarkVerified: false }), false);
const short = checkF1(shortGap, {
  noCompetitorCheck: { majorCompetitorsFound: [], searchSummary: "should be ignored" },
});
assert.equal(short.checkLabel, "Below floor");
assert.match(short.items.find((it) => /1\.5/.test(it.text)).text, /below the 2\.0 floor/);
assert.doesNotMatch(short.items.find((it) => /1\.5/.test(it.text)).text, /first-mover/);

const verifiedZero = {
  declaredAttribute: "cooling",
  benchmark: "Nivea",
  declaredGap: 0,
  growthRoute: "penetration",
  growthArgument: "share take",
};
assert.equal(
  isClaimingNoCompetitor(verifiedZero, { benchmarkVerified: true }),
  false,
  "verified competitor + gap 0 must not take the first-mover exception"
);
const verifiedCheck = checkF1(verifiedZero, {
  benchmarkVerified: true,
  noCompetitorCheck: {
    majorCompetitorsFound: [],
    searchSummary: "must be ignored because a verified competitor already exists",
  },
  categorySizeFound: true,
});
assert.equal(verifiedCheck.checkLabel, "Below floor");
const verifiedGap = verifiedCheck.items.find((it) => /gap/i.test(it.text));
assert.equal(verifiedGap.status, "pending");
assert.match(verifiedGap.text, /below the 2\.0 floor/);
assert.doesNotMatch(verifiedGap.text, /first-mover/);

const triggerSrc = readFileSync(new URL("../lib/propositionAiFirstPass.js", import.meta.url), "utf8");
assert.match(triggerSrc, /isClaimingNoCompetitor\(proposition\.f1, proposition\.researchFindings\?\.f1\)/);
assert.match(triggerSrc, /\[primus\/no-competitor\] trigger claiming=/);
const attachSrc = readFileSync(new URL("../lib/filters/runNoCompetitorCheck.js", import.meta.url), "utf8");
assert.match(attachSrc, /isClaimingNoCompetitor\(proposition\?\.f1, f1Findings\)/);
assert.match(attachSrc, /\[primus\/no-competitor\] run/);
const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /isClaimingNoCompetitor\(payload\.f1 \|\| \{\}, findings\?\.f1 \|\| \{\}\)/);

console.log("PASS Part 77 no-competitor check keys off verified benchmark, not a filled field");
