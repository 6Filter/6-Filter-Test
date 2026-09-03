import "./enableResearchTrace.mjs";
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  const k = m[1].trim();
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

import { runFilter1 } from "../lib/filters/filter1Opportunity.js";
import { runFilter4 } from "../lib/filters/filter4TechShift.js";
import { buildResearchFindings } from "../lib/researchFindings.js";
import { checkF1, checkF4 } from "../lib/filterChecks.js";
import { runWithLlm } from "../lib/llmContext.js";

const ideaText =
  "Herbal hair oil positioned for hair strengthening, daily scalp use, India mass market.";
const attribute = "Hair strengthening";
const benchmark = "Indulekha";

console.log(`[primus/research-trace] STAGE=script-start benchmark=${benchmark} attribute=${attribute}`);

const filter1 = await runWithLlm("claude", () =>
  runFilter1({ ideaText, attribute, benchmarkName: benchmark })
);
const filter4 = await runWithLlm("claude", () => runFilter4({ ideaText }));

const findings = buildResearchFindings({ filter1, filter4 });
const f1Check = checkF1(
  { declaredAttribute: attribute, benchmark, declaredGap: 2.2, growthRoute: "penetration", growthArgument: "share take" },
  findings.f1
);
const f4Check = checkF4({ techShiftRisk: filter4.techShiftRisk }, findings.f4);

console.log(
  `[primus/research-trace] STAGE=final-parsed OUTPUT=${JSON.stringify({
    f1: {
      attribute: filter1.attribute,
      benchmarkName: filter1.benchmarkName,
      estimatedBenchmarkExists: filter1.estimatedBenchmarkExists,
      researchFailed: filter1.researchFailed || false,
      verdict: filter1.verdict,
      verdictReason: filter1.verdictReason,
      categoryTamCr: filter1.categoryTamCr,
      recon: filter1.reconciliation?.status,
      sources: (filter1.sources || []).slice(0, 4),
    },
    f4: {
      researchFailed: filter4.researchFailed || false,
      overallRisk: filter4.overallRisk,
      verdict: filter4.verdict,
      verdictReason: filter4.verdictReason,
      dimCount: filter4.techShiftRisk?.dimensions ? Object.keys(filter4.techShiftRisk.dimensions).length : 0,
      sources: (filter4.sources || []).slice(0, 4),
    },
    findingsF1: findings.f1,
    findingsF4: findings.f4,
    checkF1: f1Check,
    checkF4: { checkLabel: f4Check.checkLabel, items: f4Check.items?.slice(0, 3) },
  })}`
);

const fictionalBenchmark = "Qxzlph Brand 88421";
const fictional = await runWithLlm("claude", () =>
  runFilter1({
    ideaText,
    attribute,
    benchmarkName: fictionalBenchmark,
  })
);
const fictionalFindings = buildResearchFindings({ filter1: fictional });
const fictionalCheck = checkF1(
  {
    declaredAttribute: attribute,
    benchmark: fictionalBenchmark,
    declaredGap: 2.2,
    growthRoute: "penetration",
    growthArgument: "share take",
  },
  fictionalFindings.f1
);
console.log(
  `[primus/research-trace] STAGE=fictional-benchmark OUTPUT=${JSON.stringify({
    benchmarkName: fictional.benchmarkName,
    estimatedBenchmarkExists: fictional.estimatedBenchmarkExists,
    researchFailed: fictional.researchFailed || false,
    verdictReason: fictional.verdictReason,
    findings: fictionalFindings.f1,
    check: fictionalCheck.items?.[1],
  })}`
);
