/**
 * Part 147 — the light cream-and-brown theme tokens.
 * Stand-in for the owner's testThemeTokens.mjs (not available on this machine); same six checks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ref = read("./themeTokens.light.reference.css");
const src = read("../src/PropositionForm.jsx");
const css = src.slice(src.indexOf("export const PROP_CSS"));
const tokenRule = css.slice(css.indexOf(".prop-form-page,.output-page{"), css.indexOf("\n}\n", css.indexOf(".prop-form-page,.output-page{")));

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim().toLowerCase();
  return out;
}
const R = tokens(ref);
const A = tokens(tokenRule);

let checks = 0;
function check(name, fn) {
  try {
    fn();
    checks += 1;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
}

const rgb = (hex) => {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hue = (hex) => {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (!d) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
};

check("1. every Part 147 token exists in the app with the owner's value", () => {
  for (const [k, v] of Object.entries(R)) assert.equal(A[k], v, `--${k}: app ${A[k]} vs reference ${v}`);
});

check("2. the theme is light with a brown accent", () => {
  for (const k of ["c-bg-page", "card-bg", "input-bg"]) assert.ok(lum(A[k]) > 0.8, `${k} must be light`);
  const h = hue(A["c-accent"]);
  assert.ok(h >= 15 && h <= 40, `accent hue ${h.toFixed(0)} is brown/orange`);
  assert.ok(lum(A["c-accent"]) < 0.2, "accent is a dark brown, not a pastel");
  assert.ok(ratio(A["c-accent-text"], A["c-accent"]) >= 4.5, "white text on the brand button");
});

check("3. every text colour meets WCAG AA (4.5:1) on page, card and box fills", () => {
  const texts = ["c-text-strong", "c-label", "c-text", "c-input", "c-text-muted", "c-placeholder", "c-section", "c-required", "c-link", "c-optional", "c-go", "c-credited", "c-watch", "c-partial", "c-nogo", "c-error"];
  const surfaces = ["c-bg-page", "card-bg", "input-bg"];
  for (const t of texts) {
    for (const s of surfaces) {
      const r = ratio(A[t], A[s]);
      assert.ok(r >= 4.5, `--${t} ${A[t]} on --${s} ${A[s]} = ${r.toFixed(2)}`);
    }
  }
});

check("4. the verdicts and the chips differ by hue (not by lightness alone)", () => {
  const go = hue(A["c-go"]);
  const watch = hue(A["c-watch"]);
  const nogo = hue(A["c-nogo"]);
  assert.ok(Math.abs(go - watch) >= 30, `GO ${go.toFixed(0)} vs WATCH ${watch.toFixed(0)}`);
  assert.ok(Math.abs(watch - nogo) >= 15, `WATCH ${watch.toFixed(0)} vs NO-GO ${nogo.toFixed(0)}`);
  assert.ok(Math.abs(go - nogo) >= 60, `GO ${go.toFixed(0)} vs NO-GO ${nogo.toFixed(0)}`);
  // check-pill rules: credited green, partial gold, not credited coral/muted — three different looks
  assert.match(css, /\.check-pill\[data-tone="pass"\]\{[^}]*--c-credited/);
  assert.match(css, /\.check-pill\[data-tone="watch"\]\{[^}]*--c-partial/);
  assert.match(css, /\.check-pill\[data-tone="fail"\]\{[^}]*--c-nogo/);
});

check("5. shape and layout values match (16 / 10 / pill, 240px sidebar, 1180px content)", () => {
  assert.equal(A["radius-card"], "16px");
  assert.equal(A["radius-input"], "10px");
  assert.equal(A["radius-pill"], "999px");
  assert.equal(A["sidebar-w"], "240px");
  assert.equal(A["content-max"], "1180px");
  assert.match(css, /\.prop-filter[^{]*\{[^}]*border-radius:var\(--radius-card\)/);
  assert.match(css, /\.prop-form-page input[^{]*\{[^}]*border-radius:var\(--radius-input\)/);
});

check("6. no dark-theme leftovers: the old purple surfaces are gone from the form and output CSS", () => {
  for (const dark of ["#170c25", "#120818", "#0d0715", "#1a0f25", "#191919", "#22113a", "#8b5cf6"]) {
    assert.ok(!css.toLowerCase().includes(dark), `dark colour ${dark} still in PROP_CSS`);
  }
  assert.ok(/--c-accent-text/.test(css) && /font-family:'Sora'/.test(css));
});

console.log(`PASS testThemeTokens — ${checks} checks`);
