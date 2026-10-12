# Narrative guard

`NARRATIVE_GUARD` is `shadow`, `enforce`, or `off`. The default is `shadow`.

In shadow mode the model's paragraph is saved as written. A would-be rejection is logged as `narrative-guard-shadow` with the filter and the reason, and it is counted in the narrative ledger. The paragraph text is not logged. `enforce` replaces a rejected paragraph with the check-item text. `off` skips the guard.

Commit `ffa9c1f` had no mode switch. It enforced every rejection.

## What the guard checks

- Brands. The universe is every benchmark on a stored idea, every competitor in stored findings, the CavinKare brands, and a curated list of major Indian FMCG brands. A paragraph is rejected only when it names a brand from that universe that is not this idea's benchmark or one of its competitors. Ordinary capitalised words are ignored.
- Benchmark. The match is case-insensitive. The brand head is enough, and so is at least 60% of the benchmark's distinctive words.
- Numbers. Only a figure with a rupee sign, `Rs`, or a percent sign is checked. A figure is accepted when it is within 10% of a check value, when it is that value rounded to the nearest 10 or 100, or when it is the difference, ratio, percent change, or sum of two check numbers.

## When to enforce

Enforce only when all three of these are true on the restored copy:

1. False positives are 10% or lower.
2. Recall on injected faults is 95% or higher.
3. The measured contamination justifies replacing live paragraphs.

Otherwise stay in shadow.

## Measurement on the 8 Oct restored copy (12 Oct 2026)

248 stored paragraphs. 57 would be rejected. False-positive rate 23.0%. Recall on injected faults 444 of 444 (100%): another idea's brand 224, a doubled rupee figure that the check rules do not accept 22, the benchmark removed 22, a status word contradicted 176. True contamination is 41 paragraphs that name another idea's brand or a rupee or percent figure the checks do not support. That is not about zero, so contamination would justify a guard. The false-positive rate is above 10%, so the default stays `shadow`.

Remaining rejections, as the offending token and the nearest check value:

| Filter | Reason | Token | Nearest check |
| --- | --- | --- | --- |
| f1 | missing-benchmark | Purastone after shave roll on | Purastone after shave roll on |
| f1 | missing-benchmark | Emami Navratna Cool Oil | Emami Navratna Cool Oil |
| f3 | unknown-rupee, unknown-percent | 7 | 50 |
| f3 | unknown-rupee | 540 | 699 |
| f2 | unknown-percent | 50 | none |
| f3 | unknown-rupee, unknown-percent | 85 | none |
| f4 | unknown-percent | 89.6 | none |
| f1 | missing-benchmark | FabBox Heavenly Millet Chips | FabBox Heavenly Millet Chips |
| f3 | unknown-rupee | 35 | 22 |
| f4 | foreign-brand | Hindustan Unilever | none |
| f1 | missing-benchmark | Purastone after shave roll on | Purastone after shave roll on |
| f3 | unknown-rupee | 38 | 50 |
| f1 | missing-benchmark | herbal cooling stick hair oil competitor | herbal cooling stick hair oil competitor |
| f3 | unknown-percent | 78 | 60 |
| f4 | foreign-brand | Bombay Shaving Company | none |
| f4 | foreign-brand | Aachi | none |
| f1 | missing-benchmark | Purastone after shave roll on | Purastone after shave roll on |
| f1 | foreign-brand, unknown-rupee, unknown-percent | Streax Gel Hair Color | none |
| f2 | unknown-rupee, unknown-percent | 275.33 | none |
| f3 | unknown-rupee, unknown-percent | 336 | none |
| f4 | unknown-percent | 99 | none |
| f1 | missing-benchmark | Purastone after shave roll on | Purastone after shave roll on |
| f1 | missing-benchmark | Himani Navratna Oil | Himani Navratna Oil |
| f1 | missing-benchmark | Purastone after shave roll on | Purastone after shave roll on |
| f3 | unknown-rupee | 235 | 97 |
| f1 | foreign-brand | VLCC | Neutrogena, Nivea, The Man Company, Ustraa |
| f3 | unknown-rupee | 15 | 50 |
| f3 | unknown-rupee | 1450 | 649 |
| f1 | missing-benchmark | FYC Professional Korean Glass Skin Mani | FYC Professional Korean Glass Skin Mani |
| f1 | missing-benchmark | O3+ Pedilogix Bubble Gum Manicure Pedicure Kit | O3+ Pedilogix Bubble Gum Manicure Pedicure Kit |
| f1 | missing-benchmark | Emami Navratna Cool Oil | Emami Navratna Cool Oil |
| f3 | unknown-rupee, unknown-percent | 7 | 50 |
| f1 | foreign-brand, unknown-rupee, unknown-percent | Streax Gel Hair Color | none |
| f2 | unknown-rupee, unknown-percent | 275.33 | none |
| f3 | unknown-rupee, unknown-percent | 336 | none |
| f4 | unknown-percent | 99 | none |
| f3 | unknown-rupee | 307 | 52 |
| f1 | foreign-brand | VLCC | Neutrogena, Nivea, The Man Company, Ustraa |
| f4 | foreign-brand | Navratna | none |
| f1 | missing-benchmark | Purastone after shave roll on | Purastone after shave roll on |
| f1 | missing-benchmark | FYC Professional Korean Glass Skin Mani | FYC Professional Korean Glass Skin Mani |
| f3 | unknown-percent | 6 | 22 |
| f4 | foreign-brand | Hindustan Unilever | none |
| f1 | foreign-brand | Navratna | herbal cooling stick hair oil competitor |
| f4 | foreign-brand | Navratna | none |
| f1 | missing-benchmark | Emami Navratna Ayurvedic Cool Hair Oil | Emami Navratna Ayurvedic Cool Hair Oil |
| f1 | foreign-brand, unknown-rupee, unknown-percent | Streax Gel Hair Color | none |
| f2 | unknown-rupee, unknown-percent | 275.33 | none |
| f3 | unknown-rupee, unknown-percent | 336 | none |
| f4 | unknown-percent | 99 | none |
| f1 | missing-benchmark | Emami Navratna Ayurvedic Cool Hair Oil | Emami Navratna Ayurvedic Cool Hair Oil |
| f1 | foreign-brand | Neutrogena, Nivea, The Man Company, Ustraa | none |
| f2 | unknown-rupee, unknown-percent | 650 | none |
| f3 | unknown-rupee, unknown-percent | 900 | none |
| f4 | unknown-percent | 100 | none |
| f3 | unknown-percent | 1476 | 118 |
| f3 | unknown-rupee | 491 | 699 |
