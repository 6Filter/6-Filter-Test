# The 2-hour window: getting the Claude admin to add the connector before the weekend

**Facts this plan rests on.** The connector address is `https://ck-6-filter-test-88wu.onrender.com/mcp`. It answers 404 now (switched off). The pilot allowlist and the admin panel are **not built yet**, so while the connector is ON, any company person who signs in could connect. Claude's "Add custom connector" step may refuse an address that answers 404 (I cannot verify how it behaves). Adding the connector grants no access by itself: access is decided by your server, so the connector can sit in Claude, inert, while your server is off.

**The idea:** keep the server **on only while the admin adds it**, prove it safe first, and switch it **off again straight after**. Colleagues cannot use it over the weekend; on Monday Cursor finishes the allowlist and you switch it on for two named people.

## Part A — before you contact the admin (about 20 minutes)

1. **One edit in Render, one redeploy.** In the web service's Environment change **both** at once:
   - `SESSION_SECRET` = a new value you generate yourself: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (this signs everyone out and kills tokens issued before the fix);
   - `MCP_ENABLED` = `true`.
   Save once; wait for the deploy to finish (a few minutes). You will be signed out of the website too: sign in again with your Slack code.
2. **Run the signed-in probe yourself** on your own PC (needs Node, nothing else):
   `node scripts\probeMcpSurface.mjs --url https://ck-6-filter-test-88wu.onrender.com/mcp --login --try-registration`
   Open the address it prints, sign in with your work email (the code arrives in Slack). Wait for the result.
3. **The decision (do not skip it):**
   - **Every line PASS** (A1 three tools only: `list_ideas`, `open_idea`, `read_verdict`; A2 and A3 the token refused on the website API and as a cookie; A4; A5a, A5b, A5c all PASS) **and the exit is clean: go to Part B.**
   - **A5b or A5c INCONCLUSIVE:** wait three minutes and run it again. Do not treat it as a pass.
   - **Any FAIL, above all A1, A2 or A3:** set `MCP_ENABLED=false` at once, do **not** contact the admin, and send me the output.

## Part B — message the admin (the address is live now)

Send this (it is the same request as `Message_To_Claude_Admin.md`, with the timing changed):

> Hi, the address is live **now** and will be for about the next hour, so this is the moment to add the connector. Please add it as a custom connector (Organization settings, Connectors, Add, Custom, Web): name `6 Filter Test (read-only pilot)`, URL `https://ck-6-filter-test-88wu.onrender.com/mcp`, OAuth client left on "Use Claude's published identity", request headers empty, **no API key or secret**. **Please do not announce it or tell anyone to connect**, and if the console has a per-connector switch for members, leave it off. When it is added, please tell me exactly what Claude showed you (any error text, and the list of tools: it must be exactly `list_ideas`, `open_idea`, `read_verdict`; if you see anything about save, upload or screen, do not enable it). I will switch the address off again right after, so nothing else is needed from you today. Thank you.

While he works, watch the admin audit if you can; otherwise just wait for his reply.

## Part C — as soon as he reports back (this part cannot wait for the weekend)

1. **Whatever he says, set `MCP_ENABLED=false` in Render and save.** Confirm `https://ck-6-filter-test-88wu.onrender.com/mcp` answers 404 again.
2. **If the add worked:** the connector now sits inert in Claude. Nobody can connect while your server is off. Good.
3. **If Claude refused it:** nothing is lost. Ask him to try again on Monday, when you will have the allowlist and can switch the server on for the add.
4. **If anyone connected in the window** (you will see their emails in the audit once the panel exists, or ask the admin): their tokens die as soon as the server is off, and on Monday the allowlist (which checks every call) will refuse anyone not on the pilot list.

## Part D — Monday

1. Cursor builds the allowlist and the admin panel (`Primus-AI_MCP_Pilot_Readiness_Cursor_Prompt.md`), deployed with the connector off.
2. You set `MCP_ALLOWED_EMAILS` to the two pilot emails, then `MCP_ENABLED=true`.
3. You rerun the signed-in probe. All PASS.
4. The two pilot people connect; check the audit; add more people one at a time.

## Stop rules for the weekend

- **Never leave the server on and unwatched** once the admin has finished: the allowlist does not exist yet.
- **Never skip the signed-in probe** before telling the admin the address is live.
- **Never ask the admin to enable it for members** until the allowlist is built and tested.
- If you are unsure at any point, set `MCP_ENABLED=false`. Nothing in this plan is lost by switching it off.
