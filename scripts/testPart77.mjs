import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF1, evaluateDeclaredGap, isClaimingNoCompetitor } from "../lib/filterChecks.js";

// Part 133: first-mover = explicit gap 0 with empty benchmark.
// A typed (even unverified) benchmark with gap 0 is below the floor.
const patchF1 = {
  declaredAttribute: "temperature-adaptive odour control",
  benchmark: "a currently-selling fragrance-patch format in personal care",
  declaredGap: 0,
  growthRoute: "penetration",
  growthArgument: "no incumbent owns a temperature-adaptive patch",
};

assert.equal(
  isClaimingNoCompetitor(patchF1, { benchmarkVerified: false }),
  false,
  "gap 0 with a typed benchmark is not a first-mover claim"
);
assert.equal(isClaimingNoCompetitor(patchF1, {}), false);

const patchCheck = checkF1(patchF1, {
  benchmarkCheck: { status: "not-found", reason: "placeholder not a named product" },
});
assert.equal(patchCheck.checkLabel, "Below floor");
const patchGap = patchCheck.items.find((it) => it.slot === "gap");
assert.equal(patchGap.status, "pending");
assert.match(patchGap.text, /below the 2\.0 floor/);
assert.doesNotMatch(patchGap.text, /first-mover/);

const novelF1 = {
  declaredAttribute: "enzyme-stable probiotic sachet for ambient dal",
  declaredGap: 0,
  growthRoute: "penetration",
  growthArgument: "first-mover in ambient probiotic dal",
};
assert.equal(isClaimingNoCompetitor(novelF1, {}), true);
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
assert.match(crowded.items.find((it) => /competitors/i.test(it.text)).text, /MTR/);

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
  benchmarkCheck: { status: "relevant", source_url: "https://example.com/nivea" },
  noCompetitorCheck: {
    majorCompetitorsFound: [],
    searchSummary: "must be ignored because a verified competitor already exists",
  },
});
assert.equal(verifiedCheck.checkLabel, "Below floor");
const verifiedGap = verifiedCheck.items.find((it) => it.slot === "gap");
assert.equal(verifiedGap.status, "pending");
assert.match(verifiedGap.text, /below the 2\.0 floor/);
assert.doesNotMatch(verifiedGap.text, /first-mover/);

const emptyBenchZero = {
  declaredAttribute: "cooling",
  declaredGap: 0,
  growthRoute: "penetration",
  growthArgument: "share take",
};
const firstMoverOk = checkF1(emptyBenchZero, {
  noCompetitorCheck: {
    majorCompetitorsFound: [],
    searchSummary: "no established competitor",
  },
});
assert.notEqual(firstMoverOk.checkLabel, "Below floor");
assert.equal(firstMoverOk.items.find((it) => it.slot === "gap").status, "done");

const triggerSrc = readFileSync(new URL("../lib/propositionAiFirstPass.js", import.meta.url), "utf8");
assert.match(triggerSrc, /isClaimingNoCompetitor\(proposition\.f1, proposition\.researchFindings\?\.f1\)/);
assert.match(triggerSrc, /\[primus\/no-competitor\] trigger claiming=/);
const attachSrc = readFileSync(new URL("../lib/filters/runNoCompetitorCheck.js", import.meta.url), "utf8");
assert.match(attachSrc, /isClaimingNoCompetitor\(proposition\?\.f1, f1Findings\)/);
assert.match(attachSrc, /\[primus\/no-competitor\] run/);
const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /isClaimingNoCompetitor\(payload\.f1 \|\| \{\}, findings\?\.f1 \|\| \{\}\)/);

console.log("PASS Part 77 first-mover = gap 0 + empty benchmark (Part 133)");
