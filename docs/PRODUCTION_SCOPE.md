# 6 Filter Test — Production Scope & Process Flow

**Audience:** Internal product, engineering, and IT stakeholders  
**Purpose:** Scope the current 6 Filter Test tool and process flow for production readiness  
**Status:** Live on Vercel with Claude + PostgreSQL  
**Related docs:** `PRIMUS_FULL_FLOW.md`, `PRIMUS_SCORING_LOGIC.md`, `BACKEND_API.md`, `API_KEY_BEST_PRACTICES.md`

---

## 1. Product summary

**6 Filter Test** is CavinKare’s NPD screening engine. Field / product teams submit an FMCG idea; the system runs a Phase-1 LLM validation, scores Novelty / Market Relevance / Evidence, estimates revenue and gram weight, and stores the result for later review.

| Phase | Scope | Points |
|-------|--------|--------|
| **Phase 1** (in production now) | LLM validation + scorecard + persistence | 60 / 100 |
| **Phase 2** (future) | Consumer validation after manager greenlight | 40 / 100 |

---

## 2. In scope (current production tool)

### User-facing
- Submit product idea (text, or PDF / Word / image)
- Download the final report as PDF or Word
- Run Phase-1 validation via Claude
- View scorecard (score /60, status, matrix X/5, revenue, classification, TAM, critique, pivot)
- Audio briefing (browser speech)
- Draft “forward to manager” message
- **Log tab** — browse saved validation history; open full results
- Recent runs on compose sidebar

### Backend
- `POST /api/ideas` — analyze + save
- `GET /api/ideas` — list history
- `GET /api/ideas/:id/export?format=pdf|docx` — download the screen report
- `POST /api/claude` — Claude proxy (manager draft)
- Anthropic key server-side only (`ANTHROPIC_API_KEY`)
- PostgreSQL persistence (`DATABASE_URL`)

### Platform
- Frontend: Vite + React on Vercel
- API: Vercel serverless functions
- DB: Neon / Vercel Postgres
- Source: GitHub `johngeorgegejo-dev/Primus-AI`

---

## 3. Out of scope (current release)

- Phase-2 consumer validation scoring
- Manager approval workflow / notifications (draft message only; no auto-send)
- Auth / SSO / role-based access
- Admin UI to edit investment masters
- MySQL (Postgres only in this release)
- Investment vs revenue quadrant grid (proposed; not yet built — see §8)

---

## 4. End-to-end process flow

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐     ┌──────────────┐
│ Field / PM  │────►│ 6 Filter Test UI │────►│ /api/ideas  │────►│ Claude       │
│ submits idea│     │ Validate tab     │     │ (Vercel)    │     │ (Anthropic)  │
└─────────────┘     └──────────────────┘     └──────┬──────┘     └──────┬───────┘
                                                    │                   │
                                                    │ scores + enrich   │
                                                    ▼                   │
                                             ┌──────────────┐           │
                                             │ PostgreSQL   │◄──────────┘
                                             │ ideas table  │
                                             └──────┬───────┘
                                                    │
                    ┌───────────────┐               │
                    │ Log tab       │◄──────────────┘
                    │ history list  │
                    └───────┬───────┘
                            │ open row
                            ▼
                    ┌───────────────┐
                    │ Scorecard UI  │
                    └───────────────┘
```

### User process (Phase 1)

1. Open 6 Filter Test (Vercel URL)  
2. Enter field insight / product idea (+ optional media)  
3. Click **Run validation**  
4. Review scorecard (score, status, revenue, classification, TAM, critique, pivot)  
5. Optionally draft manager message  
6. Optionally open **Log** to revisit past runs  

### Status rule (Phase 1)

| Score / 60 | Status |
|------------|--------|
| > 40 | Approved |
| 30–40 | Promising |
| < 30 | Rejected |

### Score formula

```
Phase1 = (Novelty×0.4 + Market×0.3 + Evidence×0.3) × 0.6
```

### Gram classification (from revenue)

| Revenue | Class |
|---------|--------|
| < ₹1 Cr | 10g |
| ₹1–12 Cr | 100g |
| > ₹12 Cr | 1000g |

---

## 5. Architecture (production)

| Layer | Technology |
|-------|------------|
| UI | Vite + React (Vercel static) |
| API | Vercel serverless (`/api/*`) |
| LLM | Anthropic Claude (`ANTHROPIC_API_KEY`) |
| DB | PostgreSQL via Neon (`DATABASE_URL`) |
| Source | GitHub `johngeorgegejo-dev/Primus-AI` |

### Security (in scope)

- API key **not** in browser (`ANTHROPIC_API_KEY`, not `VITE_…`)  
- Secrets only in Vercel env + local `.env.local`  
- `.env.local` gitignored  
- Errors redact `sk-ant-…`  

---

## 6. Production checklist

- [x] Claude behind server route  
- [x] Ideas analyze + persist API  
- [x] PostgreSQL (`DATABASE_URL`)  
- [x] Log tab for history  
- [x] Env vars on Vercel (Claude + DB)  
- [ ] Confirm redeploy after env changes  
- [ ] Access control / SSO (future)  
- [ ] Phase 2 consumer validation (future)  
- [ ] Manager workflow beyond draft message (future)  

---

## 7. Proposed next scope (not yet built)

**Investment vs Revenue quadrant**

- Predefined investment by category (plan, machinery, details)  
- Map idea → category → investment band  
- Classify vs Revenue Potential (± TAM) into 4 quadrants  
- Show grid on scorecard + optional log filter  

**Owner input required before build:** category investment table + high/low cutoffs.

---

## 8. Ops contacts / env ownership

| Item | Owner suggestion |
|------|------------------|
| Vercel project | Engineering |
| `ANTHROPIC_API_KEY` | Engineering / AI ops (rotate on leak) |
| `DATABASE_URL` | Engineering / IT |
| Scoring rubric changes | Product + Engineering |
| Investment master data | Product / Finance |

---

## Related documents

- `PRIMUS_FULL_FLOW.md` — end-to-end runtime flow  
- `PRIMUS_SCORING_LOGIC.md` — scoring formulas  
- `BACKEND_API.md` — API + Postgres schema  
- `API_KEY_BEST_PRACTICES.md` — secret handling  
- `GIT_AND_GITIGNORE.md` — Git practices  
