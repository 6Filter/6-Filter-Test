import { computeEngine } from "./engines.js";
import { selectedEnginesFor } from "./selection.js";
import { reconcile } from "./reconcile.js";
import { decomposeGrowth, growthStageFrom } from "./growthDecomposition.js";
import { latestCalibration } from "./store.js";

const CALIBRATED_ENGINES = new Set(["E1", "E2", "E7"]);

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function applyCalibration(engineId, archetype, estimate) {
  if (estimate == null || !CALIBRATED_ENGINES.has(engineId)) {
    return { value: estimate, note: null, multiplier: null };
  }
  const row = await latestCalibration(engineId, archetype);
  if (!row || !Number.isFinite(Number(row.multiplier))) {
    return { value: estimate, note: null, multiplier: null };
  }
  const multiplier = Number(row.multiplier);
  const measured = row.measured_from_category || "a related category";
  const when = row.measured_at
    ? new Date(row.measured_at).toLocaleString("en-IN", { month: "short", year: "numeric" })
    : "";
  return {
    value: estimate * multiplier,
    multiplier,
    note: `${engineId} estimate adjusted ×${multiplier.toFixed(2)} per your calibration on ${measured}${when ? `, measured ${when}` : ""}`,
  };
}

export async function assembleFromModelPayload(parsed, { capacityDisclosed = false, gatingAsset = false } = {}) {
  const archetype = String(parsed?.categoryArchetype || "").trim();
  const selected = selectedEnginesFor(archetype, { capacityDisclosed, gatingAsset });
  const claimed = Array.isArray(parsed?.enginesRun) ? parsed.enginesRun : [];
  const enginesRun = [];
  const enginesNotRun = Array.isArray(parsed?.enginesNotRun) ? [...parsed.enginesNotRun] : [];

  const claimedIds = new Set(claimed.map((e) => e?.engineId).filter(Boolean));
  for (const engineId of selected) {
    if (!claimedIds.has(engineId) && !enginesNotRun.some((e) => e.engineId === engineId)) {
      enginesNotRun.push({ engineId, reason: "Model did not return inputs for this selected engine." });
    }
  }

  for (const row of claimed) {
    const engineId = String(row?.engineId || "").trim();
    if (engineId && selected.length && !selected.includes(engineId)) {
      enginesNotRun.push({
        engineId,
        reason: `Not selected for archetype ${archetype || "(unclassified)"}.`,
      });
      continue;
    }
    const inputs = { ...(row?.inputs && typeof row.inputs === "object" ? row.inputs : {}) };
    // Stored calibration is applied after the engine, never silently via E1's own factor.
    if (engineId === "E1") delete inputs.calibrationFactor;
    const computed = computeEngine(engineId, inputs);
    if (computed == null) {
      enginesNotRun.push({
        engineId: engineId || "unknown",
        reason: row?.reason || "Required engine input missing — engine not run.",
        inputs,
      });
      continue;
    }
    const calibrated = await applyCalibration(engineId, archetype, computed);
    enginesRun.push({
      engineId,
      inputs,
      estimateCr: calibrated.value,
      rawEstimateCr: computed,
      calibrationNote: calibrated.note,
      sources: Array.isArray(row.sources) ? row.sources : [],
      weakness: row.weakness || "",
    });
  }

  const ranIds = new Set(enginesRun.map((e) => e.engineId));
  const dedupedNotRun = [];
  const seenNot = new Set();
  for (const row of enginesNotRun) {
    const id = row?.engineId;
    if (!id || ranIds.has(id) || seenNot.has(id)) continue;
    seenNot.add(id);
    dedupedNotRun.push(row);
  }

  const recon = reconcile(
    enginesRun.map((e) => ({
      engineId: e.engineId,
      value: e.estimateCr,
      weakness: e.weakness,
    }))
  );

  const growth = decomposeGrowth({
    valueGrowthPct: parsed?.growthDecomposition?.valueGrowthPct,
    priceGrowthPct: parsed?.growthDecomposition?.priceGrowthPct,
  });

  const growthStage = growthStageFrom({
    classification: growth?.classification,
    growthStageHint: parsed?.growthStage,
  });

  return {
    categoryArchetype: archetype,
    enginesRun,
    enginesNotRun: dedupedNotRun,
    reconciliation: {
      ...recon,
      medianCr: recon.median,
      p10Cr: recon.p10,
      p50Cr: recon.p50,
      p90Cr: recon.p90,
      diagnosis: parsed?.reconciliation?.diagnosis || (recon.status === "DIAGNOSE" ? recon.diagnosticOrder?.join("; ") : ""),
    },
    growthDecomposition: growth,
    growthStage,
    categoryTamCr: num(recon.p50),
    calibrationNotes: enginesRun.map((e) => e.calibrationNote).filter(Boolean),
  };
}

export async function recomputeFromEngines(enginesRun, enginesNotRun, {
  categoryArchetype,
  growthDecomposition,
  whatCouldNotBeEstablished = "",
} = {}) {
  const recon = reconcile(
    (enginesRun || []).map((e) => ({
      engineId: e.engineId,
      value: e.estimateCr,
      weakness: e.weakness,
    }))
  );
  const growth = decomposeGrowth({
    valueGrowthPct: growthDecomposition?.valueGrowthPct,
    priceGrowthPct: growthDecomposition?.priceGrowthPct,
  });
  return {
    categoryArchetype,
    enginesRun,
    enginesNotRun,
    reconciliation: {
      ...recon,
      medianCr: recon.median,
      p10Cr: recon.p10,
      p50Cr: recon.p50,
      p90Cr: recon.p90,
      diagnosis: recon.status === "DIAGNOSE" ? recon.diagnosticOrder?.join("; ") : recon.reason || "",
    },
    growthDecomposition: growth || growthDecomposition || null,
    categoryTamCr: num(recon.p50),
    whatCouldNotBeEstablished,
    calibrationNotes: (enginesRun || []).map((e) => e.calibrationNote).filter(Boolean),
  };
}
