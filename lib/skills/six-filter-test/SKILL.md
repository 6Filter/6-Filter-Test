---
name: six-filter-test
description: >-
  Evidence research for CavinKare 6 Filter Test Filters 1, 3, 4 and 5. Prefer
  publicly-cited Nielsen/Kantar figures (DRHPs, investor decks, credit-rating
  rationales, trade press), then category-intelligence engines, then
  digital-proxy/analog-transfer. Always report a finding and its source tier.
  Never emit unsure or not available as a field value. Use for AI first pass,
  F3 price index, F5 sizing factors, F1/F4 research prompts. F2 stays mostly
  manual; F6 is validation only and is never researched or scored here.
---

# Claude Skill for 6 Filter Test

Backend research guidance for Primus.AI Filters 1, 3, 4 and 5.

## Source hierarchy (every researched field)

1. **Tier 1 — publicly-cited Nielsen / Kantar.** Web search for figures attributed to Nielsen retail audit or Kantar household panel in DRHPs, RHPs, investor decks, earnings transcripts, credit-rating rationales, and reputable trade press. There is **no** live Nielsen/Kantar API or internal export in this app — do not invent one and do not pretend a free scrape is Nielsen.
2. **Tier 2 — category-intelligence engines.** Demand-side (HCES), supply-side (ASI ± trade), company build-up, reconciliation — as in `category-intelligence`.
3. **Tier 3 — digital-proxy / analog-transfer.** Search interest, e-com assortment/price, review velocity, comparable-market or leading-state analogs.

Always fall through until there is a real finding. Never leave a researched field blank with "unsure", "not available", "unknown", or "n/a".

Always state which tier the finding came from in the backend payload (`sourceTier` or `factorTiers`). Never present a tier-3 finding as if it were tier-1.

Uncertainty is allowed **as a labelled weaker tier**, not as silence.

## Filter mapping

| Filter | Research this skill covers | Stays human / out of scope |
|---|---|---|
| F1 | Benchmark naming; category size / growth argument | Attribute rank, CMI hierarchy evidence |
| F2 | Optional general context only — **not** MRP, COGS, net margin, Finance signature | All F2 numeric and signature fields |
| F3 | Price index vs named benchmark (₹/g or ₹/ml, comparable pack) | Elasticity source ownership, volume-loss modelling sign-off |
| F4 | Format trajectory; threat register + responses | — |
| F5 | Households Y3, trial %, repeat %, frequency, avg pack ₹ | CMI head signature |
| F6 | **Nothing** — validation approval only, never researched or scored | Lab / consumer / pack panels |

## What this skill does not cover

- Live syndicated feeds or private CavinKare Nielsen/Kantar exports
- Inventing a Nielsen number when no public citation exists (use tier 2 or 3 instead)
- F2 arithmetic against division floors
- F6 lab/consumer/pack scoring
- Surfacing per-factor methodology or tier labels in the checklist UI — tiers stay backend-only

## Non-negotiables

- Filter 3 volume loss ≤ 10% = PASS (do not change that math)
- Do not average engines when spread > 30%
- Label retail vs ex-factory on every rupee figure
- Suggestions never overwrite a filled human field; nothing persists until Submit

## References

- [filter-checklist-research.md](references/filter-checklist-research.md) — checklist-item research recipes and JSON shapes
- Sibling `lib/skills/category-intelligence/` — engines, sources, competition
