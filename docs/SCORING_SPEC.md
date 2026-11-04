# 6 Filter Test — Scoring specification

Generated from `lib/lockedConstants.js` (ruleset **v5.0**). Filters 5–6 stay validation-only and are not scored.

## Ruleset

| Constant | Value |
|---|---|
| `SCORING_RULESET_VERSION` | `v5.0` |
| `SCORE_DENOMINATOR_MODE` | `fixed-slots` |
| `SCORING_MODEL` | `relevance` |
| `RELEVANCE_SHADOW_MODE` | `true` |
| `INCOMPLETE_VERDICT_MODE` | `incomplete` |
| `SCORE_KEY_IGNORES_NAME_TYPOS` | `false` |
| `F3_MRP_RANGE_TOLERANCE_INR` | `0.5` |
| `BENCHMARK_VERIFIED_NEEDS_EVIDENCE` | `true` |
| `CATEGORY_SIZE_NEEDS_SOURCED_FIGURE` | `true` |
| `EVIDENCE_TRUST_MODE` | `count` |
| `EVIDENCE_CONFLICT_RATIO` | `2` |
| `INVALID_INPUTS_BLOCK_SUBMIT` | `true` |
| `AI_INPUT_REVIEW` | `true` |
| `GST_STANDARD_RATES` | `0, 3, 5, 12, 18, 28, 40` |
| `AI_SUGGESTED_TEXT_NEEDS_CONFIRMATION` | `true` |
| `F1_PROMPT_VERSION` | `v2` |

### What changed in v5.0 (relevance)

Filter 1 has **six** checks (17 slots). Credit is **none / weak (1/3) / adequate (2/3) / strong (1)** from stored AI assessments through locked rules in `lib/relevanceGrade.js` — never from a field being non-empty. Judged checks: Filter 1 benchmark, attributes, derivation, route, argument, and Filter 2 Quick-commerce. Numbers (gap, margin, MRP, F3 range, F4 ratings) keep numeric rules. Shadow mode stores the relevance score while the user-facing verdict still uses the legacy binary count until the owner flips `RELEVANCE_SHADOW_MODE`. Ideas already screened keep their sealed number with the older-release label.

## GO / NO-GO / WATCH / INCOMPLETE

| Verdict | Rule |
|---|---|
| **INCOMPLETE** | No floor failure, and any of F1–F4 is unfinished |
| **NO-GO** | Floor failure, or (when complete) score &lt; 60% |
| **WATCH** | Complete idea with 60% ≤ score ≤ 80% |
| **GO** | Complete idea with score &gt; 80% |

While shadow mode is on, the **displayed** verdict uses the legacy binary percent; the relevance percent is stored for ADMIN comparison.

## Fixed check slots (17)

| Filter | Slots | Canonical checks |
|---|---:|---|
| F1 | 6 | Benchmark · Declared gap ≥ 2.0 (or verified first-mover) · Attributes + evidence · Gap derivation + parity · Growth route · Growth argument |
| F2 | 3 | MRP + grammage · Net margin vs locked division minimum · Quick-commerce terms (judged) |
| F3 | 1 | Filter 2 MRP inside the safe ₹ range (± ₹0.5) |
| F4 | 7 | Seven structural-obsolescence risk dimensions |

**Relevance principle:** no check earns credit because a field is non-empty. An unassessed entry earns nothing. A link or file being present earns nothing; evidence credit comes only from quote-verified facts.

## Declared gap floor

`DECLARED_GAP_FLOOR = 2.0` (points on the 10-pt scale).

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

## Idea size tiers (Filter 5 display)

| Tier | 3-year revenue |
|---|---|
| 10g | up to ₹1 Cr |
| 100g | ₹1–12 Cr |
| 1000g | above ₹12 Cr |

INCOMPLETE ideas do not show a gram badge.

## One sealed score

The only number shown in the Log, output page, PDF and Excel is `goNoGo.score` from the last explicit screen (Submit / Run missing steps) or an ADMIN no-cost re-score from stored evidence. Opening an idea never rewrites it. Snapshots without a version are labelled `legacy` / older release until re-screened or re-scored. Relevance parallel lives on `goNoGo.relevanceScore` while shadow mode is on.
