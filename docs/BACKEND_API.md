# 6 Filter Test Backend API — Ideas + Analysis

## Overview

Analysis and storage run on the server:

```
Browser  →  POST /api/ideas  →  Claude analyze  →  PostgreSQL  →  scorecard JSON
Browser  →  GET  /api/ideas  →  list saved ideas
Browser  →  GET  /api/ideas/:id  →  one full idea
```

The Anthropic key stays on the server (`ANTHROPIC_API_KEY`). Ideas are stored in **PostgreSQL**.

---

## Endpoints

### `POST /api/ideas`

Analyze an idea with Claude, compute Phase-1 scores, save to Postgres, return the full scorecard.

**Body**

```json
{
  "idea": "A probiotic buttermilk sachet…",
  "image": { "name": "sketch.png", "mediaType": "image/png", "data": "<base64>" }
}
```

`image` is optional. Image binary is used for analysis; only metadata is stored in DB.

**Response:** `201` — full result object (`novelty`, `market`, `evidence`, `phase1`, `ideaWeight`, `id`, `ts`, …).

---

### `GET /api/ideas`

List recent ideas (newest first, default limit 20).

**Response**

```json
{
  "ideas": [
    {
      "id": "uuid",
      "idea": "…",
      "phase1": 39.4,
      "ts": 1710000000000,
      "ideaWeight": "1000g",
      "status": "analyzed"
    }
  ]
}
```

---

### `GET /api/ideas/:id`

Load one full saved scorecard by id.

---

### `POST /api/claude`

Low-level Claude proxy (still used for “Forward to manager” draft). Prefer `/api/ideas` for validation.

---

## PostgreSQL setup

### Table (auto-created on first request)

```sql
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  idea_text TEXT NOT NULL,
  image_json TEXT,
  status TEXT NOT NULL DEFAULT 'analyzed',
  phase1_score DOUBLE PRECISION,
  result_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Local `.env.local`

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
```

If `DATABASE_URL` is missing **locally**, the app falls back to `data/ideas.json` and logs a warning.  
On **Vercel**, `DATABASE_URL` is **required** (no silent file fallback).

### Vercel Environment Variables

1. Create a Postgres DB (Vercel Storage → Postgres, or Neon, or Supabase).
2. Copy the connection string.
3. Project → **Settings → Environment Variables**:

| Key | Value |
|-----|--------|
| `ANTHROPIC_API_KEY` | your Claude key |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5-20250929` |
| `DATABASE_URL` | `postgresql://…` |

4. Apply to Production (and Preview if needed).
5. **Redeploy**.

`POSTGRES_URL` is also accepted as an alias for `DATABASE_URL`.

---

## Local run

```powershell
cd D:\primus-app
npm install
# set DATABASE_URL + ANTHROPIC_API_KEY in .env.local
npm run dev
```

Open http://localhost:5173/

---

## Key files

| File | Role |
|------|------|
| `api/ideas.js` | GET list / POST analyze+save |
| `api/ideas/[id].js` | GET one idea |
| `lib/db.js` | Postgres (Neon serverless) + local file fallback |
| `lib/analyzeIdea.js` | Claude scoring pipeline |
| `lib/scoring.js` | Score formulas |
| `lib/ideasApi.js` | Shared HTTP handlers |
| `src/App.jsx` | UI calls `/api/ideas` |
