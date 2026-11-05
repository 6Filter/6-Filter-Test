# 6 Filter Test — Scoring specification

Generated from `lib/lockedConstants.js` (ruleset **v5.2**). Filters 5–6 stay validation-only and are not scored.

## Ruleset

| Constant | Value |
|---|---|
| `SCORING_RULESET_VERSION` | `v5.2` |
| `SCORE_DENOMINATOR_MODE` | `fixed-slots` |
| `SCORING_MODEL` | `relevance` |
| `RELEVANCE_SHADOW_MODE` | `true` |
| `INCOMPLETE_VERDICT_MODE` | `incomplete` |
| `F3_MRP_RANGE_TOLERANCE_INR` | `0.5` |
| `GST_STANDARD_RATES` | Finance-owned list (currently `0, 3, 5, 12, 18, 28, 40`) |

### What changed in v5.2 (Filter 2 revised)

Filter 2 has **one** scored check (15 slots total): net margin vs the locked division minimum. Below the minimum is a **mark-down** (label "Marked down", never "Below floor", never NO-GO); GO is capped at WATCH. MRP is computed from COGS ÷ (1 − margin) × (1 + GST) and may be overridden; an override is checked through the margin that MRP implies. COGS, GST, pack size, MRP and Quick-commerce notes are never scored. The 10% volume-loss / three-year price plan logic is not part of Filter 2 (Filter 3 owns price resilience).

### What changed in v5.0 (relevance)

Filter 1 has **six** checks. Credit is **none / weak / adequate / strong** from stored AI assessments — never from a field being non-empty.

## GO / NO-GO / WATCH / INCOMPLETE

| Verdict | Rule |
|---|---|
| **INCOMPLETE** | No floor failure, and any of F1–F4 is unfinished |
| **NO-GO** | Floor failure (F1 gap &lt; 2.0, or F4 overall High / other remaining floors — not Filter 2 margin), or (when complete) score &lt; 60% |
| **WATCH** | Complete idea with 60% ≤ score ≤ 80%, or a mark-down that would otherwise read GO |
| **GO** | Complete idea with score &gt; 80% and no mark-down |

## Fixed check slots (15)

| Filter | Slots | Canonical checks |
|---|---:|---|
| F1 | 6 | Benchmark · Declared gap ≥ 2.0 · Attributes + evidence · Gap derivation + parity · Growth route · Growth argument |
| F2 | 1 | Net margin vs locked division minimum (mark-down if below) |
| F3 | 1 | Filter 2 MRP inside the safe ₹ range (± ₹0.5) |
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
