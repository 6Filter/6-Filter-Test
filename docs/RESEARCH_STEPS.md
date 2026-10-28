# When each research step is expected

A Submit calls a step only when `expectedResearchSteps` in `lib/researchProgress.js` includes it. The planner uses that same function, so the estimate is the set of calls a Submit would make. A value the person already typed is not missing and is not included in the price. A retry does not call a step whose value was typed or confirmed, and it does not overwrite that value.

| Step | Expected when |
| --- | --- |
| F1 research | Filter 1 has no typed input (attribute, benchmark, gap, growth route, or the other Filter 1 fields). |
| No-competitor check | The declared gap is 0 or blank, and Filter 1 has no verified benchmark. A gap of 2.0 or more does not run this check. |
| F2 cost estimate | COGS and net margin are not both already typed. Typing both means the cost estimate is not expected and is not priced. |
| F3 margin elasticity | The min/max MRP band is empty, inverted, or not a real rupee range. |
| F4 tech-shift | The seven structural-obsolescence dimensions are not stored. |
| F5 sizing | One or more of the five sizing factors (households, trial, repeat, frequency, pack value) is blank. Filter 5 is still not scored. |

`researchRunAt` is written only when every step in `stepsExpected` is in `stepsDone` or `stepsFailed`. A timestamp by itself does not mean the pass finished. A missing failure flag does not mean a step succeeded.

## Bundle cache and identical scores

The research bundle cache stores a finished pass when **at least one** filter finding succeeded, even if another filter failed (for example F3 “no usable range”). A later Submit with the same research inputs is a cache HIT and keeps the same scores. An all-failed bundle is still refused so the next Submit can retry. `forceResearch` and per-step retry still re-run a failed step. Failed step results are never written to the per-step cache.
