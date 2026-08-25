export function deriveMoves({ filter1, filter2, filter3, filter4 }) {
  const moves = [];
  const f1 = filter1 || {};
  const f2 = filter2 || {};
  const f3 = filter3 || {};
  const f4 = filter4 || {};

  if (f2.marginHeadroomPct != null) {
    moves.push({
      tag: f2.marginHeadroomPct >= 0 ? "HOLD" : "PRICE",
      text:
        f2.marginHeadroomPct >= 0
          ? `Margin clears the floor by ${f2.marginHeadroomPct} pts — re-check this if input costs move.`
          : `Margin is ${Math.abs(f2.marginHeadroomPct)} pts under the floor — reprice or reformulate before re-screening.`,
    });
  }
  if (f3.volumeOk === false) {
    moves.push({
      tag: "PRICE",
      text: "Volume loss exceeds the 10% limit at the nearest fixed price point — test a lower price or a stronger attribute claim.",
    });
  }
  if (f4.formatTrendDirection === "stable" && f4.earlyRiskSignal !== "none") {
    moves.push({
      tag: "WATCH",
      text: "Early risk signal on format relevance — re-check this before scaling.",
    });
  }
  if (f1.parityRisk === "major") {
    moves.push({
      tag: "CLAIM",
      text: "Major parity risk vs the benchmark — sharpen the gap claim or drop the attribute that does not beat it.",
    });
  }
  if (String(f1.reconciliation?.status || "").toUpperCase() === "DIAGNOSE") {
    moves.push({
      tag: "TEST",
      text: "Category-size engines disagree by more than 30% — resolve the informal-share or price-level assumption before treating TAM as settled.",
    });
  }
  if (f1.growthStage === "unclear") {
    moves.push({
      tag: "TEST",
      text: "Growth stage is unclear — a volume/price split from an item-level index would change this check.",
    });
  }
  return moves;
}

function badgeOf(verdict) {
  const v = String(verdict || "").toUpperCase();
  if (v === "PASS") return "PASS";
  if (v === "FAIL") return "FAIL";
  return "WATCH";
}

function clampPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 40;
  return Math.max(8, Math.min(100, x));
}

export function gateCardsFor(result) {
  const f1 = result?.filter1 || {};
  const f2 = result?.filter2 || {};
  const f3 = result?.filter3 || {};
  const f4 = result?.filter4 || {};
  const tam = Number(f1.categoryTamCr ?? f1.reconciliation?.p50Cr);
  const f1Metric =
    Number.isFinite(tam) && tam > 0
      ? `₹${tam.toLocaleString("en-IN", { maximumFractionDigits: 1 })} Cr TAM`
      : f1.growthStage || f1.gapClaim || "—";
  const f1Bar =
    f1.verdict === "PASS" ? 82 : f1.verdict === "FAIL" ? 28 : 48;

  const headroom = Number(f2.marginHeadroomPct);
  const f2Metric = Number.isFinite(headroom)
    ? `${headroom >= 0 ? "+" : ""}${headroom} pts vs floor`
    : f2.usedNetMarginPct != null
      ? `${f2.usedNetMarginPct}% net · ${f2.minMargin ?? "—"}% floor`
      : f2.reason || "—";
  const f2Bar = Number.isFinite(headroom)
    ? clampPct(50 + headroom * 4)
    : f2.verdict === "PASS"
      ? 70
      : 35;

  const vol = Number(f3.volumeLossPctAtFixedPoint);
  const f3Metric = Number.isFinite(vol) ? `${vol}% volume loss` : f3.reason || "—";
  const f3Bar = Number.isFinite(vol) ? clampPct(100 - vol * 6) : f3.verdict === "PASS" ? 72 : 32;

  const dir = String(f4.formatTrendDirection || "");
  const f4Metric = dir ? `${dir}${f4.earlyRiskSignal && f4.earlyRiskSignal !== "none" ? ` · ${f4.earlyRiskSignal} risk` : ""}` : "—";
  const f4Bar = dir === "rising" ? 88 : dir === "stable" ? 58 : dir === "declining" ? 18 : 40;

  return [
    {
      n: "01",
      title: "Opportunity to grow",
      badge: badgeOf(f1.verdict),
      metric: f1Metric,
      barW: f1Bar,
      threshold: "Attribute · benchmark · gap declared",
      detail: f1.verdictReason || f1.reason || "",
    },
    {
      n: "02",
      title: "Net margin",
      badge: badgeOf(f2.verdict),
      metric: f2Metric,
      barW: f2Bar,
      threshold: `Division floor ${f2.minMargin != null ? `${f2.minMargin}%` : "required"}`,
      detail: f2.verdictReason || f2.reason || "",
    },
    {
      n: "03",
      title: "Price resilient",
      badge: badgeOf(f3.verdict),
      metric: f3Metric,
      barW: f3Bar,
      threshold: "Modelled volume loss ≤ 10%",
      detail: f3.verdictReason || f3.reason || "",
    },
    {
      n: "04",
      title: "Tech & habit shift",
      badge: badgeOf(f4.verdict),
      metric: f4Metric,
      barW: f4Bar,
      threshold: "Format relevant for 5–10 years",
      detail: f4.verdictReason || f4.reason || f4.evidenceSummary || "",
    },
  ];
}

export function heroVerdict(result) {
  const v = String(result?.overallVerdict || "").toUpperCase();
  if (v === "CLEARED") return { word: "GO", tone: "cleared" };
  if (v === "FAIL") return { word: "NO-GO", tone: "fail" };
  if (v === "NEEDS_INPUT") return { word: "WATCH", tone: "watch" };
  return { word: "WATCH", tone: "watch" };
}

export function scoreOutOf100(result) {
  const weighted = Number(result?.weighted);
  if (Number.isFinite(weighted) && weighted > 0) return Math.round(weighted);
  const pts = Number(result?.phase1);
  const max = Number(result?.phase1Max) > 0 ? Number(result.phase1Max) : 60;
  if (!Number.isFinite(pts) || max <= 0) return 0;
  return Math.round((pts / max) * 100);
}
