# 6 Filter Test — Scoring specification

Generated from `lib/lockedConstants.js` (ruleset **v5.7**, Part 141). Filters 5–6 stay validation-only and are not scored.

## Ruleset

| Constant | Value |
|---|---|
| `SCORING_RULESET_VERSION` | `v5.7` |
| `SCORE_DENOMINATOR_MODE` | `fixed-slots` |
| `SCORING_MODEL` | `relevance` |
| `RELEVANCE_SHADOW_MODE` | `false` |
| `INCOMPLETE_VERDICT_MODE` | `incomplete` |
| `F3_HORIZON_YEARS` | `5` |
| `F3_LOSS_STATISTIC` | `median` |
| `FIXED_PRICE_POINTS` | `1, 2, 5, 10, 20, 50, 100` |
| `VOLUME_LOSS_CEILING_PCT` | `10` |
| `GST_STANDARD_RATES` | Finance-owned list (currently `0, 3, 5, 12, 18, 28, 40`) |

### Part 145 — the short input form and the sourced commodity exemption (no band, check or minimum changed)

No band, check, cap, hard stop or division minimum moves. The ruleset stays **v5.7**; only what the form asks for and how the pure-commodity exemption is decided change.

- **Twelve typed Required boxes** gate Submit: name, category, idea description; Filter 1 attribute, benchmark (waived for a new market), declared gap, gap derivation, parity, growth route, growth argument; Filter 2 pack size and GST rate. Name and team come from the login; COGS, net margin and MRP are filled by the system (`Adjust cost and margin` overrides them) and never block Submit.
- **Parity is one tick**, "Parity or better on the remaining attributes". Ticked stores `f1.parityExceptions = "none"`; unticked opens the box. Nothing typed is hidden.
- **Pure commodity is a research finding, never a tick.** The Filter 1 research step returns `{ pureCommodity, reason, source_url, quote, confidence }`. The exemption applies only when research says yes, with a quote, a source the search actually returned, and **medium or high** confidence (`decideExemption`). A typed `f1.pureCommodity` tick is ignored.
- **An exempt idea is scored over the checks that remain.** Filter 1's seven checks leave the numerator and the denominator together: **11 checks at screening** (F2 = 3, F3 = 1, F4 = 7) and **14 in the final** when the proof stage adds its three checks (Part 144). A non-exempt idea stays at **18** and **21**. No free marks.
- **Ideas stored under the old tick keep their stored score**, labelled "Scored under an older release", until evaluated again.

### What changed in v5.7 (Part 141 — one number)

- **One displayed percentage decides the verdict.** `RELEVANCE_SHADOW_MODE` is off. `legacyPct` is still computed for comparison reports but is never read by the band, Log, exports or improvement panel.
- **Ideas already evaluated** keep their stored score and verdict, labelled "Scored under an older release", until the person evaluates again.
- **Improvement panel follows the verdict.** It says GO only when the verdict is GO. A capped WATCH names what holds GO back.
- **Junk / unconfirmed inputs earn zero** whatever the AI returned (`guard: "input-invalid"`). Invalid text is not sent to the AI for grading.
- **Every web finding** (reason + source) is sealed on the output item and shown beside its check; improvement suggestions for web-checked slots carry the same finding.
- **A changed draft/Submit value is the person's own** (`netMarginSource: "user"`, GST estimate marker cleared). Unchanged values keep their markers.

### What changed in v5.6 (Part 138 — 18 checks)

The fixed denominator is now **18 slots: F1 = 7, F2 = 3, F3 = 1, F4 = 7**.

- **Filter 1 — seven checks.** Gap derivation and parity exceptions are two separate items, each graded from its own entered text (`derivation` and `parity` slots).
- **Filter 1 gap below 2.0 is a mark-down, not a hard stop.** The gap item earns no credit, the label reads "Marked down" (never "Below floor"), and GO is capped at WATCH. F1 is removed from the floor failures; the only remaining hard stop for floors is **F4 overall High**.
- **Attributes need no evidence file.** Credit comes from the person-confirmed attribute text plus the web plan check. An Evidence Source upload or link is no longer required for the attributes slot.
- **New market waives an empty benchmark.** When the growth route is "new market" and no benchmark is entered, the benchmark slot reads "not applicable" and is cleared (there is no incumbent to name).
- **Filter 2 — three checks:** net margin vs the locked division minimum, pack size, and GST rate. Margin below the minimum stays a mark-down. COGS, MRP and Quick-commerce notes are still never scored. **D1 (23 Nov 2026, option A):** that mark-down stays capped at WATCH; a business head or manager (Admin / BH FORUM) may approve it forward. CKR is not in this path.
  - **Pack size** needs a number *and* a unit (g, kg, ml or L). Blank is pending; a value without a unit is marked down. It is person-entered.
  - **GST** is **person-entered**. A blank GST is pending (the MRP cannot be priced). The AI no longer fills GST, and the 18% "default" is a research-display placeholder that is never saved (`gstRateForSave`, `clearPlaceholderGst`). A web assessment that contradicts the entered rate marks the check down.
