# Primus.AI — Production Scope

**Audience:** Internal product, engineering, and IT  
**Status:** Live on Render (`https://ck-6-filter-test.onrender.com`) with Postgres + server-side LLM keys  
**Primary UI:** Proposition Form (six-filter evidence record)

---

## 1. Product summary

Primus is CavinKare’s NPD **paper-gate** tool. A proposition is one persistent record. Owner tags on the form show who should fill each field; BH Forum records a binary verdict per filter. Clearing the six filters is not commercial approval — final validation remains at CKR level (v4).

Advisory labels (Part 15) check only the v4 numeric floors that can be checked from what is typed. The optional AI first pass (Part 16) is a draft assist: it never writes the stored proposition, never sets `forumVerdict` / `finalVerdict`, and never overwrites a field a human has already filled.

---

## 2. In scope (what is actually running)

### User-facing
- Spec landing page (the v4 filter text)
- Proposition Form — F1–F6 evidence, Forum verdicts, overall BH Forum verdict
- Owner tags on fields (who *should* fill them); individual email/password login is on by default (`REQUIRE_AUTH=false` parks it)
- Log of propositions (open / delete)
- Optional research on first Submit of a proposition (F1/F3/F4/F5 suggestions; F6 explicitly not covered)
- Automated-check coverage panel on the form

### Backend
- `GET/POST /api/auth/login|logout|me` — cookie session (`primus_session`, HttpOnly)
- `GET/POST /api/propositions`, `GET/PUT/DELETE /api/propositions/:id`
- `POST /api/propositions/:id/ai-first-pass` (retired — research runs once on first Submit via `PUT /api/propositions/:id`)
- Ideas / category-sizing / format-trend / calibration / Claude routes still exist for dormant tools
- LLM keys only on the server (`ANTHROPIC_API_KEY`, never a `VITE_` key in the browser)
- Postgres via `DATABASE_URL` (local file store if unset)

### Platform
- Frontend: Vite + React
- Production API + static: Node `server.js` on Render
- Fallback: Vercel `api/*.js` wrappers that share `lib/cors.js`, `lib/auth.js`, and `lib/fieldOwnership.js` with Render — not a second copy of the rules
- DB: Render Postgres in production

### Auth (parked)
- Code for named accounts and field-ownership enforcement is in the repo
- Individual login is **on** by default (register + sign-in with email). Set `REQUIRE_AUTH=false` to park it. Production still needs `SESSION_SECRET`.
- Roles when turned on: `BM`, `CMI`, `FINANCE`, `R&D`, `SALES`, `PACKAGING`, `BH FORUM`, `ADMIN`

### Security notes
- CORS: `Access-Control-Allow-Origin` is set only when `Origin` equals `ALLOWED_ORIGIN` (default `https://ck-6-filter-test.onrender.com`), with credentials
- Rate limit: in-memory, 20/min per user on proposition Submit research path, `category-sizing/run`, `format-trend/run`, and `claude`. Resets on process restart; not shared across instances

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
Spec page  →  NPD Screen (new or existing proposition)
           →  fill fields over weeks
           →  optional AI first pass (Accept per field)
           →  Save for the team
           →  BH Forum records forumVerdict / finalVerdict
```

The retired Novelty / Market / Evidence scorecard and client-side API key flow are **not** how this app works anymore. Those files may still exist on disk as dormant code.

---

## 5. Ops / env ownership

| Item | Notes |
|------|--------|
| Render web `ck-6-filter-test` | Production (`https://ck-6-filter-test.onrender.com`) |
| Render Postgres `primus-ai-db` | `DATABASE_URL` (shared DB; service name unchanged) |
| `REQUIRE_AUTH` | On by default; set `false` to park named accounts |
| `SESSION_SECRET` | Required in production; rotate if leaked |
| `ANTHROPIC_API_KEY` | Server only |
| `ALLOWED_ORIGIN` | Defaults to the Render URL |
| User seeding | Only when turning login on; `scripts/seedUser.js` |
| Filter / owner schema | Product + the v4 document; coded in `lib/propositionFields.js` |

---

## Related

- `README.md` — local run
- `docs/BACKEND_API.md` — older ideas-table notes (partially stale)
- `lib/propositionFields.js` — field owners (source of truth for write access)
