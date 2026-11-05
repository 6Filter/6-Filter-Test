/**
 * Part 135 — Filter 3 price-events research (one web-search call per Submit).
 * Code enforces verification: returnedSources, quote-contains-figure, crossed_point
 * recomputed from prices, inflation cover cited. Model-claimed fields are ignored.
 */
import { FIXED_PRICE_POINTS, F3_HORIZON_YEARS, VOLUME_LOSS_CEILING_PCT } from "../lockedConstants.js";
import { researchThenJson } from "../llmJson.js";
import { extractReturnedSourcesFromLlmResult, returnedSourceUrls } from "../returnedSources.js";
import { urlAmongReturnedSources } from "../relevanceGrade.js";
import {
  crossedPointFromPrices,
  quoteContainsFigure,
} from "../priceResilience.js";
import { withCategoryScope } from "../categoryScopedResearch.js";
import { sixFilterChecklistSystem, SOURCE_HIERARCHY_INSTRUCTION } from "../skills/loadSkill.js";
import { researchResultIsCacheable } from "../researchCacheable.js";
import { categoryFactScope, withCategoryFact } from "../categoryFactCache.js";

export const PRIMUS_F3_PRICE_EVENTS = "PRIMUS_F3_PRICE_EVENTS";

const STRUCTURE_SYSTEM =
  "Return ONLY minified JSON:\n" +
  '{"annualIncreasePct":0,"inflation_source_url":"...","inflation_quote":"...",' +
  '"events":[{"brand":"...","product":"...","from_price_inr":0,"to_price_inr":0,' +
  '"date":"YYYY","volume_change_pct":0,"source_url":"...","quote":"..."}]}';

