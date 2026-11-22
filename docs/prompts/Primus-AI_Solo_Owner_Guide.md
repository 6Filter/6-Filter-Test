# 6 Filter Test — Running it alone on Render (no IT): backups, the public mirror, secrets

You built and run this yourself, on Render, with no IT team behind you. That is fine, but it means three jobs that a company would hand to IT are yours: **keeping a copy of the data somewhere that is not Render**, **keeping the code private**, and **not being the only person who can recover it**. This guide does each with the least machinery. Every command below is for Windows.

## 1. Why "backups on Render" are not enough on their own

Render's own backups are worth having, but they live in the same account as the database. They do not help if the account is suspended (a failed payment), a service or database is deleted by mistake, someone gets into the account, or Render has a bad day. A backup protects you only if it survives **the thing that went wrong**, so keep at least one copy in a place Render cannot touch. The cheapest such place is a folder you already own: a OneDrive or SharePoint folder that syncs (your company Microsoft account), or an external drive.

**Do both of these:**
- **Render's own backups.** In the Render dashboard, open the database, then **Recovery**. As far as I know a paid database lists its backups there and lets you download one. Tell me what it shows (how many days it keeps); put "download one" on the monthly calendar.
- **Your own folder copy** (section 2). It is encrypted by the app before it leaves Render, so it is safe to sync to OneDrive; the key is held separately.

## 2. A nightly encrypted backup into a folder you own

