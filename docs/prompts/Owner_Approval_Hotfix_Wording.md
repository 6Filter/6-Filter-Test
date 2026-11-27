# Approve the wording changes in the honest-button hotfix (the repository's lock check will not pass without this)

**What the page says today and what it would say.** Please read and answer "approved" (or tell me what to change).

| Today | The hotfix |
|---|---|
| Button on old ideas: **Evaluate** | **Submit** (one button name everywhere) |
| "Choose the team with Change before Submit." | "Not started: your team is not confirmed yet. Fix: Team." |
| "Enter all required values before Submit." / "Enter required values before Submit: <boxes>." | "Not started: a required box is still blank. Fix: <box>." |
| "Fix invalid inputs before Submit." | "Not started: an answer is invalid. Fix: <box>." |
| "Your idea was saved, but the research step failed: <reason>." | "Submit did not finish. Try again." plus the plain reason (credit, too many requests, research did not finish) |
| (nothing while it runs) | "Screening... this takes about 2 to 3 minutes. You can leave this page." and the button reads "Submitting..." |
| (nothing after it finishes) | "Screened at <time> at Level <n>. Score 61% to 97%, verdict WATCH to GO." or "Screened at <time> at Level <n>. Nothing changed because <the inputs and the level are the same as the last screening / a stored result for this level was reused / research did not finish>." |
| (silent when blocked) | "Not started: a search is already in progress. Wait for it to finish." / "...the team has run out of AI credit." / "...you cancelled the confirm step." / "...the save did not finish." |
| (a count line) | "<n> <boxes> required before Submit" |

It adds one new file (`lib/screenFeedback.js`) and changes the server's save reply (a `screenDecision` note and one log line per press with the idea id only). **It changes no score and touches no protected file.**

```
APPROVAL (owner, written). I approve the wording changes listed in Owner_Approval_Hotfix_Wording.md and the new file lib/screenFeedback.js for the honest-button hotfix only. The lock baseline may be updated for exactly these changes and no others. Scoring, credit rules and Filter 4 behaviour must not change in this branch. Nothing is deployed until I write the exact sentence naming the branch and the commit.
```

APPROVAL (owner, written, 27 Nov 2026). I approve the wording changes listed in Owner_Approval_Hotfix_Wording.md and the new file lib/screenFeedback.js for the honest-button hotfix only. The lock baseline may be updated for exactly these changes and no others. Scoring, credit rules and Filter 4 behaviour must not change in this branch. Nothing is deployed until I write the exact sentence naming the branch and the commit.
