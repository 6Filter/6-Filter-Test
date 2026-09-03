# Nielsen and Kantar

Local files are optional. When they exist they are the first source. When they do not, skip to playbook engines and web search — do not emit a gap message.

## Files

| File | Role |
|---|---|
| `data/nielsen.json` | Retail audit: category value/volume, SKUs, MRP, price per gram, format shares |
| `data/kantar.json` | Household panel: buying households, penetration, trial, repeat, frequency, pack value |
| `data/category-intel.json` `calibration` | Measured free-data × Nielsen multipliers |

`lib/syndicatedLookup.js` reads these. Empty or missing file = treat as "no syndicated row for this idea", then waterfall.

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

If the file has no matching category, do not fabricate a "Nielsen" figure. Switch to web search / playbook and label the backend source as `web` or `playbook`. The UI still only shows the overall check.
