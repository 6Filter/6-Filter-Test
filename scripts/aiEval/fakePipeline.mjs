/**
 * Deterministic pipeline for harness tests. No network, no API key, no database.
 * Idea id selects a canned prediction so tests stay stable.
 */
import { TECH_SHIFT_DIMS } from "./fields.mjs";

function allLow() {
  return Object.fromEntries(TECH_SHIFT_DIMS.map((d) => [d, "Low"]));
}

const FIXTURES = {
  match: {
    gstRatePct: 18,
    benchmarkRelevant: "yes",
    gapCredible: "yes",
    priceEventsDatedAndSourced: true,
    techShift: allLow(),
    routeMatches: "yes",
    verdictBand: "WATCH",
    citations: [
      {
        url: "https://example.com/gst",
        quote: "GST on this shampoo is 18 percent",
        field: "gst",
      },
    ],
    usage: { inputTokens: 100, outputTokens: 40, cacheRead: 0, cacheWrite: 0, searches: 1 },
  },
  mismatch: {
    gstRatePct: 5,
    benchmarkRelevant: "no",
    gapCredible: "no",
    priceEventsDatedAndSourced: false,
    techShift: Object.fromEntries(TECH_SHIFT_DIMS.map((d) => [d, "High"])),
    routeMatches: "no",
    verdictBand: "GO",
    citations: [
      {
        url: "https://example.com/missing",
        quote: "this quote is not on the page",
        field: "gap",
      },
    ],
    usage: { inputTokens: 80, outputTokens: 20, cacheRead: 0, cacheWrite: 0, searches: 0 },
  },
  adjacent: {
    gstRatePct: 18,
    benchmarkRelevant: "yes",
    gapCredible: "yes",
    priceEventsDatedAndSourced: true,
    techShift: Object.fromEntries(TECH_SHIFT_DIMS.map((d) => [d, "Medium"])),
    routeMatches: "yes",
    verdictBand: "WATCH",
    citations: [
      {
        url: "https://example.com/gst",
        quote: "GST on this shampoo is 18 percent",
        field: "gst",
      },
    ],
    usage: { inputTokens: 90, outputTokens: 30, cacheRead: 10, cacheWrite: 0, searches: 1 },
  },
  privateCite: {
    gstRatePct: 18,
    benchmarkRelevant: "yes",
    gapCredible: "yes",
    priceEventsDatedAndSourced: true,
    techShift: allLow(),
    routeMatches: "yes",
    verdictBand: "WATCH",
    citations: [
      {
        url: "https://127.0.0.1/secret",
        quote: "should never be fetched",
        field: "source",
      },
    ],
    usage: { inputTokens: 10, outputTokens: 5, cacheRead: 0, cacheWrite: 0, searches: 0 },
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createFakePipeline({ varyByRun = false } = {}) {
  return {
    name: "fake",
    async run(idea, { runIndex = 0 } = {}) {
      const started = Date.now();
      const key = String(idea?.id || "").trim();
      const base = clone(FIXTURES[key] || FIXTURES.match);
      if (varyByRun && key === "vary") {
        base.gstRatePct = runIndex === 0 ? 18 : 12;
        base.verdictBand = runIndex === 0 ? "WATCH" : "NO-GO";
      }
      const durationMs = Math.max(1, Date.now() - started);
      return {
        id: key,
        ...base,
        durationMs,
      };
    },
  };
}

export const FAKE_PAGES = {
  "https://example.com/gst": "<html><body><p>GST on this shampoo is 18 percent in India.</p></body></html>",
  "https://example.com/missing": "<html><body><p>Nothing about the claimed figure.</p></body></html>",
};

export async function fakeFetchImpl(url) {
  const href = typeof url === "string" ? url : url?.href || String(url);
  const body = FAKE_PAGES[href];
  if (!body) {
    return {
      ok: false,
      status: 404,
      headers: { get: () => "text/html" },
      body: null,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  }
  const bytes = Buffer.from(body, "utf8");
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name) => {
        const n = String(name).toLowerCase();
        if (n === "content-type") return "text/html; charset=utf-8";
        if (n === "content-length") return String(bytes.byteLength);
        return null;
      },
    },
    body: null,
    arrayBuffer: async () => copy,
  };
}
