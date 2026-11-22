# 6 Filter Test — Your checklist: everything only you can do, step by step

**6 Filter Test** (it used to be called Primus.AI) scores about **60 out of 100** today. Cursor alone can take it to about **71**. The other **14 points** of the overall average (to about **85**) depend on things Cursor cannot do: create your secrets, click in Render, GitHub, Slack or Anthropic, make a decision for you, label ideas, or release a deploy.

For every item below you get **where to go**, **the steps**, **how long it takes**, **what it is worth**, and **the proof to send back** so the score can be updated. Points are approximate and in each aspect's own 100 (eight aspect-points make one overall point). The menus of Render, GitHub, Slack and Anthropic change from time to time: if a label differs slightly, look for the nearest match.

**Two rules for everything here**
1. **Never paste a secret, token, key or connection string into any chat.** Save it in your password manager, and, where Cursor needs it, in a one-line file in `%USERPROFILE%\primus-secrets\` (a folder outside the project). Cursor reads the file; you never type the value into a message.
2. **Names:** the product is now **6 Filter Test**. A few technical names still say "primus" (the folder `primus-secrets`, backup files named `primus-backup-…`, the sign-in cookie). Leave those exactly as they are; changing them would break the backups.

## UPDATE: items that moved from you to Cursor

To keep your list short, Cursor now does these (they are still described below in case Cursor cannot):
- **B4, the Render plan name:** Cursor reads it itself (read-only).
- **C1, the CI files:** you only run `gh auth refresh -h github.com -s workflow` once and approve in the browser; Cursor adds the files and the branch protection.
- **C2, the uptime monitor:** Cursor writes a scheduled GitHub Action instead of you opening a new account; you only add one secret named `OPS_ALERT_WEBHOOK_URL` in GitHub (the repository, **Settings**, **Secrets and variables**, **Actions**, **New repository secret**).
- **E2 and E4:** Cursor pre-fills the inputs of the 30-idea sheet and the calibration table; the experts only add labels and outcomes.
- **G1 step 3 and G4:** Cursor drafts the recovery one-pager, the user guide, the announcement and the support runbook.
- **B1 and the history scan:** Cursor does everything except two clicks (Render's GitHub app access, and confirming Render can see the repository), then waits for your word "GO".

## Quick reference: where things are

| What | Where |
|---|---|
| The live site | `https://ck-6-filter-test-88wu.onrender.com` |
| Health page (shows the commit and `lastBackupAt`) | the site address + `/api/health` |
| MCP audit (you must be signed in as admin) | the site address + `/api/admin/mcp/audit` |
| Render dashboard | `https://dashboard.render.com`, then your workspace; the web service is **ck-6-filter-test**, the database is **6-Filter-Test-Live** |
| Private code | `github.com/6Filter/6-Filter-Test` |
| Public mirror (to be made private) | `github.com/cavinkarecia/6-Filter-Test-ck6filter` |
| Your secret files | `%USERPROFILE%\primus-secrets\` |
| Backup launchers and log | `%USERPROFILE%\primus-backup\` (`run-primus-backup.cmd`, `run-primus-backup-check.cmd`, `backup.log`) |
| Cursor's old safety copies (to clean up) | `D:\Primus-safety\` |

To open PowerShell: press the Windows key, type **PowerShell**, press Enter.

---

# A. Do these first (the most points for the least time)

## A1 — Backup secrets, set up, run once
**Worth: Data safety +16, Operations +20 · Time: 15 minutes · Do step 3 after Harshita's connector test, because it redeploys the site for about a minute.**

1. **Make the two secret values.** In PowerShell run this command **twice**:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   Each run prints a long string of letters and numbers. The first is the **backup token**, the second is the **backup key**. Copy each into your password manager as separate entries ("6 Filter Test backup token", "6 Filter Test backup key").
2. **Save the token in a file for the backup script.** In PowerShell:
   - `mkdir "$env:USERPROFILE\primus-secrets"` (an "already exists" message is fine)
   - `notepad "$env:USERPROFILE\primus-secrets\backup-token.txt"` → click **Yes** to create it → paste **only the token** on one line → **File, Save** → close.
   - `icacls "$env:USERPROFILE\primus-secrets" /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F"` (this stops other Windows users reading the folder).
