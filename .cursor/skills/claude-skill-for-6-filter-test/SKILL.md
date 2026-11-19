---
name: claude-skill-for-6-filter-test
description: >-
  Runs CavinKare 6 Filter Test evidence for Indian FMCG NPD ideas. Prefer
  publicly-cited Nielsen and Kantar figures; otherwise category-intelligence
  engines and web search; last resort digital-proxy/analog. Never return unsure
  or not available. Use when editing 6 Filter Test scoring, AI first pass,
  Nielsen, Kantar, category size, price per gram, tech-shift risk, structural
  obsolescence, or Filter 5 household sizing. Filter 6 is validation only, never scored.
---

# Claude Skill for 6 Filter Test

Canonical copy: `lib/skills/six-filter-test/SKILL.md`.

Before changing scoring, first pass, or check copy, read:

1. `lib/skills/six-filter-test/SKILL.md`
2. `lib/skills/six-filter-test/references/filter-checklist-research.md`

## Must follow

- Tier 1 public Nielsen/Kantar citations → tier 2 engines → tier 3 digital-proxy/analog. Always a finding; always report tier. Never "unsure" / "not available" as a field value.
- No live Nielsen/Kantar feed — search publicly-cited figures only.
- F1/F4: splice six-filter skill + full category-intelligence skill (TAM, competitors, penetration, frequency, PCC, digital) into research prompts. Validate the 3 stated USPs against category key attributes.
- F2: cost / MRP / grammage / qcom terms may auto-fill empty fields from research (Part 32); Finance signature stays human-only.
- F1/F3/F4/F5: suggestions remain accept/dismiss chips; never overwrite filled fields.
- F6: untouched — validation approval only, never researched or scored.
- Suggestions never overwrite filled fields; nothing persists until Submit.
