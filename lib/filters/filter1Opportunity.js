import { callLlm } from "../callLlm.js";
import { brandRosterForPrompt } from "../ckBrands.js";
import { trimInput } from "../scoring.js";
import { mergeSources, parseFilterJson } from "./parseFilterJson.js";

export const FILTER1_SYSTEM_PROMPT =
  "You are Filter 1 of 6 Filter Test — the \"Opportunity to Grow\" gate for an FMCG product idea.\n" +
  "Use the web_search tool for 2–3 targeted India FMCG queries (category growth, named\n" +
  "benchmark, purchase attribute), then return JSON immediately. Do not keep searching.\n" +
  "Ground numbers in real sources. Do not guess figures you have not found.\n" +
  "Given the idea, an optional stated attribute, and an optional stated benchmark:\n" +
  "1. If no benchmark was given, identify the strongest named competitor in this exact\n" +
  "   segment/sub-segment via search.\n" +
  "2. Identify the single attribute most likely to drive the purchase decision, if not given.\n" +
  "3. Estimate the gap: how the idea claims to beat the benchmark on that attribute, and by\n" +
  "   roughly how much (numeric where possible, e.g. \"30% less residue\", \"2x shelf life\").\n" +
  "4. Classify the category growth logic as exactly one of:\n" +
  "   \"low-penetration\" (category itself is growing, still under-penetrated in India),\n" +
  "   \"mature-cluttered\" (flat/slow category, growth must come from taking share), or\n" +
  "   \"unclear\" (not enough evidence either way).\n" +
  "5. Note briefly whether the idea holds parity (not worse) on other major attributes, or\n" +
  "   flags a real risk.\n" +
  "6. If isPureCommodity is true and no formulation/functional differentiation is described,\n" +
  "   set differentiationExempt=true and base the verdict on perception/positioning alone.\n" +
  "7. Respect CavinKare brand lines. If the idea names a CK brand that does not carry this\n" +
  "   product (e.g. a milkshake on Friva), say so plainly: that brand does not own the line,\n" +
  "   and name the house brand that does. If the named brand already carries the line\n" +
  "   (e.g. Nyle shampoo), keep that brand — do not reassign it to a sibling like Chik.\n" +
  "8. Also fill backend-only fields the brief may omit: estimatedNetMarginPct (typical\n" +
  "   launch net margin % for this SKU/division in India FMCG), estimatedVolumeLossPct\n" +
  "   (volume loss % if price sits at/near the stated rupee price — ≤10 is the pass bar),\n" +
  "   and isPureCommodity (true only if the idea is undifferentiated with no mix/function).\n" +
  "CavinKare brand lines:\n" +
  `${brandRosterForPrompt()}\n` +
  "Return ONLY minified JSON:\n" +
  '{"benchmarkName":"...","attribute":"...","gapClaim":"...","gapMagnitude":"...",' +
  '"growthStage":"low-penetration|mature-cluttered|unclear","categoryTamCr":0,' +
  '"categoryGrowthNote":"...","parityRisk":"none|minor|major","differentiationExempt":false,' +
  '"estimatedNetMarginPct":0,"estimatedVolumeLossPct":0,"isPureCommodity":false,' +
  '"sources":[{"title":"...","url":"..."}],' +
  '"verdict":"PASS|FAIL|NEEDS_INPUT","verdictReason":"one line, cite the missing piece if NEEDS_INPUT"}';

function looksMissing(value) {
  const s = String(value || "").trim().toLowerCase();
  return !s || s === "unknown" || s === "n/a" || s === "none" || s === "unclear" || s === "not found";
}

