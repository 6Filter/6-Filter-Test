# Filter key ownership

A client save may change human-owned keys. Server-owned keys stay the stored research or formula output. An omitted key is kept. A key sent as `""`, `null`, or `undefined` clears a human-owned value. A stale save (its `baseVersion` is older than the stored version) cannot clear a value it does not hold.

Forum verdict and verdict note sit on every filter object. They are human-owned.

## Server-owned

| Key | Filter | Reason |
|---|---|---|
| `marginElasticity` | F3 | Research writes the safe MRP range, basis, and sources. |
| `techShiftRisk` | F4 | Research writes the seven dimension ratings and the overall risk. |
| `computedRevenue` | F5 | The year-3 revenue figure is computed from the five human factors. |

## Human-owned

| Key | Filter | Reason |
|---|---|---|
| `declaredAttribute` | F1 | Typed by a person. |
| `declaredAttribute2` | F1 | Typed by a person. |
| `declaredAttribute3` | F1 | Typed by a person. |
| `evidenceSourceDate` | F1 | Typed by a person. |
| `benchmark` | F1 | Typed by a person. Research may suggest it. A person confirms it. |
| `targetConsumer` | F1 | Typed by a person. Who the idea is for, and whether they are new to the brand's current buyers. |
| `declaredGap` | F1 | Typed by a person. |
| `gapDerivation` | F1 | Typed by a person. |
| `parityExceptions` | F1 | Typed by a person. |
| `growthRoute` | F1 | Chosen by a person. |
| `growthArgument` | F1 | Typed by a person. |
| `pureCommodity` | F1 | Chosen by a person. |
| `cogsAtScale` | F2 | AI may prefill it (with low/mid/high range). A person may override or confirm it. |
| `netMarginAtScale` | F2 | Typed by a person. Never AI-filled. |
| `gstRatePct` | F2 | Finance table, cited AI estimate, or placeholder. A person may override it. |
| `grammage` | F2 | AI may prefill it. A person may override it. |
| `mrpInr` | F2 | Computed from COGS, net margin and GST. A person may override (`mrpOverride`). |
| `mrpOverride` | F2 | Chosen by a person — use typed MRP instead of the computed one. |
| `qcomTrajectory` | F2 | Optional free-text notes. Not scored. |
| `financeSigned` | F2 | Chosen by a person. |
| `f3RangeOverride` | F3 | The min and max MRP a person typed. Research stays on `marginElasticity`. |
| `f4MitigationResponses` | F4 | The written response per dimension. Ratings stay on `techShiftRisk`. |
| `householdsReachedY3Mn` | F5 | Typed by a person. |
| `trialRatePct` | F5 | Typed by a person. |
| `repeatConversionPct` | F5 | Typed by a person. |
| `purchaseFrequencyYr` | F5 | Typed by a person. |
| `avgPackValueInr` | F5 | Typed by a person. |
| `cmiHeadSigned` | F5 | Chosen by a person. |
| `labGapVsBenchmark` | F6 | Typed by a person. |
| `consumerPanelBeaters` | F6 | Typed by a person. |
| `availabilityCount` | F6 | Typed by a person. |
| `packStandoutGap` | F6 | Typed by a person. |
| `bmAttendedAll30` | F6 | Chosen by a person. |
| `packQualityParity` | F6 | Chosen by a person. |
| `forumVerdict` | F1–F6 | Recorded by a person. |
| `verdictNote` | F1–F6 | Recorded by a person. |

`f4MitigationResponses` holds text that used to be stored only as `userResponse` inside `techShiftRisk`. A read still shows that older text. A save copies it onto this key and does not delete the copy inside the research object.
