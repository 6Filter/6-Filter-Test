# 6 Filter Test — Cursor Build Prompt, Part 144: The Proof File and the Final Verdict (Filters 1 to 5)

## The owner's decisions

1. **GO means a final score above 80, after analysing all the values entered up to Filter 5.** WATCH is 60 to 80. NO-GO is below 60.
2. **Filters 1 to 4 give the first verdict from the entered values, as today.** The three Filter 5 checks (Year-3 revenue meets the target; the household model is supported by research; any out-of-range factor is argued in writing) come into the picture only after that verdict.
3. **Filter 5 comes into the picture only when someone uploads a file to back up the data.** The AI must work out whether the data in the file is correct and relevant, and only then check Filters 1 to 5 for scoring.
4. **Filter 6 is analysed later, outside the percent**, to back the verdict with data and close the loop.
5. **A WATCH idea can go to a manager for approval** (this exists; this part only uses it).

## What exists and what is wrong (verified on the Part 143 build)

- `ProofUploadPanel` (`src/PropositionForm.jsx` about line 2586) stores the file as `marketResearchProof` and nothing reads it. `hasMarketResearchProof` (`lib/filterUnlock.js` line 75) only checks that a file exists, so **any file, even an unrelated PDF or a picture, unlocks Filters 5 and 6.**
- `computeF5` (`lib/propositionScoring.js` about line 103) marks sizing "done" when the five numbers exist and research did not object. **It never compares the Year-3 revenue with the division target.** The CMI signature is an admin tick.
- Filter 5 is outside the percent (`SCORE_CHECK_SLOTS` is `{ f1: 7, f2: 3, f3: 1, f4: 7 }`, 18 in all).
- The Excel template (`IMPORT_PATHS` in `lib/ideaImport.js`) carries the five Filter 5 numbers as typed values.

## Decisions (build the DEFAULT)

