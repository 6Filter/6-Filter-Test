# When each research step is expected

A Submit calls a step only when `expectedResearchSteps` in `lib/researchProgress.js` includes it. The planner uses that same function, so the estimate is the set of calls a Submit would make. A value the person already typed is not missing and is not included in the price. A retry does not call a step whose value was typed or confirmed, and it does not overwrite that value.

| Step | Expected when |
| --- | --- |
| F1 research | Always expected until Filter 1 findings exist. Typed attribute / benchmark / gap are inputs to verify online — they do not skip the F1 web search. |
| No-competitor check | The declared gap is 0 or blank, and Filter 1 has no verified benchmark. A gap of 2.0 or more does not run this check. |
| F2 cost estimate | COGS and net margin are not both already typed. Typing both means the cost estimate is not expected and is not priced. |
| F3 margin elasticity | The min/max MRP band is empty, inverted, or not a real rupee range. |
| F4 tech-shift | The seven structural-obsolescence dimensions are not stored. |
| F5 sizing | One or more of the five sizing factors (households, trial, repeat, frequency, pack value) is blank. Filter 5 is still not scored. |
| Evidence read | An Evidence Source link or file is present. Exactly one plain call (no web search), budget ≤ 20,000 input tokens, cached by file sha256 + idea context. Quote-verified facts may clear F1 benchmark / category size / attribute. |

`researchRunAt` is written only when every step in `stepsExpected` is in `stepsDone` or `stepsFailed`. A timestamp by itself does not mean the pass finished. A missing failure flag does not mean a step succeeded.

## Bundle cache and identical scores (permanent rule)

The research fingerprint (`researchHashFor`) covers the idea text, category, attributes, benchmark, division, attachment, evidence file sha256, and evidence link (query stripped) — not the Log name or team. Once that hash has a **finished** filter outcome in `research_cache`, every later Submit with the same fingerprint is a cache HIT and keeps the **same scores**.

Documented filter failures are stored on purpose (for example F3 “no usable range”). Twin ideas cannot re-roll the model. The **first writer wins**: a second concurrent pass cannot overwrite findings for that hash. Empty or truncated parts are still refused.

After a HIT the server persists suggestion numbers onto the form and does **not** call LLM auto-fill again for F3/F4. `forceResearch`, per-step retry, and Master cache invalidation are the only ways to replace a stored bundle. Failed step results are never written to the per-step cache, so an explicit retry can still re-run one step.
