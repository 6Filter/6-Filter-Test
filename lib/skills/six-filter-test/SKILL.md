---
name: claude-skill-for-6-filter-test
description: >-
  Runs CavinKare 6 Filter Test evidence for Indian FMCG NPD ideas. Prefer
  Nielsen retail audit and Kantar household panel when those files exist;
  otherwise size and benchmark from the category-intelligence playbook plus
  web search. Never return unsure or not available — always publish a working
  estimate. Use when scoring or filling Filters 1–5, AI first pass, Nielsen,
  Kantar, category size, price per gram, format trajectory, threat register,
  or year-3 household sizing. Filter 6 is validation approval only, never scored.
---

# Claude Skill for 6 Filter Test

Backend evidence engine for Primus.AI. Scores and fills Filters 1–5 on the server. The form shows only the overall filter check (Cleared / Evidence missing / Below floor). It must not show per-point scores.

## Evidence waterfall (every field)

1. **Nielsen** retail audit (`data/nielsen.json`) when the category or SKU matches — products in market, category value/volume, price per gram, format shares.
2. **Kantar** household panel (`data/kantar.json`) when the category matches — households, penetration, trial, repeat, frequency, pack value.
3. **Calibration** in `data/category-intel.json` — apply measured Nielsen multipliers to free-data engines.
4. **Playbook engines + web search** — HCES, ASI, IIP, WPI/CPI, filings, e-commerce price architecture (see category-intelligence methods).
5. **Analog fallback** — nearest Indian staple/premium analog, labelled as a working estimate with a P10–P90 band stored in the backend, never shown as a per-point score.

Never output "unsure", "not available", "unknown", "n/a", or "could not be established" as the field value. If the preferred source is empty, drop to the next step and still fill the field.

## Filter rules (v4)

### Filter 1 — Success possibility & growth

- **Benchmark not named** — check what products are on shelf from Nielsen for this category; name the strongest currently-selling competitor (brand · variant · pack). If Nielsen has no row, web-search retail/e-com listings and still name one.
- **Growth route or growth argument incomplete** — category size from Nielsen (value and volume growth, price/volume split). If Nielsen is empty, triangulate three playbook engines (demand-side, supply-side, company build-up); do not average a >30% spread — diagnose, then publish the working P50.
- Attribute and gap still follow v4 (top-3 purchase attribute, gap ≥ 2.0). Commodity exemption unchanged.

### Filter 2 — Net margin

- Web search only (cost structures, channel terms, listed-player margin disclosures). Division floor stays in `lib/npdMaster.js`. Do not change the arithmetic. AI may suggest a path-to-floor net margin; Finance still signs.

### Filter 3 — Price resilient

- **Price index vs benchmark missing** — competitor selling prices from Nielsen (price per gram / per ml, equal grammage). If Nielsen is empty, scrape or web-search current MRP/g for the named benchmark and 2–3 peers. Volume-loss cap stays **≤ 10% = pass**. Do not change that math.

### Filter 4 — Tech & habit shift

- **Format trajectory** — Nielsen format shares when present; otherwise this skill + web search (digital proxy, analog transfer, trademark filings). Always classify rising / stable / declining.
- **Threat register empty** — substitutes, technology, clean-label, regulatory from this skill + web search. Always write a register.
- **Threat responses incomplete — missing evidence counts as FAIL (v4)** — write a one-line response per threat. Empty register is a backend FAIL, not a blank.

### Filter 5 — Revenue target (CMI model)

Year-3 revenue = households reached × trial % × repeat % × frequency × pack value.

Fill all five from Kantar, then Nielsen, then HCES / playbook household decomposition, then web search. Use analog fallbacks. Never leave a factor blank.

```
Category value ≈ Households × Penetration × Occasions/year × Volume/occasion × Realised price
```

CMI signature is a human gate. AI fills the factors so sizing is not incomplete; it does not tick the signature.

### Filter 6 — Prototype gate

**Scoring is not done on Filter 6.** Lab / consumer / pack numbers are collected for **validation approval** only. They must not move gram class, overall CLEARED, or any filter score.

## Backend vs UI

| Layer | What happens |
|---|---|
| Server | Per-criterion status, Nielsen/Kantar lookups, engine math, F5 crores, F3 ≤10% cap, F2 division floor |
| Form | One Check pill per filter. No per-point scores, no 0–100 breakdown, no Novelty/Market/Evidence tiles on the proposition path |

## Non-negotiables (do not invert)

- Filter 3 volume loss **≤ 10% = PASS**
- Filter 2 is a hard gate; margin headroom ±25% on revenue only
- Gram bands: 10g < ₹1 Cr; 100g ₹1–12 Cr; 1000g > ₹12 Cr
- Brand-line fit / CK category matching stays retired
- Do not average engines when spread > 30%
- Label every rupee figure retail vs ex-factory

## References

- [nielsen-kantar.md](references/nielsen-kantar.md) — file shapes, lookup order, price/g and household fields
- [filter-evidence.md](references/filter-evidence.md) — form field mapping and fallback recipes
- [playbook-formulas.md](references/playbook-formulas.md) — sizing engines from the Category Intelligence Mastery Playbook
- Sibling skill `lib/skills/category-intelligence/` — methods, sources, competition, RTM
