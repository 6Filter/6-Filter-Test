# 6 Filter Test — Scoring specification

Generated from `lib/lockedConstants.js` (ruleset **v4.1**). Filters 5–6 stay validation-only and are not scored.

## Ruleset

| Constant | Value |
|---|---|
| `SCORING_RULESET_VERSION` | `v4.1` |
| `SCORE_DENOMINATOR_MODE` | `fixed-slots` |
| `F3_MRP_RANGE_TOLERANCE_INR` | `0.5` |

## GO / NO-GO / WATCH bands

| Band | Rule |
|---|---|
| **NO-GO** | score &lt; 60% |
| **WATCH** | 60% ≤ score ≤ 80% |
| **GO** | score &gt; 80% |

An unscored Filter 1–4 (not yet run / research failed / division pending) promotes a raw **GO** to **WATCH**. A **Below floor** check forces **NO-GO** until the idea is re-screened.

## Fixed check slots (15)

| Filter | Slots | Canonical checks |
|---|---:|---|
| F1 | 4 | Attribute declared · Benchmark named · Declared gap ≥ 2.0 (or first-mover in that slot) · Growth route + argument |
| F2 | 3 | MRP + grammage · Net margin vs locked division minimum · Quick-commerce terms |
| F3 | 1 | Filter 2 MRP inside the safe ₹ range (± ₹0.5) |
| F4 | 7 | Seven structural-obsolescence risk dimensions |

Finance sign-off is administrative and outside the slots. Blank or missing evidence keeps the slot **open** — the denominator stays 15 at every stage, so more evidence can only raise the percent.

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

## One sealed score

The only number shown in the Log, output page, PDF and Excel is `goNoGo.score` from the last explicit screen (Submit / Run missing steps). Opening an idea never rewrites it. Snapshots without a version are labelled `legacy` / older release until re-screened.
