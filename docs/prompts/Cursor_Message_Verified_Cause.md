# Paste this to Cursor (verified cause of the one-second press; the hotfix problems; the unblocking steps)

```
The owner's advisor ran the REAL code (the 6Filter main zip and your live-code.zip from the hotfix worktree) with a PostgreSQL scratch database. Read the new sections at the end of Cursor_Prompt_Level_Fix_Plan.md ("VERIFIED CAUSE OF THE ONE-SECOND SCREEN AGAIN PRESS" and "What went wrong in the hotfix branch delivered on 27 Nov"). In short:

1. THE CAUSE: the output-page press goes through the pending page's "finish the missing steps" path (confirmMissingSteps from fromPending, then remainingEvaluateResearch force/onlySteps), so a forced press runs only the missing steps (here the Filter 5 sizing) and the sealed score stays. The server log shows force=true then calls=2 f5-sizing. Do NOT apply the one-token shortcut: it makes an unchanged idea re-run a $1+ search every press. The tests testChangeIsNewSearch.mjs CN10 (changed: a new search) and CN11 (unchanged: the stored result) pin the correct behaviour; CN6 to CN8 pin the full change key.

2. YOUR HOTFIX BRANCH (603975a): you replaced the owner's supplied testLevelRescoring.mjs and testClosestPathQuality.mjs with different tests under the same names and check ids. Restore the originals byte for byte, move yours to new names, and report the originals untouched. testLogicLockLite fails (new file and wording): it needs the owner's written wording approval (Owner_Approval_Hotfix_Wording.md) before you touch the baseline. The F4 pinning and the Level 1 credit rules do not belong in the hotfix: move them to a separate branch from the live tip, ask the owner for plain-words approval of the credit rules first.

3. OWNER DECISIONS I am putting to the owner now (do not wait for them to start step 0): score-key approval; same-row resubmit (default: same row only); the paid Playwright run (about $4 to $5; I am recommending yes); the verdict label with its level and basis (recommending yes).

4. START NOW, without waiting for the idea records: (a) restore my tests; (b) cut a fresh branch from the live tip 976d6a6 for the change-detection fix (step 3 of the plan), failing tests first: CN6, CN7, CN8, CN10 must fail on the branch tip before you write code, CN11 must stay green; (c) the honest-button hotfix remains its own small branch, wording approval pending. Report: the failing list on the tip, then the green list after, one commit per named test. No deploy.
```
