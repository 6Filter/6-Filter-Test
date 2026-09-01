import { FIXED_PRICE_POINT_OPTIONS as FIXED_PRICE_POINTS } from "./propositionOptions.js";

export const OWNER_COLORS = {
  BM:        { bg: "#2E12B0", fg: "#E4DCFF" },
  CMI:       { bg: "#1E2C55", fg: "#7EA7FF" },
  FINANCE:   { bg: "#16402C", fg: "#6FE0A3" },
  "R&D":     { bg: "#164140", fg: "#70D7E2" },
  SALES:     { bg: "#40300F", fg: "#E8B563" },
  PACKAGING: { bg: "#4A1E3D", fg: "#E778B9" },
  "BH FORUM":{ bg: "#3B1465", fg: "#C9A0E8" },
};

export const PROPOSITION_TOP_FIELDS = [
  { key: "name", label: "Proposition name", owners: ["BM"], type: "text", placeholder: "e.g. Herbal cooling hair oil" },
  { key: "category", label: "Category", owners: ["BM"], type: "text", placeholder: "e.g. Hair oils" },
  { key: "ideaDescription", label: "Idea / insight description", owners: ["BM"], type: "textarea",
    placeholder: "Describe the product idea, or attach a PDF, Word file, or image with the insight.",
    helper: "Used to run the research pass below — not a separate step." },
];

const FORUM_VERDICT_FIELD = {
  key: "forumVerdict", label: "Forum verdict", owners: ["BH FORUM"], type: "select",
  options: [{ v: "", l: "— select —" }, { v: "pass", l: "Cleared" }, { v: "fail", l: "Fail" }],
  helper: "Recorded at the paper-gate forum (F1–F5) or gate reading (F6). Binary (v4).",
};
const VERDICT_NOTE_FIELD = {
  key: "verdictNote", label: "Verdict date & note", owners: ["BH FORUM"], type: "text",
  placeholder: "e.g. 04 Sep forum — cleared; or FAIL: evidence named",
};

