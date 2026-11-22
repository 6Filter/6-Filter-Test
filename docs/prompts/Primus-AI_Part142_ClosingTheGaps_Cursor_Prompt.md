# 6 Filter Test — Cursor Build Prompt, Part 142: Closing the Gaps Found After Part 141

Part 141 is on `main` at `2932917` (ruleset v5.7). Validating it, and updating the owner fixtures to the current rules, found the defects below. Every one is pinned by an attached test that fails today; nothing here changes a rule, a band or a check count.

## What is still wrong (all verified on `2932917`)

1. **Junk still earns credit when the AI is fooled.** "x", "asdfgh qwerty", "test", "n/a" and "12345" in the Filter 1 boxes, with an AI that says "strong", still earn credit (`testQualityNotQuantity` Q1, and one more of its checks fails). The `guard: "input-invalid"` that shipped is not applied to these inputs at scoring time.
2. **The improvement panel says "GO, above 80%" over a 67% score** for an idea edited after its evaluation. The server sends the status `edited-since-evaluation`; `buildPathToGo` only knows `older-ruleset` and `edited-since-screening`, so it falls through to the GO branch.
3. **The panel's wording.** One open check reads "61% → 100% if these 1 check clear". A check the AI found weak or unsupported shows as a bare label ("Gap derivation weak") instead of an instruction, and 14 such rows carry no web finding. Four unassessed checks share the identical bold line "Evaluate to assess this", differing only in the grey line under it.
4. **The evidence file.**
   - An identical twin idea reads the file again (the result is not cached by content).
   - A broken PDF is silently ignored: status `none`, no reason.
   - A valid one-column CSV with no comma is rejected as "unsupported file type".
   - The evidence is recorded as supporting `f1.growth`, a check that no longer exists, and it does not yield Filter 5 or 6 values (`testSpecRequirements` P6).
5. **The input coverage list has gaps.** Category, "Attribute 2", the evidence link and the MRP are not listed at all, and the Quick-commerce notes show as `pending` for a check that will never run, though they are never scored.
6. **The cost step suggests a pack size** (`f2SuggestionsFromCostEstimate` returns `grammage: "100 g"`), though the pack size is entered by the person. `testSpecRequirements` P17 passes only because its AI stand-in never supplies one.
7. **A GST rate changed by a save that lacks the form's markers is dropped** (stored 18 stays 18). The form itself is fine.
8. **Small items.** Imports record no cell provenance. The "Use my own MRP" tick has an identifier but no badge.

No change to any band, any division minimum, the 18 checks, or the labels' wording except where named. Additive migrations only. Real-Postgres tests where a database is needed. Nothing under `data/` or any `.env*` is committed. Do not change workflow files. The fresh-clone `npm run test:regression` must stay green. One local round on a production build, then ONE push.

## Decisions (build the DEFAULT)

- **D78** The scoring guard runs when the score is computed, not only when the AI is called: a Filter 1 box the input review judges invalid or junk earns zero on its check whatever a stored assessment says, and the item records `guard: "input-invalid"` with a plain reason.
- **D79** The improvement panel is built from the verdict and from the status, never from the percentage alone. Any status it does not recognise is treated as "recompute", never as GO. Every row is an instruction that starts with a verb, names its check in the bold line, and carries the web finding when the AI found one.
- **D80** Evidence reading is cached by the file's content and the claims being checked, across ideas, so twin ideas never re-read. A file that cannot be read is always reported with a reason. A valid one-column CSV is read. The evidence is recorded only against checks and Filter 5 or 6 values that exist.
- **D81** The coverage list accounts for every box a person can fill. A box that is never scored shows `not-scored` with its reason, and nothing waits for a check that does not exist.
- **D82** The cost step never proposes a GST rate or a pack size.
- **D83** In every save, a value that differs from the stored one is the person's own input, including the GST rate; a value that has not changed is never marked as typed. Imported values record the cell or line they came from.

---

## PROMPT STARTS HERE

## A. The scoring guard (D78)

- In the Filter 1 scorer, before an assessment is credited, ask the input review (`reviewInputs`) whether the field is valid. If it is invalid or junk, credit 0 and set `guard: "input-invalid"` on the item with a plain-words reason ("This text looks like a placeholder, so it earns nothing"). Do this at scoring time for stored assessments too, so a result stored earlier or an AI that is fooled cannot lift it.
- Gibberish made of real-looking words ("asdfgh qwerty", "lorem ipsum", "aaaa bbbb") must be caught as well as short strings; extend the deterministic review where it misses them, and add the cases to its tests.

## B. The improvement panel (D79)

