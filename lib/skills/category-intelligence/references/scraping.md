# Scraping: Stack, Recipes, and Conduct

## Conduct rules — apply these before any technique

- Respect `robots.txt`.
- **Read the terms of service before scraping any commercial site.** Many e-commerce platforms prohibit it outright. Prefer official APIs, affiliate feeds, or licensed data where they exist.
- Rate-limit aggressively — randomised delays, low concurrency. Never hammer a government portal; that gets an entire organisation's IP range blocked.
- Never scrape behind a login. Never collect personal data (reviewer names, contact details) — data protection law applies, and in India the DPDP Act 2023 is the relevant regime.
- Cache locally so each page is fetched once.
- **Get legal and IT sign-off on the target list before a programme starts.** This has the longest lead time of anything in the build and it is what kills these initiatives — not technical failure.

Surface these constraints to the user proactively rather than waiting to be asked.

## Tiered stack — teach in this order

- **Tier 0, no code.** Spreadsheet import functions (`IMPORTHTML`, `IMPORTXML`, `IMPORTDATA`). Genuinely sufficient for static tables, price pages and government HTML. Every commercial person can learn this in an hour, and it is what lets a programme scale beyond the analysts. Start here.
- **Tier 1, point and click.** Browser scraping extensions. Good for paginated listings.
- **Tier 2, Python basics.** `requests` + `BeautifulSoup` + `pandas`. Handles most static sites and all government portals.
- **Tier 3, dynamic sites.** `Playwright` (preferred) or Selenium. Required for delivery apps, infinite scroll, and anything needing a location set before content loads.
- **Tier 4, scale.** `Scrapy` plus a scheduler and a database. Only once a standing weekly panel exists.
- **PDFs.** `pdfplumber` for text, `camelot` or `tabula` for tables. Prospectuses run to hundreds of pages — automate the extraction.

## Recipe 1 — Weekly price and assortment panel (build this first)

1. Fix a SKU panel: own brands plus top five competitors, roughly ten SKUs each.
2. Fix a location list: 12–20 postcodes spanning metro, tier 1, tier 2 and tier 3 across key regions.
3. Scrape **same day, same time, every week**: MRP, selling price, discount, availability, pack size, rating, review count, rank.
4. **Store raw HTML/JSON snapshots**, not only parsed rows. When the parsing requirement changes — and it will — history can be re-parsed.
5. Timestamp and version everything.

Outputs: price gap tracking, promotion intensity calendar, new launch detection within a week, out-of-stock as a supply signal, pack architecture shifts.

**Why first:** its value compounds. After eighteen months the organisation owns a longitudinal price and assortment history that cannot be bought. A better-funded competitor cannot purchase your past.

## Recipe 2 — Review velocity to unit sales

1. Scrape review counts weekly (recipe 1 already yields this).
2. For **own** SKUs, actual platform units are known → compute the review rate (reviews per hundred units).
3. Adjust for solicitation intensity — brands running aggressive follow-up have inflated rates. Infer this from review timing clustering and text patterns.
4. Apply the adjusted rate to competitor SKUs.
5. Gross up: platform → all e-commerce → total category, using channel shares from published industry reports and listed-player disclosures.

**State the caveats every time:** review rates vary by price point, category, brand tenure and review-gating practice; incentivised reviews distort new and premium brands most. Good for relative share and trend within e-commerce; weak as an absolute level. Use as a triangulation leg, never alone.

Best-seller rank is a parallel estimator — rank-to-units follows a power law within a category. Calibrate the curve on own SKUs across ranks.

## Recipe 3 — Quick commerce distribution map

Loop a postcode list through the delivery apps, checking listing and stock status for each competitor SKU. Produces a numeric-distribution equivalent for quick commerce at postcode granularity, weekly. See `rtm.md`.

## Recipe 4 — Outlet universe via POI extraction

See `rtm.md` step 1. Overpass API for bulk and free; a mapping platform's places API for coverage; correct against own distribution data; cross-check against the official establishment census.

## Recipe 5 — Prospectus and filing mining

Automate extraction of the industry chapter from IPO prospectuses. Each one contains a commissioned market study. Build a shared library — ten prospectuses is ten free consultancy reports.