export const SIX_FILTERS_FORM = [
  {
    key: "f1", num: "F1", title: "Success possibility & growth", subtitle: "attribute · benchmark · gap ≥ 2.0 (v4)",
    accentBg: "#301A4F", accentFg: "#C9AEEF", defaultStatus: "Evidence missing",
    fields: [
      { key: "declaredAttribute", label: "Declared attribute (consumer language)", owners: ["BM"], type: "text", placeholder: "how soft hair feels after wash" },
      { key: "attributeRank", label: "Attribute rank in category hierarchy", owners: ["CMI"], type: "select",
        options: [{ v: "", l: "— select —" }, { v: "1", l: "1" }, { v: "2", l: "2" }, { v: "3", l: "3" }, { v: "4+", l: "4 or lower (fails the floor)" }],
        helper: "Must be 1–3 (v4), from U&A / track" },
      { key: "evidenceSourceDate", label: "Evidence source & date", owners: ["CMI"], type: "text", placeholder: "U&A 2026 / tracker wave" },
      { key: "benchmark", label: "Benchmark (brand · variant · pack)", owners: ["BM", "CMI"], type: "text", placeholder: "single strongest — no composites" },
      { key: "declaredGap", label: "Declared gap (points on 10-pt scale)", owners: ["BM"], type: "number", helper: "Floor 2.0 (v4)" },
      { key: "gapDerivation", label: "Gap derivation", owners: ["BM", "CMI"], type: "textarea", placeholder: "perceivability · rating spread · share precedent · erosion headroom" },
      { key: "parityExceptions", label: "Parity exceptions (attributes we may lose on)", owners: ["BM", "R&D"], type: "textarea", placeholder: "none, or name them" },
      { key: "growthRoute", label: "Growth route", owners: ["BM"], type: "select",
        options: [{ v: "", l: "— select —" },
          { v: "low-penetration", l: "Low-penetration category — the category itself will grow" },
          { v: "mature-share-take", l: "Mature/cluttered category — advantage strong enough to take share" }] },
      { key: "growthArgument", label: "Growth argument (one paragraph)", owners: ["BM"], type: "textarea", placeholder: "every number traceable to a CMI source" },
      { key: "pureCommodity", label: "Pure commodity — differentiation requirement does not apply (v4). Any formulation added ends this exception.", owners: [], type: "checkbox" },
    ],
  },
  {
    key: "f2", num: "F2", title: "Net margin", subtitleFromDivision: (div, target) => `path to ${target}% division floor (v4)`,
    accentBg: "#1A3E2D", accentFg: "#7EDCA8", defaultStatus: "Evidence missing",
    fields: [
      { key: "mrpGrammage", label: "MRP & grammage", owners: ["BM"], type: "text", placeholder: "₹ / g or ml" },
      { key: "cogsAtScale", label: "COGS at scale (₹/unit)", owners: ["FINANCE", "R&D"], type: "number" },
      { key: "netMarginAtScale", label: "Net margin at scale (%)", owners: ["FINANCE"], type: "number",
        helperFromDivision: (div, target) => `Division floor: ${target}% (v4, non-negotiable)` },
      { key: "qcomTrajectory", label: "Quick-commerce 3-year terms assumption", owners: ["SALES", "FINANCE"], type: "textarea", placeholder: "where terms are heading, not today's rate card (v4)" },
      { key: "financeSigned", label: "Finance controller has signed the margin computation", owners: [], type: "checkbox" },
    ],
  },
  {
    key: "f3", num: "F3", title: "Price resilient", subtitle: "≤10% loss past fixed price points (v4)",
    accentBg: "#3D2C12", accentFg: "#E8B563", defaultStatus: "Evidence missing",
    fields: [
      { key: "priceIndexVsBenchmark", label: "Price index vs benchmark (equal grammage)", owners: ["CMI", "SALES"], type: "number", placeholder: "e.g. 108" },
      { key: "fixedPricePointExposure", label: "Fixed price point exposure", owners: ["BM"], type: "select",
        options: [{ v: "none", l: "None" }, ...FIXED_PRICE_POINTS.map((p) => ({ v: String(p), l: `₹${p}` }))] },
      { key: "elasticityEstimate", label: "Elasticity estimate", owners: ["CMI"], type: "number", placeholder: "e.g. -1.2", helper: "From category price history — never asserted" },
      { key: "elasticitySource", label: "Elasticity source", owners: ["CMI"], type: "text", placeholder: "audit series / own price event" },
      { key: "modelledVolumeLoss", label: "Modelled volume loss on crossing (%)", owners: ["CMI"], type: "number", helper: "Cap 10% when crossing a fixed point (v4)" },
    ],
    crossCheckNote: "Same price used in Filter 2 and Filter 3 — one price, one story",
  },
  {
    key: "f4", num: "F4", title: "Survives tech & habit shift", subtitle: "rising side of the shift (v4)",
    accentBg: "#1C2C4D", accentFg: "#8FB8E8", defaultStatus: "Evidence missing",
    fields: [
      { key: "formatTrajectory", label: "Format trajectory", owners: ["CMI"], type: "select",
        options: [{ v: "", l: "— select —" }, { v: "rising", l: "Rising" }, { v: "flat", l: "Flat" }, { v: "declining", l: "Declining" }],
        helper: "From retail-audit format shares" },
      { key: "channelShiftExposure", label: "Channel shift exposure", owners: ["CMI", "SALES"], type: "textarea", placeholder: "% of format volume in declining channels" },
      { key: "threatRegister", label: "Threat register (each threat + horizon)", owners: ["CMI", "R&D"], type: "textarea", placeholder: "substitute formats · technology · clean-label · regulatory" },
      { key: "threatsAnswered", label: "Every registered threat carries a written response", owners: [], type: "checkbox" },
    ],
  },
  {
    key: "f5", num: "F5", title: "Revenue target", subtitleFromDivision: (div, target) => `credible path to ₹${target} Cr in year 3 (v4)`,
    accentBg: "#1E2A4B", accentFg: "#F0A8C8", defaultStatus: "Evidence missing",
    fields: [
      { key: "householdsReachedY3Mn", label: "Households reached, year 3 (millions)", owners: ["CMI"], type: "number" },
      { key: "trialRatePct", label: "Trial rate (%)", owners: ["CMI"], type: "number" },
      { key: "repeatConversionPct", label: "Repeat conversion (%)", owners: ["CMI"], type: "number" },
      { key: "purchaseFrequencyYr", label: "Purchase frequency (per year)", owners: ["CMI"], type: "number" },
      { key: "avgPackValueInr", label: "Average pack value (₹)", owners: ["BM"], type: "number" },
      { key: "computedRevenue", label: "Computed year-3 revenue", owners: [], type: "computed" },
      { key: "cmiHeadSigned", label: "CMI head has signed the model factors and their ranges (out-of-range factors argued in writing)", owners: [], type: "checkbox" },
    ],
  },
  {
    key: "f6", num: "F6", title: "Prototype gate — after panels", subtitle: "not part of the paper check · lab · 18/30 · pack (v4)",
    accentBg: "#401731", accentFg: "#D9A0C9", defaultStatus: "Awaiting panels",
    fields: [
      { key: "labGapVsBenchmark", label: "Lab gap vs benchmark (points, 1 decimal)", owners: ["R&D"], type: "number", helper: "Floor 2.0; report the margin, never just \"pass\" (v4)" },
      { key: "consumerPanelBeaters", label: "Consumer panel: 2-point beaters (k of 30)", owners: ["CMI"], type: "number", helper: "Gate: 18 of 30. Seventeen is a fail (v4)" },
      { key: "availabilityCount", label: "Availability count (unprompted asks, of 30)", owners: ["CMI"], type: "number", helper: "Reported, never gated. 8 marks strength (v4)" },
      { key: "packStandoutGap", label: "Pack standout gap vs strongest pack", owners: ["PACKAGING"], type: "number", helper: "2-point beater, mandatory (v4)" },
      { key: "bmAttendedAll30", label: "BM attended all 30 consumer interviews — attendance log complete (report invalid without it, v4)", owners: [], type: "checkbox" },
      { key: "packQualityParity", label: "Pack perceived quality at parity or better (v4)", owners: [], type: "checkbox" },
    ],
  },
];

