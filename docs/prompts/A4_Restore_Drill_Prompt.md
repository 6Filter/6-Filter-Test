# A4: the restore drill (copy the text below into Cursor)

```
A4: the restore drill for 6 Filter Test. The first real backups exist and are verified. Prove that the newest complete one can be restored. Rules: never print, echo, log or commit the backup key; use the SCRATCH database only; do not call the live app's export (the hourly limit may be used up); do not touch the live database or any Render setting; do not deploy or push anything.

Backup to use: the NEWEST COMPLETE backup (a .bk with its matching .json marker) in D:\OneDrive - CavinKare Private Limited\6-Filter-Test-Backups. At the time of writing the newest is primus-backup-20261121-115407-eb72Z.bk (35 tables, 6,433 rows, 19,751,227 bytes); if a newer complete pair exists, use that and say which. Work on COPIES in a temporary folder on D: that is NOT inside OneDrive or the repository, for example D:\Primus-safety\restore-drill-20261121\. Never modify the originals.

The key: read it from %USERPROFILE%\primus-secrets\backup-key.txt into the process environment only, for example in PowerShell:
  $env:BACKUP_ENCRYPTION_KEY = (Get-Content "$env:USERPROFILE\primus-secrets\backup-key.txt" -Raw).Trim()
  ... run the decrypt ...
  Remove-Item Env:BACKUP_ENCRYPTION_KEY
Never use echo, Write-Host or a debug flag on it. First check the file exists and its length is 64 (never its content).

Steps:
1. Marker check: read the .json marker and confirm its sha256, byte count, table count and row count match the .bk file you hold.
2. Header check (needs no key): the file starts with PRIMUSBK1, the header parses, it lists the expected tables, and createdAt matches the file name.
3. Decrypt with scripts\decryptBackup.mjs into the temporary folder. A successful decrypt proves the authentication tag passed (the file is intact and the key is right). Confirm the sha256 recorded in the header equals the sha256 of the decrypted data.
4. Negative tests on COPIES: (a) flip one byte in the encrypted part: decryption must FAIL; (b) use a random wrong key: decryption must FAIL. Show both fail, without printing any key.
5. Load into an EMPTY scratch database with scripts\importExport.mjs. The scratch local server may be PGLite, which cannot create separate databases: use a fresh SCHEMA (PRIMUS_SCHEMA) if importExport supports it, or a real local PostgreSQL if one is available; refuse a target that already has tables. If neither works, say so and stop; do not use the live database.
6. Completeness: the restored row count of EVERY table equals the count recorded in the backup's header. List any difference.
7. Uploaded files: for every row in the evidence-files table, confirm the stored byte length equals its recorded size, and, wherever the row stores a checksum, that the SHA-256 of the stored bytes equals it. Also compare the largest 5 files and report names (not contents), sizes and the first 12 characters of each SHA-256. Report how many files in total.
8. The app boots on the restored copy: start the app (scratch only, a spare port) against the restored schema and check /api/health shows ok:true, sequencesOk:true, scoringFingerprint ba0156d2, and a propositions count equal to the restored propositions table. Open one evaluated idea through the admin harness and confirm its verdict is the same as the stored one. Stop the server.
9. Compare the restored database with the backup's own record using scripts\verifyDatabaseCopy.mjs where it applies (use --timestamps ms --ignore-table backup_exports if your copy of that script has those options; if it does not, say so and use the supplied version from the latest primus-supplied-files.zip).
10. Clean up, and prove it: delete the scratch schema, the decrypted data (it is PLAINTEXT of all ideas and employee emails), the copies and the temporary folder, then empty the Recycle Bin; confirm BACKUP_ENCRYPTION_KEY is no longer set in the session; leave the key file alone (the owner deletes it) and the originals in OneDrive untouched.

Report, in this form: each step PASS or FAIL with the evidence (command and final line, secrets masked); the per-table counts versus the header; the file counts and checks; the boot result; the clean-up proof; and any discrepancy or surprise. If a step fails, stop and report it; do not work around it by touching the live database.
```

## What a good result looks like

| Step | What you want |
|---|---|
| Marker and header | Everything matches |
| Decrypt | Succeeds, and the data checksum matches the header |
| Damaged file, wrong key | **Both fail**, which proves the backup refuses tampering |
| Load into the scratch database | Succeeds into an empty database |
| Row counts | Every table equals what the header recorded |
| Uploaded files | Sizes and checksums match |
| App boots on the copy | Health ok, same fingerprint, same idea count, the same verdict on an idea |
| Clean-up | The plaintext copy and the scratch data are gone |

## After Cursor reports ALL MATCH

1. Delete the key file: `Remove-Item "$env:USERPROFILE\primus-secrets\backup-key.txt"`
2. Check it is gone: `Test-Path "$env:USERPROFILE\primus-secrets\backup-key.txt"` must print `False`.
3. The key stays in your password manager and on paper.
