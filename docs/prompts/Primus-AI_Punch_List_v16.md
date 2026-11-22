# 6 Filter Test — Punch list from the latest zip (`6-Filter-Test-ck6filter-main_1c803d`)

Verified by running tests on a real PostgreSQL and the real app in a real browser. Do not redo the items in section 1.

## 1. Verified done

- A brand-new empty database now starts (`testFreshDatabaseStarts.mjs`, 5 of 5); the delete-after-a-move hotfix and `sequencesOk` on health (18 of 18).
- Filter 4 unfinished: "Research that did not finish", Filter 4 is no longer listed as a value to enter, and Screen again re-runs the screening.
- The Submit bar says exactly what blocks ("3 answers to fix before you can submit: Benchmark, Gap derivation, Growth argument."), the Why panel lists the same three, and pressing a blocked Submit sends nothing and puts the cursor in the first blocking box.
- After the answers are corrected the same press submits and returns a new verdict.
- `/api/health` reports `dbProvider` (azure, render, neon, supabase, aws, local, other, none) and is not fooled by look-alike hosts; no host, user or password is shown.
- Scoring unchanged: every scoring file is byte-identical to the previous zip; v5.7, fingerprint `ba0156d2`, 18 slots, fixed denominator, bands, hard stop, GO cap and mark-downs behave as described (checked by running them).

## 2. Fix these (found in this zip)

1. **The old sentence is still on the output page.** The main improvement list now says "Name the closest competitor you know in the same category and pack size", but a second paragraph on the same page still says `Replace "No benchmark available currently" with a closer competitor in the same category and segment as this idea`. Find that second render path (`lib/itemCopy.js` and `lib/improvementPoints.js` are locked, so fix it at the display layer).
2. **Three placeholders are still accepted as a benchmark:** "Currently not available", "Currently unavailable", "Benchmark not available". Add them (and "Not yet identified", "Nothing available" are already refused). Real answers must stay accepted ("No palm oil, made with rice bran oil").
3. **Advice points at a box that is not on the form.** `lib/itemCopy.js` line 288 says "Clarify who this is for in Target consumer", and the growth-route advice says "matches the target consumer", but the Target consumer box is hidden (the form shows no `f1.targetConsumer`). A user who is told to change it cannot (reported: "TG also mentions a change, I tried keeping it empty"). Either show the box as Optional, or reword the advice at the display layer.
4. **No Required labels.** The form shows 0 "Required" labels and 5 "Optional". The owner asked for both on every box.
5. **COGS, Net margin and MRP are on the form** in bright teal "AI fills this" panels (off the cream and brown theme). Part 145 asked for them behind one "Adjust cost and margin" button, with the two Required boxes (pack size, GST) shown.
6. **The opening form is 1088px tall** (about 1.5 screens on a laptop); tighten if easy.

## 3. Not built yet (files for these were sent earlier; upload them to Cursor)

- **Part 142** (junk earns nothing even when the AI is fooled, a truthful improvement panel): `Primus-AI_Part142_ClosingTheGaps_Cursor_Prompt.md`, `testQualityNotQuantity.mjs`, `testImprovementPathValid.mjs`.
- **Part 144** (proof file, final verdict over Filters 1 to 5, ruleset v6.0): `Primus-AI_Part144_ProofAnalysis_FinalVerdict_Cursor_Prompt.md`, `proofAnalysis.reference.mjs`, `proofEndpoint.scratch.mjs`, `testProofAnalysis.mjs`, `testFinalScoring.mjs`, `testProofFlowApi.mjs`.
- **Part 145, the scoring half** (a sourced pure-commodity finding takes Filter 1's 7 slots out of both the points and the denominator: out of 11): `commodityExemption.reference.mjs`, `testPureCommodityExemption.mjs`. `lib/commodityExemption.js` decides the exemption; wiring it into scoring and the Filter 1 research step is still to do. Confirmed by the owner's instruction: yes, score an exempt idea over the 11 remaining checks.

## 4. Hygiene

- The note that scratch scripts were copied into a **public mirror**: check them for any database address, email, idea text or key, remove them, and rotate any secret that appears.
- List the four existing tests that were edited, with the change to each.
- Database: `DATABASE_URL` is still Render. Migrate with `pg_dump` and `pg_restore` (not `scripts/importExport.mjs`, which trims timestamps and leaves counters behind), restore into an empty database before the app ever connects, and verify with `verifyDatabaseCopy.mjs`.
