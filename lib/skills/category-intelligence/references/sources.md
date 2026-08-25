# Data Source Atlas

India-heavy, because that is where this was built. Section 5 gives the general pattern for transferring it to any geography.

**Verify every portal and dataset name on first use — government sites reorganise constantly and URLs rot. The categories of source are stable; the links are not.**

## Contents
1. What you are replacing (paid → free substitution map)
2. Government / official (India)
3. Company disclosures
4. Industry bodies and free reports
5. Digital and scraped
6. Transferring to another geography

---

## 1. What you are replacing

### Retail audit (Nielsen-type) → free substitutes

| Paid output | Free substitute | Quality |
|---|---|---|
| Category value | Triangulate demand-side, supply-side, company build-up | Good, ±10–20% |
| Category volume | Value ÷ realised price, or physical output statistics | Good |
| Value growth | Weighted listed-player growth + production index direction | Good |
| Volume vs price split | Value growth − item price index growth | Excellent |
| Own market share | Own audited sales ÷ triangulated size | Good |
| Competitor shares | Registry filings + segment disclosures + investor decks | Good for large, weak for small private |
| Numeric distribution | Outlet universe × availability audit sample | Fair — needs fieldwork |
| Weighted distribution | Outlets weighted by turnover slab or size band | Fair |
| Price / promo depth | E-commerce scraping, longitudinal | Excellent — daily vs monthly |
| Pack and SKU mix | E-commerce assortment scrape | Good |
| **Retailer-level offtake** | **None** | **Gone** |
| **Sub-district rural offtake** | **None** | **Gone** |

### Household panel (Kantar-type) → free substitutes

| Paid output | Free substitute | Quality |
|---|---|---|
| Category penetration | Consumption expenditure survey: % households reporting the item | Excellent |
| Per-capita consumption | Survey quantity per person per period | Excellent |
| Spend per household | Survey item-level expenditure | Excellent |
| Urban/rural split | Native to the survey | Excellent |
| Income-class skew | Survey by expenditure fractile; health survey wealth quintiles | Excellent |
| Purchase frequency | Derived: annual volume ÷ typical pack size | Fair |
| **Brand switching / repeat / loyalty** | **None** — use own CRM/loyalty data | **Gone** |
| Basket affinity | Partial: quick-commerce "frequently bought together" | Weak |

---

## 2. Government / official (India)

| Source | Gives you | Use for |
|---|---|---|
| **HCES** (Household Consumption Expenditure Survey, MoSPI) | Item-level per-capita quantity and spend by state, rural/urban, expenditure fractile | Penetration, sizing, segmentation |
| **ASI** (Annual Survey of Industries) | Factory output value and quantity by NIC code | Supply-side sizing |
| **IIP** (Index of Industrial Production) | Monthly production index by NIC group | Growth direction, nowcasting |
| **WPI item indices** (Office of the Economic Adviser) | Monthly wholesale price index per item | Price/volume decomposition |
| **CPI item indices** (MoSPI) | Consumer price index, rural/urban | Consumer-level inflation |
| **DGCIS Tradestat** (Ministry of Commerce) | Import/export by HS code, value and quantity, by country, monthly | Trade adjustment, unit realisation, import threat |
| **Economic Census** | Establishment counts by activity by district | **Retail outlet universe** |
| **Census + District Census Handbooks** | Households, village-level population, amenities | Beat planning, potential mapping |
| **NFHS** | District-level wealth quintiles, media exposure, household assets | Micro-market targeting |
| **PLFS** | Income, employment | Segmentation |
| **data.gov.in** | API access to many datasets | Automation |
| **Agmarknet / Ministry of Agriculture** | Commodity and crop prices, production | Input cost modelling |
| **Vahan dashboard** | Vehicle registrations by RTO and segment | Affluence proxy below state level |
| **GST portal** | Entity verification, registration date, business nature | Distributor and competitor mapping |
| **FSSAI licence database** | Food manufacturers, plant locations | Food category competitor mapping |
| **IP India trademark search** | Applications by class and applicant | **Leading indicator of brand launches** |
| **RBI Handbook of Statistics** | Macro series | Context |

