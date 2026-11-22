# The six-filter-test skill: alignment audit (22 November 2026)

**Short version.** Your skill was written for an earlier platform. Compared with the platform as it is today (scoring ruleset v5.7), it is **out of date in five places and silent in four more**. **Today this causes no harm to the live platform**, because the platform's own pipeline does not use the skill at all: it has its own prompts (Filter 1 prompt version v3) and code. The skill only affects someone who uses it by hand in Claude. **It becomes critical the day the skill is used for the bring-your-own-research design**, so it must be brought into line first and kept there automatically.

## 1. What I compared
The original skill (57 lines) against the platform's code: `lockedConstants.js` (ruleset, fixed check slots, prompt versions), `searchBudget.js`, `lib/categoryIntelligence/` (the sizing engines), `syndicatedLookup.js` (Nielsen and Kantar data), `scopedSearch.js`, and `scripts/scoringFingerprint.json`.

## 2. The findings

| # | The original skill says | The platform does today | Verdict | What the refined skill (v2.1) does |
|---|---|---|---|---|
| 1 | The checks are **Filters 1 to 5** | The verdict is built from **Filters 1 to 4 only**: 18 fixed slots (Filter 1 has 7, Filter 2 has 3, Filter 3 has 1, Filter 4 has 7). Filter 6 is validation-only: "gates, never a score" | **Outdated** | States the scope as Filters 1 to 4, names the **Screening verdict (Filters 1 to 4)**; Filters 5 and 6 are not researched here |
| 2 | "No direct feed into Nielsen or Kantar is available; web search only" | The platform has an **import path and a store** for Nielsen and Kantar rows (`syndicatedImport`, `syndicatedLookup`), consulted for the **exact category**, at most once per step. The store is **empty in production today** | **Partly outdated** | Adds tier 0: the platform's own syndicated data, when loaded |
| 3 | Tier 2: "the category-intelligence **skill's** engines E1 to E7" | The platform has **its own port of seven engines** (`lib/categoryIntelligence`), with calibration on E1, E2 and E7 and a "not run, never invent a number" rule. Two copies of the same method can drift | **Divergence risk** | The engines come from the protocol served by the platform; the engine list is checked by the test |
| 4 | Tier 3: "digital proxy or analog transfer" as a **separate last-resort tier** | In the platform, **E6 (analog transfer) and E7 (digital proxy) are engines inside the set**, chosen by the category's archetype | **Outdated** | Folds them into the engines |
| 5 | No effort limit | **At most 4 web searches per research step**; the exact-category match is used once | **Missing** | Adds the budget (4) and checks it |
| 6 | (silent) | Searches are **category-first**; the wider family only if the exact category returns nothing; **never an unscoped sweep of Indian FMCG** | **Missing** | Adds the rule |
| 7 | "Every check produces a finding, never a bare 'not available'" | Engines return **"not run"** when an input is missing; the scoring reads assessments as data and **never trusts the model for a level**; an unfinished check means **INCOMPLETE** | **Conflicts in spirit** (it pushes a model to fill gaps) | "Unknown is allowed and respected"; never state a verdict or a score |
| 8 | Findings feed the form "(see `lib/propositionScoring.js`)" | A user's Claude cannot see that file | **Cannot work for users** | The checklist comes from the connector's protocol |
| 9 | No version, no review date | Prompt versions, a scoring fingerprint (`ba0156d2`) and a ruleset version exist | **Missing** | An alignment record, and a test that enforces it |
| 10 | (silent) | Web pages are untrusted; claims are checked against sources the search returned | **Missing** | Injection rules; a quote and a date for every source |
| 11 | Tier 1 relies on figures "as per Nielsen / Kantar" | Licence status is unconfirmed | **Open** | Flagged; the owner asks procurement |

## 3. How we keep it aligned from now on

1. **One home for the skill:** a copy lives in the repository (`docs/prompts/six-filter-test_SKILL_v2_DRAFT.md` for now, `docs/skills/six-filter-test/SKILL.md` once approved). That copy is the source of truth; the version in Claude is uploaded from it.
2. **An alignment record** at the end of the skill declares the platform it was written for: scoring ruleset, fingerprint, scored filters and slot counts, search budget, Filter 1 prompt version, and the engines.
3. **A test, `scripts/testSkillAlignment.mjs` (9 checks),** compares that record with the code. It fails if any of them differ, if the wording claims Filters 1 to 5 or uses the retired titles BM and BH FORUM, or if the last review is older than 45 days. **I proved it:** it passes on the refined skill, **fails all 9 checks on your original**, and catches each of ten deliberate breaks, including a change to the platform itself (a raised search budget; an eighth engine).
4. **It runs in the pre-push hook**, so a change to the scoring or research code cannot ship with a stale skill.
5. **Triggers that force a skill update in the same branch:** the ruleset, the fingerprint, the slot counts, the search budget, any prompt version, the engine list, a renamed title or verdict wording.
6. **A monthly review** by the owner (the test forces it at 45 days), recorded in the alignment record.
7. **Later (the bring-your-own-research phases):** generate the protocol from the code, so the skill is only a launcher and cannot drift on content.

## 4. What the owner does
- **Today:** nothing urgent, since the live pipeline does not use the skill. Don't upload v2.1 to Claude yet: its tools do not exist, so it is marked a draft.
- **When Cursor has run the test in the repository and confirmed it passes,** replace the old skill in your Claude with the approved version (Customize, then Skills), or ask your Claude admin to provision it through the organisation plugin.
- **Ask procurement** about citing Nielsen and Kantar figures (item G3).
