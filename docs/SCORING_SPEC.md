# 6 Filter Test — Scoring specification

Generated from `lib/lockedConstants.js` (ruleset **v4.4**). Filters 5–6 stay validation-only and are not scored.

## Ruleset

| Constant | Value |
|---|---|
| `SCORING_RULESET_VERSION` | `v4.4` |
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

### What changed in v4.4

Deterministic `reviewInputs` runs before Submit. Invalid inputs return HTTP 422, spend nothing, and seal no verdict (drafts still save). Path-to-GO items carry stable `ITEM_CODES` and instruction/why/gain copy from `lib/itemCopy.js` — never a neutral “Benchmark named: X”. Research prompts use a title-cased benchmark suggestion when capitals are odd; the typed value stays until the user accepts. Advisory AI input review (D14) may add notes only and never changes a score.

### What changed in v4.3

Team-provided Evidence Source (file or Primus Evidence library link) is read once on Submit. Quote-verified facts can clear F1 benchmark, category size, or attribute through the existing findings flags — bands, floors and the 15-slot table are unchanged. A stated-only benchmark and a ₹0 Cr / PASS-without-size category no longer count (`BENCHMARK_VERIFIED_NEEDS_EVIDENCE`, `CATEGORY_SIZE_NEEDS_SOURCED_FIGURE`). Evidence sha256 and the link (query stripped) join `gateInputKey` / `researchHashFor`.

### What changed in v4.2

Unfinished Filter 1–4 research (not yet run, research failed, or division pending) with **no** floor failure is classified **INCOMPLETE**, not a band. The percent and “X of 15 checks complete” still show. A **Below floor** check still forces **NO-GO**. Band edges, the WATCH cap for complete ideas, floors, margins and the 15-slot table are unchanged from v4.1.

## GO / NO-GO / WATCH / INCOMPLETE

| Verdict | Rule |
|---|---|
| **INCOMPLETE** | No floor failure, and any of F1–F4 is unfinished (`INCOMPLETE_VERDICT_MODE=incomplete`) |
| **NO-GO** | Floor failure, or (when complete) score &lt; 60% |
| **WATCH** | Complete idea with 60% ≤ score ≤ 80% |
| **GO** | Complete idea with score &gt; 80% |

When `INCOMPLETE_VERDICT_MODE` is `"as-built"`, unfinished filters keep the v4.1 behaviour (band from percent; a raw GO promotes to WATCH).

## Fixed check slots (15)

Slots are matched by **name** (`expectedSlotKeys()`), not list position.

| Filter | Slots | Canonical checks |
|---|---:|---|
| F1 | 4 | Attribute declared · Benchmark named · Declared gap ≥ 2.0 (or first-mover in that slot) · Growth route + argument |
| F2 | 3 | MRP + grammage · Net margin vs locked division minimum · Quick-commerce terms |
| F3 | 1 | Filter 2 MRP inside the safe ₹ range (± ₹0.5) |
| F4 | 7 | Seven structural-obsolescence risk dimensions |

**F1 scoring notes:** Attributes 2 and 3 are optional — leaving them blank never opens the attribute slot or lowers the percent. Entered benchmark / growth values are **not** accepted as correct until web research verifies them (`benchmarkVerified` / `categorySizeFound` true) or team Evidence Source clears the slot. Checklist and card copy must not echo form inputs as “Already on record / Still needed”; open slots ask for Submit / web verification or state the research failure.

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

INCOMPLETE ideas do not show a gram badge.

## One sealed score

The only number shown in the Log, output page, PDF and Excel is `goNoGo.score` from the last explicit screen (Submit / Run missing steps) or an ADMIN no-cost re-score from stored evidence. Opening an idea never rewrites it. Snapshots without a version are labelled `legacy` / older release until re-screened or re-scored.
