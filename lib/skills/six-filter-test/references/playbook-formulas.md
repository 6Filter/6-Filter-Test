# Playbook formulas (Category Intelligence Mastery Playbook)

Indian FMCG. Figures in any worked example are illustrative — recompute from sources.

## Demand-side — household decomposition (Filter 5 spine)

```
Category value = Households
  × Penetration %
  × Purchase occasions per year
  × Volume per occasion
  × Realised price per unit
```

Each term is separately sourceable. When challenged, dispute one term, not the product.

## Demand-side — per-capita compact

```
Category value = Population
  × Per-capita monthly spend (HCES)
  × 12
  × (1 + out-of-home / institutional uplift)
  × Calibration factor
```

## Supply-side

```
Organised ex-factory = ASI value of output − Exports + Imports
Unorganised ex-factory = Organised × (unorg. share / organised share)
Category value = (Organised × organised markup) + (Unorganised × unorganised markup)
```

Two markups, never one blend. Label retail vs ex-factory.

## Company build-up

```
Category value = Σ (player category revenue, retail-equivalent) ÷ coverage of the player set
```

## Volume / price

```
Volume growth ≈ Value growth − Price growth (WPI or CPI item index)
```

## Reconciliation

- Spread ≤ 15% → median, band = spread.
- Spread > 30% → diagnose; do not average.
- Report P10–P90, P50 as the working estimate.

## Engine choice

| Archetype | Engines |
|---|---|
| Established staple | Demand + supply + company build-up |
| Premium / discretionary | Company build-up + digital proxy + analog |
| Emerging format | Digital proxy + company build-up + analog |
| Heavily unorganised | Demand-side + primary audit analog |

## Calibration doctrine

Free methods fail systematically. Blind-run them against Nielsen categories you hold, store `multiplier = Nielsen / free`, apply to uncovered categories. Never steer the blind estimate toward the answer key.
