# Filter evidence mapping

Fill these proposition fields. Human-owned signatures stay unticked.

## Filter 1 → `f1`

| Check copy | Source | Field |
|---|---|---|
| Benchmark not named | Nielsen `products[]`, else web listings | `benchmark` |
| Growth route / argument incomplete | Nielsen category value + growth, else three engines | `growthRoute`, `growthArgument` |
| Attribute / gap | Web + reviews; gap ≥ 2.0 | `declaredAttribute` (required), `declaredAttribute2`/`declaredAttribute3` (optional), `declaredGap` |

`generalCategory` is a plain market label. No CavinKare brands, no new-vs-existing-for-CK.

## Filter 2 → `f2`

Web search for cost/channel analogs. Empty F2 fields may auto-fill from `runCostEstimate` (Part 32). Floor from `division_thresholds` via `getDivisionMarginFloor`. `financeSigned` stays human. GST is analysed from the product name / category / idea at the top of the page: food 5% or 18%, packaged snacks typically 18%. Display `gstBasis` under the GST field.

## Filter 3 → `f3`

| Check copy | Source | Field |
|---|---|---|
| Margin elasticity not yet computed | Category avg price + Part 43 inflation/elasticity + division floor | `marginElasticity` |

`marginElasticity` is `{ minMrpInr, maxMrpInr, minMarginPct, maxMarginPct, basis, competitiveNote, categoryAvgPriceInr, sources, aiSourced }`. Display is a ₹ MRP range. Min MRP is today's COGS against the division floor. Max MRP is the 10% volume-loss price ceiling after 5 years of cost inflation. Internal `minMarginPct`/`maxMarginPct` are what Filter 2's declared margin is checked against. `competitiveNote` states implied launch price vs the researched category average (within 5% / premium / below).

## Filter 4 → `f4`

| Check copy | Source | Field |
|---|---|---|
| Technology & habit shift risk not yet assessed | Skill + web: emerging tech, patents, regulation, adjacent-category innovation | `techShiftRisk` |

`techShiftRisk` is `{ dimensions: { functionalCoreStability, consumptionContextStability, manufacturingDisruptionRisk, userHabitShiftPotential, adjacentSubstitutionThreat, purchaseFrequencyShift, regulatoryDisruptionRisk }, overallRisk, sources, aiSourced }`. Each dimension is `{ risk: Low|Medium|High, reason, userResponse?, reassessedRisk?, reassessedReason? }`. The model must not supply `overallRisk` — the app computes it (`2+ High → High`, `1 High or 3+ Medium → Medium`, else `Low`) from `reassessedRisk` when present, otherwise original `risk`. High overall = `Below floor`. Medium = `Evidence missing`. A written `userResponse` is judged, never accepted at face value; original `risk`/`reason` are never overwritten.

## Filter 5 → `f5`

| Check copy | Source | Field |
|---|---|---|
| Sizing incomplete | Kantar → Nielsen → HCES decomposition → web analog | `householdsReachedY3Mn`, `trialRatePct`, `repeatConversionPct`, `purchaseFrequencyYr`, `avgPackValueInr` |
| CMI signature pending | Human | `cmiHeadSigned` — never auto-tick |

Year-3 ₹ Cr is computed on the server: `HH×1e6 × trial × repeat × freq × pack / 1e7`.

## Filter 6 → `f6`

Do not score. Do not suggest lab/panel/pack numbers. Check pill: Awaiting panels / Validation pending / Validation recorded.
