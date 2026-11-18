/**
 * Part 145 D110 — "pure commodity" is a sourced research finding, never a tick.
 *  1. decideExemption: yes only with a quote, a source the search returned, and medium/high confidence.
 *  2. Scoring: an exempt idea is scored over 11 checks (Filter 1's seven leave numerator and denominator);
 *     a non-exempt idea, and an idea with only the old tick, stays at 18. No free marks.
 *  3. The Filter 1 research step returns the commodity finding with a source (stubbed model, real code).
 *  4. An idea stored under the old tick keeps its stored score and is labelled "Scored under an older release".
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-commodity-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
for (const key of Object.keys(process.env)) {
  if (key === "ANTHROPIC_API_KEY" || key.startsWith("DEPT_API_KEY")) delete process.env[key];
}
process.env.ANTHROPIC_API_KEY = `sk-${"ant"}-stub-local-only`;

const {
  decideExemption,
  isF1ExemptByResearch,
  normalizeCommodityFinding,
  scoredUnderOlderRelease,
  OLDER_RELEASE_LABEL,
} = await import("../lib/commodityExemption.js");
const { scoreAdvisoryChecks } = await import("../lib/goNoGo.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { annotateSealedGoNoGo } = await import("../lib/scoringRuleset.js");
const { SCORING_RULESET_VERSION } = await import("../lib/lockedConstants.js");
const { TECH_SHIFT_DIMENSIONS } = await import("../lib/techShiftRisk.js");

let checks = 0;
async function check(name, fn) {
  try {
    await fn();
    checks += 1;
    console.log(`  ok ${checks} — ${name}`);
  } catch (e) {
    e.message = `${name}: ${e.message}`;
    throw e;
  }
}

const SOURCE = "https://example.com/salt-category";
const good = {
  pureCommodity: true,
  reason: "Plain salt competes on price with no differentiation",
  source_url: SOURCE,
  quote: "Packaged salt is sold on price with no meaningful differentiation",
  confidence: "high",
  returnedSources: [SOURCE],
};

// ───────────── 1. the decision ─────────────
await check("a quote, a returned source and medium/high confidence exempt", () => {
  assert.equal(decideExemption(good).exempt, true);
  assert.equal(decideExemption({ ...good, confidence: "medium" }).exempt, true);
});

await check("every missing ingredient refuses the exemption", () => {
  assert.equal(decideExemption(null).exempt, false);
  assert.equal(decideExemption({ ...good, pureCommodity: false }).exempt, false, "research said no");
  assert.equal(decideExemption({ ...good, confidence: "low" }).exempt, false, "low confidence");
  assert.equal(decideExemption({ ...good, quote: "" }).exempt, false, "no quote");
  assert.equal(decideExemption({ ...good, source_url: "" }).exempt, false, "no source");
  assert.equal(
    decideExemption({ ...good, source_url: "https://invented.example/page" }).exempt,
    false,
    "a source the search never returned"
  );
});

// ───────────── 2. scoring ─────────────
function docWith(f1Extra = {}, researchF1 = {}) {
  const dims = Object.fromEntries(TECH_SHIFT_DIMENSIONS.map((k) => [k, { risk: "Low", reason: "stable" }]));
  return {
    id: "c1",
    name: "Commodity salt",
    category: "Staples",
    division: "Foods",
    ideaDescription: "Iodised table salt",
    f1: {
      declaredAttribute: "Purity",
      benchmark: "Tata Salt 1 kg",
      declaredGap: 3,
      gapDerivation: "Cleaner crystals",
      parityExceptions: "none",
      growthRoute: "penetration",
      growthArgument: "Households still under-indexed",
      ...f1Extra,
    },
    f2: { cogsAtScale: 10, netMarginAtScale: 40, gstRatePct: 5, grammage: "1 kg", mrpInr: 20 },
    f3: { plannedAnnualIncreasePct: 5 },
    f4: { techShiftRisk: { dimensions: dims } },
    researchFindings: {
      f1: { attributeValidation: [{ attribute: "Purity", isPurchaseDriver: true }], benchmarkVerified: true, ...researchF1 },
      f4: {},
    },
  };
}
const totalOf = async (doc) => scoreAdvisoryChecks(await computeAllAdvisoryChecks(doc));

await check("not exempt: eighteen checks", async () => {
  assert.equal((await totalOf(docWith())).total, 18);
});

await check("a sourced finding: eleven checks, Filter 1 leaves numerator and denominator", async () => {
  const s = await totalOf(docWith({}, { commodityFinding: good }));
  assert.equal(s.total, 11);
  assert.equal(s.byFilter.f1.total, 0);
  assert.equal(s.byFilter.f1.done, 0);
  assert.ok(s.done <= s.total);
});

await check("the old typed tick alone exempts nothing: still eighteen checks", async () => {
  const s = await totalOf(docWith({ pureCommodity: true }));
  assert.equal(s.total, 18);
  assert.equal(s.byFilter.f1.total, 7);
});

await check("a finding whose source the search did not return exempts nothing", async () => {
  const bad = { ...good, source_url: "https://invented.example/page" };
  assert.equal(isF1ExemptByResearch(docWith({}, { commodityFinding: bad })), false);
  assert.equal((await totalOf(docWith({}, { commodityFinding: bad }))).total, 18);
});

await check("exemption gives no free marks: the percent is the share of the remaining checks", async () => {
  const s = await totalOf(docWith({}, { commodityFinding: good }));
  assert.equal(s.pct, Math.round((100 * s.done) / s.total));
});

// ───────────── 3. the Filter 1 research step ─────────────
const realFetch = globalThis.fetch;
let modelCalls = [];
function stubModel({ returnedUrl, finding }) {
  modelCalls = [];
  globalThis.fetch = async (url, options) => {
    if (!String(url).includes("api.anthropic.com")) return realFetch(url, options);
    const body = JSON.parse(options.body);
    modelCalls.push(body);
    const searching = (body.tools || []).some((t) => t.name === "web_search");
    const content = searching
      ? [
          { type: "web_search_tool_result", tool_use_id: "t1", content: [{ type: "web_search_result", url: returnedUrl, title: "Salt category" }] },
          { type: "text", text: "Packaged salt is sold on price with no meaningful differentiation." },
        ]
      : [
          {
            type: "text",
            text: JSON.stringify({
              attribute: "Purity",
              categoryKeyAttributes: ["price"],
              attributeValidation: [],
              commodityFinding: finding,
            }),
          },
        ];
    return new Response(
      JSON.stringify({
        content,
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: searching ? 1 : 0 } },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
}

const { runCategorySizing } = await import("../lib/categoryIntelligence/runSizing.js");
const sizingArgs = {
  ideaText: "Iodised table salt",
  categoryName: "Staples",
  attribute: "Purity",
  benchmarkName: "Tata Salt 1 kg",
  persist: false,
};

try {
  await check("the research step returns the commodity finding with a source the search returned", async () => {
    stubModel({
      returnedUrl: SOURCE,
      finding: { pureCommodity: true, reason: good.reason, source_url: SOURCE, quote: good.quote, confidence: "high" },
    });
    const out = await runCategorySizing(sizingArgs);
    assert.ok(out.parsed, `research parsed (${out.error || ""})`);
    const f = out.parsed.commodityFinding;
    assert.ok(f, "a commodity finding is returned");
    assert.equal(f.pureCommodity, true);
    assert.equal(f.source_url, SOURCE);
    assert.equal(f.quote, good.quote);
    assert.equal(f.confidence, "high");
    assert.ok(f.returnedSources.includes("example.com/salt-category"), "the search's own URL is recorded beside it");
    assert.equal(decideExemption(f).exempt, true);
    assert.ok(modelCalls.some((c) => (c.tools || []).some((t) => t.name === "web_search")), "the web search ran");
    const prompt = modelCalls.map((c) => JSON.stringify(c.system || "") + JSON.stringify(c.messages)).join("\n");
    assert.match(prompt, /commodityFinding/, "the model is asked for the finding");
    assert.doesNotMatch(prompt, /"pureCommodity":\s*true.*tick/i);
  });

  await check("a finding that cites a page the search never returned is kept but does not exempt", async () => {
    stubModel({
      returnedUrl: "https://example.com/other-page",
      finding: { pureCommodity: true, reason: "x", source_url: "https://invented.example/page", quote: "salt is salt", confidence: "high" },
    });
    const out = await runCategorySizing(sizingArgs);
    assert.ok(out.parsed);
    assert.equal(out.parsed.commodityFinding.pureCommodity, true);
    assert.equal(decideExemption(out.parsed.commodityFinding).exempt, false);
  });

  await check("no finding from the model: nothing is exempt", async () => {
    stubModel({ returnedUrl: SOURCE, finding: undefined });
    const out = await runCategorySizing(sizingArgs);
    assert.ok(out.parsed);
    assert.equal(decideExemption(out.parsed.commodityFinding).exempt, false);
  });
} finally {
  globalThis.fetch = realFetch;
}

await check("normalizeCommodityFinding cleans the shape", () => {
  const n = normalizeCommodityFinding({ pureCommodity: "true", confidence: "HIGH", source_url: ` ${SOURCE} `, quote: " q " }, [{ url: SOURCE }]);
  assert.equal(n.pureCommodity, true);
  assert.equal(n.confidence, "high");
  assert.equal(n.quote, "q");
  assert.equal(normalizeCommodityFinding(null), null);
});

// ───────────── 4. an old-tick idea keeps its stored score, labelled ─────────────
await check("an idea stored under the old tick keeps its stored score, labelled", () => {
  const stored = {
    classification: "GO",
    rulesetVersion: SCORING_RULESET_VERSION,
    score: { pct: 91, done: 10, total: 11, rulesetVersion: SCORING_RULESET_VERSION },
    output: { filters: { f1: { label: "Exempt" } } },
  };
  const doc = { ...docWith({ pureCommodity: true }), goNoGo: stored };
  assert.equal(scoredUnderOlderRelease(doc), true);
  const annotated = annotateSealedGoNoGo(doc, stored);
  assert.equal(annotated.scoreStatus, "older-ruleset", "labelled as an older release");
  assert.equal(annotated.score.pct, 91, "the stored percent is not rewritten");
  assert.equal(annotated.score.total, 11);
  assert.equal(annotated.classification, "GO");
  assert.equal(OLDER_RELEASE_LABEL, "Scored under an older release");
});

await check("an exempt score that rests on a sourced finding is current, not labelled", () => {
  const stored = {
    classification: "GO",
    rulesetVersion: SCORING_RULESET_VERSION,
    score: { pct: 91, done: 10, total: 11, rulesetVersion: SCORING_RULESET_VERSION },
    output: { filters: { f1: { label: "Exempt" } } },
  };
  const doc = { ...docWith({}, { commodityFinding: good }), goNoGo: stored };
  assert.equal(scoredUnderOlderRelease(doc), false);
});

console.log(`PASS testPureCommodityExemption — ${checks} checks`);
process.exit(0);
