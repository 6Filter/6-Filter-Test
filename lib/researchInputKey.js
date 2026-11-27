/**
 * Fingerprint of every screening input. Change → full new search on Submit.
 * Ignores only capital letters and spaces.
 */
import { difficultyFromDoc } from "./difficultyLevel.js";
import { TECH_SHIFT_DIMENSIONS } from "./techShiftRisk.js";

function normBit(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function attachmentSig(doc) {
  const attach = doc?.attachment;
  if (attach?.data) return `data:${String(attach.data).length}`;
  if (attach?.name) return `name:${attach.name}`;
  return "";
}

function evidenceSig(doc) {
  const meta = doc?.f1?.evidenceSourceFile;
  if (meta && typeof meta === "object") {
    return `ev:${meta.sha256 || ""}:${meta.name || ""}:${meta.size || ""}`;
  }
  return `evlink:${doc?.f1?.evidenceSourceDate || ""}`;
}

function f4Bits(doc) {
  const risk = doc?.f4?.techShiftRisk;
  const dims = risk?.dimensions && typeof risk.dimensions === "object" ? risk.dimensions : {};
  const inputs = doc?.f4?.userInputs && typeof doc.f4.userInputs === "object" ? doc.f4.userInputs : {};
  const mit =
    doc?.f4?.f4MitigationResponses && typeof doc.f4.f4MitigationResponses === "object"
      ? doc.f4.f4MitigationResponses
      : {};
  const bits = [normBit(risk?.overallRisk)];
  for (const key of TECH_SHIFT_DIMENSIONS) {
    const cell = dims[key] && typeof dims[key] === "object" ? dims[key] : {};
    const ui = inputs[key] && typeof inputs[key] === "object" ? inputs[key] : {};
    bits.push(
      normBit(cell.risk),
      normBit(cell.reason),
      normBit(cell.userResponse),
      normBit(ui.rating),
      normBit(ui.pov),
      normBit(mit[key])
    );
  }
  return bits;
}

export function researchInputKey(doc = {}) {
  const f1 = doc?.f1 && typeof doc.f1 === "object" ? doc.f1 : {};
  const f2 = doc?.f2 && typeof doc.f2 === "object" ? doc.f2 : {};
  const f3 = doc?.f3 && typeof doc.f3 === "object" ? doc.f3 : {};
  const bits = [
    doc?.name,
    doc?.ideaDescription,
    doc?.category,
    doc?.division,
    f1.declaredAttribute,
    f1.declaredAttribute2,
    f1.declaredAttribute3,
    f1.benchmark,
    f1.declaredGap,
    f1.gapDerivation,
    f1.parityExceptions,
    f1.growthRoute,
    f1.growthArgument,
    f2.grammage,
    f2.cogsAtScale,
    f2.netMarginAtScale,
    f2.gstRatePct,
    f2.mrpOverride === true ? f2.mrpInr : "",
    f3.volumeLossJustification,
    attachmentSig(doc),
    evidenceSig(doc),
    difficultyFromDoc(doc),
    ...f4Bits(doc),
  ].map(normBit);
  return bits.join("|");
}

export function researchInputsUnchanged(a, b) {
  return researchInputKey(a) === researchInputKey(b);
}
