# Sizing Methods, Formula Sheet, and Traps

## Contents
1. Formula sheet
2. The five engines in detail
3. Engine selection by category type
4. Reconciliation procedure
5. The twelve traps

---

## 1. Formula sheet

**Demand-side, household decomposition** (preferred — each term is separately sourceable and separately challengeable):
```
Category value = Households
               × Penetration %
               × Purchase occasions per year
               × Volume per occasion
               × Realised price per unit
```

**Demand-side, per-capita compact form:**
```
Category value = Population × per-capita periodic spend × periods per year
               × (1 + out-of-home / institutional uplift)
               × calibration factor
```

**Supply-side:**
```
Organised ex-factory   = production statistics value of output − exports + imports
Unorganised ex-factory = organised × (unorganised share / organised share)
Category value = (organised ex-factory × organised markup)
               + (unorganised ex-factory × unorganised markup)
```
The two markups differ — unorganised product moves through shorter channels at thinner margins. Applying one blended markup is the most common error in this method. Calibrate the organised markup from the user's own P&L, where both ex-factory realisation and consumer MRP are known exactly.

**Company build-up:**
```
Category value = Σ (player category revenue, converted to retail-equivalent)
                 ÷ coverage of the player set
```

**Growth decomposition:**
```
Volume growth ≈ Value growth − Price growth (item-level price index)
```

**Market share:**
```
Share = own audited sales ÷ triangulated category size
```
The numerator is exact; all uncertainty sits in the denominator, so share inherits exactly the sizing error band.

**Distribution:**
```
Numeric distribution  = outlets served ÷ total outlet universe
Weighted distribution = Σ throughput of outlets served ÷ Σ throughput of all outlets
```

**Review velocity to units:**
```
Weekly units (SKU) ≈ Δ review count ÷ review rate
```
Review rate calibrated on the user's own SKUs where actual platform units are known, then adjusted for the competitor's review-solicitation intensity.

**Headroom:**
```
Headroom multiple = per-capita consumption in analog market
                    ÷ per-capita consumption in target market
                    (adjusted for the income gap)
```
Works between countries and between states/regions within one country. "If state X consumed at state Y's per-capita rate, the category doubles" is a powerful and cheap strategic line.

---

## 2. The five engines in detail

### Engine 1 — Demand-side (consumption survey)
**Inputs:** national household consumption expenditure survey with item-level detail; population; household counts.
**Strengths:** gives segmentation free — by geography, urban/rural, income decile. Directly yields penetration and per-capita consumption, which is what a household panel is normally bought for.
**Weaknesses:** recall-based surveys systematically under-report; excludes institutional and out-of-home consumption; item coding may not match the commercial category; multi-year gaps between rounds.
**Correction:** the under-report factor is systematic and measurable via calibration. It is typically material, not marginal.

### Engine 2 — Supply-side (production + trade)
**Inputs:** industrial production statistics by activity code; import/export by tariff code (value and quantity, which also yields unit realisation).
**Strengths:** independent of consumer recall; trade data is timely and granular.
**Weaknesses:** covers registered manufacturers only, so misses the informal sector entirely; activity codes are often broader than the commercial category; production statistics run 2–3 years behind.
**Correction:** trend forward explicitly; gross up for informal share with a stated assumption; use two markups.

### Engine 3 — Company build-up
**Inputs:** annual reports, investor presentations, earnings call transcripts, company registry filings, credit rating rationales.
**Strengths:** grounded in audited figures; earnings calls often disclose category growth, share claims, volume/price split and distribution reach directly.
**Weaknesses:** fragmented categories defeat it; segment definitions rarely match; double-counting via contract manufacturing; the informal tail is invisible.
**Correction:** check customer-concentration notes to detect double counting; read segment definition notes before using any disclosed figure.

### Engine 4 — Analog transfer
**Inputs:** per-capita consumption in comparable markets; income per capita.
**Strengths:** excellent for headroom and long-range potential; cheap sanity check.
**Weaknesses:** unreliable as a level estimate where culture, climate or regulation drive consumption more than income.

### Engine 5 — Digital proxy
**Inputs:** search interest, keyword volume, e-commerce review velocity, best-seller rank, quick-commerce availability by postcode.
**Strengths:** near-real-time; the only engine that works for genuinely new categories; excellent for relative momentum.
**Weaknesses:** skews premium, urban and young; weak as an absolute level; review rates vary by price point, brand tenure and solicitation practice.
**Correction:** always calibrate on own SKUs; use for share-within-e-commerce and trend, not national level.

---

## 3. Engine selection by category type

| Category type | Run these three |
|---|---|
| Established staple | Demand-side + supply-side + company build-up |
| Premium / discretionary | Company build-up + digital proxy + analog transfer |
| Emerging / new format | Digital proxy + company build-up + analog transfer |
| Heavily informal | Demand-side + primary retail audit + company build-up |
| B2B / industrial | Supply-side + company build-up + customer-side bottom-up |

---

## 4. Reconciliation procedure

1. Put all estimates in one table with each method's known weakness in that specific category.
2. Compute the spread as a percentage of the median.
3. Within ±15% → publish median, band = spread.
4. Over 30% → diagnose before publishing. Check in this order: (a) price level mismatch, (b) informal sector treatment, (c) out-of-home consumption, (d) segment definition, (e) stale base year.
5. Identify which single assumption the estimate is most sensitive to. That is where any primary research budget should go — buy down the biggest specific uncertainty, not uncertainty in general.
6. Publish the reconciliation table in the output, disagreements visible.

---

## 5. The twelve traps

1. **Averaging disagreeing methods** — produces a number that is wrong and unexaminable.
2. **False precision** — a figure to four significant digits invites a challenge you cannot win.
3. **Ignoring the informal sector** — the largest single error source in emerging markets; can exceed 40% of a category.
4. **Mixing ex-factory and retail values** — silently understates by 40–50%. Label every figure with its price level.
5. **One blended markup** across organised and informal channels.
6. **Trendlines across a survey methodology change** — the comparison is fiction.
7. **Treating stale data as current** — trend forward explicitly and show the rate.
8. **Double-counting** contract manufacturer revenue inside brand owner revenue.
9. **Segment mismatch** — their "hair care" is not your "hair oil".
10. **Over-reading e-commerce** — a brand at 30% e-com share may hold 6% nationally.
11. **Uncalibrated review velocity** — decorative without a known review rate.
12. **Anchoring to the desired answer** — invisible from the inside. Write assumptions down *before* computing, and get them pressure-tested by someone with no stake.