3. **Tell Render the token and the key.** Go to `https://dashboard.render.com` → open **ck-6-filter-test** → left menu **Environment** → **Add Environment Variable**, three times:
   - name `BACKUP_TOKEN`, value = the token
   - name `BACKUP_ENCRYPTION_KEY`, value = the key
   - name `OPS_ALERT_WEBHOOK_URL`, value = the Slack address from **A2** (add it later if you have not done A2 yet)
   No quote marks, no spaces. Click **Save** (Render may offer "Save, rebuild, and deploy": either is fine). Wait about a minute until the service shows **Live**.
4. **Run the first backup by hand.** Open File Explorer, paste `%USERPROFILE%\primus-backup\` in the address bar, and double-click **run-primus-backup.cmd**. A black window flashes. Then open **backup.log** in the same folder: the last line must say **BACKUP STORED AND VERIFIED**.
5. **Check it landed.** In your browser open the site address + `/api/health` and find `"lastBackupAt"`: it must show today's date and time (not `null`). Open your backup folder (**A3**): two new files must be there, `primus-backup-<date>-<time>-….bk` and a matching `.json`.
6. Tell Cursor: "Backup is on; `lastBackupAt` is fresh."

**If something is wrong** (read `backup.log`): "the backup token was not accepted" = the token in the file and in Render do not match, fix one; "exports are limited to 2 an hour" = wait an hour; "the backup folder cannot be written" = the folder path in the launcher is wrong (see **A3**).
**Proof to send:** the `"lastBackupAt"` line from `/api/health`, and the names of the two files.

## A2 — A Slack address for alerts
**Worth: part of the Operations +20 (without it, a failed backup tells nobody) · Time: 10 minutes · You may need your Slack workspace admin for five minutes.**

1. Open `https://api.slack.com/apps` and sign in to your workspace → **Create New App** → **From scratch** → name it `6 Filter Test alerts`, choose your workspace → **Create App**.
2. Left menu **Incoming Webhooks** → switch **Activate Incoming Webhooks** to **On** → **Add New Webhook to Workspace** → choose a channel only you read (a private channel is best) → **Allow**.
3. Copy the **Webhook URL** (it starts `https://hooks.slack.com/services/`). Save it in your password manager.
4. Save it for the script: `notepad "$env:USERPROFILE\primus-secrets\slack-webhook.txt"` → paste it on one line → Save. Use the same address as `OPS_ALERT_WEBHOOK_URL` in Render (A1 step 3).
5. **Test it** in PowerShell: `Invoke-RestMethod -Method Post -Uri (Get-Content "$env:USERPROFILE\primus-secrets\slack-webhook.txt") -ContentType "application/json" -Body '{"text":"6 Filter Test alert test"}'`. The message must appear in the channel.
If "Create New App" is blocked, ask your Slack admin to approve the app or create the webhook for you.
**Proof:** the test message arrives.

## A3 — Choose where the backup files are kept
**Worth: part of A1 · Time: 2 minutes**

1. Pick a folder that syncs to a place you control, such as a OneDrive or SharePoint folder, or an external drive. The launcher is set to `%USERPROFILE%\OneDrive - CavinKare\PrimusBackups`: if that folder exists and you are happy with it, you are done.
2. If you prefer another folder: in PowerShell run `notepad "$env:USERPROFILE\primus-backup\run-primus-backup.cmd"`, change the `BACKUP_DIR` line to your folder, **Save**; do the same in `run-primus-backup-check.cmd`.
3. Tell Cursor the folder you chose.

## A4 — Prove a backup can be restored
**Worth: Data safety +7 · Time: 30 minutes · After A1**

1. Save the backup key (not the token) for Cursor: `notepad "$env:USERPROFILE\primus-secrets\backup-key.txt"` → paste the key on one line → Save.
2. Send Cursor exactly this message: "Run the restore drill from the runbook, section 5, using the latest backup file in my backup folder. Read the key from `%USERPROFILE%\primus-secrets\backup-key.txt` into the environment only and never print it. Use the scratch database only. Compare every table and the uploaded files byte for byte. Delete the scratch data afterwards and report."
3. Read Cursor's report: it must show **ALL MATCH** and matching checksums for the uploaded files.
4. When it is done, remove the key file: `Remove-Item "$env:USERPROFILE\primus-secrets\backup-key.txt"`.
**Proof:** the ALL MATCH line.

