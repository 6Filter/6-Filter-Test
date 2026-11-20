# MCP pilot: the read-only Claude connector

The connector lets a person ask their own Claude about ideas and verdicts. It is **read only**: three tools, `list_ideas`, `open_idea` and `read_verdict`. It cannot submit, save, upload, screen, or change anything. People still submit ideas on the website.

Each person sees only the ideas their team can already see on the website. The text of an idea appears in their Claude conversation, under your Claude workspace's retention settings.

The connector has its own sign-in and its own tokens. A connector token is refused on the website, and a website session is refused on the connector.

## The three switches (all in Render, Environment)

| Name | Meaning |
| --- | --- |
| `MCP_ENABLED` | `true` turns the connector on. Anything else, or unset, turns it off: `/mcp` and its sign-in addresses answer 404. |
| `MCP_ALLOWED_EMAILS` | Who may sign in. **Unset or empty: nobody.** A single `*`: every signed-in company user. A comma-separated list: only those emails. |
| `SESSION_SECRET` | The website's signing secret. Changing it signs everyone out of the website and ends every connector token. You generate it; nobody else sees it. |

Matching is exact: each entry is trimmed and compared in lower case. There is no prefix match, no domain wildcard (`*@company.com` matches nobody), no plus-address stripping, and a `*` inside a list is just text. The list is read on every request, so a change takes effect when Render has applied it. No code change is needed.

Optional: `MCP_ABSOLUTE_SESSION_DAYS` (default 7, at most 30) is how long a person can stay connected before they sign in again. Access tokens last at most one hour.

Render restarts the service when you save an environment change. Watch the deploy go Live before you rely on it.

## Switch the connector on or off

1. Render, the web service, Environment.
2. Set `MCP_ENABLED` to `true` (on) or `false` (off). Save.
3. Check: `https://<host>/mcp` answers 401 when on and 404 when off.

Off is always safe. It does not affect the website.

## Add or remove a pilot person

1. Edit `MCP_ALLOWED_EMAILS` in Render: add or remove the work email. Save.
2. **Add:** the person can now sign in. They type their email on the connector's sign-in page and enter the code that arrives in Slack.
3. **Remove:** the person's existing tokens stop working at their next call or refresh, and they are revoked at that moment. They cannot sign in again.

Anyone not on the list who tries to sign in sees "This connector is in a limited pilot". No Slack code is sent to them, no token is issued, and the attempt is audited.

## Revoke one person now

Settings, **MCP connector**, find the person under "People holding a token", press **Revoke**. The panel says who was revoked. Their token fails on its next call and cannot refresh. A revoke is not a ban: if they are still on the list they can sign in again. To keep them out, remove their email from `MCP_ALLOWED_EMAILS` as well.

The same action is `POST /api/admin/mcp/revoke` with `{"userId": "..."}`, for an Admin only.

## Read the audit

Settings, **MCP connector** shows the last 50 rows: when, who (by email), what, which idea, how many results, and whether it was done or refused. The full last 200 rows are at `GET /api/admin/mcp/audit` (Admin only). Rows are kept 90 days.

What you will see in "what":
- `list_ideas`, `open_idea`, `read_verdict`: a tool call. Calls to a turned-off tool (`save_draft`, `upload_evidence`, `screen_idea`) also appear, as refused.
- `sign_in_refused`: someone not on the list tried to sign in.
- `token_refused`: a token or refresh was refused because the person is no longer on the list.
- `call_refused`: a call was refused for the same reason.
- `revoked_by_admin`: an Admin pressed Revoke for that person.

Rows never hold a token or the text of an idea. Admin pages are Admin only. A member gets 403 and a signed-out visitor gets 401.

## If misuse is suspected

1. Set `MCP_ENABLED=false` in Render. Do this first.
2. Change `SESSION_SECRET` to a new value you generate. Everyone is signed out of the website and every connector token ends. Tell people to sign in again.
3. Review the audit (the panel, then `/api/admin/mcp/audit`) for who signed in and what was read.
4. Tell the Claude admin to remove the connector if you want it gone from the workspace.

## The order of the pilot

1. **Allowlist first.** Set `MCP_ALLOWED_EMAILS` to the pilot emails (two, to start).
2. **Switch on.** Set `MCP_ENABLED=true`.
3. **The owner's signed-in probe**, once, from your own PC, signing in in the browser:
   `node scripts/probeMcpSurface.mjs --url https://<host>/mcp --login --try-registration`
   It must show **A1 to A5 and M1 to M8 all PASS**, with A5b and A5c as PASS (INCONCLUSIVE is not a pass; wait a few minutes and run it again). Any FAIL: set `MCP_ENABLED=false` at once.
4. **Then the Claude admin adds the connector** (Organization settings, Connectors, Add, Custom, Web), name `6 Filter Test (read-only pilot)`, URL `https://<host>/mcp`, no key and no headers. The tool list must show exactly the three tools above.
5. **Then the first pilot person connects.** Watch the panel for their first sign-in and calls.
6. Add one team at a time, checking the audit after each.
