import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  engine1DemandSide,
  engine8HouseholdDecomposition,
  computeMarketShare,
  computeNumericDistribution,
  computeWeightedDistribution,
  computeEngine,
} from "../lib/categoryIntelligence/engines.js";

// (a) worked examples
assert.equal(
  engine8HouseholdDecomposition({
    householdsMn: 100,
    penetrationPct: 50,
    purchaseOccasionsPerYear: 12,
    volumePerOccasion: 1,
    realisedPricePerUnit: 100,
  }),
  6000,
  "100mn HH × 50% × 12 × 1 × ₹100 / 10 = ₹6,000 Cr"
);

assert.equal(
  computeMarketShare({ auditedSales: 50, triangulatedCategorySize: 200 }),
  0.25
);

assert.equal(
  computeNumericDistribution({ outletsServed: 2000, totalOutletUniverse: 10000 }),
  0.2
);

assert.equal(
  computeWeightedDistribution({
    throughputOfOutletsServed: [10, 20],
    throughputOfAllOutlets: [10, 20, 70],
  }),
  0.3
);

// (b) null on missing / non-finite / zero denominator
assert.equal(engine8HouseholdDecomposition({ householdsMn: 100 }), null);
assert.equal(
  engine8HouseholdDecomposition({
    householdsMn: 100,
    penetrationPct: "x",
    purchaseOccasionsPerYear: 12,
    volumePerOccasion: 1,
    realisedPricePerUnit: 100,
  }),
  null
);
assert.equal(computeMarketShare({ auditedSales: 50 }), null);
assert.equal(computeMarketShare({ auditedSales: 50, triangulatedCategorySize: 0 }), null);
assert.equal(computeMarketShare({ auditedSales: "na", triangulatedCategorySize: 200 }), null);
assert.equal(computeNumericDistribution({ outletsServed: 10 }), null);
assert.equal(computeNumericDistribution({ outletsServed: 10, totalOutletUniverse: 0 }), null);
assert.equal(computeWeightedDistribution({ throughputOfOutletsServed: [1] }), null);
assert.equal(
  computeWeightedDistribution({
    throughputOfOutletsServed: [],
    throughputOfAllOutlets: [1, 2],
  }),
  null
);
assert.equal(
  computeWeightedDistribution({
    throughputOfOutletsServed: [1],
    throughputOfAllOutlets: [0, 0],
  }),
  null
);

// share() accepts fraction or percent for household penetration
assert.equal(
  engine8HouseholdDecomposition({
    householdsMn: 100,
    penetrationPct: 0.5,
    purchaseOccasionsPerYear: 12,
    volumePerOccasion: 1,
    realisedPricePerUnit: 100,
  }),
  6000
);

// (c) ENGINE_FNS still exactly E1–E7 — dormant helpers not dispatched
const enginesSrc = readFileSync(
  new URL("../lib/categoryIntelligence/engines.js", import.meta.url),
  "utf8"
);
const mapBlock = enginesSrc.slice(
  enginesSrc.indexOf("const ENGINE_FNS = {"),
  enginesSrc.indexOf("};", enginesSrc.indexOf("const ENGINE_FNS = {")) + 2
);
assert.match(mapBlock, /E1:\s*engine1DemandSide/);
assert.match(mapBlock, /E2:\s*engine2SupplySide/);
assert.match(mapBlock, /E3:\s*engine3CompanyBuildup/);
assert.match(mapBlock, /E4:\s*engine4Capacity/);
assert.match(mapBlock, /E5:\s*engine5InstalledBase/);
assert.match(mapBlock, /E6:\s*engine6AnalogTransfer/);
assert.match(mapBlock, /E7:\s*engine7DigitalProxy/);
assert.doesNotMatch(mapBlock, /E8|engine8HouseholdDecomposition|computeMarketShare|computeNumericDistribution|computeWeightedDistribution/);
assert.equal(computeEngine("E8", { householdsMn: 100 }), null);
assert.equal(
  typeof engine1DemandSide,
  "function",
  "existing E1 export must remain available"
);

console.log("PASS Part 92: dormant formula-sheet helpers (household / share / distribution)");
