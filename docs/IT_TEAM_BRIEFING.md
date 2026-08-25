# 6 Filter Test — Logic Briefing for IT Team

**Purpose:** Explain how Primus works end-to-end for IT / engineering stakeholders  
**Live app:** Vercel (e.g. `https://primus-ai-nine.vercel.app`)  
**Repo:** `https://github.com/johngeorgegejo-dev/Primus-AI`

---

## 1. What the tool does (one paragraph)

6 Filter Test is an FMCG **NPD screening engine**. A user enters a product idea. The **server** calls **Claude (Anthropic)** to score Novelty, Market Relevance, and Evidence. The app then calculates a **Phase-1 score out of 60**, status (Approved / Promising / Rejected), revenue band, and gram classification (10g / 100g / 1000g). The full result is saved in **PostgreSQL** and can be reopened from the **Log** tab.

Phase 1 = **60 of 100** final points. Phase 2 (consumer validation, 40 points) is future scope.

---

## 2. System architecture

```
┌──────────────┐      HTTPS       ┌─────────────────────┐      HTTPS       ┌──────────────┐
│ Browser      │ ───────────────► │ Vercel              │ ───────────────► │ Anthropic    │
│ React (Vite) │                  │  - Static UI        │                  │ Claude API   │
│              │ ◄─────────────── │  - Serverless APIs  │ ◄─────────────── │              │
└──────────────┘   JSON result    │    /api/ideas       │   model JSON     └──────────────┘
                                  │    /api/claude      │
                                  └──────────┬──────────┘
                                             │ SQL
                                             ▼
                                  ┌─────────────────────┐
                                  │ PostgreSQL (Neon)   │
                                  │ table: ideas        │
                                  └─────────────────────┘
```

| Layer | Technology | Role |
|-------|------------|------|
| Frontend | Vite + React | UI only — no API keys |
| API | Vercel serverless (`/api/*`) | Analyze, save, list, Claude proxy |
| LLM | Anthropic Claude | Scores idea dimensions |
| Database | PostgreSQL (Neon) | Stores ideas + full scorecards |
| Secrets | Vercel Environment Variables | `ANTHROPIC_API_KEY`, `DATABASE_URL` |

**Important for IT:** The browser never holds the Claude key. All Anthropic calls go through the server.

---

## 3. User / process flow

1. User opens Primus → **Validate** tab  
2. Enters idea (+ optional image) → **Run validation**  
3. Browser calls `POST /api/ideas`  
4. Server:
   - Calls Claude with Primus scoring prompt  
   - Parses JSON scores  
   - Computes Phase-1, status, revenue, gram weight  
   - Inserts row into Postgres `ideas`  
5. UI shows scorecard  
6. User can open **Log** → `GET /api/ideas` → click row → `GET /api/ideas/:id`  

Optional: **Forward to manager** drafts a message via `POST /api/claude` (does not auto-email).

---

## 4. Scoring logic (business rules in code)

### Claude returns (0–100 each)

| Dimension | Weight | Meaning |
|-----------|--------|---------|
| Novelty | 40% | Differentiation / right to win |
| Market Relevance | 30% | Fit to India consumer trends |
| Evidence | 30% | Reason to believe (pilots, data) |

### Phase-1 formula

```
weighted = (Novelty × 0.4) + (Market × 0.3) + (Evidence × 0.3)
Phase1   = weighted × 0.6
```

**Result = Score / 60**

### Status

| Score / 60 | Status |
|------------|--------|
| > 40 | Approved (green) |
| 30 – 40 | Promising (amber) |
| < 30 | Rejected (red) |

### Matrix display (X/5)

```
X/5 = round(score_100 / 20)   # clamped 1–5
```

### Revenue

1. Prefer Claude’s `revenuePotentialCrores`  
2. If missing → estimate from Phase-1 score  

### Gram classification (commercial weight)

| Revenue | Classification |
|---------|----------------|
| < ₹1 Cr | **10g** |
| ₹1 – 12 Cr | **100g** |
| > ₹12 Cr | **1000g** |

---

## 5. APIs IT should know

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/ideas` | Analyze idea + save to DB |
| `GET` | `/api/ideas?limit=50` | List history (Log tab) |
| `GET` | `/api/ideas/:id` | Load one full scorecard |
| `POST` | `/api/claude` | Claude proxy (manager draft) |

Main validation path: **`POST /api/ideas`** (not client-side scoring).

---

## 6. Database

**Engine:** PostgreSQL (Neon / Vercel Postgres)  
**Env:** `DATABASE_URL=postgresql://…`

**Table `ideas` (auto-created):**

| Column | Type | Content |
|--------|------|---------|
| `id` | TEXT PK | UUID |
| `idea_text` | TEXT | User idea |
| `image_json` | TEXT | Optional image metadata |
| `status` | TEXT | e.g. analyzed |
| `phase1_score` | DOUBLE | Score / 60 |
| `result_json` | TEXT | Full scorecard JSON |
| `created_at` | TIMESTAMPTZ | Timestamp |

**Raw data access:** Neon console → SQL Editor → `SELECT * FROM ideas ORDER BY created_at DESC;`

---

## 7. Environment variables (production)

| Variable | Where | Purpose |
|----------|--------|---------|
| `ANTHROPIC_API_KEY` | Vercel env | Claude access (server only) |
| `ANTHROPIC_MODEL` | Vercel env | e.g. `claude-sonnet-4-5-20250929` |
| `DATABASE_URL` | Vercel env | Postgres connection string |

**Do not** use `VITE_ANTHROPIC_API_KEY` — that would expose the key in browser JS.

After any env change → **Redeploy** on Vercel.

---

## 8. Security model (for IT review)

| Topic | How Primus handles it |
|-------|------------------------|
| LLM key | Server-only; never in frontend bundle |
| Git | `.env.local` gitignored; secrets not in repo |
| Errors | API key patterns redacted from responses |
| DB | Hosted Postgres via TLS connection string |
| Auth / SSO | **Not in current release** (open URL access) |

**Gap for production hardening:** add authentication / network restriction if required by IT policy.

---

## 9. Deploy / change process

```
Developer commits → GitHub main → Vercel auto-build → Live site + APIs
```

Local:

```powershell
cd D:\primus-app
npm install
npm run dev
```

Requires local `.env.local` with `ANTHROPIC_API_KEY` (+ optional `DATABASE_URL`).

---

## 10. What is NOT in this release

- Phase-2 consumer validation  
- Login / SSO / RBAC  
- Auto email to managers  
- Investment vs Revenue quadrant grid (proposed later)  
- MySQL (Postgres only)

---

## 11. Talking points for IT meeting

1. **Primus is a Vite React app on Vercel** with serverless APIs.  
2. **Claude runs only on the server**; key is in Vercel env.  
3. **Every validation is stored in PostgreSQL** (Neon).  
4. **Scoring rules are deterministic in code** after Claude returns 0–100 dimensions.  
5. **Log tab** reads history from DB via `/api/ideas`.  
6. **Next IT-sensitive items:** auth, monitoring, key rotation, backup of Neon.

---

## Related internal docs

| Doc | Content |
|-----|---------|
| `PRODUCTION_SCOPE.md` | Scope / in-out / checklist |
| `PRIMUS_SCORING_LOGIC.md` | Detailed formulas |
| `BACKEND_API.md` | API + schema |
| `API_KEY_BEST_PRACTICES.md` | Secret handling |
| `INVESTMENT_VS_REVENUE_GRID.md` | Future feature proposal |

---

**Owner note:** Product owns scoring rubric; Engineering owns deploy/API; IT owns network/access policy and secret rotation standards.
