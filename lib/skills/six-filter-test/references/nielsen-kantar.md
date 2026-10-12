# Nielsen and Kantar

There is no live Nielsen or Kantar feed. Loaded rows are a Master import into the `syndicated_rows` table. On a local file-mode server only, `data/nielsen.json` and `data/kantar.json` are a fallback when that table is empty. Those files are not on the live service. When no row matches, research uses public web search and must not invent a Nielsen figure.

## Where rows live

| Place | Role |
|---|---|
| `syndicated_rows` | Live and local Postgres: retail audit and household panel rows, with `source` and `as_of` |
| `data/nielsen.json` | Local development fallback only |
| `data/kantar.json` | Local development fallback only |

`lookupSyndicatedData` matches exact category, then family. An empty match is "no local row", then the public-source waterfall.

## Nielsen row shape (one object per category or SKU)

```json
{
  "category": "hair oil",
  "period": "2025",
  "geography": "All-India",
  "categoryValueCr": 23500,
  "categoryVolumeTonnes": null,
  "valueGrowthPct": 9.1,
  "volumeGrowthPct": 3.7,
  "formatShares": [{ "format": "bottle", "sharePct": 62 }],
  "products": [
    {
      "brand": "Example",
      "variant": "Cooling",
      "pack": "100 ml",
      "mrpInr": 99,
      "gramsOrMl": 100,
      "pricePerGram": 0.99
    }
  ]
}
```

**Use for:** Filter 1 named benchmark (pick the largest currently-selling SKU in the exact segment). Filter 1 category size and growth argument. Filter 3 price index = (idea MRP/g) ÷ (benchmark MRP/g) × 100. Filter 4 structural signals (emerging formats, adjacent substitutes) when a public citation exists; else web search. Format-share trend lines are not the F4 gate.

## Kantar row shape

```json
{
  "category": "hair oil",
  "period": "2025",
  "geography": "All-India urban",
  "householdsMn": 270,
  "penetrationPct": 87,
  "trialRatePct": 18,
  "repeatConversionPct": 55,
  "purchaseFrequencyYr": 12.5,
  "avgPackValueInr": 99
}
```

**Use for:** Filter 5 five factors. Year-3 households reached is not "all buying HH" — scale Kantar buying HH by a credible reach assumption (distribution × awareness analog) and still fill a number.

## Calibration

If `calibration_factors` has a multiplier for this archetype (staple / premium / emerging), apply it to HCES/ASI/build-up estimates: `corrected = raw × multiplier`. Quote the band from method spread, not a decorative ±10%.

## Never invent a Nielsen number

If no loaded row matches the category, do not fabricate a Nielsen figure. Switch to public web search and label the source as public. The filter card states that there is no local Nielsen or Kantar row.