function asNum(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeEvent(raw = {}) {
  return {
    brand: String(raw.brand || "").trim(),
    product: String(raw.product || "").trim(),
    from_price_inr: asNum(raw.from_price_inr ?? raw.fromPriceInr),
    to_price_inr: asNum(raw.to_price_inr ?? raw.toPriceInr),
    date: String(raw.date || "").trim(),
    volume_change_pct: asNum(raw.volume_change_pct ?? raw.volumeChangePct),
    source_url: String(raw.source_url || raw.sourceUrl || "").trim(),
    quote: String(raw.quote || "").trim(),
  };
}

/**
 * Code safeguards — never trust the model's returnedSources or crossed_point.
 */
export function sanitizePriceEventsPayload(parsed = {}, returnedSources = [], evidenceFacts = []) {
  const urls = returnedSourceUrls(returnedSources);
  delete parsed.returnedSources;

  const inflationUrl = String(parsed.inflation_source_url || parsed.inflationSourceUrl || "").trim();
  const inflationQuote = String(parsed.inflation_quote || parsed.inflationQuote || "").trim();
  let annualIncreasePct = asNum(parsed.annualIncreasePct ?? parsed.annual_increase_pct);
  const inflationCited =
    annualIncreasePct != null &&
    inflationUrl &&
    urlAmongReturnedSources(inflationUrl, urls) &&
    quoteContainsFigure(inflationQuote, annualIncreasePct);
  if (!inflationCited) annualIncreasePct = null;

  const events = [];
  const rawEvents = Array.isArray(parsed.events) ? parsed.events : [];
  for (const raw of rawEvents) {
    const e = normalizeEvent(raw);
    const crossed_point = crossedPointFromPrices(e.from_price_inr, e.to_price_inr);
    const verified =
      Boolean(e.source_url) &&
      urlAmongReturnedSources(e.source_url, urls) &&
      Boolean(e.quote) &&
      e.volume_change_pct != null &&
      quoteContainsFigure(e.quote, e.volume_change_pct);
    events.push({ ...e, crossed_point, verified });
  }

  // Part 131 evidence facts (price/volume) may join the register with their quotes.
  for (const fact of Array.isArray(evidenceFacts) ? evidenceFacts : []) {
    const kind = String(fact?.kind || fact?.type || "").toLowerCase();
    if (kind !== "price" && kind !== "volume" && kind !== "price_event") continue;
    const e = normalizeEvent({
      brand: fact.brand || fact.entity || "Evidence",
      product: fact.product || fact.label || "",
      from_price_inr: fact.from_price_inr ?? fact.fromPrice,
      to_price_inr: fact.to_price_inr ?? fact.toPrice,
      date: fact.date,
      volume_change_pct: fact.volume_change_pct ?? fact.volumeChangePct,
      source_url: fact.source_url || fact.sourceUrl || "evidence://team",
      quote: fact.quote,
    });
    if (e.volume_change_pct == null || !e.quote) continue;
    if (!quoteContainsFigure(e.quote, e.volume_change_pct)) continue;
    const crossed_point = crossedPointFromPrices(e.from_price_inr, e.to_price_inr);
    events.push({
      ...e,
      crossed_point,
      verified: true,
      fromEvidence: true,
    });
  }

  return {
    annualIncreasePct,
    inflation_source_url: inflationCited ? inflationUrl : "",
    inflation_quote: inflationCited ? inflationQuote : "",
    events,
    returnedSources: urls,
  };
}

export async function runPriceEventsResearch({
  priceInr,
  packSize = "",
  category = "",
  ideaText = "",
  priceTier = "",
  evidenceFacts = [],
} = {}) {
  const price = asNum(priceInr);
  if (price == null || price <= 0) return null;

  const pointsList = FIXED_PRICE_POINTS.map((p) => `₹${p}`).join(", ");
  const researchSystem = sixFilterChecklistSystem(
    SOURCE_HIERARCHY_INSTRUCTION +
      `\n\n${PRIMUS_F3_PRICE_EVENTS}\n` +
      "Filter 3 price resilience — owner's rule:\n" +
      "We hold the power to raise price to cover inflation and input cost increases continuously\n" +
      "without any volume loss. Where a steep price increase crosses a fixed price point\n" +
      `(${pointsList}), volume loss cannot exceed ${VOLUME_LOSS_CEILING_PCT}%.\n` +
      "Fixed points behave as cliffs, not slopes. Research:\n" +
      `1. The annual % price rise needed to cover inflation and input costs over ${F3_HORIZON_YEARS} years,\n` +
      "   with inflation_source_url and a quote that contains the figure.\n" +
      "2. A register of past price events in this category and pack tier in India\n" +
      "   (brand, product, from_price_inr, to_price_inr, date, volume_change_pct, source_url, quote).\n" +
      "Include our own brands' past increases where known. Never invent volume figures."
  );

  const { text: userText } = await withCategoryScope(
    `PRODUCT IDEA:\n${String(ideaText || "").slice(0, 800)}\n\n` +
      `CATEGORY: ${String(category || "").trim() || "(infer)"}\n` +
      `LAUNCH_MRP_INR: ${price}\n` +
      `PACK_SIZE: ${String(packSize || "").trim() || "(unknown)"}\n` +
      `PRICE_TIER: ${String(priceTier || "").trim() || "(infer from MRP)"}\n` +
      `FIXED_PRICE_POINTS: ${pointsList}\n` +
      `HORIZON_YEARS: ${F3_HORIZON_YEARS}\n\n` +
      "Find the inflation-covering annual increase (cited) and comparable India price events with volume outcomes.",
    {
      category,
      baseQuery: "India FMCG price increase volume loss fixed price point",
      label: "f3-price-events",
    }
  );

  const jsonSystem =
    "You are the structuring step for F3 price-events research. Do not search. " +
    "Use only the research brief. Every event needs source_url and quote containing the volume figure. " +
    "Do not invent crossed_point. " +
    STRUCTURE_SYSTEM;

  return withCategoryFact({
    category,
    scope: categoryFactScope("f3-price-events", {
      ideaText,
      grammage: String(packSize || "").trim(),
      price,
    }),
    factType: "f3-price-events",
    cacheable: (value) =>
      researchResultIsCacheable(value) &&
      (Boolean(value?.events?.length) || value?.annualIncreasePct != null),
    run: async () => {
      const result = await researchThenJson({
        label: "f3-price-events",
        researchSystem,
        researchUser: userText,
        jsonSystem,
        jsonUser: "Structure the price-events JSON now.",
        maxTokens: 2500,
      });

      const returnedSources = extractReturnedSourcesFromLlmResult(result);
      const sanitized = sanitizePriceEventsPayload(result.parsed || {}, returnedSources, evidenceFacts);

      return {
        ...sanitized,
        error: result.error || null,
        searchesUsed: result.searchesUsed || 0,
        cacheable: researchResultIsCacheable({
          ok: !result.error,
          hasContent: sanitized.events.length > 0 || sanitized.annualIncreasePct != null,
        }),
        sources: returnedSources,
      };
    },
  });
}