**What you need:** a Windows PC that is switched on at the scheduled time (a desk PC is best), Node installed (`node -v` shows a version; Cursor's machine already has it), the repository folder with `scripts\pullBackupToFolder.mjs` in it (from the supplied bundle), and a folder that syncs.

**What it does:** calls the app's own export, checks the file is a fresh, whole Primus backup, saves it into your folder under a temporary name and renames it only when complete, checks what it saved, keeps the newest 60, and **sends a Slack message if anything goes wrong**. It never has the encryption key, so it cannot read the backup. It is tested by `testPullBackupToFolder.mjs` (11 checks, six deliberate breaks each caught).

### 2.1 Make the two secrets (you, yourself; never send them to anyone, including me and Cursor)

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Run it twice. First result = the **backup token**. Second = the **backup encryption key**. Save both in your password manager now.

**Do not use the values Cursor created.** Cursor wrote its own into `D:\Primus-safety\render-backup-secrets.txt`, which means they passed through an AI tool and sit in plain text beside the encrypted dump. Delete that file and use your own.

### 2.2 Tell Render (Render dashboard, the web service `ck-6-filter-test`, **Environment**)

Add `BACKUP_TOKEN` and `BACKUP_ENCRYPTION_KEY` with the two values, and `OPS_ALERT_WEBHOOK_URL` (a Slack webhook; see 2.5). Save; the service redeploys.

### 2.3 Put the token where the script reads it

Open PowerShell and run (the first command opens Notepad: paste only the token, save, close):
```
mkdir "$env:USERPROFILE\primus-secrets"
notepad "$env:USERPROFILE\primus-secrets\backup-token.txt"
icacls "$env:USERPROFILE\primus-secrets" /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F"
mkdir "$env:USERPROFILE\OneDrive - CavinKare\PrimusBackups"
```
(The last folder is an example: use any synced folder, and note its real path. The `icacls` line stops other Windows users reading the secrets.)

### 2.4 A small launcher, and a daily schedule

Save this as `%USERPROFILE%\primus-backup\run-primus-backup.cmd` (change the two paths to yours):
```
@echo off
set "APP_URL=https://ck-6-filter-test-88wu.onrender.com"
set "BACKUP_TOKEN_FILE=%USERPROFILE%\primus-secrets\backup-token.txt"
set "OPS_ALERT_WEBHOOK_URL_FILE=%USERPROFILE%\primus-secrets\slack-webhook.txt"
set "BACKUP_DIR=%USERPROFILE%\OneDrive - CavinKare\PrimusBackups"
cd /d "C:\path\to\the\repository"
node scripts\pullBackupToFolder.mjs backup >> "%USERPROFILE%\primus-backup\backup.log" 2>&1
```
**Run it once by hand first** (double-click it, then read `backup.log`). It must say `BACKUP STORED AND VERIFIED`, a `.bk` and a `.json` file must appear in the folder, and `https://ck-6-filter-test-88wu.onrender.com/api/health` must show `lastBackupAt` within the last minute.

Then schedule it, in PowerShell (this runs at 10:30 each day, when a working PC is on; if you miss it, it runs as soon as the PC is next awake). Add a second task that checks the newest backup is not stale:
```
$a = New-ScheduledTaskAction -Execute "$env:USERPROFILE\primus-backup\run-primus-backup.cmd"
$t = New-ScheduledTaskTrigger -Daily -At 10:30am
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName "Primus backup" -Action $a -Trigger $t -Settings $s
```
For the stale check, make a second launcher that is identical but ends with `node scripts\pullBackupToFolder.mjs status`, and register it for 11:30 with the task name "Primus backup check". It exits with a failure and sends the Slack message if the newest complete backup is more than 26 hours old, which catches a PC that was off for days.

### 2.5 The alert (a Slack webhook)

A Slack **incoming webhook** lets the script post a message. Create one in Slack (it needs a Slack app or Workflow Builder permission in your workspace, so you may need your Slack workspace admin for five minutes), choose a channel only you read, copy the address, and save it into `%USERPROFILE%\primus-secrets\slack-webhook.txt` (one line). Put the same address in Render as `OPS_ALERT_WEBHOOK_URL`. If you cannot create a webhook, the stale check still fails visibly in `backup.log`, but you would have to look: that is much weaker, so the webhook is worth the five minutes.

### 2.6 Prove a restore, and keep proving it

Once: restore one of the files into a scratch database with the steps in `Primus-AI_Backup_Setup_Runbook.md`, section 5 (`decryptBackup.mjs`, `importExport.mjs`, `verifyDatabaseCopy.mjs --timestamps ms --ignore-table backup_exports`), and check the uploaded files match. Then **every month**. Cursor can do it for you with the file and the key, if you give the key through a file outside the repository. A backup you have never restored is a hope.

### 2.7 What this does not cover

The secrets in Render's environment are not in the backup (keep them in the password manager); a backup holds at most a day less than the live data, so take a manual one before any risky change (`node scripts\pullBackupToFolder.mjs backup`); and it depends on that PC. If the PC will not always be on, run the same script on Render as a Cron Job writing to Azure Blob (`exportToBlob.mjs`) later, when you have storage you are happy with.

## 3. Make the public mirror private, without breaking your deploys

Every deploy publishes the entire application, its prompts and its test emails to a public GitHub repository. Making it private is the right fix, but **Render pulls from that public repository without logging in**, so flipping it to private first would break your deploys. The order below avoids that. UI names are as far as I know; GitHub and Render change them.

**Before anything: look for forks.** On the mirror's GitHub page, check **Forks** (right-hand side or Insights). When a public repository becomes private, its public forks **stay public** in their own copy. If there are forks you do not know, you cannot take them back; plan to rotate secrets (section 4) regardless.

1. **Find out what Render is connected to.** Render dashboard, the web service, **Settings**, the repository line. Note which GitHub account or organisation it belongs to (it is `cavinkarecia/6-Filter-Test-ck6filter`, per the Cursor rule file). Then Render, **Account Settings**, **GitHub** (connected accounts) to see which GitHub identity Render uses.
2. **Give Render's GitHub app access to that repository.** In GitHub, signed in as an owner of that account or organisation: **Settings, Applications, Installed GitHub Apps, Render, Configure**; under **Repository access** choose "Only select repositories" and add the mirror (or "All repositories"). Save. If Render's app is not installed there, install it from Render's **Account Settings, GitHub, Configure**.
3. **Check Render can now see it as a private repo.** Render, the web service, **Settings, Build & Deploy**, edit the repository: the repository must appear in the list. **If it does not appear, stop here** and recheck step 2; do not go on.
4. **Make the repository private.** GitHub, the repository, **Settings, General, Danger Zone, Change repository visibility, Make private.**
5. **Prove the deploy still works.** Render, **Manual Deploy, Deploy latest commit**; watch it finish; check `/api/health` shows the new commit.
6. **Prove it is private.** Open the old repository address in a private browser window you are not signed in to: it must say "not found".

**If a deploy fails after step 4** with a "repository not found" or permission message, the cause is step 2 (the app's access), not the privacy. Fix the access. Making it public again is the last resort because it re-exposes everything.

The private organisation repository (`6Filter/6-Filter-Test`) is the real source. A cleaner end state is to point Render at that and delete the mirror entirely; that needs you to be an owner of that organisation and to install Render's app on it. Either way works; pick the one you control.

## 4. Which secrets to rotate (do not rotate blindly)

Making the repository private does not un-publish what was in it: assume copies exist (forks, clones, search caches). The right list comes from the **history scan**: ask Cursor to run `scanForSecrets.mjs` on a fresh clone of the mirror and a history scanner (gitleaks or trufflehog), and report masked findings by type and file. Rotate **only what is found**, with these cautions:

- **`DEPARTMENT_KEY_ENCRYPTION_SECRET` and `BACKUP_ENCRYPTION_KEY`: do not just change them.** The first encrypts the department keys and passwords already stored in the database: change it without a migration and they become unreadable. The second is what opens every old backup: keep the old one until the old backups are gone. If either was exposed, tell me and I will write the safe re-encryption steps first.
- **`SESSION_SECRET` and `LOGIN_CODE_SECRET`**: safe to change; everyone is simply signed out once.
- **The database password:** check whether Render's database page offers to rotate or reset the credentials; if it does not, Render support can. The app picks up a new address from `DATABASE_URL`.
- **AI provider keys and Slack tokens:** create a new one in the provider's console, put it in Render, then revoke the old one.
- **An Azure SAS or storage key:** regenerate the key or revoke the stored access policy.
- Record each change in the password manager with the date.

## 5. You are one person: the bus-factor fix (ten minutes)

If you are unavailable, nobody can restore the data or even read a backup. Fix that without involving IT:
- Give **one trusted colleague or your manager** the backup encryption key and the password manager's emergency access (many managers have an emergency-contact feature; otherwise a sealed envelope in a safe).
- Write down, on one page, where the backups are, how to restore them (`Primus-AI_Backup_Setup_Runbook.md`, section 5), and who to call. Keep it with the key.
- Put the Render, GitHub and Slack owner accounts on an email address a second person can also recover (a shared mailbox), not only your personal one.

Separately, "no IT involvement" is a practical fact, but this system holds confidential ideas and employee email addresses, so tell your manager or data-protection owner once, in a sentence, where it runs and where the backups live. I am not a lawyer; that conversation is cheap now and expensive later.

## 6. What changes in the roadmap when you run it alone

In `Primus-AI_Road_To_Production_Plan.md`, every task marked **IT** becomes yours, using this guide (the private repository, the monitoring, the storage). The monitoring is a free uptime check on `/api/health` plus the Slack alert from section 2.5. Everything else in the plan stands.
