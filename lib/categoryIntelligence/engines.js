/**
 * Seven category-sizing engines, ported from Category-Sizing-Universal-Template.xlsx.
 * Any missing required input returns null ("not run") — never invent a number.
 *
 * Also exports dormant formula-sheet helpers (household decomposition, market share,
 * distribution). Those are not registered in ENGINE_FNS / computeEngine.
 */

function num(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function share(value) {
  const n = num(value);
  if (n == null) return null;
  return n > 1 ? n / 100 : n;
}

function pctUtil(value) {
  const n = num(value);
  if (n == null) return null;
  return n > 1 ? n / 100 : n;
}

// E1 — Demand-side (per-capita compact form)
// Sheet 'E1 Demand-side' C9: =IFERROR(C5*C6/10*C7*C8,"")
export function engine1DemandSide({
  populationMn,
  perCapitaAnnualSpend,
  oohUplift,
  calibrationFactor,
}) {
  if (populationMn == null || perCapitaAnnualSpend == null) return null;
  const pop = num(populationMn);
  const spend = num(perCapitaAnnualSpend);
  if (pop == null || spend == null) return null;
  const ooh = oohUplift == null || oohUplift === "" ? 1 : num(oohUplift);
  const cal = calibrationFactor == null || calibrationFactor === "" ? 1 : num(calibrationFactor);
  if (ooh == null || cal == null) return null;
  return ((pop * spend) / 10) * ooh * cal;
}

// E2 — Supply-side, two markups never one blended markup
// C11 formal = C5*(1+C8)^C7-C9+C10
// C15 informal = C11*(1-C14)/C14
// C21 total = C11*C18+C15*C19
export function engine2SupplySide({
  valueOfOutputBaseYear,
  yearsToTrend,
  annualGrowthForTrending,
  exports,
  imports,
  formalShareOfCategory,
  formalMarkup,
  informalMarkup,
}) {
  if (valueOfOutputBaseYear == null || formalShareOfCategory == null) return null;
  const base = num(valueOfOutputBaseYear);
  const years = num(yearsToTrend) ?? 0;
  const growth = share(annualGrowthForTrending) ?? 0;
  const exp = num(exports) ?? 0;
  const imp = num(imports) ?? 0;
  const formalShare = share(formalShareOfCategory);
  const fMarkup = num(formalMarkup);
  const iMarkup = num(informalMarkup);
  if (base == null || formalShare == null || formalShare <= 0 || fMarkup == null || iMarkup == null) {
    return null;
  }
  const formalExFactory = base * Math.pow(1 + growth, years) - exp + imp;
  const informalExFactory = (formalExFactory * (1 - formalShare)) / formalShare;
  return formalExFactory * fMarkup + informalExFactory * iMarkup;
}

// E3 — Company build-up
// E23 = SUM(retail-equivalent); C28 = E23/C26; C29 = C28/C27
export function engine3CompanyBuildup({
  playerRevenuesRetailEquivalent,
  coverageOfFormalMarket,
  formalShareOfTotalCategory,
}) {
  const rows = Array.isArray(playerRevenuesRetailEquivalent)
    ? playerRevenuesRetailEquivalent.map(num).filter((n) => n != null)
    : [];
  const coverage = share(coverageOfFormalMarket);
  const formalShare = share(formalShareOfTotalCategory);
  if (!rows.length || !coverage || !formalShare) return null;
  const sum = rows.reduce((a, b) => a + b, 0);
  const impliedFormalMarket = sum / coverage;
  return impliedFormalMarket / formalShare;
}

// E4 — Installed capacity
// F = capacityPerDay * utilisationPct * operatingDays / 1000
// C22 = F19 / coverage; C24 = C22 * price / 10
export function engine4Capacity({ players, coverageOfTotalVolume, realisedRetailPrice }) {
  const list = Array.isArray(players) ? players : [];
  const coverage = share(coverageOfTotalVolume);
  const price = num(realisedRetailPrice);
  if (!list.length || !coverage || price == null) return null;
  let totalVolume = 0;
  let any = false;
  for (const p of list) {
    const cap = num(p?.capacityPerDay);
    const util = pctUtil(p?.utilisationPct);
    const days = num(p?.operatingDays);
    if (cap == null || util == null || days == null) continue;
    totalVolume += (cap * util * days) / 1000;
    any = true;
  }
  if (!any) return null;
  const impliedTotalVolume = totalVolume / coverage;
  return (impliedTotalVolume * price) / 10;
}

// E5 — Installed base / gating asset
// Workbook C16: =IFERROR(C15*C12/10,"")  — divisor 10, same crore conversion as E1/E4/E6
export function engine5InstalledBase({
  totalAssetsDisclosed,
  coverageOfTotalBase,
  avgThroughputPerAsset,
  shareOfVolumeThroughAsset,
  realisedRetailPrice,
}) {
  const assets = num(totalAssetsDisclosed);
  const coverage = share(coverageOfTotalBase);
  const throughput = num(avgThroughputPerAsset);
  const volShare = share(shareOfVolumeThroughAsset);
  const price = num(realisedRetailPrice);
  if (!assets || !coverage || !throughput || !volShare || price == null) return null;
  const totalBaseGrossedUp = assets / coverage;
  const volumeThroughAsset = (totalBaseGrossedUp * throughput) / 1000;
  const impliedTotalVolume = volumeThroughAsset / volShare;
  return (impliedTotalVolume * price) / 10;
}

// E6 — Analog transfer (headroom / sanity-check only)
// C14: =IFERROR(C12*C10*C11/10,"")
export function engine6AnalogTransfer({
  analogPerCapitaConsumption,
  analogIncomePerCapita,
  yourIncomePerCapita,
  incomeElasticity,
  yourPopulationMn,
  realisedRetailPrice,
}) {
  const analogPc = num(analogPerCapitaConsumption);
  const analogInc = num(analogIncomePerCapita);
  const yourInc = num(yourIncomePerCapita);
  const elast = num(incomeElasticity) ?? 1;
  const pop = num(yourPopulationMn);
  const price = num(realisedRetailPrice);
  if (!analogPc || !analogInc || !yourInc || pop == null || price == null) return null;
  const incomeAdjusted = analogPc * Math.pow(yourInc / analogInc, elast);
  return (incomeAdjusted * pop * price) / 10;
}

// E7 — Digital proxy
// Workbook C16: =IFERROR(C15*C13*C12/10000,"")
// Divisor 10000: units sold are entered in '000 (sheet note).
export function engine7DigitalProxy({
  yourUnitsSoldKnown,
  yourReviewCountIncrease,
  solicitationAdjustment,
  totalCategoryReviewIncrease,
  platformShareOfEcom,
  ecomShareOfCategory,
  realisedRetailPrice,
  volumePerUnit,
}) {
  const units = num(yourUnitsSoldKnown);
  const ownReviews = num(yourReviewCountIncrease);
  const catReviews = num(totalCategoryReviewIncrease);
  const solicit = num(solicitationAdjustment) ?? 1;
  const platShare = share(platformShareOfEcom);
  const ecomShare = share(ecomShareOfCategory);
  const price = num(realisedRetailPrice);
  const vol = num(volumePerUnit);
  if (!units || !ownReviews || !catReviews || !platShare || !ecomShare || price == null || vol == null) {
    return null;
  }
  const reviewRate = ownReviews / units;
  if (!reviewRate) return null;
  const impliedPlatformUnits = catReviews / (reviewRate * solicit);
  const impliedTotalCategoryUnits = impliedPlatformUnits / platShare / ecomShare;
  return (impliedTotalCategoryUnits * vol * price) / 10000;
}

// Formula sheet — Demand-side household decomposition (methods.md §1)
// Category value = Households × Penetration% × Purchase occasions/yr
//                × Volume/occasion × Realised price/unit
// householdsMn in millions; divisor 10 converts ₹ millions → ₹ crore (same as E1).
export function engine8HouseholdDecomposition({
  householdsMn,
  penetrationPct,
  purchaseOccasionsPerYear,
  volumePerOccasion,
  realisedPricePerUnit,
}) {
  if (
    householdsMn == null ||
    penetrationPct == null ||
    purchaseOccasionsPerYear == null ||
    volumePerOccasion == null ||
    realisedPricePerUnit == null
  ) {
    return null;
  }
  const hh = num(householdsMn);
  const pen = share(penetrationPct);
  const occ = num(purchaseOccasionsPerYear);
  const vol = num(volumePerOccasion);
  const price = num(realisedPricePerUnit);
  if (hh == null || pen == null || occ == null || vol == null || price == null) return null;
  return (hh * pen * occ * vol * price) / 10;
}

// Formula sheet — Market share (methods.md §1)
// Share = own audited sales ÷ triangulated category size
export function computeMarketShare({ auditedSales, triangulatedCategorySize }) {
  if (auditedSales == null || triangulatedCategorySize == null) return null;
  const sales = num(auditedSales);
  const size = num(triangulatedCategorySize);
  if (sales == null || size == null || size === 0) return null;
  return sales / size;
}

// Formula sheet — Numeric distribution (methods.md §1)
// Numeric distribution = outlets served ÷ total outlet universe
export function computeNumericDistribution({ outletsServed, totalOutletUniverse }) {
  if (outletsServed == null || totalOutletUniverse == null) return null;
  const served = num(outletsServed);
  const universe = num(totalOutletUniverse);
  if (served == null || universe == null || universe === 0) return null;
  return served / universe;
}

// Formula sheet — Weighted distribution (methods.md §1)
// Weighted distribution = Σ throughput of outlets served ÷ Σ throughput of all outlets
export function computeWeightedDistribution({ throughputOfOutletsServed, throughputOfAllOutlets }) {
  const served = Array.isArray(throughputOfOutletsServed)
    ? throughputOfOutletsServed.map(num).filter((n) => n != null)
    : [];
  const all = Array.isArray(throughputOfAllOutlets)
    ? throughputOfAllOutlets.map(num).filter((n) => n != null)
    : [];
  if (!served.length || !all.length) return null;
  const sumServed = served.reduce((a, b) => a + b, 0);
  const sumAll = all.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(sumServed) || !Number.isFinite(sumAll) || sumAll === 0) return null;
  return sumServed / sumAll;
}

const ENGINE_FNS = {
  E1: engine1DemandSide,
  E2: engine2SupplySide,
  E3: engine3CompanyBuildup,
  E4: engine4Capacity,
  E5: engine5InstalledBase,
  E6: engine6AnalogTransfer,
  E7: engine7DigitalProxy,
};

export function computeEngine(engineId, inputs) {
  const fn = ENGINE_FNS[engineId];
  if (!fn) return null;
  try {
    const value = fn(inputs || {});
    return value == null || !Number.isFinite(value) ? null : value;
  } catch {
    return null;
  }
}
