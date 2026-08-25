# 6 Filter Test — Product Validation Logic & Scoring System

## Current model — 4-Filter NPD Weightage Engine (product ideas)

Product / NPD ideas are no longer classified into **10g / 100g / 1000g** from the LLM's revenue guess alone. They run CavinKare's **6 Filters Test** (v4) **Filters 1–4** (Filters 5 and 6 — revenue-target and prototype lab/consumer/pack — are out of scope).

Process ideas are unchanged: Efficiency / Feasibility / Scalability. See the Legacy section below for the original product Phase-1 formulas, which still run as a *component* (`revenuePotentialCrores` is the starting number the filters discipline).

| Class | Meaning | Revenue band (3-year potential) |
|---|---|---|
| **10g** | Small commercial weight | < ₹1 Cr |
| **100g** | Mid commercial weight | ₹1 – ₹12 Cr |
| **1000g** | Strong commercial weight | > ₹12 Cr |

Bands are `classifyIdeaWeight()` in `lib/scoring.js`. Missing evidence on a deterministic filter is a **FAIL**, not a silent default.

### Filter 1 — Opportunity to Grow (AI + web search)

Claude + `web_search_20250305` fills benchmark, purchase attribute, gap, and category growth stage (`low-penetration` | `mature-cluttered` | `unclear`).

- **FAIL** if `growthStage` is `unclear` **and** `parityRisk` is `major` **and** no commodity differentiation exemption.
- **NEEDS_INPUT** if a credible benchmark or attribute cannot be found after search.
- **PASS** otherwise.
- Pure commodities (`isPureCommodity`) may skip formulation differentiation until mixing/function is added.

### Filter 2 — Net Margin Gate (deterministic)

Division floors live in `lib/npdMaster.js` (`DIVISION_NET_MARGIN`). Division is auto-detected from idea text and is **user-editable**. The team must declare launch net margin — AI does not invent it.

- Blank declared margin → **FAIL** ("Missing evidence").
- `International Business` → **NEEDS_INPUT** (Finance).
- Below floor → **FAIL**; at or above → **PASS**.
- `marginHeadroomPct` also **nudges** the revenue estimate by up to ±25% in the weightage engine (hard gate + confidence nudge).

### Filter 3 — Price Resilient (deterministic)

- Volume loss if price crosses the nearest fixed point (`₹1, 2, 5, 10, 20, 50, 100`) **cannot be more than 10%**. **≤ 10% = pass**; 10.1% fails.
- If a market leader exists, the idea must beat it by **≥ 2 points on a 10-point scale** (a **proxy** for the Filter 6 lab test, labelled as such in the UI).
- Blank price or volume-loss → **FAIL** ("Missing evidence").

### Filter 4 — Survives Technology & Habit Shift (AI + web search)

Secondary data (gov / industry / reputable research via web search). Format trend:

- `declining` → hard **FAIL**, multiplier `0`
- `rising` → **PASS**, multiplier `1.0`
- `stable` → **PASS** with mark-down: `none` 0.9 / `weak` 0.75 / `moderate` 0.6

### Weightage (`lib/npdWeightage.js`)

```
adjustedRevenueCr = baseRevenueEstimateCr × filter4.multiplier × (1 + marginNudge)
marginNudge = clamp(marginHeadroomPct / 100, -0.25, +0.25)
```

- Any filter **FAIL** → overall **FAIL**, gram class **capped at 10g**, escalate-to-CKR available.
- Any **NEEDS_INPUT** (and no hard fail) → overall **NEEDS_INPUT**, no gram class until re-run.
- All **PASS** → **CLEARED**, gram class from `classifyIdeaWeight(adjustedRevenueCr)`.

Escalation stores `escalation_status = escalated` plus the disputed filter and evidence. It does **not** change the AI verdict.

Web-search Claude calls are server-side only (`ANTHROPIC_API_KEY` never reaches the browser).

---

## Legacy Phase-1 model (Novelty / Market / Evidence)

The following documents the original Phase-1 LLM scoring path. For **product** ideas it still runs first; its revenue estimate is the *base* the 4-filter engine adjusts. **Process** ideas still use this style of LLM scoring (Efficiency / Feasibility / Scalability in `lib/processScoring.js`).

## Overview

6 Filter Test is CavinKare’s **NPD screening engine**. It scores FMCG product ideas for the Indian market using Claude (Anthropic).

- **Phase 1** (this app): LLM scoring — **60 of 100** final points  
- **Phase 2** (future): Consumer validation — **40 of 100** points  

Users enter a product idea (optional image). Claude scores three dimensions. The app then computes Phase-1 score, status, revenue band, and gram classification.

---

## End-to-end flow

1. User enters product idea (+ optional media).
2. App calls **Claude** (`claude-sonnet-4-5-20250929`) with the 6 Filter Test scoring prompt.
3. Claude returns JSON: Novelty / Market / Evidence (0–100), critique, revenue, TAM, improvements.
4. App validates the response and applies local formulas:
   - Phase-1 score out of 60
   - Status (Approved / Promising / Rejected)
   - Matrix scores (X/5)
   - Gram weight from revenue (10g / 100g / 1000g)
5. Scorecard is displayed.

If Claude fails, the app shows an error. There is no Ollama or local heuristic fallback.

---

## Scoring dimensions (0–100)

