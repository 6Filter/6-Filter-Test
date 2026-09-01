# Primus.AI

CavinKare’s NPD screening tool for the six-filter paper gate. The primary interface is the **Proposition Form**: BM, CMI, Finance, R&D, Sales, Packaging, and BH Forum fill evidence over time, with a Forum verdict on each filter. Advisory labels (Part 15) check numeric floors as people type. An optional **AI first pass** (Part 16) can suggest empty F1–F4 fields; nothing it produces is saved until a person clicks Accept and then Save.

This is a governance tool. Only BH Forum clears a filter. The AI never writes `forumVerdict` or `finalVerdict`.

## What exists today

- Persistent propositions (Postgres on Render; local JSON file store without `DATABASE_URL`)
- Per-field owners from `lib/propositionFields.js` (shown on the form; login/role enforcement is parked)
- Optional AI first pass (Filter 1 + Filter 4 engines, suggestions only)
- Advisory scoring coverage panel
- Spec landing page, proposition log
- Dormant idea-analysis / category-intelligence paths remain in the repo, unplugged from the primary UI

## Run it locally

1. Copy `.env.local.example` to `.env.local` and set `ANTHROPIC_API_KEY` (server-side only — never `VITE_…` in the browser).
2. `npm install`
3. `npm run dev` and open the URL Vite prints (typically http://127.0.0.1:5173).

Named-account login is in the repo but off. To turn it on later: set `REQUIRE_AUTH=true` and `SESSION_SECRET`, then seed a user with `node scripts/seedUser.js "Name" email@ck.com password ROLE`.

## Production (Render)

Render is the live host: [https://6-filter-test.onrender.com](https://6-filter-test.onrender.com). `server.js` serves the Vite build and `/api/*`. Environment variables on the service:

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Yes — Render Postgres |
| `ANTHROPIC_API_KEY` | Yes for AI first pass / LLM routes |
| `REQUIRE_AUTH` | Optional; set `true` only when turning login back on |
| `SESSION_SECRET` | Required only when `REQUIRE_AUTH=true` |
| `ALLOWED_ORIGIN` | Optional; defaults to `https://6-filter-test.onrender.com` |
| Other model keys | Optional comparison providers |

Vercel-style `api/*.js` handlers still exist as a fallback. They import the **same** CORS, session, and ownership modules as `server.js` — do not copy those rules into a second place.

## Out of scope

- Part 2 lifecycle (Luminar tracking, ticket routing, COO dashboard)
- Real SSO (Okta / Azure AD / Google Workspace) — named-account login is in the repo but parked; the session/role model is meant to survive a later swap
- Cross-instance rate limiting (in-memory, resets on restart; fine for a single Render instance)
- Version history beyond a counter on the proposition row
- A numeric F3 `mrpInr` field for a hard same-price gate
