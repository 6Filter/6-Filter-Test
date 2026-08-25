import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSizingRun } from "./store.js";

function templatePath() {
  const fromHere = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "templates",
    "Category-Sizing-Universal-Template.xlsx"
  );
  const fromCwd = path.join(
    process.cwd(),
    "lib/categoryIntelligence/templates/Category-Sizing-Universal-Template.xlsx"
  );
  return fs.existsSync(fromHere) ? fromHere : fromCwd;
}

function setNum(ws, cell, value) {
  if (value == null || value === "") return;
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  ws.getCell(cell).value = n;
}

function setText(ws, cell, value) {
  if (value == null || value === "") return;
  ws.getCell(cell).value = String(value);
}

function firstSource(engine) {
  const src = Array.isArray(engine?.sources) ? engine.sources[0] : null;
  if (!src) return engine?.calibrationNote || "";
  return [src.title, src.url].filter(Boolean).join(" — ");
}

function engineById(run, id) {
  return (run.enginesRun || []).find((e) => e.engineId === id) || null;
}

function fillE1(ws, engine) {
  if (!engine) return;
  const i = engine.inputs || {};
  setNum(ws, "C5", i.populationMn);
  setNum(ws, "C6", i.perCapitaAnnualSpend);
  setNum(ws, "C7", i.oohUplift ?? 1);
  setText(ws, "E5", firstSource(engine));
}

function fillE2(ws, engine) {
  if (!engine) return;
  const i = engine.inputs || {};
  setNum(ws, "C5", i.valueOfOutputBaseYear);
  setNum(ws, "C7", i.yearsToTrend);
  setNum(ws, "C8", i.annualGrowthForTrending);
  setNum(ws, "C9", i.exports ?? 0);
  setNum(ws, "C10", i.imports ?? 0);
  setNum(ws, "C14", i.formalShareOfCategory);
  setNum(ws, "C18", i.formalMarkup);
  setNum(ws, "C19", i.informalMarkup);
  setText(ws, "E5", firstSource(engine));
}

function fillE3(ws, engine) {
  if (!engine) return;
  const i = engine.inputs || {};
  const rows = Array.isArray(i.playerRevenuesRetailEquivalent)
    ? i.playerRevenuesRetailEquivalent
    : [];
  rows.slice(0, 18).forEach((rev, idx) => {
    setNum(ws, `E${5 + idx}`, rev);
    setText(ws, `B${5 + idx}`, `Player ${idx + 1}`);
  });
  setNum(ws, "C26", i.coverageOfFormalMarket);
  setNum(ws, "C27", i.formalShareOfTotalCategory);
}

function fillE4(ws, engine) {
  if (!engine) return;
  const i = engine.inputs || {};
  const players = Array.isArray(i.players) ? i.players : [];
  players.slice(0, 14).forEach((p, idx) => {
    const r = 5 + idx;
    setText(ws, `B${r}`, p.name || `Player ${idx + 1}`);
    setNum(ws, `C${r}`, p.capacityPerDay);
    setNum(ws, `D${r}`, p.utilisationPct);
    setNum(ws, `E${r}`, p.operatingDays);
  });
  setNum(ws, "C21", i.coverageOfTotalVolume);
  setNum(ws, "C23", i.realisedRetailPrice);
}

function fillE5(ws, engine) {
  if (!engine) return;
  const i = engine.inputs || {};
  setNum(ws, "C8", i.totalAssetsDisclosed);
  setNum(ws, "C9", i.coverageOfTotalBase);
  setNum(ws, "C10", i.avgThroughputPerAsset);
  setNum(ws, "C11", i.shareOfVolumeThroughAsset);
  setNum(ws, "C12", i.realisedRetailPrice);
}

function fillE6(ws, engine) {
  if (!engine) return;
  const i = engine.inputs || {};
  setNum(ws, "C6", i.analogPerCapitaConsumption);
  setNum(ws, "C7", i.analogIncomePerCapita);
  setNum(ws, "C8", i.yourIncomePerCapita);
  setNum(ws, "C9", i.incomeElasticity ?? 1);
  setNum(ws, "C10", i.yourPopulationMn);
  setNum(ws, "C11", i.realisedRetailPrice);
}

function fillE7(ws, engine) {
  if (!engine) return;
  const i = engine.inputs || {};
  setNum(ws, "C5", i.yourUnitsSoldKnown);
  setNum(ws, "C6", i.yourReviewCountIncrease);
  setNum(ws, "C8", i.solicitationAdjustment ?? 1);
  setNum(ws, "C9", i.totalCategoryReviewIncrease);
  setNum(ws, "C10", i.platformShareOfEcom);
  setNum(ws, "C11", i.ecomShareOfCategory);
  setNum(ws, "C12", i.realisedRetailPrice);
  setNum(ws, "C13", i.volumePerUnit);
}

export async function buildSizingWorkbookBuffer(runId, { categoryName = "" } = {}) {
  const run = await getSizingRun(runId);
  if (!run) return null;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath());

  const setup = wb.getWorksheet("Category Setup");
  if (setup) {
    setText(setup, "C5", categoryName || run.categoryArchetype || "");
    setText(setup, "C6", "All-India");
    setText(setup, "C8", "INR crore");
    setText(setup, "C10", "6 Filter Test");
    setText(setup, "C11", new Date().toISOString().slice(0, 10));
  }

  fillE1(wb.getWorksheet("E1 Demand-side"), engineById(run, "E1"));
  fillE2(wb.getWorksheet("E2 Supply-side"), engineById(run, "E2"));
  fillE3(wb.getWorksheet("E3 Company build-up"), engineById(run, "E3"));
  fillE4(wb.getWorksheet("E4 Capacity"), engineById(run, "E4"));
  fillE5(wb.getWorksheet("E5 Installed base"), engineById(run, "E5"));
  fillE6(wb.getWorksheet("E6 Analog transfer"), engineById(run, "E6"));
  fillE7(wb.getWorksheet("E7 Digital proxy"), engineById(run, "E7"));

  const growth = wb.getWorksheet("Growth Decomposition");
  if (growth && run.growthDecomposition) {
    setNum(growth, "C5", run.growthDecomposition.valueGrowthPct);
    setNum(growth, "C6", run.growthDecomposition.priceGrowthPct);
    setText(growth, "C17", run.growthDecomposition.classification || "");
  }

  const recon = wb.getWorksheet("Reconciliation");
  if (recon) {
    setText(recon, "C28", run.reconciliation?.diagnosis || run.reconciliation?.status || "");
    setText(recon, "C30", run.whatCouldNotBeEstablished || "");
    for (const e of run.enginesRun || []) {
      const row = { E1: 5, E2: 6, E3: 7, E4: 8, E5: 9, E6: 10, E7: 11 }[e.engineId];
      if (row) setText(recon, `F${row}`, e.weakness || e.calibrationNote || "");
    }
  }

  const log = wb.getWorksheet("Assumption Log");
  if (log) {
    setText(log, "B5", "What free data cannot tell you");
    setText(log, "C5", run.whatCouldNotBeEstablished || "");
    setText(log, "B6", "Archetype");
    setText(log, "C6", run.categoryArchetype || "");
    setText(log, "B7", "Reconciliation status");
    setText(log, "C7", run.reconciliation?.status || "");
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
