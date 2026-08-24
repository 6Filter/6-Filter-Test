# Primus.ai — Investment vs Revenue Quadrant

**Status:** Built (v1) — scorecard shows 2×2 grid  
**Audience:** Product, Finance, Engineering  
**Code:** `lib/investmentMaster.js`, `lib/investmentGrid.js`, wired in `lib/scoring.js` → scorecard UI

---

## 1. Purpose

Each validated idea is checked against **predefined plant / platform investment** (plan, machinery, category) and plotted against **Revenue Potential** (TAM as context) on a **2×2 grid**.

| Quadrant | Meaning |
|----------|---------|
| **High investment · High revenue** | Scale play — justify capex with strong return |
| **High investment · Low revenue** | Caution — heavy spend vs weak return signal |
| **Low investment · Low revenue** | Small / niche — limited upside and spend |
| **Low investment · High revenue** | Attractive — efficient return profile |

---

## 2. How it works

```
User submits idea
        ↓
Phase-1 scoring (existing)
  → Novelty / Market / Evidence
  → Revenue Potential (₹ crores)
  → TAM Valuation
        ↓
Match idea → Platform and/or Plant(s)
  (keyword fit on platforms + plant products / extensions)
        ↓
Classify investment High / Low
        ↓
Classify revenue High / Low (vs threshold)
        ↓
Show 2×2 grid + plan / machinery / reason
        ↓
Saved inside result_json with the idea
```

---

## 3. Cutoffs (v1)

| Axis | Low | High |
|------|-----|------|
| **Investment** | Single plant + fits current / future lines (incl. full PC portfolio → Pan-India PC) | Multi-plant platform, multi-plant hit, or unmatched |
| **Revenue** | `revenuePotentialCrores` **&lt; 0.5** (₹50 Lakhs) | **≥ 0.5** crore |

Constants live in `lib/investmentMaster.js` (`HIGH_REVENUE_CRORES`).

---

## 4. Master data (from plant / platform tables)

### Plants

| Plant | Category | Key assets (summary) |
|-------|----------|----------------------|
| Ambient Dairy & Beverage (Erode) | Beverage / Dairy | UHT, retort, powder, butter, ghee, nata |
| Cold Chain Dairy (Kanchipuram) | Cold Chain Dairy | Pouch fill, curd/paneer, ice cream |
| Food Factory — Pickles | Culinary / Pickles | Blending, filling, brine |
| Snacks Unit | Snacks | Extruders, fryer, batti, HNC, coater, chips |
| Pet Food | Pet Food | Extruder, drum dryer, blenders |
| Personal Care (Pan-India) | Personal Care (PC) | Emulsification, blending, filling |

### Platforms (multi-plant → High investment)

| Platform | Plants | Concept |
|----------|--------|---------|
| Functional protein | Erode + Snacks + Kanchipuram | Protein UHT + protein snacks + protein paneer |
| South Indian heritage | Erode + Food Factory + Snacks | Retort payasam, gravies, battis, pickles |
| Coconut ecosystem | Erode + Snacks | Coconut water / milk UHT, coconut snacks |

---

## 5. Scorecard UI

Under Revenue / TAM:

- Active quadrant badge + short guidance
- Visual 2×2 (active cell highlighted)
- Category / platform, plants, key assets, plan summary, investment reason, revenue band used

Older Log entries without `investmentGrid` simply omit this block.

---

## 6. Out of scope (still)

- Full IRR / NPV
- Live ERP / SAP capex feeds
- Changing Novelty / Market / Evidence formula
- Log filters by quadrant (optional next)

---

## 7. Tuning later

1. Add explicit ₹ investment bands per plant / platform  
2. Confirm revenue High/Low cutoff with Finance  
3. Optional Log filter by quadrant  
4. Manual category override if auto-match is wrong  
