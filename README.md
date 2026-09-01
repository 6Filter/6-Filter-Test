# Primus.AI

CavinKare’s NPD screening tool for the six-filter paper gate. The primary interface is the **Proposition Form**: BM, CMI, Finance, R&D, Sales, Packaging, and BH Forum fill evidence over time, with a Forum verdict on each filter. Advisory labels (Part 15) check numeric floors as people type. An optional **AI first pass** (Part 16) can suggest empty F1–F4 fields; nothing it produces is saved until a person clicks Accept and then Save.

This is a governance tool. Only BH Forum clears a filter. The AI never writes `forumVerdict` or `finalVerdict`.

## What exists today

- Persistent propositions (Postgres on Render; local JSON file store without `DATABASE_URL`)
- Per-field owners from `lib/propositionFields.js`
- Named accounts (email + password, one role per person) with server-side field-ownership enforcement
- Optional AI first pass (Filter 1 + Filter 4 engines, suggestions only)
- Advisory scoring coverage panel
- Spec landing page, proposition log
- Dormant idea-analysis / category-intelligence paths remain in the repo, unplugged from the primary UI

## Run it locally

1. Copy `.env.local.example` to `.env.local` and set:
   - `ANTHROPIC_API_KEY` (server-side only — never `VITE_…` in the browser)
   - `SESSION_SECRET` (any long random string locally)
2. `npm install`
3. Seed at least one user (no public signup):

       node scripts/seedUser.js "Your Name" you@cavinkare.com a-password BM

   Roles: `BM`, `CMI`, `FINANCE`, `R&D`, `SALES`, `PACKAGING`, `BH FORUM`, `ADMIN`.

4. `npm run dev` and open the URL Vite prints (typically http://127.0.0.1:5173).

## Production (Render)

Render is the live host: [https://primus-ai.onrender.com](https://primus-ai.onrender.com). `server.js` serves the Vite build and `/api/*`. Environment variables on the service:

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Yes — Render Postgres |
| `SESSION_SECRET` | Yes — signed cookies fail loudly without it |
| `ANTHROPIC_API_KEY` | Yes for AI first pass / LLM routes |
| `ALLOWED_ORIGIN` | Optional; defaults to `https://primus-ai.onrender.com` |
| Other model keys | Optional comparison providers |

Seed production users the same way, with `DATABASE_URL` set in the shell (or Render’s one-off job). There is no admin UI for users yet.

Vercel-style `api/*.js` handlers still exist as a fallback. They import the **same** CORS, session, and ownership modules as `server.js` — do not copy those rules into a second place.

## Out of scope

- Part 2 lifecycle (Luminar tracking, ticket routing, COO dashboard)
- Real SSO (Okta / Azure AD / Google Workspace) — email+password is a documented stopgap; the session/role model is meant to survive a swap
- Cross-instance rate limiting (in-memory, resets on restart; fine for a single Render instance)
- Version history beyond a counter on the proposition row
- A numeric F3 `mrpInr` field for a hard same-price gate
