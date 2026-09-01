---
name: claude-skill-for-6-filter-test
description: >-
  Runs CavinKare 6 Filter Test evidence for Indian FMCG NPD ideas. Prefer
  Nielsen and Kantar when local files exist; otherwise playbook engines and web
  search. Never return unsure or not available. Use when editing 6 Filter Test
  scoring, AI first pass, Nielsen, Kantar, category size, price per gram, format
  trajectory, threat register, or Filter 5 household sizing. Filter 6 is
  validation only, never scored.
---

# Claude Skill for 6 Filter Test

Canonical copy: `lib/skills/six-filter-test/SKILL.md`.

Before changing scoring, first pass, or check copy, read:

1. `lib/skills/six-filter-test/SKILL.md`
2. `lib/skills/six-filter-test/references/nielsen-kantar.md`
3. `lib/skills/six-filter-test/references/filter-evidence.md`
4. `lib/skills/six-filter-test/references/playbook-formulas.md`

## Must follow

- Nielsen → Kantar → calibration → playbook + web → analog. Never "unsure" / "not available".
- F1 benchmark and category size: Nielsen products and category value first.
- F2: web search. Do not change division-floor math.
- F3: Nielsen price per gram vs benchmark. Volume loss ≤ 10% = pass.
- F4: skill + web for trajectory, threats, responses.
- F5: fill households, trial, repeat, frequency, pack value from Kantar/Nielsen/web fallbacks.
- F6: not scored. Validation approval only.
- Per-point scores stay on the server. The form shows one Check pill per filter.
