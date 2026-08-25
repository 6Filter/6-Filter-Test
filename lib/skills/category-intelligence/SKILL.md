---
name: category-intelligence
description: Size markets, analyse competitors, and map route to market using free public data instead of paid syndicated sources like Nielsen, Kantar, Euromonitor or IQVIA. Use this skill whenever the user asks about market size, TAM/SAM/SOM, category size or growth, market share estimation, competitive analysis or competitor benchmarking, route to market, distribution or outlet universe, category deep dives, secondary research, or scraping data for market analysis — and also whenever they mention not having budget for syndicated data, working at a smaller company, or needing category understanding without paid research. Applies to India FMCG in greatest depth but the method is category- and geography-agnostic. Trigger this even when the user just says "how big is the market for X" or "who are the competitors in Y", since a rigorous triangulated answer is far better than an off-the-cuff figure.
---

# Category Intelligence Without Syndicated Data

Produce defensible market sizing, competitive analysis and RTM assessment from public data, scraping and disciplined estimation — replacing or supplementing Nielsen, Kantar, Euromonitor and similar paid sources.

## Core principle: never a single number, never a single method

The failure mode this skill exists to prevent is a confident point estimate from one source. Every output must have (a) at least three independent methods triangulated, (b) a stated confidence band, and (c) a written assumption log. A range with a visible basis is worth more to a decision-maker than a precise number with none — and it survives challenge, which the precise number does not.

## Workflow

### 1. Scope the category before estimating

Ask or state explicitly: what is in and what is out, at what price level (ex-factory vs retail), for what geography, for what period. Most sizing disputes turn out to be definitional. Settle this first and write it at the top of the output.

Also establish demand-side scope: what would the consumer use if this category vanished? That set is the real competitive frame, and it is usually wider than the industry category definition.

### 2. Check for an answer key — the calibration step

Ask whether the user has paid syndicated data for *any* adjacent category. If they do, this is the highest-value move available and almost nobody does it:

1. Estimate the covered category using free methods only, blind.
2. Compare against the audited truth, output by output — size, growth, volume/price split, share, distribution.
3. Express the error as a **multiplier** (`estimate ran 0.79× actual`), not a difference, so it transfers to new categories.
4. Apply the correction factor to the uncovered category and quote the measured error band.

This converts an estimate into a method with a known accuracy. Surface this opportunity proactively — users rarely think of it themselves.

### 3. Run three or more sizing engines

Choose based on category type; see `references/methods.md` for full detail and selection guidance.

| Engine | Best for |
|---|---|
| Demand-side (consumption survey × population) | Established staples; gives free segmentation |
| Supply-side (production statistics ± trade) | Categories dominated by registered manufacturers |
| Company build-up (sum of player revenues ÷ coverage) | Concentrated categories with disclosing leaders |
| Analog transfer (per-capita vs comparable markets) | Headroom, sanity-check |
| Digital proxy (search, review velocity, rank) | Growth and momentum; emerging categories |

### 4. Reconcile — do not average

- Spread within ±15% → publish the median, band = the spread.
- Spread over 30% → **one method is broken; diagnose it.** Usual causes: unorganised/informal sector share, out-of-home consumption, segment mismatch, mixing price levels. Averaging here produces a number that is both wrong and unexaminable.
- Always show the reconciliation table in the output. It is the most trust-building element of any sizing deliverable.

### 5. Decompose growth into price and volume

```
Volume growth ≈ Value growth − Price growth (item-level price index)
```

Do this every time. "The category grew 9%, of which 5 points was price" is a fundamentally different strategic conversation from "the category grew 9%", and most analyses never get there.

### 6. Competitive analysis

Financial teardown from public filings, then the strategic layer. See `references/competition.md`. Key moves:
- Company registry filings give audited financials for **unlisted** competitors cheaply.
- IPO prospectuses contain commissioned market studies given away free — mine the industry chapter.
- Credit rating rationales disclose revenue and capacity for private companies.
- Advertising/marketing spend as a share of sales is the most predictive single number for what a competitor will do next.
- Build an early-warning dashboard: trademark filings lead launches by 6–18 months; job postings lead territory expansion by 3–6 months.

Then assess durability, not just position: distinguish operational excellence (copyable — better ads, better packaging, better trade schemes) from structural power (scale economies in media and distribution, cornered supply, genuine brand salience). For any competitor advantage ask both whether rivals *can't* replicate it and whether they *won't* — the "won't" cases, where replication would damage their existing business, are the real openings.

### 7. Route to market

Universe → coverage → gap. See `references/rtm.md`. The outlet universe comes from official establishment counts cross-checked against POI extraction, corrected using districts where the user's own distribution data is near-complete. This is usually the most actionable deliverable and it costs nothing but time.

### 8. State the limits explicitly

Free data cannot deliver outlet-level offtake, brand switching/repeat/loyalty, or reliable sub-district rural granularity. Say so plainly, propose the cheapest primary research that would fill the specific gap, and target that spend at the assumption the estimate is *most sensitive* to — not at general uncertainty.

Never fabricate these outputs from proxies that cannot support them.

## Output format

Use this structure for a full category deep dive:

```
1. Category definition & scope (in/out, price level, geography, period)
2. Size: methods, reconciliation table, published range
3. Growth: value, decomposed into volume and price
4. Segmentation: sub-category, pack, price tier, geography, income
5. Consumer: penetration, per-capita consumption, frequency, headroom
6. Competitive landscape: players, estimated shares, financial teardown, organised vs unorganised
7. Price architecture: price per standard unit vs pack size, all players
8. Distribution & RTM: universe, coverage, white space, channel mix
9. Trends: launch pipeline, premiumisation, format shifts, regulation
10. Digital: search demand, e-commerce share, review velocity, ad activity
11. Strategic read: where structural power sits, where the openings are
12. Assumption log, confidence assessment, and what could not be known
```

For a quick answer, compress to sections 1, 2, 3, 6 and 12 — but never drop 12.

## Non-negotiables

- **Label every figure with its price level.** Mixing ex-factory and retail silently understates by 40–50%.
- **State the informal/unorganised sector assumption explicitly.** It is the largest single source of error in emerging-market sizing and must be visible to be challengeable.
- **Never build a trendline across a survey methodology change.**
- **Trend stale data forward explicitly** and show the growth rate used.
- **Never extrapolate national share from e-commerce data** — it skews premium, urban and young.
- **Report ranges, not point estimates.** Band width must derive from method spread, not be a decorative ±10%.
- If asked for a number and the honest answer is a wide range, give the wide range and explain what would narrow it.

## Scraping conduct

When the task involves collecting web data, follow `references/scraping.md`. Baseline: respect robots.txt, check terms of service before scraping any commercial site, rate-limit, never scrape behind a login, never collect personal data, prefer official APIs. Flag to the user that many e-commerce terms of service prohibit scraping and that a legal review of the target list should happen before a programme starts — this is what kills these initiatives, not technical failure.

## Reference files

- `references/methods.md` — the five sizing engines in detail, full formula sheet, selection guidance, and the twelve traps
- `references/sources.md` — data source atlas (India-heavy, with the general pattern for other geographies)
- `references/competition.md` — competitor teardown, share estimation, early-warning signals
- `references/rtm.md` — outlet universe, distribution estimation, white-space modelling
- `references/scraping.md` — scraping stack, specific recipes, conduct rules
