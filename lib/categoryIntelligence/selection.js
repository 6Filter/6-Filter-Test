/** Port of methods.md §3 — which engines to run by category archetype. */

export const ENGINE_SELECTION = {
  "established-staple": ["E1", "E2", "E3"],
  "premium-discretionary": ["E3", "E7", "E6"],
  "emerging-new-format": ["E7", "E3", "E6"],
  "heavily-informal": ["E1", "E3"],
  "b2b-industrial": ["E2", "E3"],
};

export const SITUATIONAL_ENGINES = ["E4", "E5"];

export function selectedEnginesFor(archetype, { capacityDisclosed = false, gatingAsset = false } = {}) {
  const key = String(archetype || "").trim();
  const base = ENGINE_SELECTION[key] ? [...ENGINE_SELECTION[key]] : ["E1", "E2", "E3"];
  if (capacityDisclosed && !base.includes("E4")) base.push("E4");
  if (gatingAsset && !base.includes("E5")) base.push("E5");
  return base;
}

export function isKnownArchetype(value) {
  return Object.prototype.hasOwnProperty.call(ENGINE_SELECTION, String(value || "").trim());
}
