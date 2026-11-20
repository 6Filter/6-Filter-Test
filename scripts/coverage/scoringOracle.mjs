/**
 * Independent scoring oracle for the locked v5.7 fixed-slot relevance model.
 * Reads only lockedConstants (the written numbers) and TECH_SHIFT_DIMENSIONS.
 * Does not import scoreSlots.js or goNoGo.js — those are the system under test.
 */
import {
  CHECK_WEIGHTS,
  GONOGO_SCORE_BANDS,
  SCORE_CHECK_SLOTS,
  SCORE_CHECK_SLOTS_TOTAL,
} from "../../lib/lockedConstants.js";
import { TECH_SHIFT_DIMENSIONS } from "../../lib/techShiftRisk.js";

export const F1_SLOTS = ["benchmark", "gap", "attributes", "derivation", "parity", "route", "argument"];
export const F2_SLOTS = ["margin", "packSize", "gst"];
export const F3_SLOTS = ["resilience"];
export const F4_SLOTS = [...TECH_SHIFT_DIMENSIONS];

function clip(n) {
  return Math.max(0, Math.min(1, Number(n)));
}

function itemCredit(it) {
  if (it && typeof it === "object" && "credit" in it && Number.isFinite(Number(it.credit))) return clip(it.credit);
  return it?.status === "done" ? 1 : 0;
}

function weight(filter, slot) {
  const w = CHECK_WEIGHTS?.[filter]?.[slot];
  return Number.isFinite(Number(w)) && Number(w) > 0 ? Number(w) : 1;
}

function f1Points(check) {
  if (String(check?.checkLabel || "") === "Exempt") return { points: 0, slots: 0, exempt: true };
  const items = Array.isArray(check?.items) ? check.items : [];
  let points = 0;
  for (let i = 0; i < F1_SLOTS.length; i++) {
    points += itemCredit(items[i]) * weight("f1", F1_SLOTS[i]);
  }
  return { points, slots: SCORE_CHECK_SLOTS.f1, exempt: false };
}

function slottedPoints(filter, slots, check) {
  const items = Array.isArray(check?.items) ? check.items : [];
  const used = new Set();
  let points = 0;
  for (const slot of slots) {
    let idx = items.findIndex((it, i) => !used.has(i) && String(it?.slot || "") === slot);
    if (idx < 0 && (filter === "f2" || filter === "f4")) {
      idx = items.findIndex((_, i) => !used.has(i));
    }
    if (idx < 0) continue;
    used.add(idx);
    points += itemCredit(items[idx]) * weight(filter, slot);
  }
  return { points, slots: slots.length, exempt: false };
}

export function oracleScore(advisory = {}) {
  const f1 = f1Points(advisory.f1);
  const f2 = slottedPoints("f2", F2_SLOTS, advisory.f2);
  const f3 = slottedPoints("f3", F3_SLOTS, advisory.f3);
  const f4 = slottedPoints("f4", F4_SLOTS, advisory.f4);
  const parts = { f1, f2, f3, f4 };
  let points = 0;
  let total = 0;
  for (const row of Object.values(parts)) {
    points += row.points;
    total += row.slots;
  }
  if (total === 0) total = SCORE_CHECK_SLOTS_TOTAL;
  const pct = total ? Math.round((100 * points) / total) : 0;
  let classification = "NO-GO";
  if (pct > GONOGO_SCORE_BANDS.WATCH_MAX) classification = "GO";
  else if (pct >= GONOGO_SCORE_BANDS.NOGO_MAX) classification = "WATCH";
  return {
    points: Math.round(points * 1000) / 1000,
    total,
    pct,
    classification,
    exemptF1: f1.exempt,
  };
}
