# 6 Filter Test — Cursor prompt: finish the MCP pilot so the Claude admin can add the connector

The connector is OFF (`MCP_ENABLED=false`, `/mcp` answers 404) and must stay off until the owner switches it on. This prompt finishes what is left. **Do not set `MCP_ENABLED`, do not change `SESSION_SECRET`, do not generate or store any secret: the owner does those.** Never edit a supplied test. Send me a report in the usual form (what you did, evidence with secrets masked, defects with severity, what you wait for).

## 0. Be on the latest supplied files
Re-extract the newest `primus-supplied-files.zip` over the repository (the probe changed again: a rate-limit reply is no longer counted as a refusal). `MANIFEST.sha256` must match. Run `scripts/testProbeMcpSurface.mjs` untouched: **26 checks must pass**. Run the off-mode live probe and report its lines (`OFF` PASS, `M5`, `M6`).

## 1. The pilot allowlist (fail closed)
Environment variable `MCP_ALLOWED_EMAILS`: a comma-separated list; each entry trimmed, compared in lower case, exact match (no prefix, no domain wildcard, no plus-address stripping).
- **Unset or empty: nobody** can use the connector. **A single `*`: every signed-in company user.** **A list: only those people.**
- Enforced at **two points**: (a) when the authorization code is issued, after the normal email-code sign-in: a person not on the list gets a clear page ("This connector is in a limited pilot") and **no authorization code, access token or refresh token is issued**; (b) on **every MCP call and every token refresh**: removing an email stops that person's existing tokens at their next call.
- Every refusal is audited (who, when, which step), without any token.
- The list is read from the environment on each request (or at most a 60-second cache) so the owner can change it in Render and it takes effect without a code change.
- Nothing the client sends can influence it (the email comes only from the signed-in session).

## 2. A small admin panel (the owner runs this alone)
In Settings, for an Admin only (server-enforced): an **MCP connector** panel showing: whether the connector is on (`MCP_ENABLED`), the allowlist mode (`nobody`, `everyone`, or the count of people), the number of MCP tokens issued and still valid, the last 50 audit rows (who, tool, idea id, when, how many results, success or failure, and denied attempts), and a **Revoke** button per person that calls the existing revoke action and shows the result. A member or a signed-out visitor must get 401 or 403 on every one of these endpoints.

## 3. Tests (you write them; they must fail without the feature)
- A listed email obtains a token and can call the three read tools; an unlisted email sees the pilot page and obtains **nothing**; case and surrounding spaces do not matter; `a@x.com` does not match `aa@x.com` or `a@x.com.evil.example`.
- `MCP_ALLOWED_EMAILS` unset: nobody can sign in. `*`: everyone can. A list: only the list.
- Remove an email while its token is valid: the next tool call and the next refresh are refused.
- Every refusal and every tool call appears in the audit; none contains a token or idea text.
- The admin panel endpoints refuse a member and a signed-out request.
- Re-run the existing MCP tests (token separation, registration forms, read-tool access, one-hour tokens, refresh reuse) and the supplied probe test: all still pass.

## 4. Documentation
Write `docs/MCP_PILOT.md`: how the owner switches the connector on and off, how to add or remove a pilot email, how to revoke someone, how to read the audit, what to do if misuse is suspected (set `MCP_ENABLED=false`, change `SESSION_SECRET`, review the audit), and the exact order of the pilot: the owner's `--login` probe, then the admin adds the connector, then the first pilot person connects. Update `docs/OPERATIONS.md` with the new variables.

## 5. Ship it, switched off
One commit, the private repository first, the normal deploy path second. After the deploy, `/mcp` must still answer 404 and the off-mode live probe must still report `OFF` PASS. Report the commit.

## 6. After the owner switches it on and runs the signed-in probe
The owner will send you the probe output and the panel's audit rows. Check them against the checklist: A1 to A5 PASS (A5b and A5c PASS, not INCONCLUSIVE), the probe's own calls appear in the audit, the revoke action makes the probe's token fail on its next call, and an unlisted test account is refused. Report; do not turn anything on yourself.

**Done when:** the 26-check probe test passes untouched, the allowlist and panel are built and tested, `docs/MCP_PILOT.md` exists, the commit is deployed with the connector still off, and the report is sent.
