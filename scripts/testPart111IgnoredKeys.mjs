import assert from "node:assert/strict";
import { patchIgnoredKeys } from "../lib/ignoredKeyRefresh.js";

const local = {
  f1: { declaredAttribute: "still typing", benchmark: "kept" },
  f2: { cogsAtScale: "" },
};
const server = {
  f1: { declaredAttribute: "server copy", benchmark: "kept" },
  f2: { cogsAtScale: 40 },
};
const refreshed = patchIgnoredKeys(local, server, ["f2.cogsAtScale", "f1.declaredAttribute"], "f1.declaredAttribute");
assert.equal(refreshed.doc.f1.declaredAttribute, "still typing");
assert.equal(refreshed.doc.f1.benchmark, "kept");
assert.equal(Number(refreshed.doc.f2.cogsAtScale), 40);
assert.deepEqual(refreshed.applied, ["f2.cogsAtScale"]);

console.log("PASS ignored keys leave the active field alone");