## A5 — Delete the old secrets file Cursor made
**Worth: security hygiene · Time: 1 minute · After A1**

1. In PowerShell: `Remove-Item "D:\Primus-safety\render-backup-secrets.txt"`
2. Check it is gone: `Test-Path "D:\Primus-safety\render-backup-secrets.txt"` must print `False`.
(Its values are retired. Your own new values from A1 are the only ones in use.)

## A6 — Look at Render's own database backups
**Worth: tells me whether Data safety deserves more · Time: 2 minutes**

1. Render dashboard → **Databases** (or the list on the home page) → **6-Filter-Test-Live** → the **Recovery** tab.
2. Note what it shows: how many backups, and for how many days. Tell me.

## A7 — Copy all Render settings into your password manager
**Worth: protects against an accidental overwrite · Time: 5 minutes**

1. Render dashboard → **ck-6-filter-test** → **Environment**.
2. For each variable, click the reveal (eye) icon and copy the **name and value** into one secure note called "6 Filter Test Render settings, <today's date>" in your password manager. Do not take screenshots or save them in a shared folder.
3. Do this again after any large change.

---

# B. Keep the code private

## B1 — Make the public mirror private
**Worth: Security +10 (with B2) · Time: 30 minutes. Do this in order: Render pulls from that public repository without logging in, so making it private first would break your deploys.**

1. **Look for forks.** Open `https://github.com/cavinkarecia/6-Filter-Test-ck6filter`. At the top right look at the **Forks** count. If forks exist you cannot take them back (see B2).
2. **Give Render's GitHub app access.** On GitHub click your profile picture → **Settings** → **Applications** → **Installed GitHub Apps** → **Render** → **Configure** → under **Repository access** choose **Only select repositories** → add `6-Filter-Test-ck6filter` → **Save**. (If the repository belongs to an organisation: that organisation's Settings → **GitHub Apps** → Render → Configure.) If Render is not listed, install it from Render: **Account Settings** → **GitHub** → **Configure**.
3. **Check Render can see it.** Render → **ck-6-filter-test** → **Settings** → **Build & Deploy** → the **Repository** line → **Edit**. The repository must appear in the list. **If it does not, stop and repeat step 2. Do not go on.**
4. **Make it private.** On GitHub open the repository → **Settings** → **General** → scroll to **Danger Zone** → **Change repository visibility** → **Make private** → confirm.
5. **Prove the deploy still works.** Render → **ck-6-filter-test** → **Manual Deploy** → **Deploy latest commit**. Watch it reach **Live**. Then open the site address + `/api/health` and check the commit changed.
6. **Prove it is private.** Open a private (incognito) browser window, not signed in to GitHub, and open the repository address: it must say **404 / not found**.
**If a deploy fails after step 4** with "repository not found" or a permission message, the cause is step 2. Fix the access. Making it public again is a last resort.
**Proof:** the incognito "not found", and a successful deploy.

## B2 — Rotate what the secret scan finds
**Worth: part of Security +10 · Time: about 5 minutes per item · After Cursor sends the masked scan summary**