- In `lib/improvementPoints.js` treat `edited-since-evaluation` like `edited-since-screening` (the panel asks to evaluate again instead of mixing two numbers), and make any unknown status fall to "recompute". The GO branch needs the verdict to be GO.
- Fix the plural: "if this 1 check clears" and "if these N checks clear".
- Rewrite the copy for assessed-but-weak checks as instructions that carry the finding, for example "Support your gap derivation: the web check found that caffeine at 2% is not shown to reduce hair fall". Name the check in the bold line of unassessed rows ("Evaluate the benchmark", "Evaluate the growth route").

## C. The evidence file (D80)

- Key the evidence-read cache by the file's content hash and the claims checked, not by the idea. Twin ideas reuse the stored result.
- A file that cannot be read (a broken PDF, an unsupported type) is stored as `unreadable` with a reason and shown on the page; Submit still completes. Accept a one-column CSV with no comma.
- `used[]` may list only live checks (`f1.attributes`, `f1.benchmark`, `f1.derivation`, `f1.parity`, `f1.route`, `f1.argument`) and Filter 5 and 6 values (`f5.*`, `f6.*`). Extract quote-verified Filter 5 and 6 values from the file and offer them as suggestions, as in `testSpecRequirements` P6 (report back if the sample fact still fails verification, and why).

## D. Coverage and the cost step (D81, D82)

- List every box in `inputCoverage`: Category (`not-scored`, used to find the division), "Attribute 2" and "Attribute 3" (`not-scored`), the evidence link (`assessed` once read, `pending` before, `unreadable` if it failed), the MRP (`not-scored`, computed). Set the Quick-commerce notes to `not-scored`.
- Remove `grammage` and `gstRatePct` from what the cost step suggests and from what it stores as a suggestion.

## E. Saves and provenance (D83)

- In the draft and Submit paths, mark a changed `gstRatePct` as the person's own, exactly as the margin is, whatever markers the client sent. Record `fieldSources[path] = { source: "upload", cell }` for imported values and show the cell in the review.
- Give the "Use my own MRP" tick its role badge.

## F. Lock, migration and the owner's tests

- Bump `SCORING_RULESET_VERSION`; add the guard and the panel code to the fingerprint list; update `docs/SCORING_SPEC.md` and the golden file (a junk input with a fooled AI scoring 0; an edited-since-evaluation idea never shown as GO). Do not rewrite stored scores.
- The owner fixtures were updated to the current rules in the same session; apply them from the attached set. Do NOT edit any attached test.

## G. Tests (attached; do NOT edit them)

- `testQualityNotQuantity.mjs` (14 checks; 2 fail today): junk earns nothing with a fooled AI.
- `testImprovementPathValid.mjs` (9; PF fails): every suggestion carries the web finding.
- `testPathToGo.mjs` (17; A3 and D3 fail) and `owner-tests/testPathToGo.mjs` (passes): the status and the plural.
- `testPathToGoActionCopy.mjs` (the new instruction check fails): weak rows are verb-first instructions.
- `testEvidenceReading.mjs` (26; E3b, E3c, E8 and E13 fail) and `testSpecRequirements.mjs` (54; P6 fails twice).
- `owner-tests/testInputCoverage.mjs` (18; the last check fails) and `owner-tests/testFilter2CogsGstPlan.mjs` (the last block fails).
- `testTypedValuesNeverRevert.mjs` (7; S1 fails), `testIdeaImportPolish.mjs` (6; P6 fails), `testIdeaImportApi.mjs` (20; A5b fails) and `testFieldLabelsOnPage.mjs` (17; L3 fails).
- Also required, written by you: a test that a stored strong assessment on junk input scores 0 after a re-score; a UI test that a broken file shows its reason on the page; and a test that the twin of an idea makes no second evidence call.

## H. Not in scope

Any band, any division minimum, the 18 checks, the labels' wording, and Filters 5 and 6 scoring.

## Acceptance checklist

- [ ] Junk or gibberish in a Filter 1 box earns zero whatever the AI returns, now and after a re-score.
- [ ] The improvement panel never says GO over a score that is not GO, in any status, and asks to evaluate again after an edit.
- [ ] Every panel row is a verb-first instruction that names its check and carries the web finding; the plural is right.
- [ ] Evidence is read once per file content; an unreadable file always says why; a one-column CSV is read; evidence informs only checks and Filter 5 and 6 values that exist.
- [ ] The coverage list accounts for every box; nothing waits for a check that never runs.
- [ ] The cost step never suggests a pack size or a GST rate.
- [ ] A changed GST rate is the person's own on every surface; imports record their cell.
- [ ] No band, minimum or check count changed; the attached tests pass untouched.

## PROMPT ENDS HERE
