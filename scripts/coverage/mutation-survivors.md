# Scoring mutation — T1 (goNoGo, scoreSlots, propositionScoring)

Locked scoring files were **not** edited. Concurrency 2. Temp on `D:/Primus-safety/stryker-tmp` (behavioural) and `D:/Primus-safety/stryker-tmp-all` (all mutants). Command runner: `node scripts/coverage/runScoringMutation.mjs` (the three `*MutationKill` tests + golden + oracle with `SCORING_MUTATION=1`).

## Two scores (this run)

| File | All mutants (`stryker.verdict-all.json`) | Behavioural (`StringLiteral` + `RegexLiteral` excluded, `stryker.verdict.json`) |
| --- | ---: | ---: |
| `lib/goNoGo.js` | **59.86%** (340 killed / 228 survived) | **59.23%** (263 killed / 181 survived) |
| `lib/scoreSlots.js` | **41.87%** (256 killed / 4 timeout / 361 survived) | **43.55%** (229 killed / 4 timeout / 302 survived) |
| `lib/propositionScoring.js` | **34.33%** (92 killed / 176 survived) | **37.23%** (86 killed / 145 survived) |
| **three-file total** | **47.49%** (688 killed / 4 timeout / 765 survived of 1457) | **48.10%** (578 killed / 4 timeout / 628 survived of 1210) |

Target **90% behavioural** on these three is **not met**. The tests now execute the bands, F4 hard stop, GO cap, INCOMPLETE, mark-downs, fixed-slot arithmetic and F5 revenue; remaining survivors are mostly unreached rollback / copy / research-orchestration branches listed below.

## Excluded from the behavioural run

- **Mutators:** `StringLiteral`, `RegexLiteral` (`mutator.excludedMutations`).
- **Paths not mutated in this T1 pass:** `lib/filter1Check.js`, `lib/filter2Check.js`, `lib/f4Assessment.js`, and the other fingerprint files. Those stay locked; they are research and copy pipelines the verdict suite does not execute.

## Remaining survivors (equivalent or unreached)

| File | Line / region | Mutation | Why it is equivalent / unreached |
| --- | --- | --- | --- |
| `goNoGo.js` | `item()` helper ~178–186 | any | Dead: `previewAdvisoryChecks` uses the filter checkers' own item builders, never this helper. |
| `goNoGo.js` | `scoreAdvisoryChecks` as-built loop ~153–175 | arithmetic / unscored | `SCORE_DENOMINATOR_MODE` is locked to `"fixed-slots"`; the loop never runs. |
| `goNoGo.js` | `computeGoNoGo` `incomplete && band === "GO"` | true / false | `INCOMPLETE_VERDICT_MODE` is `"incomplete"`, so unfinished boards return `INCOMPLETE` before a GO→WATCH promotion. |
| `goNoGo.js` | `buildGateRationale` as-built WATCH copy ~314–322 | `INCOMPLETE_VERDICT_MODE === "as-built"` | Locked to `"incomplete"`; rollback-only sentences. |
| `goNoGo.js` | `hasProvisionalFloor` | return true | Part 134 removed the provisional AI-COGS hard stop; always `false` by design. |
| `goNoGo.js` | `previewAdvisoryChecks` F1 rewrite ~214–221 | text / status | Preview still matches oracle/golden; many rewrites only change copy. |
| `goNoGo.js` | `summarizeChecksForPrompt` ~335–347 | `overallLabel` args | Prompt text is not a verdict input. |
| `scoreSlots.js` | `itemMatchesSlot` F1 / F3 regex | any | `creditSlots` / `countDoneSlots` never call `itemMatchesSlot` for F1 (positional) or F3 (own finder). |
| `scoreSlots.js` | `itemMatchesSlot` `qcom` / `qcomTrajectory` | any | F2 expected slots are `margin`, `packSize`, `gst` only. |
| `scoreSlots.js` | `keys.length === 4` total override ~270 | skip / always | Sum of per-filter slot counts already equals `SCORE_CHECK_SLOTS_TOTAL - exemptSlots` under the locked slot table. |
| `scoreSlots.js` | F2/F4 fallback-to-first-unused ~164–170, ~227–232 | take next item | When texts already match, the fallback is not observed; when they do not, the decoy test kills some but not every operator mutant. |
| `propositionScoring.js` | `computeF2` / `computeF5` internals ~56–156 | division pending, floor `??`, forumVerdict `every` | Orchestration around locked filter checkers; many branches do not change F1–F4 credit or the displayed percent. |
| `propositionScoring.js` | `item()` extra fields ~44–53 | formAdmin / code / slot | Local helper; live items come from `applyFilter2Rules` / `checkFilter`. |
| `propositionScoring.js` | `logScoringFresh` | log line | Console copy only. |

JSON: `D:/Primus-safety/stryker-tmp/mutation-verdict-behavioural.json` and `D:/Primus-safety/stryker-tmp-all/mutation-verdict-all.json`.