| Dimension | Weight | What it measures | Scoring guidance |
|-----------|--------|------------------|------------------|
| **Novelty** | 40% | Differentiation / “right to win” | Reward novel formats, ingredients, or models. Punish commodity / “me-too” ideas (&lt;25). |
| **Market Relevance** | 30% | Fit to Indian consumer shifts | Reward gut-health, sachet-economy, longevity, Gen Z, sustainability, convenience, sharp pain points. |
| **Evidence** | 30% | Reason to believe | Reward pilots, sales feedback, clinical / ingredient proof. If weak/none → ~20–45. |

Claude also returns:

- `oneLiner` — strategic critique  
- `revenuePotentialCrores` — India revenue estimate (crores)  
- `tamValuation` — category TAM string  
- `improvements` — refinement pivots  
- `edge` / `trend` / `gap` — supporting notes  

---

## Phase-1 score formula

Each dimension is scored 0–100 by Claude.

```
weighted = (Novelty × 0.4) + (Market × 0.3) + (Evidence × 0.3)
Phase1   = weighted × 0.6
```

**Result = Score / 60**

### Example

Novelty = 80, Market = 90, Evidence = 60:

```
weighted = 80×0.4 + 90×0.3 + 60×0.3
         = 32 + 27 + 18
         = 77

Phase1   = 77 × 0.6
         = 46.2 / 60
```

### Point contribution caps

| Dimension | Max points in Phase-1 |
|-----------|------------------------|
| Novelty | 24 (40% of 60) |
| Market Relevance | 18 (30% of 60) |
| Evidence | 18 (30% of 60) |
| **Total** | **60** |

---

## Status bands

Based on Phase-1 score:

| Score / 60 | Status | Color |
|------------|--------|-------|
| **&gt; 40** | Approved | Green |
| **30 – 40** | Promising | Yellow / amber |
| **&lt; 30** | Rejected | Red |

---

## Matrix display (X/5)

Claude’s 0–100 scores are converted for the UI:

```
X/5 = round(score_100 / 20)
```

Clamped between **1** and **5**.

| Score (0–100) | Display |
|---------------|---------|
| 0 – 29 | 1/5 |
| 30 – 49 | 2/5 |
| 50 – 69 | 3/5 |
| 70 – 89 | 4/5 |
| 90 – 100 | 5/5 |

UI labels: **Novelty**, **Relevance**, **Evidence**.

---

## Revenue logic

1. Prefer Claude’s `revenuePotentialCrores`.
2. If missing or ≤ 0, estimate from Phase-1:

| Phase-1 score | Estimated revenue |
|---------------|-------------------|
| &lt; 30 | ₹4 – 9 Lakhs (0.04 – 0.09 Cr) |
| 30 – 40 | ₹10 – 50 Lakhs (0.10 – 0.50 Cr) |
| &gt; 40 | ₹1.2 – 4.0 Cr |

Displayed as e.g. `₹8.0 Lakhs` or `₹2.80 Cr`.

---

## Gram classification (10g / 100g / 1000g)

Classification is derived from **estimated revenue in crores**, not directly from score.

| Revenue | Classification | Meaning |
|---------|----------------|---------|
| **&lt; ₹1 Cr** | **10g** | Small commercial weight |
| **₹1 – 12 Cr** | **100g** | Mid commercial weight |
| **&gt; ₹12 Cr** | **1000g** | Strong commercial weight |

---

## TAM Valuation

1. Prefer Claude’s `tamValuation`.
2. If empty, use keyword fallback, for example:
   - Hair / shampoo → Indian hair care (~₹30,000 Cr)
   - Food / gut / nutrition → packaged foods / health nutrition (~₹50,000 Cr+)
   - Soap / wash / skin → bathing / personal wash (~₹28,000 Cr)
   - Oral care → oral care (~₹10,000 Cr)
   - Home / detergent → home care (~₹25,000 Cr)

---

## Scorecard output fields

- Score / 60 + Status  
- Idea title / one-liner  
- Novelty / Relevance / Evidence (X/5)  
- Revenue Potential  
- Classification (10g / 100g / 1000g)  
- TAM Valuation  
- Trend / category tags  
- Strategic critique + Audio Briefing  
- Refinement Pivot  
- Actions: Refine & re-run, Forward to manager  

---

## Quick reference

```
Claude scores: Novelty, Market, Evidence (0–100)
        ↓
Phase1 = (N×0.4 + M×0.3 + E×0.3) × 0.6     → Score / 60
        ↓
Status:  <30 Rejected | 30–40 Promising | >40 Approved
        ↓
Matrix:  round(score/20) as X/5
        ↓
Revenue →  <₹1 Cr = 10g | ₹1–12 Cr = 100g | >₹12 Cr = 1000g
```

---

## Technical notes

| Item | Value |
|------|--------|
| Frontend | Vite + React |
| Backend API | `/api/claude` (Vercel serverless + local Vite middleware) |
| LLM | Anthropic Claude (server-side only) |
| Model | `claude-sonnet-4-5-20250929` (configurable) |
| API key | `ANTHROPIC_API_KEY` in `.env.local` / Vercel (no `VITE_` prefix) |
| Browser exposure | Key is **not** shipped to the client |

### Config (`.env.local`)

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
```

On Vercel, set the same names under **Settings → Environment Variables** (not `VITE_…`).
Put the real key only in `.env.local` / Vercel — never commit it.