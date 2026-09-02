/**
 * Browser-safe GO / NO-GO / WATCH helpers. No DB, no Node APIs.
 */

export function computeGoNoGoWatch(advisoryChecks = {}) {
  const relevant = ["f1", "f2", "f3", "f4"].map(
    (k) => advisoryChecks[k] || { checkLabel: "Evidence missing" }
  );
  const anyBelowFloor = relevant.some((c) => c.checkLabel === "Below floor");
  const allClearOrExempt = relevant.every(
    (c) => c.checkLabel === "Cleared" || c.checkLabel === "Exempt"
  );
  if (anyBelowFloor) return "NO-GO";
  if (allClearOrExempt) return "GO";
  return "WATCH";
}

export function goNoGoTone(classification) {
  if (classification === "GO") return "pass";
  if (classification === "NO-GO") return "fail";
  return "watch";
}

export function filterCheckScore(check) {
  const items = Array.isArray(check?.items) ? check.items : [];
  const done = items.filter((i) => i.status === "done").length;
  return {
    done,
    total: items.length,
    pct: items.length ? Math.round((100 * done) / items.length) : 0,
  };
}

export function scoreAdvisoryChecks(advisoryChecks = {}, keys = ["f1", "f2", "f3", "f4"]) {
  const byFilter = {};
  let done = 0;
  let total = 0;
  for (const k of keys) {
    const s = filterCheckScore(advisoryChecks[k]);
    byFilter[k] = s;
    done += s.done;
    total += s.total;
  }
  return {
    byFilter,
    done,
    total,
    pct: total ? Math.round((100 * done) / total) : 0,
  };
}

function item(status, text) {
  return { status, text };
}

function overallLabel(items, belowFloor = false) {
  if (belowFloor) return "Below floor";
  if (!items.length) return "Evidence missing";
  if (items.every((i) => i.status === "done")) return "Cleared";
  return "Evidence missing";
}

