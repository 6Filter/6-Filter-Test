# 6 Filter Test — Cursor Build Prompt, Part 145: The Short Input Form

The owner pasted the whole current form and asked which fields can go. This part cuts the form to the boxes a person must really type, moves everything else to the system or to the proof stage, and fixes one scoring loophole the cut exposed. It follows Parts 143 (labels, tokens, collapsible filters) and 144 (proof file, final verdict).

## What the owner sees today (pasted from the live form)

Your name · Your team (16 teams) · "Start with the idea: Three fields. Research fills the rest" · Upload your idea (Excel, Word or PDF) with a template link and a caption · Proposition name · Category · Idea description · **Upload concept card** · Filter 1: Declared attribute, + Add another benefit, **Evidence source link**, **Upload source file**, Benchmark, Declared gap, Gap derivation, Parity exceptions, **Who is this for?**, Growth route, Growth argument, **Pure commodity** · two empty cards, **Filter 5** and **Filter 6** · "14 required boxes left before you can submit."

## Decisions (build the DEFAULT)

- **D105 The Required list is the 12 boxes a person types:** proposition name, category, idea description; declared attribute, benchmark (Optional under the New market route), declared gap, gap derivation, parity, growth route, growth argument; pack size, GST rate. Everything else is Optional. Your name and team are **not boxes**: the server fills them from the login (name from the account, team from the profile), so Submit never asks for them. The team shows as a small chip, "Team: R&D", with a **Change** button that opens the list.
- **D106 COGS, net margin and MRP are filled by the system** (the AI's estimate, the division minimum, the computed price). They move behind one **Adjust cost and margin** button in Filter 2 and are not Required. **Submit never refuses because they are empty.** (The Part 143 build refuses with "COGS is required before Submit"; that is the Submit-gate regression this part removes.)
- **D107 One upload.** "Upload your idea" takes a concept card, an Excel sheet, a Word file or a PDF, one idea or many. Remove the separate "Upload concept card" button. The template link stays inside the upload.
- **D108 Remove from the form:** Your name; the Evidence source link and the Upload source file button (the proof file in Part 144 replaces them); Who is this for?; Pure commodity (see D110); the Quick-commerce notes; the Finance sign-off tick (move it to the manager review screen); the planned price rise box; the empty Filter 5 and Filter 6 cards (show them only at the proof stage); and the loose text: "Three fields. Research fills the rest", the upload caption "One idea or many...", "Optional. Read on Submit...", "Opens once the idea reads GO...", "Opens together with Filter 5...", "Submit for a GO read, or request manager review...".
- **D109 Parity is one tick**, "Parity or better on the remaining attributes", marked Required. Ticked stores `f1.parityExceptions = "none"` (the field the scorer already reads). Unticked opens the exceptions box. Unanswered shows no box. An idea that already has exceptions written opens with the tick off and the text showing. No scoring change.
- **D110 "Pure commodity" is a research finding, not a tick.** Today ticking it gives all 7 Filter 1 checks full credit: with nothing else entered the idea scores 39% (7 of 18). Your v4 document exempts pure commodities from Filter 1; it does not give them free marks. From now on:
  - The Filter 1 research step decides, and returns `{ pureCommodity, reason, source_url, quote, confidence }`.
  - The exemption applies only when research says yes, with a quote and a source the search actually returned, at medium or high confidence (`decideExemption` in `commodityExemption.reference.mjs`). A person's earlier tick never exempts on its own.
  - An exempt idea is scored over the checks that remain: **11 at screening, 14 in the final** (Part 144), with the same bands and the same caps. Not exempt: 18 and 21, unchanged.
  - Ideas already stored with the tick keep their stored score, labelled "Scored under an older release". When screened again they follow the new rule.
- **D111 The Excel template** carries only: name, category, description, main benefit, attribute 2 and 3, benchmark, declared gap, gap derivation, parity ("where we may lose"), growth route, growth argument, GST rate, pack size. Drop the columns for the evidence link, who it is for, pure commodity, COGS, margin, MRP, Quick-commerce notes, the price rise and the five Filter 5 numbers. The builder must not assume any column exists (removing the yes/no column breaks `buildImportTemplateWorkbook` today with "A Cell needs a Row").

## Files to change

- `lib/fieldRoleDisplay.js`: `DISPLAY_REQUIRED_PATHS` becomes the 12 above; `SUBMIT_GATE_PATHS` becomes name, category, description. `requiredEmpty` and the Submit gate in `lib/propositionsApi.js` (line 310) follow automatically.
- `lib/propositionsApi.js`: before the identity check (about line 1081) fill a blank `submitterName` from the account and a blank `submitterDepartment` from the user's team.
- `src/PropositionForm.jsx`: the identity strip (chip), the concept-card block (delete), the section field loop (hide the boxes in D108; the parity tick; the Adjust button in Filter 2), the locked Filter 5 and 6 cards (return nothing), the loose text.
- `src/IdeaImportPanel.jsx`: the caption.
- `lib/ideaImport.js`: `IMPORT_FIELD_SPECS` and `buildImportTemplateWorkbook` (guard the missing yes/no column).
- New `lib/commodityExemption.js` from `commodityExemption.reference.mjs`; wire it into the Filter 1 research step and the screening and final scoring.
- `src/FieldRoleBadge.jsx`: `BeforeYouSubmit` is defined but rendered nowhere. Either render it with one number or delete it; the count lives in the Submit bar.
- `docs/SCORING_SPEC.md` and the golden file: the exemption rule and the 11 and 14 totals.

## Tests (attached; do NOT edit them)

- `testShortForm.mjs` (13 checks): what the person sees, what the server accepts, the template. Fails 12 today; passes against `Part145_scratch_reference.diff`.
- `testRoleDisplay.mjs` (5): the two labels are true for the 12 typed boxes, on the real scorer. Fails today (16 Required); passes with the 12-box list.
- `testPureCommodityExemption.mjs` (12): the exemption is a sourced finding, never a free tick; scored over 11 and 14; caps and the Filter 4 hard stop still apply; the old behaviour (39% from one tick) is shown for contrast. Passes against the reference; breaking the reference three ways was caught each time.
- Also required, written by you: the Filter 1 research step returns the commodity finding with a source; an idea stored with the old tick keeps its stored score, labelled; a mobile check of the shortened form.

## Not in this part

The proof file and the final verdict (Part 144), the manager source screen, Filter 6, and any change to a band, a check or a division minimum.

## Acceptance checklist

- [ ] The form asks for 12 boxes; a concept card or Excel file can fill up to five of them; no name box; a team chip.
- [ ] Submit works with only those 12; it never refuses for COGS, margin, MRP, name or team.
- [ ] One upload; no evidence, who-for, pure-commodity, Quick-commerce, Finance, price-rise, Filter 5 or Filter 6 boxes; none of the loose text.
- [ ] Parity is a tick that stores `none`; nothing typed is ever hidden.
- [ ] A pure commodity is exempt only with a sourced research finding, scored over the checks that remain; no free credit.
- [ ] The template matches the form and builds without the removed columns.
- [ ] No band, check or minimum changed; the attached tests pass untouched.
