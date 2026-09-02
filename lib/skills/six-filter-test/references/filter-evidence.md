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

Web search for cost/channel analogs. Empty F2 fields may auto-fill from `runCostEstimate` (Part 32). Floor from `division_thresholds` via `getDivisionMarginFloor`. `financeSigned` stays human.

## Filter 3 → `f3`

| Check copy | Source | Field |
|---|---|---|
| Margin elasticity not yet computed | Category avg price + Part 43 inflation/elasticity + division floor | `marginElasticity` |

`marginElasticity` is `{ minMrpInr, maxMrpInr, minMarginPct, maxMarginPct, basis, sources, aiSourced }`. Display is a ₹ MRP range. Min MRP is today's COGS against the division floor. Max MRP is the 10% volume-loss price ceiling after 5 years of cost inflation. Internal `minMarginPct`/`maxMarginPct` are what Filter 2's declared margin is checked against.

## Filter 4 → `f4`

| Check copy | Source | Field |
|---|---|---|
| Format trajectory pending | Nielsen format shares, else skill + web | `formatTrajectory` (`rising` / `flat` / `declining`) |
| Threat register empty | Skill + web: substitutes, technology, clean-label, regulatory | `threatRegister` |
| Threat responses incomplete | One response line per threat | `threatRegister` (include responses); `threatsAnswered` stays human |

Map model `stable` → form `flat`. Declining format = backend FAIL (`Below floor`).

## Filter 5 → `f5`

| Check copy | Source | Field |
|---|---|---|
| Sizing incomplete | Kantar → Nielsen → HCES decomposition → web analog | `householdsReachedY3Mn`, `trialRatePct`, `repeatConversionPct`, `purchaseFrequencyYr`, `avgPackValueInr` |
| CMI signature pending | Human | `cmiHeadSigned` — never auto-tick |

Year-3 ₹ Cr is computed on the server: `HH×1e6 × trial × repeat × freq × pack / 1e7`.

## Filter 6 → `f6`

Do not score. Do not suggest lab/panel/pack numbers. Check pill: Awaiting panels / Validation pending / Validation recorded.