- **D96 Two verdicts.** *Screening* (Filters 1 to 4, 18 checks, unchanged) and *Final* (Filters 1 to 5, 21 checks, after a proof file has been judged). Same bands: GO above 80 (17 or more of 21, that is 81%), WATCH 60 to 80 (13 to 16), NO-GO below 60 (12 or fewer). Bump `SCORING_RULESET_VERSION` to v6.0. Ideas already evaluated keep their stored verdict, labelled "Scored under an older release".
- **D97 Filter 5 comes only from the file.** Remove the Filter 5 input boxes from the form and the `f5.*` columns from the upload template. The Filter 5 section shows the five values the file supports, read-only, each with its quote and where it was. A value can be changed only by uploading a better file. A text box to argue an out-of-range factor appears only when one is out of range. Typed Filter 5 values already stored are kept but never scored.
- **D98 Who may upload proof.** A GO; a WATCH only after a manager has approved it; never a NO-GO or an unfinished (INCOMPLETE) idea. The server enforces it (HTTP 409 with the reason), not only the button.
- **D99 The AI reads; code decides.** The AI reads the file (label `PRIMUS_PROOF_READ`, no web search) and returns facts: `{ topic, value, statement, quote, location, period, geography, category, source: { publisher, year, method, sampleSize } }`. Deterministic code then decides whether each fact counts, as in `proofAnalysis.reference.mjs`: the quote must be in the file; a figure must be in its quote; a quote that gives the AI instructions is rejected; the geography must be India; the period no older than 3 years; the category must match; credibility sets the level (strong, adequate, weak). Rejected facts are kept and shown with their reasons, and earn nothing.
- **D100 Usable or not.** A file is usable (every Filter 5 factor has an accepted fact), partly usable, or not usable (nothing accepted). A file that is not usable produces no final verdict; the person sees why and can upload another. The screening verdict stands.
- **D101 The three Filter 5 checks and the caps.** Revenue meets the division target (credit by the weakest of the five factors' evidence, 0 if short); the household model is supported (the file plus the existing research step; research that contradicts it gives 0); out-of-range factors are argued in writing (1 if all are in the category range, two thirds if argued, 0 if not argued). Missing evidence is a fail (v4): a GO also needs all three checks done, none on weak evidence, no unresolved conflict between sources, and numbers that add up. Otherwise GO is capped at WATCH. The Filter 4 hard stop stays NO-GO whatever the file says.
- **D102 Reproducible.** The file's SHA-256 and the sorted facts go into the score key, so the same file and inputs always give the same final output. The AI reads a file once per content hash (a renamed copy does not read again).
- **D103 Labels.** "Screening GO: proof file needed for final clearance" until a final verdict exists. "Final GO: paper clearance (Stage 1)" after it. The Log and the output show both verdicts and the final one's sources with their quotes.
- **D104 File types.** PDF, Word, Excel and CSV only; reuse the evidence reader. Images are not read: say so plainly and do not call the AI. Remove the picture types from the file picker.

## Files to add and change

- Add `lib/proofAnalysis.js`, starting from `proofAnalysis.reference.mjs`: `gradeFact`, `gradeFacts`, `proofUsability`, `extractFactors`, `arithmeticConsistent`, `scoreF5`, `finalScore`, `finalVerdict`, `canUploadProof`, `sealFinal`. It uses the build's own `scoreAdvisoryChecks`, `computeF5Revenue` and `classifyGoNoGoFromScore`.
- Add `lib/proofApi.js` and register `POST` and `GET /api/propositions/:id/proof` in `lib/apiRouter.js` **before** the `:id` route. Follow `proofEndpoint.scratch.mjs` for the shape (it keeps state in memory; yours stores it in Postgres).
- Database: additive columns for the proof analysis, the final output and its sealed time; keep the screening output (do not overwrite it); a read cache keyed by file hash and ruleset.
- `lib/filterUnlock.js`: unlock Filter 5 and 6 only after a usable proof file has been analysed.
- `lib/lockedConstants.js` and `lib/scoreSlots.js`: add the three Filter 5 slots for the final score only; the screening total stays 18.
- `src/PropositionForm.jsx`: the proof panel's wording ("backs Filters 1 to 5"), the file types, the read-only Filter 5 section, the labels in D103.
- `docs/SCORING_SPEC.md` and the golden file: the two verdicts, the 21 checks, the caps.

## Not in this part

Using facts from the file to strengthen or contradict the checks in Filters 1 to 4 (Part 145). The manager screen that shows every source (Part 145). The Filter 6 upload and the outcomes record (Part 146). Any change to the screening bands, caps or checks.

## Tests (attached; do NOT edit them)

- `testProofAnalysis.mjs` (18 checks): the proof file is judged before it counts. Passes against the reference.
- `testFinalScoring.mjs` (19): the 21 checks, the bands, the caps, who may upload, the reproducible sealed output. Passes against the reference; breaking the reference in four ways was caught each time.
- `testProofFlowApi.mjs` (14): the end-to-end flow on a real Postgres schema (NO-GO and unapproved WATCH refused; an irrelevant file earns nothing; a good file gives a v6.0 final verdict over 21 checks with sourced quotes; a revenue short of the target is never GO; the same file twice gives the same answer and one AI read; an invented quote is rejected; typed Filter 5 numbers are never used; images are not read). Passes against the scratch endpoint; it must also pass against the real one with the analysis stored in Postgres.
- Also required, written by you: reading a real PDF, Word and Excel file end to end; the Filter 5 form section is read-only; the old stored typed Filter 5 values are kept and unused; an idea evaluated before this release keeps its stored verdict, labelled.

## Acceptance checklist

- [ ] A file that is unrelated, out of date, from another country or about another category earns nothing and produces no final verdict.
- [ ] Filter 5 values come only from quote-verified facts in the file; none can be typed.
- [ ] The final verdict is over 21 checks with the same bands; a revenue below the target, missing evidence, weak evidence or an unresolved conflict can never be GO.
- [ ] NO-GO ideas and unapproved WATCH ideas cannot upload proof, enforced by the server.
- [ ] The same file gives the same final output; the AI reads it once per content hash.
- [ ] Both verdicts show on the Log and the output, with the final one's sources and quotes.
- [ ] No screening band, check or cap changed; the attached tests pass untouched.