**HS codes, personal care:** 3305 hair preparations incl. shampoo; 3401 soap; 3304 beauty/skin; 3306 oral hygiene; 3307 shaving/deodorant; 3402 surface-active agents and detergents; 1513 coconut oil.

**NIC:** group 202 covers soaps, detergents, cleaning preparations, perfumes and toilet preparations. Drill to the 5-digit sub-class in the ASI schedule and verify the current mapping — these get revised.

---

## 3. Company disclosures

| Source | Gives you |
|---|---|
| **MCA21 company registry** | Full audited financials of **any Indian private company** for a token fee. Revenue, margins, related-party transactions, capex, auditor notes. The best single source on unlisted competitors. |
| **DRHP / RHP IPO prospectuses** (SEBI, NSE, BSE) | The industry chapter is a **commissioned market study given away free** — category sizes, growth, channel splits, competitive maps. Build a library of these. |
| **Investor presentations + earnings transcripts** | Category growth, market share claims, volume/price split, urban/rural mix, distribution reach, channel mix. Companies say things on calls they never write down. |
| **Credit rating rationales** (CRISIL, ICRA, CARE, India Ratings) | Free PDFs with revenue, capacity, utilisation, margins — **including private companies**. Plus free sector outlooks. |
| **Annual reports** | Segment reporting, capacity, plant locations |
| **Aggregators** (Screener, Trendlyne, Tijori) | Fast listed financials |

**Indian FMCG listed comparator set:** HUL, Dabur, Marico, Emami, Godrej Consumer, Bajaj Consumer Care, Jyothy Labs, ITC, Colgate-Palmolive India, P&G Hygiene & Health, Gillette India, Honasa, Nykaa, Zydus Wellness, Nestlé India, Britannia, Varun Beverages, Hatsun, Dodla.

---

## 4. Industry bodies and free reports

IBEF sector reports; FICCI, CII, ASSOCHAM; category associations (beauty and hygiene, coconut development board, dairy development board); free public reports from consulting firms and research houses (Bain, BCG, Kearney, Redseer, Technopak, Datum) — often released as joint reports with retail or e-commerce industry bodies.

---

## 5. Digital and scraped

| Source | Gives you |
|---|---|
| E-commerce marketplaces (Amazon, Flipkart, Nykaa, BigBasket, JioMart) | Assortment, MRP, selling price, discount, ratings, review counts over time, best-seller rank, stock status |
| Quick commerce (Blinkit, Zepto, Instamart) | Postcode-level availability = distribution map for a channel syndicated data covers poorly |
| Google Trends | Relative search interest by geography, brand vs category, seasonality |
| Keyword volume tools | Absolute-ish search demand |
| Meta Ad Library | Every active ad by any advertiser: creative, run dates, count |
| Google Ads Transparency Center | Same for Google and YouTube |
| SimilarWeb free tier | Competitor site traffic and channel mix |
| LinkedIn | Headcount by function and growth, job postings by city → sales force size and expansion geography |
| Google Places API / OpenStreetMap Overpass | Outlet, salon and chemist counts and locations |
| Justdial / IndiaMART | Distributor and retailer listings, B2B pricing |
| Wayback Machine | Competitor price, assortment and positioning **history** |
| Import shipment databases | Competitor raw material and packaging imports |
| Company store locators | Modern trade footprint, exclusive outlets |

---

## 6. Transferring to another geography

The categories of source are universal. For any country, look for:

1. **A national household consumption or expenditure survey** with item-level detail (the household panel substitute).
2. **An industrial production survey or census** by activity code (the supply-side base).
3. **Customs trade statistics** by tariff code — near-universal and usually good quality.
4. **A producer or wholesale price index** at item level (for the volume/price split).
5. **An economic census or business register** (the outlet universe).
6. **A company registry** with filed financials — availability varies hugely; UK, India, and much of the EU are good, the US is poor for private companies.
7. **A securities regulator's prospectus archive** (the free commissioned market studies).
8. **A credit rating agency** publishing free rationales.
9. **A trademark office** with public search (the launch early-warning system).
10. **The digital sources**, which are largely geography-independent.

If a country lacks (1), lean harder on supply-side and company build-up. If it lacks (6), lean on trade data and digital proxies.
