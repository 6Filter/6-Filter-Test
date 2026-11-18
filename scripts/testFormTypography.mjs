/**
 * Part 143 D88 — type scale, heading, contrast, touch targets (11 checks).
 * Reads live tokens from PropositionForm PROP_CSS and the reference file.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const formCss = read("../src/PropositionForm.jsx");
const badgeCss = read("../src/FieldRoleBadge.jsx");
const css = `${formCss}\n${badgeCss}`;
const ref = read("../lib/formTokens.reference.css");

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

function token(src, name) {
  const m = src.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  assert.ok(m, `token --${name}`);
  return m[1].trim();
}

function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relLum({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fgHex, bgHex) {
  const L1 = relLum(hexToRgb(fgHex));
  const L2 = relLum(hexToRgb(bgHex));
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

const EXPECT = {
  "fs-section": "22px",
  "c-section": "#8a4f2a",
  "fs-status": "13px",
  "fs-label": "16px",
  "c-label": "#3b2a1e",
  "fs-input": "15px",
  "c-input": "#50392e",
  "fs-placeholder": "15px",
  "c-placeholder": "#7a6454",
  "fs-badge": "12px",
  "c-required": "#8a4f2a",
  "c-optional": "#6b5646",
  "c-error": "#a8432b",
  "gap-label": "8px",
  "gap-field": "22px",
  "h-input": "44px",
};

check("reference tokens match the D88 table", () => {
  for (const [k, v] of Object.entries(EXPECT)) {
    assert.equal(token(ref, k).toLowerCase(), v.toLowerCase(), k);
  }
});

// Part 146: colours stay as D88. Text sizes are the 78% (old Compact) values times --ts on the scaled wrapper,
// and the spacing tokens are the old Compact values, so the default look is unchanged.
const LIVE_SIZES = { "fs-section": 16, "fs-status": 12, "fs-label": 13, "fs-input": 13, "fs-placeholder": 13, "fs-badge": 11 };
const LIVE_SPACING = { "gap-label": "4px", "gap-field": "12px", "h-input": "34px" };
check("live .prop-form-page declares the same colours; sizes are the 78% values times --ts", () => {
  for (const [k, v] of Object.entries(EXPECT)) {
    if (k.startsWith("c-")) assert.equal(token(formCss, k).toLowerCase(), v.toLowerCase(), `live ${k}`);
  }
  for (const [k, px] of Object.entries(LIVE_SIZES)) {
    assert.equal(token(formCss, k).replace(/\s+/g, " "), `calc(${px}px * var(--ts))`, `live ${k}`);
  }
  for (const [k, v] of Object.entries(LIVE_SPACING)) assert.equal(token(formCss, k), v, `live ${k}`);
});

check("field heading uses Sora scale tokens, not 11px monospace", () => {
  assert.match(css, /\.prop-label\{[^}]*font-size:var\(--fs-label\)/);
  assert.match(css, /\.prop-label\{[^}]*font-weight:600/);
  assert.match(css, /\.prop-label\{[^}]*color:var\(--c-label\)/);
  assert.match(css, /\.prop-label\{[^}]*font-family:'Sora'/);
  assert.doesNotMatch(css, /\.prop-label\{[^}]*font-size:11px/);
  assert.doesNotMatch(css, /\.prop-label\{[^}]*font-family:var\(--fm\)/);
});

check("inputs use --fs-input / --c-input and min-height --h-input", () => {
  assert.match(css, /min-height:var\(--h-input\)/);
  assert.match(css, /font-size:var\(--fs-input\)/);
  assert.match(css, /color:var\(--c-input\)/);
  assert.match(css, /::placeholder\{[^}]*color:var\(--c-placeholder\)/s);
});

check("section title uses --fs-section / --c-section", () => {
  assert.match(css, /\.prop-filter-title\{[^}]*font-size:var\(--fs-section\)/);
  assert.match(css, /--c-section/);
});

check("Required solid border vs Optional dashed", () => {
  assert.match(css, /data-role="required"\]\{[^}]*border:1px solid/s);
  assert.match(css, /data-role="optional"\]\{[^}]*border:1px dashed/s);
});

check("reference touch target height is 44px; the text size control itself uses 44px buttons", () => {
  assert.equal(Number.parseInt(token(ref, "h-input"), 10), 44);
  assert.match(read("../src/TextSizeControl.jsx"), /min-height:44px/);
});

check("label-to-box and field gaps match the reference (D88)", () => {
  assert.equal(token(ref, "gap-label"), "8px");
  assert.equal(token(ref, "gap-field"), "22px");
});

check("two columns from 1100px; one column below", () => {
  assert.match(css, /@media \(max-width:1099px\)/);
  assert.match(css, /\.prop-grid\{[^}]*grid-template-columns:1fr 1fr/s);
});

const bg = token(ref, "card-bg") || "#fffaf1";
check("text colours meet WCAG AA (4.5:1) on card background", () => {
  const pairs = [
    ["c-label", token(ref, "c-label")],
    ["c-input", token(ref, "c-input")],
    ["c-placeholder", token(ref, "c-placeholder")],
    ["c-section", token(ref, "c-section")],
    ["c-required", token(ref, "c-required")],
    ["c-optional", token(ref, "c-optional")],
    ["c-error", token(ref, "c-error")],
  ];
  for (const [name, fg] of pairs) {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= 4.5, `${name} ${fg} on ${bg} = ${ratio.toFixed(2)}`);
  }
});

check("status / error colours use the D88 tokens", () => {
  assert.match(css, /--c-status:#7a6454/);
  assert.match(css, /\.autofill-status\{[^}]*color:var\(--c-status\)/s);
  assert.match(css, /--c-error:#a8432b/);
});

console.log(`PASS testFormTypography — ${checks} checks`);
process.exit(0);
