# Daily probe

The probe submits one fixed idea, reads that row back, and checks that the name, category, description, and filters F1 to F4 are populated. It files the idea under **NPD**, with submitter name Live Check. The fixed text lives in `scripts/probeIntegrity.mjs`.

Reuse one row. Set `PRIMUS_PROBE_ID` to the id printed the first time the job creates a row. The next run updates that same row instead of adding another idea each morning.

## Cost

The first successful submit is a full research pass. After that, identical inputs are a research-cache hit, so later days should cost about zero model tokens.

The earlier Live Check runs were not cache hits. Stored durations were 143 to 170 seconds, and the findings hash changed from day to day.

Confirm a later day from Master unlock at `GET /api/billing/usage`. In the NPD rows for that day, `cache_read_tokens` should account for the probe and `input_tokens` plus `output_tokens` should stay near zero for that call. A large `output_tokens` figure means the job sent different inputs and paid for a full pass.

## Secrets

The team password (`PRIMUS_PROBE_PASSWORD`) and the probe token (`PRIMUS_PROBE_TOKEN`) live only in the automation's secret store and in the server environment. They are never written into the repo, a chat, or a log. The script reads them and does not print them.

The server accepts `probe: true` only when the request header `X-Primus-Probe-Token` matches `PRIMUS_PROBE_TOKEN`, compared in constant time. A `probe` field in a normal save is ignored. A plain `X-Primus-Probe: 1` header does nothing. A wrong token is rejected.

## This writes to production

The job creates or updates a real idea and runs research on the first day. That conflicts with a rule that production checks must be read-only. Run it against production only after the owner approves that write.

The script refuses a base URL on `onrender.com` unless `PRIMUS_PROBE_ALLOW_REMOTE=1` is set on that job.

`scripts/flagProbes.mjs` can mark the old Live Check rows (`likelyProbe = yes`) without deleting them. It is a dry run until `--apply`. It refuses a non-local database unless `FLAG_PROBES_ALLOW_REMOTE=1`. The owner decides when to run it on the live database.

## Daily line

```
node scripts/probeIntegrity.mjs
```

Set `PRIMUS_BASE_URL`, `PRIMUS_PROBE_DEPARTMENT` (NPD), `PRIMUS_PROBE_PASSWORD`, `PRIMUS_PROBE_TOKEN`, `PRIMUS_PROBE_ID`, and, only with the owner's approval, `PRIMUS_PROBE_ALLOW_REMOTE=1`. The process prints `PROBE INTEGRITY OK` or exits 1.
