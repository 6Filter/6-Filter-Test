# Route to Market Without Syndicated Data

RTM is where free data competes most effectively with paid data, because paid data was rarely granular enough anyway.

## The stack

**1. Universe — total outlets by type by district**
- Official establishment counts (economic census or business register) are the authoritative base.
- Cross-check and localise with POI extraction: OpenStreetMap Overpass API (free, bulk, no key — query shop types within a district boundary) and a mapping platform's places API (better coverage, gridded nearby-search over a city).
- **Correction factor:** open POI databases under-cover emerging-market retail badly and unevenly. Calibrate against districts where the user's own distribution management system has near-complete outlet coverage, derive a multiplier by district type (metro / tier 1 / tier 2 / rural), and apply it to uncovered districts.

**2. Own coverage** — from the user's own DMS or secondary sales. Exact, already owned, frequently underused.

**3. Numeric distribution** = outlets served ÷ universe, computed by district.

**4. Weighted distribution** — weight outlets by throughput. Proxy throughput using tax turnover slabs, establishment employment-size bands from the economic census, or observed shelf size from a small physical audit.

**5. Competitor distribution** — a physical availability audit is unavoidable here, and it is cheap. 250–400 outlets across six town classes, checking presence and facings for a fixed SKU list, quarterly. This yields competitor numeric distribution and share of shelf directly, for a fraction of a syndicated subscription. Label it as a sample with a sampling error, not a census.

**6. Potential per outlet** — regress own outlet-level offtake against district and sub-district characteristics (wealth quintiles from health surveys, census amenities and household counts, vehicle registrations, mobile penetration), then predict potential for outlets not yet served. Report the R². It is genuinely useful for prioritising expansion and genuinely unreliable for forecasting any single location.

**7. Channel mix** — modern trade, general trade, e-commerce and quick commerce splits are disclosed readily in listed players' investor decks. Aggregate several to triangulate the category picture.

**8. Distributor mapping** — competitor distributor networks via tax registry search, business directory listings, and the competitors' own "find a distributor" pages. Registration dates reveal expansion timing.

**9. Quick commerce distribution** — loop a postcode list through the delivery apps checking whether each competitor SKU is listed and in stock. This is a numeric-distribution equivalent for a channel that syndicated audits still cover patchily, refreshed weekly, at postcode granularity. It is one of the few places where free data can make you *better* informed than a paying competitor.

## The deliverable that wins budget

A district-level map with three layers: category potential (from the demand-side model), current coverage (from own DMS), and the gap. Colour the gap. That is the RTM investment case, built entirely from free data, and it is usually the single most actionable artefact this whole method produces.

## Honest limits

Sub-district rural granularity is genuinely hard. The regression model in step 6 is a model, not a measurement, and should always be labelled as one. Where a decision hinges on village-level detail, the honest answer is that it needs primary work.
