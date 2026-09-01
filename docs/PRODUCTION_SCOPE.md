# Primus.AI — Production Scope

**Audience:** Internal product, engineering, and IT  
**Status:** Live on Render (`https://primus-ai.onrender.com`) with Postgres + server-side LLM keys  
**Primary UI:** Proposition Form (six-filter evidence record)

---

## 1. Product summary

Primus is CavinKare’s NPD **paper-gate** tool. A proposition is one persistent record. People in named roles fill the fields they own; BH Forum records a binary verdict per filter. Clearing the six filters is not commercial approval — final validation remains at CKR level (v4).

Advisory labels (Part 15) check only the v4 numeric floors that can be checked from what is typed. The optional AI first pass (Part 16) is a draft assist: it never writes the stored proposition, never sets `forumVerdict` / `finalVerdict`, and never overwrites a field a human has already filled.

---

## 2. In scope (what is actually running)

### User-facing
- Sign in with a named email + password (one role per person)
- Spec landing page (the v4 filter text)
- Proposition Form — F1–F6 evidence, Forum verdicts, overall BH Forum verdict
- Fields the current role does not own are disabled in the UI; the server rejects writes anyway
- Log of propositions (open / delete)
- Optional “Run AI first pass” on a proposition (F1/F4 suggestions, F5/F6 explicitly not covered)
- Automated-check coverage panel on the form

### Backend
- `GET/POST /api/auth/login|logout|me` — cookie session (`primus_session`, HttpOnly)
- `GET/POST /api/propositions`, `GET/PUT/DELETE /api/propositions/:id`
- `POST /api/propositions/:id/ai-first-pass`
- Ideas / category-sizing / format-trend / calibration / Claude routes still exist for dormant tools; they require a session
- LLM keys only on the server (`ANTHROPIC_API_KEY`, never a `VITE_` key in the browser)
- Postgres via `DATABASE_URL` (local file store if unset)

### Platform
- Frontend: Vite + React
- Production API + static: Node `server.js` on Render
- Fallback: Vercel `api/*.js` wrappers that share `lib/cors.js`, `lib/auth.js`, and `lib/fieldOwnership.js` with Render — not a second copy of the rules
- DB: Render Postgres in production

### Auth (MVP)
- Roles: `BM`, `CMI`, `FINANCE`, `R&D`, `SALES`, `PACKAGING`, `BH FORUM`, `ADMIN`
- Ownership comes from `lib/propositionFields.js` (`owners` arrays) — not a second matrix
- Seed users with `node scripts/seedUser.js "Name" email@ck.com password ROLE`
- No public registration

### Security notes
- CORS: `Access-Control-Allow-Origin` is set only when `Origin` equals `ALLOWED_ORIGIN` (default `https://primus-ai.onrender.com`), with credentials
- Rate limit: in-memory, 20/min per user on `ai-first-pass`, `category-sizing/run`, `format-trend/run`, and `claude`. Resets on process restart; not shared across instances

---

## 3. Out of scope

- Part 2: Luminar pipeline tracking, ticket routing, COO dashboard
- Real SSO (Okta, Azure AD, Google Workspace) — planned as a swap of how a session is established, not a rebuild of roles
- Admin UI for adding/removing users
- Redis / shared rate-limit store
- Full version history (today: a version **counter** on the row)
- Hard F3 same-price gate from a numeric `mrpInr` field
- Treating Filters 5–6 as AI-scorable

---

## 4. How a proposition moves

```
Sign in  →  Spec page  →  NPD Screen (new or existing proposition)
                         →  fill owned fields over weeks
                         →  optional AI first pass (Accept per field)
                         →  Save for the team
                         →  BH Forum records forumVerdict / finalVerdict
```

The retired Novelty / Market / Evidence scorecard and client-side API key flow are **not** how this app works anymore. Those files may still exist on disk as dormant code.

---

## 5. Ops / env ownership

| Item | Notes |
|------|--------|
| Render web `primus-ai` | Production |
| Render Postgres `primus-ai-db` | `DATABASE_URL` |
| `SESSION_SECRET` | Required; rotate if leaked |
| `ANTHROPIC_API_KEY` | Server only |
| `ALLOWED_ORIGIN` | Defaults to the Render URL |
| User seeding | Engineering, via `scripts/seedUser.js` |
| Filter / owner schema | Product + the v4 document; coded in `lib/propositionFields.js` |

---

## Related

- `README.md` — local run
- `docs/BACKEND_API.md` — older ideas-table notes (partially stale)
- `lib/propositionFields.js` — field owners (source of truth for write access)
