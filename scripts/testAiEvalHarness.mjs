/**
 * Harness tests for scripts/aiEval/. Fake pipeline only — no API key, no network, no database.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

delete process.env.ANTHROPIC_API_KEY;
delete process.env.EVAL_API_KEY;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evalDir = path.join(root, "scripts", "aiEval");

const { LABEL_COLUMNS, parseLabelledSet } = await import("./aiEval/labels.mjs");
const { SCORE_FIELDS, withinOneLevel, gstRatesEqual } = await import("./aiEval/fields.mjs");
const { scorePrediction, fieldStability } = await import("./aiEval/score.mjs");
const { createFakePipeline, fakeFetchImpl } = await import("./aiEval/fakePipeline.mjs");
const { createRealPipeline, assertSafeToRunLive, extractPredicted, envLooksLikeLiveDatabase } =
  await import("./aiEval/realPipeline.mjs");
const { assertPublicHttpsUrl, safeFetchPublicUrl, isBlockedAddress } = await import("./aiEval/safeFetch.mjs");
const { auditCitations } = await import("./aiEval/citationAudit.mjs");
const { runEval } = await import("./aiEval/runEval.mjs");
const { renderIdeaCsv, renderSummaryCsv, renderMarkdown } = await import("./aiEval/report.mjs");

const FETCH = { fetchImpl: fakeFetchImpl, skipDns: true };

function labelledCsv(ids) {
  const tech = [
    "tech_functionalCoreStability",
    "tech_consumptionContextStability",
    "tech_manufacturingDisruptionRisk",
    "tech_userHabitShiftPotential",
    "tech_adjacentSubstitutionThreat",
    "tech_purchaseFrequencyShift",
    "tech_regulatoryDisruptionRisk",
  ];
  const header = LABEL_COLUMNS.join(",");
  const rows = ids.map((id) => {
    const row = {
      id,
      name: "Herbal shampoo",
      category: "Shampoo",
      division: "Personal Care",
      ideaDescription: "A mild herbal shampoo for daily use",
      declaredAttribute: "less silicone",
      benchmark: "Dove",
      declaredGap: "3",
      gapDerivation: "Lab panel beat Dove on combability",
      parityExceptions: "",
      growthRoute: "penetration",
      growthArgument: "Low penetration in Tier-2",
      packSize: "200 ml",
      gstRatePct: "18",
      expectedGstRate: "18",
      benchmarkRelevant: "yes",
      gapCredible: "yes",
      priceEventsDatedAndSourced: "yes",
      routeMatches: "yes",
      expectedVerdict: "WATCH",
      actualOutcome: "unknown",
      labelledBy: "EX",
      labelledDate: "2026-01-01",
    };
    for (const k of tech) row[k] = "Low";
    return LABEL_COLUMNS.map((h) => row[h] ?? "").join(",");
  });
  return [header, ...rows].join("\n");
}

assert.equal(process.env.ANTHROPIC_API_KEY, undefined, "tests must not use an API key");

{
  const fp = JSON.parse(readFileSync(path.join(root, "scripts", "scoringFingerprint.json"), "utf8"));
  assert.equal(fp.rulesetVersion, "v5.7");
  assert.equal(String(fp.fingerprint).slice(0, 8), "ba0156d2");
  assert.equal(Object.keys(fp.files).length, 28);
}

{
  for (const name of readdirSync(evalDir)) {
    if (!/\.(mjs|csv)$/i.test(name)) continue;
    const text = readFileSync(path.join(evalDir, name), "utf8");
    assert.doesNotMatch(text, /readFile(?:Sync)?\s*\([^)]*eval-key/i);
    assert.doesNotMatch(text, /primus-secrets/i);
  }
}

{
  const ideas = parseLabelledSet(labelledCsv(["match"]));
  assert.equal(ideas.length, 1);
  assert.equal(ideas[0].labels.gstRate, 18);
  assert.equal(ideas[0].labels.verdictBand, "WATCH");
  const withEx = parseLabelledSet("id,name\nEXAMPLE-a,A\nreal,B\n", { includeExamples: false });
  assert.equal(withEx.length, 1);
  assert.equal(withEx[0].id, "real");
}

{
  assert.equal(gstRatesEqual("18%", 18), true);
  assert.equal(withinOneLevel("Low", "Medium"), true);
  assert.equal(withinOneLevel("Low", "High"), false);
}

{
  const pipeline = createFakePipeline();
  const predicted = await pipeline.run({ id: "match" });
  const labels = parseLabelledSet(labelledCsv(["match"]))[0].labels;
  const score = scorePrediction(predicted, labels);
  assert.equal(score.matched, SCORE_FIELDS.length);
  assert.equal(score.agreementPct, 100);
  for (const k of SCORE_FIELDS) assert.equal(score.fields[k], true, k);
}

{
  const pipeline = createFakePipeline();
  const predicted = await pipeline.run({ id: "mismatch" });
  const labels = parseLabelledSet(labelledCsv(["mismatch"]))[0].labels;
  const score = scorePrediction(predicted, labels);
  assert.equal(score.matched, 0);
  assert.equal(score.fields.gstRate, false);
  assert.equal(score.fields.techShiftWithinOneLevel, false);
  assert.equal(score.fields.verdictBand, false);
}

{
  const pipeline = createFakePipeline();
  const predicted = await pipeline.run({ id: "adjacent" });
  const labels = parseLabelledSet(labelledCsv(["adjacent"]))[0].labels;
  const score = scorePrediction(predicted, labels);
  assert.equal(score.fields.techShiftWithinOneLevel, true, "Low vs Medium is within one level");
  assert.equal(score.fields.gstRate, true);
}

{
  const audit = await auditCitations(
    {
      citations: [{ url: "https://example.com/gst", quote: "GST on this shampoo is 18 percent" }],
    },
    FETCH
  );
  assert.equal(audit.checked, 1);
  assert.equal(audit.found, 1);
  assert.equal(audit.missing, 0);
}

{
  const audit = await auditCitations(
    {
      citations: [{ url: "https://example.com/missing", quote: "this quote is not on the page" }],
    },
    FETCH
  );
  assert.equal(audit.found, 0);
  assert.equal(audit.missing, 1);
}

{
  const audit = await auditCitations(
    {
      citations: [{ url: "https://127.0.0.1/secret", quote: "should never be fetched" }],
    },
    FETCH
  );
  assert.equal(audit.blocked, 1);
  assert.equal(audit.found, 0);
}

{
  assert.equal(isBlockedAddress("10.0.0.1"), true);
  assert.equal(isBlockedAddress("169.254.169.254"), true);
  assert.equal(isBlockedAddress("::1"), true);
  assert.throws(() => assertPublicHttpsUrl("http://example.com/x"), /https/);
  assert.throws(() => assertPublicHttpsUrl("https://localhost/x"), /private/);
}

{
  await assert.rejects(
    () =>
      safeFetchPublicUrl("https://example.com/slow", {
        skipDns: true,
        timeoutMs: 30,
        fetchImpl: (_url, opts) =>
          new Promise((_, reject) => {
            const t = setTimeout(() => reject(new Error("not aborted")), 5_000);
            opts.signal?.addEventListener("abort", () => {
              clearTimeout(t);
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          }),
      }),
    (err) => err.code === "EVAL_TIMEOUT"
  );
}

{
  await assert.rejects(
    () =>
      safeFetchPublicUrl("https://example.com/huge", {
        skipDns: true,
        maxBytes: 16,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: { get: (n) => (String(n).toLowerCase() === "content-length" ? "99999" : "text/plain") },
          body: null,
          arrayBuffer: async () => new ArrayBuffer(8),
        }),
      }),
    (err) => err.code === "EVAL_SIZE"
  );
}

{
  const outDir = mkdtempSync(path.join(tmpdir(), "ai-eval-"));
  const result = await runEval({
    labelsText: labelledCsv(["match", "adjacent"]),
    pipeline: createFakePipeline(),
    repeats: 3,
    outDir,
    fetchOpts: FETCH,
  });
  assert.equal(result.entries.length, 6);
  assert.equal(result.summary.repeats, 3);
  assert.equal(result.agreement.gstRate.pct, 100);
  assert.equal(result.agreement.techShiftWithinOneLevel.pct, 100);
  assert.equal(result.stability.gstRate.pct, 100);
  assert.equal(result.stability.verdictBand.pct, 100);
  assert.ok(result.summary.totals.durationMs >= 6);
  assert.ok(result.summary.totals.listPriceUsd > 0);
  assert.ok(result.summary.totals.citationFound >= 6);
  const ideasCsv = readFileSync(result.paths.ideasPath, "utf8");
  const summaryCsv = readFileSync(result.paths.summaryPath, "utf8");
  const md = readFileSync(result.paths.mdPath, "utf8");
  const ideaHeader = ideasCsv.trim().split(/\r?\n/)[0];
  assert.equal(
    ideaHeader,
    "runIndex,ideaId,gstRateMatch,benchmarkRelevanceMatch,gapCredibilityMatch,priceEventsDatedAndSourcedMatch,techShiftWithinOneLevel,routeMatch,verdictBandMatch,agreementPct,citationChecked,citationFound,citationMissing,citationBlocked,durationMs,inputTokens,outputTokens,listPriceUsd"
  );
  assert.equal(summaryCsv.trim().split(/\r?\n/)[0], "field,agreementPct,stableAcrossRunsPct,same,total");
  assert.match(md, /AI evaluation harness report/);
  assert.match(md, /gstRate/);
  const again = renderIdeaCsv(result.entries);
  assert.equal(again.trim().split(/\r?\n/)[0], ideaHeader);
  const summaryAgain = renderSummaryCsv(result.agreement, result.stability);
  assert.equal(summaryAgain.trim().split(/\r?\n/)[0], summaryCsv.trim().split(/\r?\n/)[0]);
  assert.match(renderMarkdown(result.summary), /Pipeline: fake/);
}

{
  const result = await runEval({
    labelsText: labelledCsv(["vary"]),
    pipeline: createFakePipeline({ varyByRun: true }),
    repeats: 3,
    fetchOpts: FETCH,
  });
  assert.equal(result.stability.gstRate.pct, 0);
  assert.equal(result.stability.verdictBand.pct, 0);
  const stab = fieldStability(Object.fromEntries([["vary", result.entries]]));
  assert.equal(stab.gstRate.stable, 0);
}

{
  await assert.rejects(() => createRealPipeline().run({ id: "match" }), /live: true/);
  await assert.rejects(() => createRealPipeline({ live: false }).run({ id: "match" }), /EVAL_NOT_LIVE|live: true/);
  assert.equal(envLooksLikeLiveDatabase({ DATABASE_URL: "postgres://u@dpg-x.render.com/db" }), true);
  assert.equal(envLooksLikeLiveDatabase({ DATABASE_URL: "postgres://u@127.0.0.1/db" }), false);
  assert.throws(() => assertSafeToRunLive({ DATABASE_URL: "postgres://u@host.neon.tech/db" }), /live database/);
  assert.throws(() => assertSafeToRunLive({}), /ANTHROPIC_API_KEY/);
}

{
  const predicted = extractPredicted({
    id: "x",
    research: {
      f1: {
        assessments: {
          benchmark: { raw: { relevance: "strong", source_url: "https://example.com/a", quote: "Dove sells in India today" } },
          derivation: { raw: { relevance: "supported", source_url: "https://example.com/b", quote: "gap of three points" } },
          route: { raw: { matches: "yes" } },
        },
        benchmarkVerified: true,
      },
      f2: { costEstimate: { estimatedGstRatePct: 18 } },
      f3: {
        priceEvents: {
          events: [{ date: "2024", source_url: "https://example.com/p", quote: "price rose ten percent" }],
        },
      },
      f4: {
        dimensions: Object.fromEntries(
          [
            "functionalCoreStability",
            "consumptionContextStability",
            "manufacturingDisruptionRisk",
            "userHabitShiftPotential",
            "adjacentSubstitutionThreat",
            "purchaseFrequencyShift",
            "regulatoryDisruptionRisk",
          ].map((d) => [d, { risk: "Low" }])
        ),
      },
    },
    suggestions: {},
    verdictBand: "WATCH",
    usage: { inputTokens: 3, outputTokens: 2 },
    durationMs: 9,
  });
  assert.equal(predicted.gstRatePct, 18);
  assert.equal(predicted.benchmarkRelevant, "yes");
  assert.equal(predicted.gapCredible, "yes");
  assert.equal(predicted.priceEventsDatedAndSourced, true);
  assert.equal(predicted.routeMatches, "yes");
  assert.equal(predicted.verdictBand, "WATCH");
  assert.ok(predicted.citations.length >= 3);
  const labels = parseLabelledSet(labelledCsv(["x"]))[0].labels;
  const score = scorePrediction(predicted, labels);
  assert.equal(score.agreementPct, 100);
}

{
  const result = await runEval({
    labelsText: labelledCsv(["privateCite"]),
    pipeline: createFakePipeline(),
    repeats: 1,
    fetchOpts: FETCH,
  });
  assert.equal(result.entries[0].citationAudit.blocked, 1);
  assert.ok(result.entries[0].predicted.durationMs >= 1);
  assert.ok(result.entries[0].listPriceUsd >= 0);
}

console.log("PASS testAiEvalHarness");