- **Narrative guard defaults to `enforce`.** A paragraph that names a number, date, brand or regulation not found in the inputs or returned sources is rejected and the deterministic fallback text is used. `NARRATIVE_GUARD=shadow` or `off` remain available.
- **Division minimum net margins are unchanged** (see the table below).

### What changed in v5.5 (every value entered is assessed)

Assessment results carry `status: "ok" | "failed"`. Failed or unreadable AI answers are never turned into a "none" verdict and are never cached. Limited research runs merge by step slot (`mergeFindingsByStep` / `STEP_SLOTS`) so paid results are not discarded. The evaluation page shows **What was assessed** for every filled field. One **Evaluate** action runs missing and failed AI steps; "Recompute without AI" is ADMIN-only.

### What changed in v5.4 (output only when evaluated)

An idea has an **output** only when every required AI step has finished (`evaluationStatus`). The sealed snapshot (`goNoGo.output`) holds the verdict, score, rationale and each filter's label, narrative and items. Opening an idea never recomputes live `advisoryChecks` for display. Incomplete / not-evaluated ideas show no verdict, percent or cards. Legacy ideas (screened before sealed outputs) keep their stored score labelled "Scored under an older release" with no cards. A failed AI step blocks sealing and offers Retry; a documented "found nothing" is a finished result.

### What changed in v5.3 (Filter 3 cliff rule)

Filter 3 has **one** scored check: price resilience on the 10% volume-loss cliff rule. The price tested is the Filter 2 MRP (`resolveF2Price`). Smooth inflation-covering rises that never meet a fixed price point pass with full credit and no volume evidence. A crossing is judged from verified comparable events (source among returned search URLs; quote contains the figure; `crossed_point` recomputed). Exactly 10% passes; above fails; no evidence cannot-assess. Fail / cannot-assess / weak pass are mark-downs that cap GO at WATCH — never "Below floor", never NO-GO. The old min/max MRP band no longer scores.

### What changed in v5.2 (Filter 2 revised)

Filter 2 had **one** scored check at v5.2 (superseded by v5.6, which has three): net margin vs the locked division minimum. Below the minimum is a **mark-down** (label "Marked down", never "Below floor", never NO-GO); GO is capped at WATCH. MRP is computed from COGS ÷ (1 − margin) × (1 + GST) and may be overridden; an override is checked through the margin that MRP implies. COGS, MRP and Quick-commerce notes are never scored. The 10% volume-loss / three-year price plan logic is not part of Filter 2 (Filter 3 owns price resilience).

### What changed in v5.0 (relevance)

Filter 1 had **six** checks at v5.0 (seven since v5.6). Credit is **none / weak / adequate / strong** from stored AI assessments — never from a field being non-empty.

## GO / NO-GO / WATCH / INCOMPLETE

| Verdict | Rule |
|---|---|
| **INCOMPLETE** | No floor failure, and any of F1–F4 is unfinished |
| **NO-GO** | Floor failure (**F4 overall High only** — not the F1 gap, Filter 2 margin or Filter 3 cliff), or (when complete) score &lt; 60% |
| **WATCH** | Complete idea with 60% ≤ score ≤ 80%, or a mark-down (including an F1 gap below 2.0) / weak evidence that would otherwise read GO |
| **GO** | Complete idea with score &gt; 80% and no mark-down / weak-evidence cap |

## Fixed check slots (18)

| Filter | Slots | Canonical checks |
|---|---:|---|
| F1 | 7 | Benchmark (not applicable for a new market) · Declared gap ≥ 2.0 (mark-down if below) · Attributes (no evidence file) · Gap derivation · Parity exceptions · Growth route · Growth argument |
| F2 | 3 | Net margin vs locked division minimum (mark-down if below) · Pack size (number + unit) · GST rate (person-entered) |
| F3 | 1 | Price resilience — 10% volume-loss cliff at fixed price points (mark-down if fail / cannot-assess) |
| F4 | 7 | Seven structural-obsolescence risk dimensions |

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

## One sealed score

The only number shown in the Log, output page, PDF and Excel is `goNoGo.score` from the last explicit screen. Opening an idea never rewrites it. Snapshots without a version are labelled `legacy` / older release until re-screened.
