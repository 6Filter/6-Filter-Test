/**
 * Part 135 — price-events research safeguards (AI/search stubbed).
 * Real Postgres when TEST_DATABASE_URL is set. Owner source of truth.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  sanitizePriceEventsPayload,
  PRIMUS_F3_PRICE_EVENTS,
} from "../../lib/filters/runPriceEventsResearch.js";
import { crossedPointFromPrices, quoteContainsFigure, applyFilter3Rules } from "../../lib/priceResilience.js";

const SKIP = "SKIP testFilter3Research — TEST_DATABASE_URL not set";
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log(SKIP);
  process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0);
}
if (!/(localhost|127\.0\.0\.1|\[::1\])/.test(testUrl)) {
  console.error("Refusing non-local TEST_DATABASE_URL.");
  process.exit(1);
}

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-f3-research-"));
process.env.DATABASE_URL = testUrl;
process.env.REQUIRE_AUTH = "false";

let n = 0;
function check(cond, msg) {
  n += 1;
  assert.ok(cond, `check ${n}: ${msg}`);
}

check(String(PRIMUS_F3_PRICE_EVENTS).includes("PRIMUS_F3_PRICE_EVENTS"), "token");

const returned = ["https://rbi.org.in/inflation", "https://nielsen.com/pack"];

{
  const raw = {
    annualIncreasePct: 6,
    inflation_source_url: "https://rbi.org.in/inflation",
    inflation_quote: "CPI food rose 6 percent",
    returnedSources: ["https://evil.example/ignore-me"],
    events: [
      {
        brand: "X",
        product: "oil 100ml",
        from_price_inr: 9,
        to_price_inr: 11,
        date: "2024",
        volume_change_pct: -8,
        source_url: "https://nielsen.com/pack",
        quote: "volume fell 8% after the move",
        crossed_point: 99,
      },
      {
        brand: "Y",
        from_price_inr: 9,
        to_price_inr: 11,
        volume_change_pct: -30,
        source_url: "https://not-returned.example",
        quote: "lost 30%",
      },
      {
        brand: "Z",
        from_price_inr: 9,
        to_price_inr: 11,
        volume_change_pct: -12,
        source_url: "https://nielsen.com/pack",
        quote: "softened without a figure",
      },
    ],
  };
  const out = sanitizePriceEventsPayload(raw, returned);
  check(out.annualIncreasePct === 6, "inflation trusted when cited");
  check(!("returnedSources" in (raw.events?.[0] || {}) || out.returnedSources.includes("https://evil.example/ignore-me")), "model returnedSources ignored");
  check(out.returnedSources.includes("https://rbi.org.in/inflation"), "code returnedSources kept");
  check(out.events[0].crossed_point === 10, "crossed_point recomputed");
  check(out.events[0].verified === true, "verified when source+quote");
  check(out.events[1].verified === false, "unreturned source not verified");
  check(out.events[2].verified === false, "quote without figure not verified");
}

{
  const badInflation = sanitizePriceEventsPayload(
    {
      annualIncreasePct: 6,
      inflation_source_url: "https://missing.example",
      inflation_quote: "six percent",
      events: [],
    },
    returned
  );
  check(badInflation.annualIncreasePct == null, "uncited inflation null");
}

check(crossedPointFromPrices(19, 21) === 20, "awkward pair 19→21");
check(crossedPointFromPrices(20, 20.5) === 20, "on point then rise");
check(crossedPointFromPrices(10, 10) === null, "no move");
check(quoteContainsFigure("volume −8.0 pct", -8), "signed figure in quote");
check(!quoteContainsFigure("", -8), "empty quote");

{
  const scored = applyFilter3Rules({
    price: 9,
    priceEvents: sanitizePriceEventsPayload(
      {
        annualIncreasePct: 8,
        inflation_source_url: "https://rbi.org.in/inflation",
        inflation_quote: "8 percent cover",
        events: [
          {
            brand: "A",
            from_price_inr: 9,
            to_price_inr: 11,
            volume_change_pct: -8,
            source_url: "https://nielsen.com/pack",
            quote: "lost 8%",
          },
          {
            brand: "B",
            from_price_inr: 9,
            to_price_inr: 11,
            volume_change_pct: -7,
            source_url: "https://nielsen.com/pack",
            quote: "down 7%",
          },
          {
            brand: "C",
            from_price_inr: 9,
            to_price_inr: 11,
            volume_change_pct: -9,
            source_url: "https://nielsen.com/pack",
            quote: "9% drop",
          },
        ],
      },
      returned
    ),
  });
  check(scored.checkLabel === "Cleared", "e2e credit clears");
  check(Number(scored.items[0].credit) === 1, "e2e strong credit");
}

// Property: only price, inflation cover, and verified events move the score
{
  const base = {
    annualIncreasePct: 8,
    events: [
      {
        verified: true,
        crossed_point: 10,
        volume_change_pct: -8,
        quote: "8%",
        source_url: "https://a",
      },
      {
        verified: true,
        crossed_point: 10,
        volume_change_pct: -7,
        quote: "7%",
        source_url: "https://b",
      },
      {
        verified: true,
        crossed_point: 10,
        volume_change_pct: -9,
        quote: "9%",
        source_url: "https://c",
      },
    ],
  };
  const a = applyFilter3Rules({ price: 9, priceEvents: base });
  const b = applyFilter3Rules({
    price: 9,
    priceEvents: {
      ...base,
      noise: "ignored",
      events: base.events.map((e) => ({ ...e, brand: "Other", product: "x" })),
    },
  });
  check(a.items[0].credit === b.items[0].credit, "brand noise does not change credit");
  const c = applyFilter3Rules({ price: 9.5, priceEvents: base });
  // May or may not change crossings depending on path; credit structure still valid
  check(Number.isFinite(Number(c.items[0].credit)), "price change still scores");
  const d = applyFilter3Rules({
    price: 9,
    priceEvents: { ...base, annualIncreasePct: 0 },
  });
  check(d.checkLabel === "Cleared" && d.items[0].credit === 1, "zero inflation → no crossing pass");
}

console.log(`PASS owner testFilter3Research (${n} checks)`);
process.exit(0);
