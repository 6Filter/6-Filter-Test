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

## F1 — benchmark and category size

- **Benchmark not named:** find currently-selling named competitors in the exact segment (tier-1 public audit citations when available; else e-com / filings / trade press). Name brand · variant · pack.
- **Growth route / argument:** category value and growth from public Nielsen/Kantar citations when available; else triangulate demand / supply / company build-up; publish working P50 with tier.

## F2 — almost entirely manual

Do **not** research or suggest: MRP & grammage, COGS, net margin at scale, Finance signature. No dedicated F2 research module.

## F3 — margin elasticity (safe min–max band)

Research three inputs, then the engine computes the range — do not invent a ceiling if elasticity is missing:

1. **Category average pack price** (Nielsen/Kantar cited avg first, else engines, else e-com listing average). Return `sourceTier`.
2. **Inflation** for the category (reuse the Part 43 WPI/CPI recipe) plus the inflation-matching volume-loss observation that encodes elasticity.
3. **Division margin floor** is supplied by the app (`getDivisionMarginFloor`) — do not research it.

If no elasticity exists at any tier, return a structured miss rather than a fabricated `maxMarginPct`.

The stored field is `marginElasticity`: `{ minMarginPct, maxMarginPct, basis, sources, aiSourced }`.

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

## F4 — format trajectory and threats

- Format rising / stable / declining from public format-share citations, then engines, then digital proxy.
- Threat register: substitutes, technology, clean-label, regulatory — each with a one-line response. Empty register is a backend FAIL, not a blank.

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
