/**
 * Fill coverage-map.json routes from existing scripts/test*.mjs files.
 * A route maps to a test only when that file mentions the route's last path segment.
 * Controls are merged from inventory.json when present.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectRoutes } from "./inventory.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.join(here, "..");
const tests = fs.readdirSync(scripts).filter((n) => /^test.*\.mjs$/i.test(n));
const needleRoute = (r) => {
  const s = r.split("/").filter(Boolean);
  const last = s[s.length - 1];
  return (last.startsWith(":") ? "/" + s[s.length - 2] : s.length <= 3 ? r : "/" + last).toLowerCase();
};

const routes = {};
for (const route of collectRoutes()) {
  const needle = needleRoute(route);
  const hits = tests.filter((f) => fs.readFileSync(path.join(scripts, f), "utf8").toLowerCase().includes(needle));
  if (hits.length) routes[route] = hits.slice(0, 8);
}

const prev = fs.existsSync(path.join(here, "coverage-map.json"))
  ? JSON.parse(fs.readFileSync(path.join(here, "coverage-map.json"), "utf8"))
  : {};
const controls = prev.controls && typeof prev.controls === "object" && !Array.isArray(prev.controls) ? prev.controls : {};
const inventoryFile = path.join(here, "inventory.json");
if (fs.existsSync(inventoryFile)) {
  const inv = JSON.parse(fs.readFileSync(inventoryFile, "utf8"));
  for (const key of Object.values(inv.controls || {}).flat()) {
    if (controls[key]) continue;
    const ident = String(key).split("|").slice(3).join("|").replace(/#/g, "").toLowerCase().trim();
    if (ident.length < 4) continue;
    const hits = tests.filter((f) => fs.readFileSync(path.join(scripts, f), "utf8").toLowerCase().includes(ident));
    if (hits.length) controls[key] = hits.slice(0, 6);
  }
}

const exemptions = {
  "lock-member": "Team password gate is off (PLATFORM_TEAM_LOCK_ENABLED=false); the unlock form is not reachable.",
  "lock-master": "Team password gate is off (PLATFORM_TEAM_LOCK_ENABLED=false); Master unlock is not reachable.",
};

const map = {
  version: 1,
  phase: 1,
  note: "Routes mapped from existing test files that mention the last path segment. Controls filled from inventory.json when that file exists. Exemptions are only for unreachable lock screens.",
  routes,
  controls,
  exemptions,
};
fs.writeFileSync(path.join(here, "coverage-map.json"), JSON.stringify(map, null, 1));
const mappedR = Object.keys(routes).length;
const allR = collectRoutes().length;
console.log(`wrote scripts/coverage/coverage-map.json — routes ${mappedR}/${allR} controls ${Object.keys(controls).length}`);
