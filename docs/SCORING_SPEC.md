# 6 Filter Test — Scoring specification

Generated from `lib/lockedConstants.js` (ruleset **v5.4**). Filters 5–6 stay validation-only and are not scored.

## Ruleset

| Constant | Value |
|---|---|
| `SCORING_RULESET_VERSION` | `v5.4` |
| `SCORE_DENOMINATOR_MODE` | `fixed-slots` |
| `SCORING_MODEL` | `relevance` |
| `RELEVANCE_SHADOW_MODE` | `true` |
| `INCOMPLETE_VERDICT_MODE` | `incomplete` |
| `F3_HORIZON_YEARS` | `5` |
| `F3_LOSS_STATISTIC` | `median` |
| `FIXED_PRICE_POINTS` | `1, 2, 5, 10, 20, 50, 100` |
| `VOLUME_LOSS_CEILING_PCT` | `10` |
| `GST_STANDARD_RATES` | Finance-owned list (currently `0, 3, 5, 12, 18, 28, 40`) |

### What changed in v5.4 (output only when evaluated)

An idea has an **output** only when every required AI step has finished (`evaluationStatus`). The sealed snapshot (`goNoGo.output`) holds the verdict, score, rationale and each filter's label, narrative and items. Opening an idea never recomputes live `advisoryChecks` for display. Incomplete / not-evaluated ideas show no verdict, percent or cards. Legacy ideas (screened before sealed outputs) keep their stored score labelled "Scored under an older release" with no cards. A failed AI step blocks sealing and offers Retry; a documented "found nothing" is a finished result.

### What changed in v5.3 (Filter 3 cliff rule)

Filter 3 has **one** scored check: price resilience on the 10% volume-loss cliff rule. The price tested is the Filter 2 MRP (`resolveF2Price`). Smooth inflation-covering rises that never meet a fixed price point pass with full credit and no volume evidence. A crossing is judged from verified comparable events (source among returned search URLs; quote contains the figure; `crossed_point` recomputed). Exactly 10% passes; above fails; no evidence cannot-assess. Fail / cannot-assess / weak pass are mark-downs that cap GO at WATCH — never "Below floor", never NO-GO. The old min/max MRP band no longer scores.

### What changed in v5.2 (Filter 2 revised)

Filter 2 has **one** scored check (15 slots total): net margin vs the locked division minimum. Below the minimum is a **mark-down** (label "Marked down", never "Below floor", never NO-GO); GO is capped at WATCH. MRP is computed from COGS ÷ (1 − margin) × (1 + GST) and may be overridden; an override is checked through the margin that MRP implies. COGS, GST, pack size, MRP and Quick-commerce notes are never scored. The 10% volume-loss / three-year price plan logic is not part of Filter 2 (Filter 3 owns price resilience).

### What changed in v5.0 (relevance)

Filter 1 has **six** checks. Credit is **none / weak / adequate / strong** from stored AI assessments — never from a field being non-empty.

## GO / NO-GO / WATCH / INCOMPLETE

| Verdict | Rule |
|---|---|
| **INCOMPLETE** | No floor failure, and any of F1–F4 is unfinished |
| **NO-GO** | Floor failure (F1 gap &lt; 2.0, or F4 overall High — not Filter 2 margin or Filter 3 cliff), or (when complete) score &lt; 60% |
| **WATCH** | Complete idea with 60% ≤ score ≤ 80%, or a mark-down / weak evidence that would otherwise read GO |
| **GO** | Complete idea with score &gt; 80% and no mark-down / weak-evidence cap |

## Fixed check slots (15)

| Filter | Slots | Canonical checks |
|---|---:|---|
| F1 | 6 | Benchmark · Declared gap ≥ 2.0 · Attributes + evidence · Gap derivation + parity · Growth route · Growth argument |
| F2 | 1 | Net margin vs locked division minimum (mark-down if below) |
| F3 | 1 | Price resilience — 10% volume-loss cliff at fixed price points (mark-down if fail / cannot-assess) |
| F4 | 7 | Seven structural-obsolescence risk dimensions |

## Division minimum net margins (locked)

| Division | Minimum % |
|---|---:|
| Professional Care | 60 |
| Personal Care | 50 |
| Foods | 35 |
| Snacks | 30 |
| Bakery | 30 |
| Ambient Dairy | 25 |
| Beverages | 25 |
| Dairy Craft — Non-UHT | 25 |
| Cold Chain Business | 12 |
| Dairy Craft — UHT Milk | 12 |
| International Business | respective division |

## One sealed score

The only number shown in the Log, output page, PDF and Excel is `goNoGo.score` from the last explicit screen. Opening an idea never rewrites it. Snapshots without a version are labelled `legacy` / older release until re-screened.