/** Instant Filter 1–4 checks in the browser (no division floors). Server re-scores after save. */
export function previewAdvisoryChecks(doc = {}) {
  const f1 = doc.f1 || {};
  const f2 = doc.f2 || {};
  const f3 = doc.f3 || {};
  const f4 = doc.f4 || {};

  let f1Check;
  if (f1.pureCommodity) {
    f1Check = {
      checkLabel: "Exempt",
      items: [item("done", "Pure commodity — differentiation floor doesn't apply (v4)")],
    };
  } else {
    const attr1 = String(f1.declaredAttribute || "").trim();
    const attrCount =
      (attr1 ? 1 : 0) +
      [f1.declaredAttribute2, f1.declaredAttribute3].filter((v) => String(v || "").trim()).length;
    const gapN = Number(f1.declaredGap);
    const hasGap = f1.declaredGap != null && f1.declaredGap !== "";
    const gapOk = hasGap && Number.isFinite(gapN) && gapN >= 2.0;
    const belowFloor = hasGap && Number.isFinite(gapN) && gapN < 2.0;
    const items = [
      item(
        attr1 ? "done" : "pending",
        !attr1
          ? "Attribute 1 not yet declared (required)"
          : attrCount > 1
            ? `Attributes declared (${attrCount} of 3)`
            : "Attribute 1 declared"
      ),
      item(f1.benchmark ? "done" : "pending", f1.benchmark ? `Benchmark named: ${f1.benchmark}` : "Benchmark not named"),
      item(
        gapOk ? "done" : "pending",
        !hasGap
          ? "Declared gap missing"
          : gapOk
            ? `Declared gap ${gapN} clears the 2.0 floor`
            : `Declared gap ${gapN} is below the 2.0 floor (v4)`
      ),
      item(
        f1.growthRoute && f1.growthArgument ? "done" : "pending",
        f1.growthRoute && f1.growthArgument
          ? "Growth route and argument recorded"
          : "Growth route or growth argument incomplete"
      ),
    ];
    f1Check = { checkLabel: overallLabel(items, belowFloor), items };
  }

  const hasMargin = f2.netMarginAtScale != null && f2.netMarginAtScale !== "";
  const f2Items = [
    item(
      f2.mrpInr && f2.grammage ? "done" : "pending",
      f2.mrpInr && f2.grammage ? `MRP ₹${f2.mrpInr} · ${f2.grammage}` : "MRP and grammage not yet declared"
    ),
    item(
      hasMargin ? "done" : "pending",
      hasMargin
        ? `Net margin ${Number(f2.netMarginAtScale)}% recorded — floor applied after Submit`
        : "Net margin at scale not yet computed"
    ),
    item(
      f2.qcomTrajectory ? "done" : "pending",
      f2.qcomTrajectory ? "Quick-commerce terms assumption recorded" : "Quick-commerce 3-year terms assumption missing (v4)"
    ),
    item(
      f2.financeSigned ? "done" : "pending",
      f2.financeSigned ? "Finance signature recorded" : "Finance signature pending — missing evidence counts as FAIL (v4)"
    ),
  ];

  const exposure = f3.fixedPricePointExposure;
  const noExposure = !exposure || exposure === "none";
  const loss = Number(f3.modelledVolumeLoss);
  const hasLoss = f3.modelledVolumeLoss != null && f3.modelledVolumeLoss !== "";
  const lossOk = noExposure || (hasLoss && loss <= 10);
  const f3Below = !noExposure && hasLoss && Number.isFinite(loss) && loss > 10;
  const f3Items = [
    item(
      f3.priceIndexVsBenchmark ? "done" : "pending",
      f3.priceIndexVsBenchmark ? "Price index vs benchmark recorded" : "Price index vs benchmark missing"
    ),
    noExposure
      ? item("done", "No fixed price point is crossed — the 10% loss cap is not triggered (v4)")
      : item(
          lossOk ? "done" : "pending",
          !hasLoss
            ? "Modelled volume loss not yet entered"
            : lossOk
              ? `Modelled loss ${loss}% clears the 10% cap`
              : `Modelled loss ${loss}% exceeds the 10% cap (v4)`
        ),
    item(
      f3.elasticityEstimate && f3.elasticitySource ? "done" : "pending",
      f3.elasticityEstimate && f3.elasticitySource
        ? "Elasticity estimate and source recorded"
        : "Elasticity estimate or its source missing"
    ),
    item(
      f2.mrpInr && f3.priceIndexVsBenchmark ? "done" : "pending",
      f2.mrpInr && f3.priceIndexVsBenchmark
        ? "Price consistent with Filter 2"
        : "Price consistency with Filter 2 unconfirmed"
    ),
  ];

  const f4Items = [
    item(
      f4.formatTrajectory ? "done" : "pending",
      f4.formatTrajectory ? `Format trajectory: ${f4.formatTrajectory}` : "Format trajectory pending — retail-audit format shares (CMI)"
    ),
    item(f4.threatRegister ? "done" : "pending", f4.threatRegister ? "Threat register recorded" : "Threat register empty — substitutes, technology, clean-label, regulatory"),
    item(
      f4.threatsAnswered ? "done" : "pending",
      f4.threatsAnswered ? "Threat responses complete" : "Threat responses incomplete — missing evidence counts as FAIL (v4)"
    ),
  ];

  return {
    f1: f1Check,
    f2: { checkLabel: overallLabel(f2Items), items: f2Items },
    f3: { checkLabel: overallLabel(f3Items, f3Below), items: f3Items },
    f4: {
      checkLabel: f4.formatTrajectory === "declining" ? "Below floor" : overallLabel(f4Items),
      items: f4Items,
    },
  };
}

export function applyLocalGate(doc) {
  const checks = previewAdvisoryChecks(doc);
  const classification = computeGoNoGoWatch(checks);
  return { checks, classification, score: scoreAdvisoryChecks(checks) };
}

export function summarizeChecksForPrompt(advisoryChecks = {}) {
  return ["f1", "f2", "f3", "f4"]
    .map((k) => {
      const c = advisoryChecks[k] || {};
      const items = Array.isArray(c.items)
        ? c.items.map((it) => `  - [${it.status}] ${it.text}`).join("\n")
        : "";
      return `${k.toUpperCase()}: ${c.checkLabel || "Evidence missing"}\n${items}`;
    })
    .join("\n\n");
}
