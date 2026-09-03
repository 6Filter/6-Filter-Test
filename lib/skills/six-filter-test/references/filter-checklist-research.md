# Filter checklist research

Recipes for AI-first-pass research. Apply the three-tier hierarchy in `SKILL.md` on every call.

## Shared research instruction (splice into system prompts)

```
Apply the source hierarchy from the six-filter-test skill: search for a publicly-
cited Nielsen or Kantar figure first: DRHPs, investor decks, credit-rating
rationales, trade press. If none exists, use the category-intelligence engines
already specified above. If neither produces anything, use digital-proxy/analog-
transfer as a last resort. Always report a finding — state clearly which tier it
came from, never omit the tier, never present a tier-3 finding as if it were tier-1.
```

## F1 — category intelligence + attribute validation

Apply `category-intelligence/SKILL.md` in full: TAM triangulation (never a single method), competitive landscape, penetration, purchase frequency, per-capita consumption, price architecture.

- **Stated attributes 1–3** are the BM's intended USPs. Independently identify the category's actual top purchase-decision attributes. Evaluate saliency across general trade, modern trade, e-com and quick-commerce before scoring. Only mark `not-core` after that channel read. Do not overwrite the human attributes. Checklist copy when not-core: the category currently sells on X, Y, Z; the betted attribute requires primary research.
- **Benchmark named:** search that exact brand (listings, company reports, trade press). Write a one-sentence finding unique to this brand (owner, SKU, currently selling in India). `estimatedBenchmarkExists` is true only after that search confirms it; false only after the search finds no such competitor. Never write "name the purchase-decision attribute" when STATED_ATTRIBUTE is already filled. Never invent a substitute brand.
- **Benchmark not named:** find currently-selling named competitors in the exact segment (tier-1 public audit citations when available; else e-com / filings / trade press). Name brand · variant · pack.
- **Growth route / argument:** category value and growth from public Nielsen/Kantar citations when available; else triangulate demand / supply / company build-up; publish working P50 with tier.

## F2 — cost, GST, qcom, competitive price and PCC (auto-fill empty fields only)

Empty F2 fields may auto-fill from `runCostEstimate`. Finance signature stays human. MRP is formula-only from COGS, net margin and GST (never a researched guess).

**Q-com trajectory:** not today's Blinkit/Instamart rate card. Research where take-rate, commission, delivery-fee and visibility costs are heading over **3 years**, and what that does to net margin at this pack's MRP. Write that as `qcomTrajectory`.

Also research, at the stated pack size (normalize if the found pack differs):
- typical competitor / leader shelf price
- category per-capita consumption (PCC)
- market-leader PCC or volume share used as the PCC proxy

These feed Filter 3's elasticity band. They do not replace the formula MRP.

**GST rate:** analysed from the proposition name, category, and idea at the top of the page.
Food products are usually 5% or 18%. Packaged snacks (namkeen, chips, extruded savoury) are typically 18%. Staple foods more often 5%. Personal care / homecare typically 18%. Store `gstRatePct` plus `gstBasis` (`Analysed by AI: …`). Do not leave GST blank.

## F3 — elasticity band around the Filter 2 MRP

Filter 2's formula MRP is the centre. Research then compute a 5-year operating band around it:

1. **Category / competitor pack price** at equal grammage (normalize; never use a sachet as a 100ml price).
2. **Inflation** — CPI/WPI for the item group, plus commodity, capacity, shortage and listed-player outlook that would move COGS over 5 years.
3. **Volume-loss elasticity** at an inflation-matching increase (10% volume-loss ceiling).
4. **Division margin floor** is supplied by the app — do not research it.

Min cannot go below today's COGS ÷ (1 − floor). Max cannot go above the 10% volume-loss ceiling. If the Filter 2 MRP sits outside that band, recommend a new MRP — do not silently leave a false range.

The stored field is `marginElasticity`: `{ minMrpInr, maxMrpInr, minMarginPct, maxMarginPct, recommendedMrpInr, basis, sources, aiSourced }`.

## F3 — volume loss on an inflation-matching increase

Used to recover the elasticity relationship (typically at price-index 100 / at-parity) so the 10% volume-loss ceiling can be solved for a price, then a margin. Do not fire a parallel elasticity model.

```json
{
  "inflationRatePct": 0,
  "inflationSource": "...",
  "inflationPeriod": "...",
  "competitivePositionNote": "...",
  "modelledVolumeLossPct": 0,
  "sourceTier": 1,
  "basis": "...",
  "sources": [{ "title": "...", "url": "..." }]
}
```

## F4 — structural obsolescence (`techShiftRisk`)

Apply the same category-intelligence skill as Filter 1. Additionally search quick-commerce, e-commerce, social and internet behaviour for this format (share of new launches, urban habit shift, serum-vs-oil style substitution, subscription / planned-purchase moves). Use those signals as evidence inside the seven dimensions — do not replace the dimensions with a trend score.

Assess whether the format is structurally exposed to a shift that has not happened yet — not whether today's trend line is up or down. Seven dimensions, each Low/Medium/High with a one-sentence evidence-grounded reason. If a dimension has no discoverable destabilizing signal, write `Low risk — no destabilizing signal found`. Do not return `overallRisk`; the app aggregates it.

```json
{
  "dimensions": {
    "functionalCoreStability": { "risk": "Low", "reason": "..." },
    "consumptionContextStability": { "risk": "Low", "reason": "..." },
    "manufacturingDisruptionRisk": { "risk": "Low", "reason": "..." },
    "userHabitShiftPotential": { "risk": "Low", "reason": "..." },
    "adjacentSubstitutionThreat": { "risk": "Low", "reason": "..." },
    "purchaseFrequencyShift": { "risk": "Low", "reason": "..." },
    "regulatoryDisruptionRisk": { "risk": "Low", "reason": "..." }
  },
  "sources": [{ "title": "...", "url": "..." }]
}
```

## F5 — five sizing factors

Always fill all five. Stronger tier on one factor must not be laundered onto a weaker factor — use `factorTiers` per factor.

```json
{
  "householdsReachedY3Mn": 0,
  "trialRatePct": 0,
  "repeatConversionPct": 0,
  "purchaseFrequencyYr": 0,
  "avgPackValueInr": 0,
  "factorTiers": {
    "households": 1,
    "trial": 2,
    "repeat": 2,
    "frequency": 3,
    "packValue": 3
  },
  "sources": [{ "title": "...", "url": "..." }]
}
```

`factorTiers` is backend-only — never show tier labels as per-point checklist UI.

Household decomposition fallback (tier 2/3):

```
Category value ≈ Households × Penetration × Occasions/year × Volume/occasion × Realised price
```

A category with zero public footprint still gets tier-3 digital-proxy / analog estimates for every factor.

## F6 — untouched

No research, no suggestions, no scoring in this skill.
