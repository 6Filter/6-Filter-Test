import { getPropositionById } from "./db.js";
import { prepareIdeaInput } from "./extractAttachment.js";
import { runFilter1 } from "./filters/filter1Opportunity.js";
import { runFilter4 } from "./filters/filter4TechShift.js";
import { detectDivision } from "./npdMaster.js";

export const AI_FIRST_PASS_NOT_COVERED = [
  {
    filter: "F5",
    reason:
      "The five revenue factors (households, trial, repeat, frequency, pack value) come from CMI's own consumer sizing model — this engine never produced them, then or now.",
  },
  {
    filter: "F6",
    reason:
      "Requires a real prototype, purchased benchmark samples, and a live panel — structurally not something any AI pass can estimate.",
  },
];

function compactFields(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    out[key] = typeof value === "string" ? value.trim() : value;
  }
  return out;
}

export function buildSuggestions(filter1 = {}, filter4 = {}) {
  const growthRoute =
    filter1.growthStage === "low-penetration"
      ? "low-penetration"
      : filter1.growthStage === "mature-cluttered"
        ? "mature-share-take"
        : null;

  const formatTrajectory =
    filter4.formatTrendDirection === "stable"
      ? "flat"
      : filter4.formatTrendDirection || null;

  const filings = Array.isArray(filter4.trademarkFilingsFound) ? filter4.trademarkFilingsFound : [];
  const filingNote = filings.length
    ? `Trademark filings found: ${filings.map((f) => f?.applicant).filter(Boolean).join(", ")}`
    : null;

  return {
    f1: compactFields({
      declaredAttribute: filter1.attribute || null,
      benchmark: filter1.benchmarkName || null,
      declaredGap: filter1.estimatedPointsBeat ?? null,
      gapDerivation: [filter1.gapClaim, filter1.gapMagnitude].filter(Boolean).join(" — ") || null,
      growthRoute,
      growthArgument: filter1.verdictReason || filter1.categoryGrowthNote || null,
      parityExceptions:
        filter1.parityRisk === "major" || filter1.parityRisk === "minor"
          ? `AI flagged a ${filter1.parityRisk} parity risk — review before naming exceptions here.`
          : null,
    }),
    f2: compactFields({
      netMarginAtScale: filter1.estimatedNetMarginPct ?? null,
    }),
    f3: compactFields({
      modelledVolumeLoss: filter1.estimatedVolumeLossPct ?? null,
    }),
    f4: compactFields({
      formatTrajectory,
      channelShiftExposure: filter4.digitalProxySignal || null,
      threatRegister:
        [filter4.evidenceSummary, filter4.analogTransferSignal, filingNote].filter(Boolean).join("\n") || null,
    }),
  };
}

export async function handleAiFirstPass(req, res, id, { readBody, sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }

  if (!id) {
    sendJson(res, 400, { error: "Proposition id is required." });
    return;
  }

  try {
    const body = typeof readBody === "function" ? await readBody(req) : req.body || {};
    const ideaText = body.ideaText ?? body.idea ?? "";
    const image = body.image || null;
    if (!String(ideaText || "").trim() && !image) {
      sendJson(res, 400, { error: "Describe the idea, or attach a file, to run the AI first pass." });
      return;
    }

    const proposition = await getPropositionById(id);
    if (!proposition) {
      sendJson(res, 404, { error: "Proposition not found." });
      return;
    }

    const prepared = await prepareIdeaInput(ideaText, image);

    const [filter1, filter4] = await Promise.all([
      runFilter1({
        ideaText: prepared.idea,
        attribute: "",
        benchmarkName: "",
        isPureCommodity: false,
        pricePerUnit: null,
        image: prepared.image,
      }),
      runFilter4({ ideaText: prepared.idea, image: prepared.image }),
    ]);

    const division = proposition.division || detectDivision(prepared.idea || "") || "";

    sendJson(res, 200, {
      division,
      suggestions: buildSuggestions(filter1, filter4),
      notCovered: AI_FIRST_PASS_NOT_COVERED,
      sources: [...(filter1.sources || []), ...(filter4.sources || [])],
    });
  } catch (e) {
    const status = e.status && Number.isInteger(e.status) ? e.status : 500;
    sendJson(res, status, { error: redactSecrets(e.message) });
  }
}