Cursor lists exposed secrets by type and file, never the value. For each one:
- **Database password:** Render → **6-Filter-Test-Live** → **Info** / **Settings** → look for a credential reset. If there is none, ask Render support. If the address changes, update `DATABASE_URL` in the web service's Environment.
- **Slack token or signing secret:** `https://api.slack.com/apps` → your app → **OAuth & Permissions** (reinstall to get a new token) or **Basic Information** (regenerate the signing secret). Put the new value in Render's Environment.
- **Anthropic key:** `https://console.anthropic.com` → **API keys** → **Create key** → put it in Render (`ANTHROPIC_API_KEY`, and in the app's team key settings if you use them) → run one screening to check it works → **delete the old key**.
- **`SESSION_SECRET` or `LOGIN_CODE_SECRET`:** make a new value with the `node -e` command from A1 and set it in Render. Everyone is signed out once. (You did `SESSION_SECRET` already.)
- **Do NOT change `DEPARTMENT_KEY_ENCRYPTION_SECRET` or `BACKUP_ENCRYPTION_KEY`** without Cursor's re-encryption plan: the first decrypts stored team keys and passwords, the second opens every old backup.
Record each change and its date in your password manager.
**Proof:** a list of what you rotated.

## B3 — Rotate Cursor's Render key
**Worth: Security +3 · Time: 5 minutes**

1. Render → your profile (top right) → **Account Settings** → **API Keys** → **Revoke** the existing key, and create a new one only if you decide Cursor needs one.
2. In PowerShell run `render logout` (this signs the command-line tool out). Optionally delete `%USERPROFILE%\.render\cli.yaml` afterwards.
3. Tell Cursor: no standing Render access; you will name any change you want.
(You do not need a Render key for deploys: they happen automatically when the mirror is updated.)

## B4 — Tell Cursor your Render plan name
**Worth: Operations (the deploy file `render.yaml` must match) · Time: 1 minute**

1. Render → **ck-6-filter-test** → **Settings** → find **Instance Type** and read the name (for example "Starter").
2. Send that one word to Cursor.

---

# C. Switches only you can add

## C1 — Add the CI workflow files through GitHub
**Worth: Testing +7, Operations · Time: 10 minutes · After Cursor sends the two files**

1. Open `https://github.com/6Filter/6-Filter-Test` (the private repository).
2. **Add file** → **Create new file** → in the name box type `.github/workflows/ci.yml` (GitHub creates the folders as you type the slashes) → paste the file's text from Cursor → **Commit changes** (choose a new branch if you prefer).
3. Repeat for the keep-alive workflow file.
4. **Make a failing test block a merge:** repository → **Settings** → **Branches** → **Add branch protection rule** → Branch name `main` → tick **Require status checks to pass before merging** → pick the check named after the CI job → **Save**.
**Proof:** a deliberately failing change cannot be merged.

## C2 — An uptime monitor
**Worth: Operations +6 · Time: 10 minutes · The second monitor works after Cursor's operations branch is deployed**

1. Open `https://uptimerobot.com` (a free service; any similar one will do) → sign up → **Add New Monitor**.
2. **Monitor Type:** Keyword · **Friendly Name:** `6 Filter Test health` · **URL:** the site address + `/api/health` · **Keyword:** `"ok":true` · alert when the keyword **does not exist** · **Alert Contacts:** your email (and Slack if you like) → **Create Monitor**.
3. Add a second monitor: same URL, keyword `"backupStale":true`, alert when the keyword **exists**.
**Proof:** both show "Up", and a test alert reaches you.

## C3 — Alerts and spending limits
**Worth: Operations +4 · Time: 10 minutes**

1. **Render:** your profile → **Account Settings** (or the workspace **Notifications**) → turn on notifications for **failed deploys** and **service events**, by email and/or Slack.
2. **Anthropic:** `https://console.anthropic.com` → **Settings** / **Limits** (or **Plans & Billing**) → set a **monthly spend limit**; set a smaller limit on any key used for testing.
3. **Billing alert:** set an email alert at a threshold you are comfortable with, where the provider offers one.
**Proof:** a note of each limit you set.

---

# D. Decisions only you can make

**How to record a decision.** Either open `docs/DECISIONS.md` in Cursor and type the line yourself, or send Cursor a message such as: "Record in `docs/DECISIONS.md`: D1 OWNER'S DECISION: B, <today's date>". Then **read the line back** to be sure it says what you meant. Cursor must not change scoring until the line exists.

| # | Decision | Where to read first | What to write | Worth |
|---|---|---|---|---|
| **D1** | **The margin rule.** A margin below the division minimum is **A**, a mark-down capped at WATCH that a manager can approve forward (today), or **B**, a hard NO-GO with an exception note (your v4 text). | Cursor's impact report (how many ideas would change) | `D1 OWNER'S DECISION: A` or `B` | **Scoring +5**; unlocks the commodity half of Part 145 (Functionality +4) |
| **D2** | **Approve Part 142** (a fooled AI earns nothing). It changes the locked scoring files, so it needs your written approval and a new fingerprint (ruleset v5.8). | Cursor's report on its branch and the two passing tests | `D2 APPROVED: Part 142, ruleset v5.8, <date>` | **Scoring +8, Functionality +4** |
| **D3** | **Part 144 timing** (the proof file and the final verdict) and the wording "Screening verdict (Filters 1 to 4)" on every verdict until then. | `docs/prompts/…Part144…` | `D3: build during the pilot; keep the wording` | clarity; stops a GO being read as final |
| **D4** | **Approve the coverage exemptions list** Cursor sends (each has a reason). Without it the coverage gate cannot close. | Cursor's exemptions list | `D4 APPROVED: exemptions list of <date>` | **Testing** (closes the gate) |
| **D5** | **The visibility policy.** A Business Manager sees only ideas they created; a roster team lead sees their reports'; BH FORUM sees the mapped teams; ADMIN sees all; another team's idea answers "not found". | Cursor's access matrix | `D5 CONFIRMED` or the change you want | Security, Functionality |
| **D6** | **Small choices:** keep the Required label on every box; keep the Bulk upload button; the one-tick parity design (after D1). | the form | `D6: keep, keep, tick` | Functionality |
| **D7** | **Retention:** deleted ideas kept 90 days; backups kept 35 days; audit rows 90 days. | — | your periods (confirm with your data-protection owner) | Data safety, governance |
| **D8** | **The MCP connector:** company-managed Claude accounts only; who is on `MCP_ALLOWED_EMAILS` (today you and Harshita); whether it stays on. | the MCP panel | `D8: …` | Security |
| **D9** | **Who approves a WATCH idea** besides Admin and BH FORUM, with a named deputy for each. | the approval screen | the names | Functionality |

---

# E. Inputs only you and your experts can give

## E1 — A test AI key with a spend cap
**Worth: part of AI +22 · Time: 10 minutes · Cursor estimates the cost first and you approve the cap**

1. `https://console.anthropic.com` → **API keys** → **Create key**, named `6filter-eval`.
2. Set a **spend limit** on it (or its workspace) at the amount you approved.
3. Save the key: `notepad "$env:USERPROFILE\primus-secrets\eval-key.txt"` → paste on one line → Save. Tell Cursor the file name (never the key).

## E2 — Label 30 ideas
**Worth: AI +22 to +30 · Time: 2 to 4 hours of an expert's time · Start with 10 to unlock partial credit**

1. Open `golden_set_labels_template.csv` in Excel.
2. **Delete the two example rows** (marked EXAMPLE).
3. For each real idea, fill the columns: the idea's details; the expected GST rate; whether the benchmark is relevant; whether the gap is credible; the price events; the seven tech-shift ratings (Low, Medium or High); whether the route matches; the verdict you would expect; and **what actually happened** (launched, killed, running, unknown); your initials and date.
4. **Save as CSV (UTF-8)** into a folder outside the project and tell Cursor the path.

## E3 — The acceptance thresholds for the AI
**Time: 10 minutes**
Write your numbers in `docs/DECISIONS.md`. Proposed: at least 85% agreement on GST and on benchmark relevance, tech-shift ratings within one level at least 90% of the time, and zero invented sources.

## E4 — A calibration set from real outcomes
**Worth: Scoring +4 · Time: 2 to 4 hours with the NPD heads**

1. List 30 to 50 past ideas whose real outcome you know.
2. Give Cursor the list. It compares each one with what 6 Filter Test would say.
3. Look at the table together. Today 2 GO out of about 320 screenings is very strict. **Any threshold change is your written decision**; the scoring files stay locked until then.

---

# F. Release control (only you can say "go")

## F1 — Release the deploys, one at a time
**Worth: unblocks Performance +10, Operations, Testing · Time: 1 minute per deploy**

The order, one deploy window per day, **never during a test**: (1) the MCP branch (audit email, admin panel, fail-closed allowlist); (2) the tests-only branches; (3) the diagnostics endpoint and the health fields; (4) the operations branch; (5) Part 155 (paging) **only after A1 and A4 are proven**.
For each, send: "Release: deploy `<branch name>` now (private repository first, then the mirror). I am not testing anything at the moment." After it finishes, open the site address + `/api/health` and check the commit changed and `"ok":true`.

## F2 — Run the signed-in probe after the MCP deploy
**Time: 5 minutes**

1. Download the latest `probeMcpSurface.mjs` from the chat into your Downloads folder.
2. In PowerShell: `node "$env:USERPROFILE\Downloads\probeMcpSurface.mjs" --url https://ck-6-filter-test-88wu.onrender.com/mcp --login --try-registration`
3. When it prints **OPEN THIS ADDRESS IN YOUR BROWSER AND SIGN IN**, copy the long address into your browser, sign in with your work email and the Slack code, wait for "Signed in. You can close this window", and let PowerShell finish.
4. Every line must pass. If A5b or A5c say INCONCLUSIVE, wait three minutes and run it again. Any FAIL: set `MCP_ENABLED=false` in Render at once and send me the output.

## F3 — The Claude admin and Harshita's test
**Time: 30 minutes**

1. **Confirm the admin added the connector** and what Claude showed him, including the tool list: exactly three tools, `list_ideas`, `open_idea`, `read_verdict`.
2. **Harshita first creates one draft idea on the website** (open the site, start a new proposition, enter a name and a description, save the draft). A Business Manager sees only their own ideas, so without a draft the connector shows nothing and proves nothing.
3. **Harshita connects:** Claude settings → **Connectors** (or Customize → Connectors) → find the 6 Filter Test connector → **Connect** → sign in with her work email and the Slack code. Then in a new chat she asks: "Using 6 Filter Test, list my ideas" (the list must match the website), "open <her idea> and tell me its verdict", and "save a draft called Test" (it must say it cannot).
4. **A negative test:** the admin tries to connect with his own account. He is not on the list, so he must see the "limited pilot" page and get no token.
5. **You check the audit:** while signed in to the site as admin, open the site address + `/api/admin/mcp/audit`. Her calls must appear.

---

# G. People and governance

## G1 — A second person who can restore the data
**Time: 10 minutes**

1. In your password manager open its settings and look for **Emergency access** or **Trusted contacts**; add one trusted colleague or your manager. Give them the backup key (A1) through the password manager, not by message.
2. Ask your Microsoft 365 admin to create a **shared mailbox** for the project (for example one named for 6 Filter Test). Change the recovery email on the Render, GitHub and Slack owner accounts to it, so a second person can recover them.
3. Write one page: where the backups are, the restore steps (`Primus-AI_Backup_Setup_Runbook.md`, section 5), and who to call. Keep it with the key.

## G2 — Tell your manager or data-protection owner
**Time: 10 minutes.** Say, in one sentence: "6 Filter Test runs on Render, its backups are encrypted and kept in <folder>, and it holds employee email addresses and confidential product ideas." I am not a lawyer; this conversation is cheap now and expensive later.

## G3 — Nielsen and Kantar
**Time: 15 minutes.** Ask procurement about the licence **before** any data from either is used or cited in the platform.

## G4 — The pilot
**Time: 15 minutes.** Decide which two or three teams, which dates (about two to three weeks), and who answers questions (a Slack channel). The pilot starts about week 5 of the plan.

## G5 — The go-live signature
When every aspect is at least 85 and no serious defect is open, the decision is yours.

---

# H. Routines to put in your calendar

- **Every month:** a restore drill into a scratch database (ALL MATCH, files byte for byte); `npm audit`; the secret scan.
- **Every quarter:** a calibration review against real outcomes; re-run the full verification; re-run the scorecard.
- **Every expiry:** renew any storage token two weeks early; rotate secrets on a schedule; check the card on Render is valid.
- **Every Cursor report:** read it, and send it to me with the zip or the diff. I rescore from the evidence.

---

# The order I would do them in (about two hours of your time makes the biggest difference)

1. **A1 to A3, A5** (about 30 minutes): the single biggest block, about +36 across Data safety and Operations.
2. **B1, B2** (about 45 minutes): the code private, exposed secrets rotated: Security +10.
3. **D1, D2** (10 minutes once Cursor's impact report arrives): Scoring +13.
4. **B3, B4, C1 to C3** (about 40 minutes): Security +3, Operations +10, Testing +7.
5. **A4** (30 minutes): the restore proven on your side: Data safety +7.
6. **E1 to E3, then E4** (the hours): AI +22 to +30, Scoring +4.
7. **F1 to F3** as Cursor's branches are ready.

**What your items are worth in total:** about +14 on the overall average. Cursor's own work is the other +11. Neither side alone reaches 85.