export function resolveFilter1Verdict(data) {
  const parsed = data && typeof data === "object" ? { ...data } : {};
  const differentiationExempt = Boolean(parsed.differentiationExempt);
  const growthStage = ["low-penetration", "mature-cluttered", "unclear"].includes(parsed.growthStage)
    ? parsed.growthStage
    : "unclear";
  const parityRisk = ["none", "minor", "major"].includes(parsed.parityRisk)
    ? parsed.parityRisk
    : "minor";
  const hasBenchmark = !looksMissing(parsed.benchmarkName);
  const hasAttribute = !looksMissing(parsed.attribute);

  parsed.growthStage = growthStage;
  parsed.parityRisk = parityRisk;
  parsed.differentiationExempt = differentiationExempt;

  if (!hasBenchmark || !hasAttribute) {
    parsed.verdict = "NEEDS_INPUT";
    parsed.verdictReason = !hasAttribute
      ? "Missing evidence: name the purchase-decision attribute."
      : "Missing evidence: name a credible benchmark competitor.";
    return parsed;
  }

  if (growthStage === "unclear" && parityRisk === "major" && !differentiationExempt) {
    parsed.verdict = "FAIL";
    parsed.verdictReason =
      parsed.verdictReason ||
      "Category growth is unclear and there is a major parity risk — no differentiation exemption.";
    return parsed;
  }

  parsed.verdict = "PASS";
  parsed.verdictReason =
    parsed.verdictReason ||
    (differentiationExempt
      ? "Commodity exemption: assessed on perception/positioning."
      : `Clears opportunity gate vs ${parsed.benchmarkName} on ${parsed.attribute}.`);
  return parsed;
}

export async function runFilter1({
  ideaText,
  attribute = "",
  benchmarkName = "",
  isPureCommodity = false,
  brandFit = null,
  pricePerUnit = null,
}) {
  const brandNote = brandFit?.mismatch
    ? `BRAND_FIT: MISMATCH — ${brandFit.reason}`
    : brandFit?.reason
      ? `BRAND_FIT: ${brandFit.reason}`
      : "BRAND_FIT: (no named CK brand/line conflict detected)";
  const priceNote =
    pricePerUnit != null && Number.isFinite(Number(pricePerUnit))
      ? `STATED_PRICE_INR: ${Number(pricePerUnit)}`
      : "STATED_PRICE_INR: (none)";
  const userText =
    `PRODUCT IDEA:\n${trimInput(String(ideaText || ""), 1600)}\n\n` +
    `STATED_ATTRIBUTE: ${attribute?.trim() || "(none — identify the top purchase-decision attribute)"}\n` +
    `STATED_BENCHMARK: ${benchmarkName?.trim() || "(none — identify the strongest named competitor in this exact segment)"}\n` +
    `IS_PURE_COMMODITY: ${isPureCommodity ? "true" : "infer from the idea"}\n` +
    `${priceNote}\n` +
    `${brandNote}`;

  const response = await callLlm({
    userText,
    system: FILTER1_SYSTEM_PROMPT,
    useWebSearch: true,
    maxTokens: 2048,
    maxUses: 3,
  });

  const raw = response?.text ?? "";
  if (!raw.trim()) {
    return resolveFilter1Verdict({
      verdict: "NEEDS_INPUT",
      verdictReason: "Filter 1 returned no research. Supply a benchmark and attribute, then re-run.",
      sources: response?.sources || [],
    });
  }

  let parsed;
  try {
    parsed = parseFilterJson(raw);
  } catch {
    return resolveFilter1Verdict({
      verdict: "NEEDS_INPUT",
      verdictReason: "Filter 1 research could not be parsed. Supply a benchmark and attribute, then re-run.",
      sources: response?.sources || [],
    });
  }

  if (attribute?.trim()) parsed.attribute = parsed.attribute || attribute.trim();
  if (benchmarkName?.trim()) parsed.benchmarkName = parsed.benchmarkName || benchmarkName.trim();
  if (isPureCommodity && parsed.differentiationExempt == null) {
    parsed.differentiationExempt = true;
  }
  const asNum = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  parsed.estimatedNetMarginPct = asNum(parsed.estimatedNetMarginPct);
  parsed.estimatedVolumeLossPct = asNum(parsed.estimatedVolumeLossPct);

  const resolved = resolveFilter1Verdict(parsed);
  resolved.sources = mergeSources(resolved.sources, response?.sources);
  return resolved;
}
