# Filter evidence mapping

Fill these proposition fields. Human-owned signatures stay unticked.

## Filter 1 → `f1`

| Check copy | Source | Field |
|---|---|---|
| Benchmark not named | Nielsen `products[]`, else web listings | `benchmark` |
| Growth route / argument incomplete | Nielsen category value + growth, else three engines | `growthRoute`, `growthArgument` |
| Attribute / gap | Web + reviews; gap ≥ 2.0 | `declaredAttribute`, `declaredGap` |

`generalCategory` is a plain market label. No CavinKare brands, no new-vs-existing-for-CK.

## Filter 2 → `f2`

Web search for cost/channel analogs. `netMarginAtScale` is a suggestion. Floor from `DIVISION_NET_MARGIN`. `financeSigned` stays human.

## Filter 3 → `f3`

| Check copy | Source | Field |
|---|---|---|
| Price index vs benchmark missing | Nielsen price per gram of the named benchmark and peers | `priceIndexVsBenchmark` |

`priceIndexVsBenchmark` = idea ₹/g ÷ benchmark ₹/g × 100. Volume loss cap ≤ 10% unchanged.

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
