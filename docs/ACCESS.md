# Access control — Slack sign-in and idea visibility

## Sign-in

People sign in with their CavinKare email. The server looks them up in Slack and DMs a 6-digit code (HMAC-stored, 10 minutes, one use). There is no password and no self-registration.

Environment (never commit secrets):

| Variable | Role |
|----------|------|
| `SLACK_BOT_TOKEN` | Bot scopes: `users:read`, `users:read.email`, `chat:write`, `im:write` |
| `LOGIN_CODE_SECRET` | HMAC key for codes (≠ `SESSION_SECRET`) |
| `ALLOWED_EMAIL_DOMAINS` | Default `cavinkare.com` |
| `SESSION_HOURS` | Default `24` |
| `SLACK_WEBHOOK_URL` | Manager review + Slack-down alerts |
| `ADMIN_BOOTSTRAP_EMAILS` | Comma-separated; while **no** ADMIN exists, first successful Slack sign-in of a listed email becomes ADMIN. Then ignored. |
| `SESSION_SECRET` | Session cookie signing |
| `DATABASE_URL` | Required for auth (no disk fallback) |
| `TRUST_CLOUDFLARE` | Set to `1` only behind Cloudflare so `CF-Connecting-IP` is trusted; otherwise the right-most `X-Forwarded-For` entry is used |

Session cookie: HttpOnly, Secure on Render/HTTPS, SameSite=Lax, payload `{ userId, tokenVersion, iat, exp }` (`exp = iat + SESSION_HOURS`). Tokens without `exp` or `tokenVersion`, or past `exp`, are refused on the server (not only by the browser cookie). Disabling an account or “sign out everywhere” bumps `token_version` and ends older sessions.

First sign-in creates `users` row: Slack name, email, `status=active`, `role=BM` (or ADMIN via bootstrap). If the email is in `business_head_teams`, role becomes **BH FORUM** at sign-in and at `/api/auth/me` (audited). Leaving that table removes BH access immediately. The person must pick one of the 18 teams before the form opens; only an ADMIN can change it later.

**Verify when Slack is down:** if Slack is unreachable at verify time, a still-valid code is accepted (it was issued minutes earlier). If Slack is reachable, deactivated / guest / bot accounts are refused.

Break-glass: `node scripts/issueLoginCode.mjs <email>` (ADMIN only, audited). Role changes: Admin screen or `node scripts/setRole.mjs <email> <ROLE>`.

**First admin:** set `ADMIN_BOOTSTRAP_EMAILS=tanmay.v@cavinkare.com` in Render. Tanmay’s first Slack sign-in becomes the only ADMIN via bootstrap. Further roles change only on the Admin screen or `setRole.mjs`.

## Visibility

Keyed on `propositions.created_by_email` (normalised), with an additional **R&D org chart** in `lib/orgHierarchy.js`. At login, the viewer’s **email** is matched to the chart first (then Slack/display name as fallback). Idea owners are matched the same way (`created_by_email`, then `submitterName`).

| Actor | Sees |
|-------|------|
| Individual / team member | Ideas where `created_by_email` equals their email |
| Team lead (org chart) | Own ideas + ideas submitted by their charted reportees |
| Unit head (e.g. CQM / K Kavitha) | Own ideas + ideas from everyone under that unit on the chart |
| Department business head (org chart / Sridhar Rajam) | Own ideas + every idea on team **R&D**, and everyone under them on the chart |
| BH FORUM (email in `business_head_teams`) | Own ideas + ideas whose team is in that mapping (legacy names via `legacy_team_map`). Decided from the table, not only the stored role. |
| ADMIN | Every idea (including legacy NPD / Marketing until reassigned) |

Distinct ABC leads: Navin Kumar (`navin.d@…`, Corporate Quality Assurance – ABC), Naveen Kumar S (`naveenkumar.s@…`, Product Development – ABC), Soumen Bera (`soumen.s@…`, Product Development – ABC). Navin’s three CQA ABC reportees are still unnamed on the deck.

Unassigned ideas (no creator email): ADMIN, and the business head of the idea’s team after `legacy_team_map`.

NPD and Marketing are **retired as teams**. Their existing ideas stay in the database, show as `Legacy: NPD` / `Legacy: Marketing`, and are **ADMIN-only** until an ADMIN uses **Reassign team** (one idea or a selection → one of the 18 teams, audited). Nothing is deleted.

One function — `canAccessIdea` in `lib/propositionAccess.js` — gates every list and by-id idea handler.

## Teams (18)

Ambient & Beverages; CC; CIA; Digital Marketing; FD and Dairy; IB; Manufacturing; Manufacturing and Commodities; MED; Media; Packaging Development; PC; Pets Division; R&D; Sales & Distribution FMCG; Sales & Distribution PPD; SN; Strategic Purchase.

Stored legacy values are never blanked on read/save. New selections must be one of the 18.

Manufacturing and Manufacturing and Commodities stay separate (different business heads).

## Business heads

Import `Primus-AI_BusinessHeads_TeamMapping.csv` (gitignored) via Admin or `node scripts/importBusinessHeadTeams.mjs`. Emails lower-cased; 18 heads ↔ 18 teams.

## Still needed from the owner

- Slack bot token in Render (never in chat).
- CSV of `submitter_name,email` for existing ideas so people regain ownership of earlier work (Master assign-owner import).
