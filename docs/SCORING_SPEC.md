# 6 Filter Test — Scoring specification

Generated from `lib/lockedConstants.js` (ruleset **v5.0**). Filters 5–6 stay validation-only and are not scored.

## Ruleset

| Constant | Value |
|---|---|
| `SCORING_RULESET_VERSION` | `v5.0` |
| `SCORE_DENOMINATOR_MODE` | `fixed-slots` |
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
| `F1_EVIDENCE_CREDIT_MODE` | `read-and-relevant` |
| `AI_SUGGESTED_TEXT_NEEDS_CONFIRMATION` | `true` |
| `F1_PROMPT_VERSION` | `v1` |

### What changed in v5.0

Filter 1 has **six** checks (17 slots total). Category size no longer scores Filter 1. Benchmark credit needs a web relevance check with a returned source. Attributes need Evidence Source that was read and is relevant. Gap derivation, parity, growth route and growth argument are fact-checked; AI-written text earns nothing until a person confirms or edits it. Mark-down opens one check (~5.9 points); the only Filter 1 hard stop remains declared gap below 2.0. Ideas already screened keep their sealed number and show the older-release label until Screen again.

### What changed in v4.4

Deterministic `reviewInputs` runs before Submit. Invalid inputs return HTTP 422, spend nothing, and seal no verdict (drafts still save). Path-to-GO items carry stable `ITEM_CODES` and instruction/why/gain copy from `lib/itemCopy.js`.

## GO / NO-GO / WATCH / INCOMPLETE

| Verdict | Rule |
|---|---|
| **INCOMPLETE** | No floor failure, and any of F1–F4 is unfinished (`INCOMPLETE_VERDICT_MODE=incomplete`) |
| **NO-GO** | Floor failure, or (when complete) score &lt; 60% (10 or fewer of 17) |
| **WATCH** | Complete idea with 60% ≤ score ≤ 80% (about 11–13 of 17) |
| **GO** | Complete idea with score &gt; 80% (about 14 of 17) |

## Fixed check slots (17)

| Filter | Slots | Canonical checks |
|---|---:|---|
| F1 | 6 | Benchmark relevant · Declared gap ≥ 2.0 (or verified first-mover) · Attributes + relevant evidence · Gap derivation + parity · Growth route · Growth argument |
| F2 | 3 | MRP + grammage · Net margin vs locked division minimum · Quick-commerce terms |
| F3 | 1 | Filter 2 MRP inside the safe ₹ range (± ₹0.5) |
| F4 | 7 | Seven structural-obsolescence risk dimensions |

**Filter 1 owner rules:** typed benchmarks need a web relevance check citing a returned source. Gap ≥ 2.0 never mark-down; &lt; 2.0 is NO-GO. Gap 0 with no benchmark is first-mover (needs &lt; 2 competitors). Attributes need Evidence Source read and relevant. Claims mark down only on contradicted + quote + returned source. Route marks down only on high-confidence mismatch. AI-suggested text needs person confirm/edit.

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

The only number shown in the Log, output page, PDF and Excel is `goNoGo.score` from the last explicit screen (Submit / Run missing steps) or an ADMIN no-cost re-score from stored evidence. Opening an idea never rewrites it. Snapshots without a version are labelled `legacy` / older release until re-screened or re-scored.