export { FORUM_VERDICT_FIELD, VERDICT_NOTE_FIELD };

export function emptyFilterState(spec) {
  const o = { forumVerdict: "", verdictNote: "" };
  for (const f of spec.fields) {
    if (f.type === "checkbox") o[f.key] = false;
    else if (f.key === "fixedPricePointExposure") o[f.key] = "none";
    else o[f.key] = "";
  }
  return o;
}

export function emptyPropositionDoc(id = "") {
  const p = {
    id,
    name: "",
    category: "",
    division: "",
    ideaDescription: "",
    attachment: null,
    researchRunAt: null,
    finalVerdict: "",
    finalVerdictNote: "",
    version: 1,
    createdAt: null,
    updatedAt: null,
  };
  for (const spec of SIX_FILTERS_FORM) {
    p[spec.key] = emptyFilterState(spec);
  }
  return p;
}

export function mergeProposition(raw) {
  const base = emptyPropositionDoc(raw?.id || "");
  if (!raw || typeof raw !== "object") return base;
  const next = {
    ...base,
    id: raw.id || base.id,
    name: raw.name ?? "",
    category: raw.category ?? "",
    division: raw.division ?? "",
    ideaDescription: raw.ideaDescription ?? "",
    attachment: raw.attachment && typeof raw.attachment === "object" ? raw.attachment : null,
    researchRunAt: raw.researchRunAt ?? null,
    finalVerdict: raw.finalVerdict ?? "",
    finalVerdictNote: raw.finalVerdictNote ?? "",
    version: Number(raw.version) || 1,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
  for (const spec of SIX_FILTERS_FORM) {
    const incoming = raw[spec.key] && typeof raw[spec.key] === "object" ? raw[spec.key] : {};
    next[spec.key] = { ...emptyFilterState(spec), ...incoming };
  }
  return next;
}

export function filterStatus(filterKey, values, forumVerdict, unlocked = true) {
  if (filterKey === "f6" && !unlocked) return { label: "Awaiting panels", tone: "watch" };
  if (forumVerdict === "pass") return { label: "Cleared", tone: "pass" };
  if (forumVerdict === "fail") return { label: "Failed", tone: "fail" };
  return { label: "Evidence missing", tone: "watch" };
}

export function f6Unlocked(doc) {
  return ["f1", "f2", "f3", "f4", "f5"].every((k) => doc?.[k]?.forumVerdict === "pass");
}
