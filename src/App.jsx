import { useState, useRef, useEffect } from "react";
import {
  Sparkles, Gauge, TrendingUp, FlaskConical, X, Send,
  RefreshCw, Copy, Check, Lock, AlertTriangle, Loader2,
  ImagePlus, ArrowRight, ArrowLeft, History, Volume2,
  Zap, Wrench, Expand, Scale, Tag, Cpu, ChevronDown, Flag
} from "lucide-react";
import { revenueDisplayFor, scoreToFive, statusOf, toneOf } from "./scoringUi.js";
import { buildInvestmentGrid } from "../lib/investmentGrid.js";
import { DIVISION_OPTIONS, DIVISION_NET_MARGIN, detectDivision, nearestFixedPricePoint } from "../lib/npdMaster.js";

async function callClaude(userText, system, image = null) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userText, system, image }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Claude API failed (${res.status}).`);
    }
    return data.text ?? "";
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error("Validation timed out. Please try again with a shorter idea.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchIdeaHistory(limit = 20, ideaType = null) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (ideaType === "product" || ideaType === "process") {
    params.set("ideaType", ideaType);
  }
  const res = await fetch(`/api/ideas?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load idea history.");
  return Array.isArray(data.ideas) ? data.ideas : [];
}

function formatLogDate(ts) {
  const d = new Date(Number(ts) || Date.now());
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function analyzeAndStoreIdea(idea, image = null, ideaType = "product", npd = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ideaType === "product" ? 180000 : 90000);
  try {
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea,
        ideaType,
        image: image
          ? { name: image.name, mediaType: image.mediaType, data: image.data }
          : null,
        ...npd,
      }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Analysis failed (${res.status}).`);
    return data;
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error("Validation timed out. Please try again with a shorter idea.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchIdeaById(id) {
  const res = await fetch(`/api/ideas/${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load idea.");
  return data;
}

async function escalateIdeaToCkr(id, filterName, disputedEvidence) {
  const res = await fetch(`/api/ideas/${encodeURIComponent(id)}/escalate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filterName, disputedEvidence }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not escalate.");
  return data;
}

const NPD_FILTERS = [
  { key: "filter1", num: "01", title: "Opportunity to Grow", hint: "Attribute · benchmark · gap", icon: TrendingUp },
  { key: "filter2", num: "02", title: "Net Margin Gate", hint: "Division floor at launch", icon: Scale },
  { key: "filter3", num: "03", title: "Price Resilient", hint: "2-pt proxy · volume loss ≤10%", icon: Tag },
  { key: "filter4", num: "04", title: "Tech & Habit Shift", hint: "5–10 year format trend", icon: Cpu },
];

function filterReason(filter) {
  return String(filter?.verdictReason || filter?.reason || filter?.evidenceSummary || "").trim();
}

function overallHeaderKey(verdict) {
  if (verdict === "CLEARED") return "approved";
  if (verdict === "NEEDS_INPUT") return "promising";
  if (verdict === "FAIL") return "rejected";
  return null;
}

function overallLabel(verdict) {
  if (verdict === "CLEARED") return "Cleared";
  if (verdict === "NEEDS_INPUT") return "Needs input";
  if (verdict === "FAIL") return "Fail";
  return verdict || "";
}

// ---- scoring config ----
const PRODUCT_DIMS = [
  { key: "novelty",  label: "Novelty",          weight: 0.40, max: 24, icon: Sparkles,     blurb: "Uniqueness vs. market & competition" },
  { key: "market",   label: "Market Relevance", weight: 0.30, max: 18, icon: TrendingUp,   blurb: "Alignment with consumer trends" },
  { key: "evidence", label: "Evidence Strength",weight: 0.30, max: 18, icon: FlaskConical, blurb: "Data quality & research backing" },
];

const PROCESS_DIMS = [
  { key: "efficiency",  label: "Efficiency Gain", weight: 0.50, max: 20, icon: Zap,    blurb: "Estimated time/cost reduction" },
  { key: "feasibility", label: "Feasibility",     weight: 0.30, max: 12, icon: Wrench, blurb: "Ease of implementation" },
  { key: "scalability", label: "Scalability",     weight: 0.20, max: 8,  icon: Expand, blurb: "Applicability across teams/projects" },
];

const PROCESS_PHASE2 = [
  { label: "Actual Efficiency Gain", weight: "40%", blurb: "Measured time/cost savings" },
  { label: "Adoption Rate", weight: "30%", blurb: "% of team using new process" },
  { label: "Quality Improvement", weight: "20%", blurb: "Error reduction, accuracy increase" },
  { label: "User Satisfaction", weight: "10%", blurb: "Team feedback scores" },
];

function isProcessResult(r) {
  return r?.ideaType === "process" || Boolean(r?.efficiency && r?.feasibility && r?.scalability);
}

function ideaTypeOf(r) {
  if (r?.ideaType === "process" || isProcessResult(r)) return "process";
  return "product";
}

function phase1MaxOf(r) {
  if (r?.phase1Max) return Number(r.phase1Max);
  return ideaTypeOf(r) === "process" ? 40 : 60;
}

function hasFullScorecard(r) {
  if (!r) return false;
  if (ideaTypeOf(r) === "process") {
    return (
      r.efficiency?.score != null &&
      r.feasibility?.score != null &&
      r.scalability?.score != null
    );
  }
  return r.novelty?.score != null && r.market?.score != null && r.evidence?.score != null;
}


export default function App() {
  const [view, setView] = useState("compose");
  const [ideaType, setIdeaType] = useState("product");
  const [idea, setIdea] = useState("");
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [productHistory, setProductHistory] = useState([]);
  const [processHistory, setProcessHistory] = useState([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState("");
  const [logFilter, setLogFilter] = useState("product");

  const [attribute, setAttribute] = useState("");
  const [benchmarkName, setBenchmarkName] = useState("");
  const [isPureCommodity, setIsPureCommodity] = useState(false);
  const [division, setDivision] = useState("Personal Care");
  const [divisionTouched, setDivisionTouched] = useState(false);
  const [declaredNetMarginPct, setDeclaredNetMarginPct] = useState("");
  const [benchmarkExists, setBenchmarkExists] = useState(false);
  const [pointsBeat, setPointsBeat] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [volumeLossPctAtFixedPoint, setVolumeLossPctAtFixedPoint] = useState("");

  const [msgOpen, setMsgOpen] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [copied, setCopied] = useState(false);
  const [returnView, setReturnView] = useState("compose");
  const [openingId, setOpeningId] = useState(null);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateFilter, setEscalateFilter] = useState("");
  const [escalateEvidence, setEscalateEvidence] = useState("");
  const [escalateLoading, setEscalateLoading] = useState(false);
  const [escalateError, setEscalateError] = useState("");

  const fileRef = useRef(null);
  const activeDims = ideaType === "process" ? PROCESS_DIMS : PRODUCT_DIMS;

  async function refreshHistories() {
    const [products, processes] = await Promise.all([
      fetchIdeaHistory(50, "product"),
      fetchIdeaHistory(50, "process"),
    ]);
    setProductHistory(products);
    setProcessHistory(processes);
    return { products, processes };
  }

  useEffect(() => {
    refreshHistories().catch(() => {});
  }, []);

  useEffect(() => {
    if (ideaType !== "product" || divisionTouched) return;
    setDivision(detectDivision(idea));
  }, [idea, ideaType, divisionTouched]);

  function goBack() {
    if (view === "result") {
      if (returnView === "log") {
        openLogTab(ideaTypeOf(result) === "process" ? "process" : "product");
      } else {
        setView("compose");
      }
      return;
    }
    if (view === "log") {
      setView("compose");
      return;
    }
    if (result) {
      setReturnView("compose");
      setView("result");
    }
  }

  async function openLogTab(preferredType) {
    const nextFilter =
      preferredType === "process" || preferredType === "product"
        ? preferredType
        : ideaType === "process"
          ? "process"
          : "product";
    setLogFilter(nextFilter);
    setReturnView("log");
    setView("log");
    setLogError("");
    setLogLoading(true);
    try {
      await refreshHistories();
    } catch (e) {
      setLogError(e.message || "Could not load log.");
    } finally {
      setLogLoading(false);
    }
  }

  const composeHistory = (ideaType === "process" ? processHistory : productHistory).slice(0, 6);
  const logHistory = logFilter === "process" ? processHistory : productHistory;

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () =>
      setImage({ name: f.name, mediaType: f.type, data: String(reader.result).split(",")[1], preview: reader.result });
    reader.readAsDataURL(f);
  };

  async function analyze() {
    if (!idea.trim()) {
      setError(ideaType === "process" ? "Describe the process idea first." : "Describe the product idea first.");
      return;
    }
    setLoading(true); setError("");

    try {
      const npd =
        ideaType === "product"
          ? {
              attribute,
              benchmarkName,
              isPureCommodity,
              division,
              declaredNetMarginPct: declaredNetMarginPct === "" ? null : Number(declaredNetMarginPct),
              benchmarkExists,
              pointsBeat: pointsBeat === "" ? null : Number(pointsBeat),
              pricePerUnit: pricePerUnit === "" ? null : Number(pricePerUnit),
              volumeLossPctAtFixedPoint:
                volumeLossPctAtFixedPoint === "" ? null : Number(volumeLossPctAtFixedPoint),
            }
          : {};
      const full = await analyzeAndStoreIdea(idea.trim(), image, ideaType, npd);
      setResult(full);
      const summary = {
        id: full.id,
        idea: full.idea,
        phase1: full.phase1,
        ts: full.ts,
        ideaWeight: full.gramClass || full.ideaWeight,
        gramClass: full.gramClass || null,
        overallVerdict: full.overallVerdict || null,
        ideaType: full.ideaType || ideaType,
        phase1Max: full.phase1Max || (ideaType === "process" ? 40 : 60),
      };
      if ((full.ideaType || ideaType) === "process") {
        setProcessHistory((h) => [summary, ...h.filter((x) => x.id !== summary.id)].slice(0, 50));
      } else {
        setProductHistory((h) => [summary, ...h.filter((x) => x.id !== summary.id)].slice(0, 50));
      }
      setReturnView("compose");
      setView("result");
    } catch (e) {
      setError(e.message || "Validation failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function openHistory(h, source = "compose") {
    if (!h?.id && !hasFullScorecard(h)) {
      const msg = "That run has no saved id. Re-run validation to open it.";
      if (source === "log") setLogError(msg);
      else setError(msg);
      return;
    }

    setReturnView(source === "log" ? "log" : "compose");
    setError("");
    setLogError("");
    if (ideaTypeOf(h) === "process") setLogFilter("process");
    else setLogFilter("product");

    try {
      // Log / recent-run rows are summaries — only skip fetch when full scorecard is already present.
      if (hasFullScorecard(h)) {
        setResult(h);
        setView("result");
        return;
      }

      setOpeningId(h.id);
      setLoading(true);
      const full = await fetchIdeaById(h.id);
      if (!hasFullScorecard(full)) {
        throw new Error("Scorecard data was incomplete for this run.");
      }
      setResult(full);
      setView("result");
    } catch (e) {
      const msg = e.message || "Could not open that run.";
      if (source === "log" || view === "log") setLogError(msg);
      else setError(msg);
    } finally {
      setLoading(false);
      setOpeningId(null);
    }
  }

  async function draftMessage() {
    setMsgOpen(true); setMsgLoading(true); setMsgText(""); setCopied(false);
    const process = isProcessResult(result);
    const max = phase1MaxOf(result);
    let system;
    let text;
    if (process) {
      const e = result.efficiency.score, f = result.feasibility.score, s = result.scalability.score;
      system = "You draft concise, confident internal messages for a process owner submitting a process idea to their manager. Sentence case, no fluff, no emoji.";
      text =
        `Draft a short message to my manager submitting this process idea for review. Under 110 words. ` +
        `Confident but not overselling; end with a clear ask to review and greenlight a Luminar pilot.\n\n` +
        `PROCESS IDEA: ${result.idea}\nPOSITIONING: ${result.oneLiner}\n` +
        `PRIMUS PHASE-1 SCORE: ${result.phase1.toFixed(1)}/${max} (Efficiency ${e}, Feasibility ${f}, Scalability ${s}).`;
    } else {
      const n = result.novelty.score, m = result.market.score, ev = result.evidence.score;
      system = "You draft concise, confident internal messages for a product manager submitting an idea to their manager. Sentence case, no fluff, no emoji.";
      text =
        `Draft a short message to my manager submitting this product idea for review. Under 110 words. ` +
        `Confident but not overselling; end with a clear ask to review and greenlight the next validation phase.\n\n` +
        `IDEA: ${result.idea}\nPOSITIONING: ${result.oneLiner}\n` +
        `PRIMUS PHASE-1 SCORE: ${result.phase1.toFixed(1)}/${max} (Novelty ${n}, Market Relevance ${m}, Evidence ${ev}).`;
    }
    try {
      setMsgText((await callClaude(text, system)).trim());
    } catch {
      setMsgText("Couldn't draft the message — try again.");
    } finally {
      setMsgLoading(false);
    }
  }

  const copyMsg = () => {
    const ta = document.createElement("textarea");
    ta.value = msgText; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  const reset = () => { setResult(null); setReturnView("compose"); setView("compose"); };

  async function submitEscalate() {
    if (!result?.id) return;
    if (!escalateFilter) {
      setEscalateError("Name the specific filter being disputed.");
      return;
    }
    if (!escalateEvidence.trim()) {
      setEscalateError("Describe the specific evidence being disputed.");
      return;
    }
    setEscalateLoading(true);
    setEscalateError("");
    try {
      const updated = await escalateIdeaToCkr(result.id, escalateFilter, escalateEvidence.trim());
      setResult(updated);
      setProductHistory((h) =>
        h.map((row) => (row.id === updated.id ? { ...row, escalationStatus: "escalated" } : row))
      );
      setEscalateOpen(false);
    } catch (e) {
      setEscalateError(e.message || "Could not escalate.");
    } finally {
      setEscalateLoading(false);
    }
  }

  const backLabel =
    view === "result"
      ? returnView === "log"
        ? "Back to log"
        : "Back to NPD Screen"
      : view === "log"
        ? "Back to NPD Screen"
        : result
          ? "Back to scorecard"
          : null;

  return (
    <div className="primus">
      <style>{CSS}</style>

      <header className="masthead">
        <button type="button" className="brand-btn" onClick={() => setView("compose")} aria-label="Go to validate">
          <div className="brandmark"><span className="star">✦</span></div>
          <div>
            <div className="eyebrow">Primus Insights · Product Validation Architect</div>
            <h1>Primus<span className="dot">.</span>ai</h1>
          </div>
        </button>
        <nav className="top-nav" aria-label="Main">
          <button
            type="button"
            className={`nav-tab${view === "compose" || view === "result" ? " active" : ""}`}
            onClick={() => setView("compose")}
          >
            NPD Screen
          </button>
          <button
            type="button"
            className={`nav-tab${view === "log" ? " active" : ""}`}
            onClick={openLogTab}
          >
            <History size={14} /> Log
          </button>
        </nav>
        <div className="live">
          <span className="pulse" />
          Claude
        </div>
      </header>

      {backLabel && (
        <div className="page-back-bar">
          <button type="button" className="page-back" onClick={goBack}>
            <ArrowLeft size={15} /> {backLabel}
          </button>
        </div>
      )}

      {view === "compose" && (
        <main className="grid">
          <section className="panel console">
            <div className="panel-tab">01 — Brief</div>

            <div className="type-toggle" role="tablist" aria-label="Idea type">
              <button
                type="button"
                role="tab"
                aria-selected={ideaType === "product"}
                className={`type-tab${ideaType === "product" ? " active" : ""}`}
                onClick={() => setIdeaType("product")}
              >
                Product idea
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={ideaType === "process"}
                className={`type-tab${ideaType === "process" ? " active" : ""}`}
                onClick={() => setIdeaType("process")}
              >
                Process idea
              </button>
            </div>

            <label className="field">
              <span className="lbl">{ideaType === "process" ? "Process idea" : "Product idea"}</span>
              <textarea
                className="idea-input"
                rows={8} value={idea} onChange={(e) => setIdea(e.target.value)}
                placeholder={
                  ideaType === "process"
                    ? "e.g. Automate weekly sales reporting with a shared Luminar checklist — cut 4 hours of manual consolidation per team."
                    : "e.g. A dry shampoo bar for Indian summers — no aerosol, sweat-activated freshness, refill-first packaging."
                }
              />
            </label>

            {ideaType === "product" && (
              <div className="npd-fields">
                <p className="npd-hint">
                  4-Filter NPD Screen (Filters 1–4). Blank price or margin is a missing-evidence fail — not a silent default.
                </p>
                <div className="npd-grid">
                  <label className="field">
                    <span className="lbl">Purchase attribute <em>optional</em></span>
                    <input
                      value={attribute}
                      onChange={(e) => setAttribute(e.target.value)}
                      placeholder="The one thing a buyer decides on"
                    />
                  </label>
                  <label className="field">
                    <span className="lbl">Benchmark <em>optional — AI finds one if blank</em></span>
                    <input
                      value={benchmarkName}
                      onChange={(e) => setBenchmarkName(e.target.value)}
                      placeholder="Strongest named competitor"
                    />
                  </label>
                  <label className="npd-check span-2">
                    <input
                      type="checkbox"
                      checked={isPureCommodity}
                      onChange={(e) => setIsPureCommodity(e.target.checked)}
                    />
                    Pure commodity (undifferentiated — skip formulation gap until mixing/function is added)
                  </label>

                  <label className="field">
                    <span className="lbl">Division <em>auto-detected — override if wrong</em></span>
                    <select
                      value={division}
                      onChange={(e) => {
                        setDivisionTouched(true);
                        setDivision(e.target.value);
                      }}
                    >
                      {DIVISION_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                          {DIVISION_NET_MARGIN[d] == null ? " · Finance review" : ` · ≥${DIVISION_NET_MARGIN[d]}%`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="lbl">Declared net margin % <em>required</em></span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={declaredNetMarginPct}
                      onChange={(e) => setDeclaredNetMarginPct(e.target.value)}
                      placeholder="Team's launch margin, not an AI guess"
                    />
                  </label>

                  <label className="field">
                    <span className="lbl">Price per unit (₹) <em>required</em></span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={pricePerUnit}
                      onChange={(e) => setPricePerUnit(e.target.value)}
                      placeholder="e.g. 10"
                    />
                    {pricePerUnit !== "" && nearestFixedPricePoint(Number(pricePerUnit)) != null && (
                      <span className="npd-inline-hint">
                        Nearest fixed point: ₹{nearestFixedPricePoint(Number(pricePerUnit))}
                      </span>
                    )}
                  </label>
                  <label className="field">
                    <span className="lbl">Volume loss % at that point <em>required · ≤10% passes</em></span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={volumeLossPctAtFixedPoint}
                      onChange={(e) => setVolumeLossPctAtFixedPoint(e.target.value)}
                      placeholder="Projected volume loss if price crosses the point"
                    />
                  </label>

                  <label className="npd-check span-2">
                    <input
                      type="checkbox"
                      checked={benchmarkExists}
                      onChange={(e) => setBenchmarkExists(e.target.checked)}
                    />
                    A market leader already exists (must beat it by ≥2 points on a 10-point scale — lab-test proxy)
                  </label>
                  {benchmarkExists && (
                    <label className="field span-2">
                      <span className="lbl">Points beat vs leader (0–10) <em>required if a leader exists</em></span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="10"
                        step="0.1"
                        value={pointsBeat}
                        onChange={(e) => setPointsBeat(e.target.value)}
                        placeholder="Honest estimate, or leave blank for missing-evidence fail"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            <div className="media-row">
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} hidden />
              {!image ? (
                <button className="ghost" onClick={() => fileRef.current?.click()}><ImagePlus size={15} /> Add media</button>
              ) : (
                <span className="chip file"><img src={image.preview} alt="" />{image.name}
                  <button onClick={() => setImage(null)}><X size={12} /></button>
                </span>
              )}
            </div>

            {error && <div className="err"><AlertTriangle size={14} /> {error}</div>}

            <button className="run" onClick={analyze} disabled={loading}>
              {loading ? (<><Loader2 size={17} className="spin" /> {ideaType === "product" ? "Screening…" : "Validating…"}</>) : (<><Gauge size={17} /> {ideaType === "product" ? "Run NPD screen" : "Run validation"}</>)}
            </button>
          </section>

          <aside className="panel side">
            <div className="panel-tab">{ideaType === "product" ? "4-Filter NPD engine" : "Scoring matrix · Phase 1"}</div>
            <p className="side-note">
              {ideaType === "process" ? (
                <>Phase 1 is the LLM pass — <b>40 of 100</b> final points. Phase 2 (Luminar implementation, 60) unlocks after greenlight.</>
              ) : (
                <>Gram class is earned only if Filters 1–4 all pass. A single fail caps the idea at <b>10g</b>. Filters 5–6 (revenue target, prototype lab) are outside this tool.</>
              )}
            </p>
            <div className="matrix">
              {ideaType === "product" ? (
                <>
                  {NPD_FILTERS.map((d) => (
                    <div className="matrix-row" key={d.key}>
                      <d.icon size={16} />
                      <div>
                        <div className="mr-top"><b>{d.num} {d.title}</b></div>
                        <div className="mr-blurb">{d.hint}</div>
                      </div>
                    </div>
                  ))}
                  <div className="matrix-row phase2">
                    <Lock size={16} />
                    <div>
                      <div className="mr-top"><b>Filter 6 · Prototype lab</b><span>out of scope</span></div>
                      <div className="mr-blurb">Consumer / pack gate stays with the NPD team</div>
                    </div>
                  </div>
                </>
              ) : (
                <>
              {activeDims.map((d) => (
                <div className="matrix-row" key={d.key}>
                  <d.icon size={16} />
                  <div>
                    <div className="mr-top"><b>{d.label}</b><span>{Math.round(d.weight * 100)}%</span></div>
                    <div className="mr-blurb">{d.blurb} · up to {d.max} pts</div>
                  </div>
                </div>
              ))}
                {PROCESS_PHASE2.map((d) => (
                  <div className="matrix-row phase2" key={d.label}>
                    <Lock size={16} />
                    <div>
                      <div className="mr-top"><b>{d.label}</b><span>{d.weight}</span></div>
                      <div className="mr-blurb">Phase 2 — {d.blurb}</div>
                    </div>
                  </div>
                ))}
                </>
              )}
            </div>

            {composeHistory.length > 0 && (
              <div className="hist">
                <div className="hist-h">
                  <History size={13} /> Recent {ideaType === "process" ? "process" : "product"} runs
                </div>
                {error && view === "compose" && (
                  <div className="err hist-err"><AlertTriangle size={14} /> {error}</div>
                )}
                {composeHistory.map((h) => {
                  const max = phase1MaxOf(h);
                  const t = toneOf(h.phase1, max);
                  const isOpening = openingId === h.id;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      className="hist-row"
                      onClick={() => openHistory(h, "compose")}
                      disabled={loading}
                    >
                      <span className="hist-score" style={{ color: t.color }}>
                        {isOpening ? <Loader2 size={14} className="spin" /> : Number(h.phase1 || 0).toFixed(0)}
                      </span>
                      <span className="hist-weight">
                        {ideaTypeOf(h) === "process" ? "PROC" : (h.ideaWeight || "—")}
                      </span>
                      <span className="hist-idea">{h.idea}</span>
                    </button>
                  );
                })}
                <button type="button" className="hist-more" onClick={() => openLogTab(ideaType)}>
                  View {ideaType === "process" ? "process" : "product"} log <ArrowRight size={13} />
                </button>
              </div>
            )}
          </aside>
        </main>
      )}

      {view === "log" && (
        <main className="log-page">
          <section className="panel log-panel">
            <div className="panel-tab">Log · History</div>
            <div className="log-head">
              <div>
                <h2 className="log-title">Validation log</h2>
                <p className="log-sub">
                  Separate histories for Product and Process. Click a row to open the full scorecard.
                </p>
              </div>
              <button type="button" className="ghost" onClick={() => openLogTab(logFilter)} disabled={logLoading}>
                {logLoading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                Refresh
              </button>
            </div>

            <div className="type-toggle log-type-toggle" role="tablist" aria-label="Log type">
              <button
                type="button"
                role="tab"
                aria-selected={logFilter === "product"}
                className={`type-tab${logFilter === "product" ? " active" : ""}`}
                onClick={() => setLogFilter("product")}
              >
                Product log ({productHistory.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={logFilter === "process"}
                className={`type-tab${logFilter === "process" ? " active" : ""}`}
                onClick={() => setLogFilter("process")}
              >
                Process log ({processHistory.length})
              </button>
            </div>

            {logError && <div className="err"><AlertTriangle size={14} /> {logError}</div>}

            {logLoading && productHistory.length === 0 && processHistory.length === 0 ? (
              <div className="log-empty"><Loader2 size={18} className="spin" /> Loading history…</div>
            ) : logHistory.length === 0 ? (
              <div className="log-empty">
                No {logFilter === "process" ? "process" : "product"} ideas yet. Run a {logFilter} validation first.
              </div>
            ) : (
              <div className="log-list">
                {logHistory.map((h) => {
                  const max = phase1MaxOf(h);
                  const t = toneOf(h.phase1, max);
                  const st = statusOf(h.phase1, max);
                  const isOpening = openingId === h.id;
                  const isProcess = ideaTypeOf(h) === "process";
                  const verdict = h.overallVerdict;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      className="log-row"
                      onClick={() => openHistory(h, "log")}
                      disabled={loading}
                    >
                      <span className="log-score" style={{ color: t.color }}>
                        {isOpening ? <Loader2 size={16} className="spin" /> : Number(h.phase1 || 0).toFixed(1)}
                      </span>
                      {isProcess ? (
                        <span className={`log-status log-status-${st.key}`}>{st.label}</span>
                      ) : (
                        <span className={`log-status log-status-${overallHeaderKey(verdict) || st.key}`}>
                          {verdict ? overallLabel(verdict) : st.label}
                        </span>
                      )}
                      <span className="log-weight">
                        {isProcess ? `/${max}` : (h.gramClass || h.ideaWeight || "—")}
                      </span>
                      <span className="log-idea">{h.idea}</span>
                      <span className="log-date">{formatLogDate(h.ts)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      )}

      {view === "result" && result && (
        <main className="result">
          <Readout result={result} onEscalate={() => {
            const failed = result?.failedFilters || [];
            setEscalateFilter(failed[0] || "");
            setEscalateEvidence("");
            setEscalateError("");
            setEscalateOpen(true);
          }} />
          <div className="verdict-actions">
            <button type="button" className="ghost" onClick={goBack}>
              <ArrowLeft size={15} /> {returnView === "log" ? "Back to log" : "Back to NPD Screen"}
            </button>
            <button className="ghost" onClick={reset}><RefreshCw size={15} /> Refine &amp; re-run</button>
            <button className="run inline" onClick={draftMessage}>
              <Send size={16} /> Forward to manager <ArrowRight size={15} />
            </button>
          </div>
        </main>
      )}

      {msgOpen && (
        <div className="modal-bg" onClick={() => setMsgOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <span><Send size={15} /> Submission message</span>
              <button className="ghost sq" onClick={() => setMsgOpen(false)}><X size={16} /></button>
            </div>
            {msgLoading ? (
              <div className="modal-loading"><Loader2 size={20} className="spin" /> Drafting…</div>
            ) : (
              <>
                <textarea className="msg-area" value={msgText} onChange={(e) => setMsgText(e.target.value)} rows={7} />
                <button className="run" onClick={copyMsg}>
                  {copied ? (<><Check size={16} /> Copied</>) : (<><Copy size={16} /> Copy message</>)}
                </button>
                <p className="modal-foot">Review before sending — Primus won't message your manager for you.</p>
              </>
            )}
          </div>
        </div>
      )}

      {escalateOpen && result && (
        <div className="modal-bg" onClick={() => !escalateLoading && setEscalateOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <span><Flag size={15} /> Raise exception → escalate to CKR</span>
              <button className="ghost sq" onClick={() => setEscalateOpen(false)} disabled={escalateLoading}><X size={16} /></button>
            </div>
            <p className="modal-foot" style={{ textAlign: "left", margin: "0 0 14px" }}>
              This does not change the AI verdict. It flags the record for human review. Name the failed filter and the evidence you dispute.
            </p>
            <label className="field">
              <span className="lbl">Failed filter</span>
              <select value={escalateFilter} onChange={(e) => setEscalateFilter(e.target.value)}>
                <option value="">Select a filter</option>
                {(result.failedFilters || []).map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="lbl">Disputed evidence</span>
              <textarea
                className="msg-area"
                rows={5}
                value={escalateEvidence}
                onChange={(e) => setEscalateEvidence(e.target.value)}
                placeholder="What specific evidence is wrong, and what should replace it?"
              />
            </label>
            {escalateError && <div className="err"><AlertTriangle size={14} /> {escalateError}</div>}
            <button className="run" onClick={submitEscalate} disabled={escalateLoading}>
              {escalateLoading ? <><Loader2 size={16} className="spin" /> Escalating…</> : <><Flag size={16} /> Escalate to CKR</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterStrip({ result }) {
  const [openKey, setOpenKey] = useState(null);
  return (
    <div className="filter-strip">
      {NPD_FILTERS.map((meta) => {
        const filter = result[meta.key] || {};
        const verdict = String(filter.verdict || "NEEDS_INPUT").toUpperCase();
        const pillClass =
          verdict === "PASS" ? "pass" : verdict === "FAIL" ? "fail" : "needs";
        const Icon = meta.icon;
        const expanded = openKey === meta.key;
        const sources = Array.isArray(filter.sources) ? filter.sources : [];
        return (
          <div className={`filter-tile filter-tile-${pillClass}${expanded ? " open" : ""}`} key={meta.key}>
            <button
              type="button"
              className="filter-tile-h"
              onClick={() => setOpenKey(expanded ? null : meta.key)}
            >
              <span className="filter-num">{meta.num}</span>
              <span className="filter-title">
                <Icon size={13} /> {meta.title}
              </span>
              <span className={`filter-pill filter-pill-${pillClass}`}>{verdict.replace("_", " ")}</span>
              <ChevronDown size={14} className={`filter-chevron${expanded ? " rot" : ""}`} />
            </button>
            {expanded && (
              <div className="filter-body">
                <p>{filterReason(filter) || "No reason recorded."}</p>
                {filter.evidenceSummary && filter.evidenceSummary !== filterReason(filter) && (
                  <p>{filter.evidenceSummary}</p>
                )}
                {meta.key === "filter3" && (
                  <p className="filter-proxy">Points-beat is a 10-point proxy, not a substitute for the Filter 6 lab/consumer panel.</p>
                )}
                {sources.length > 0 && (
                  <ul className="filter-sources">
                    {sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Readout({ result, onEscalate }) {
  const process = isProcessResult(result);
  const incomplete = process
    ? !(result?.efficiency && result?.feasibility && result?.scalability)
    : !(result?.novelty && result?.market && result?.evidence);

  if (incomplete) {
    return (
      <div className="err" style={{ margin: "18px 0" }}>
        <AlertTriangle size={14} /> Scorecard data was incomplete. Please re-run validation.
      </div>
    );
  }

  const pts = Number(result.phase1);
  const safePts = Number.isFinite(pts) ? pts : 0;
  const maxPts = phase1MaxOf(result);
  const status = statusOf(safePts, maxPts);
  const tags = Array.isArray(result.categoryTags)
    ? result.categoryTags.map((t) => String(t || "")).filter(Boolean)
    : [];

  const playBriefing = () => {
    if (!window.speechSynthesis || !result.analysisSummary) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(result.analysisSummary));
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  };

  if (process) {
    return (
      <article className="scorecard">
        <header className={`sc-header sc-header-${status.key}`}>
          <div className="sc-score-block">
            <span className="sc-label">Score / {maxPts}</span>
            <span className="sc-score">{safePts.toFixed(1)}</span>
          </div>
          <div className="sc-status-block">
            <span className="sc-label">Status</span>
            <span className="sc-status-pill">{status.label}</span>
          </div>
        </header>

        <div className="sc-body">
          <div className="sc-type-pill">Process idea · Phase 1</div>
          <h2 className="sc-title">{String(result.idea || "").toUpperCase()}</h2>

          <div className="sc-metrics">
            <div className="sc-metric">
              <span className="sc-metric-label">Efficiency</span>
              <span className="sc-metric-val">{scoreToFive(result.efficiency.score)}/5</span>
            </div>
            <div className="sc-metric">
              <span className="sc-metric-label">Feasibility</span>
              <span className="sc-metric-val">{scoreToFive(result.feasibility.score)}/5</span>
            </div>
            <div className="sc-metric">
              <span className="sc-metric-label">Scalability</span>
              <span className="sc-metric-val">{scoreToFive(result.scalability.score)}/5</span>
            </div>
          </div>

          <div className="sc-finance">
            <div className="sc-finance-row">
              <div className="sc-finance-item">
                <span className="sc-fin-label">Est. efficiency gain</span>
                <span className="sc-fin-val">{result.estimatedEfficiencyGain || "—"}</span>
              </div>
              <div className="sc-finance-item">
                <span className="sc-fin-label">Implementation effort</span>
                <span className="sc-fin-val">{result.implementationEffort || "—"}</span>
              </div>
            </div>
            <div className="sc-finance-tam">
              <span className="sc-fin-label">Applicability scope</span>
              <p>{result.applicabilityScope || "—"}</p>
            </div>
          </div>

          {tags.length > 0 && (
            <div className="sc-tags">
              {tags.map((t) => (
                <span key={t} className="sc-tag"># {t.toUpperCase()}</span>
              ))}
            </div>
          )}

          <div className="sc-analysis">
            <p className="sc-analysis-text">"{result.analysisSummary || result.oneLiner || ""}"</p>
            <button type="button" className="sc-audio" onClick={playBriefing}>
              <Volume2 size={14} /> Audio Briefing
            </button>
          </div>

          {result.refinementPivot && (
            <div className="sc-pivot">
              <div className="sc-pivot-label">Refinement Pivot</div>
              <p>{result.refinementPivot}</p>
            </div>
          )}
        </div>
      </article>
    );
  }

  const revenueInfo = revenueDisplayFor(result);
  const ideaWeight = result.gramClass || revenueInfo.weight;
  const hasNpd = Boolean(result.overallVerdict || result.filter1 || result.filter2);
  const headerKey = overallHeaderKey(result.overallVerdict) || status.key;
  const investmentGrid =
    result.investmentGrid ||
    buildInvestmentGrid(
      result.idea,
      result.adjustedRevenueCr ?? revenueInfo.crores ?? result.revenuePotentialCrores,
      result.tamValuation
    );

  return (
    <article className="scorecard">
      <header className={`sc-header sc-header-${headerKey}`}>
        <div className="sc-score-block">
          <span className="sc-label">{hasNpd ? "Gram class" : `Score / ${maxPts}`}</span>
          <span className="sc-score">{hasNpd ? (ideaWeight || "—") : safePts.toFixed(1)}</span>
        </div>
        <div className="sc-status-block">
          <span className="sc-label">{hasNpd ? "Overall verdict" : "Status"}</span>
          <span className="sc-status-pill">{hasNpd ? overallLabel(result.overallVerdict) : status.label}</span>
        </div>
      </header>

      <div className="sc-body">
        <div className="sc-type-pill">{hasNpd ? "Product idea · 4-Filter NPD" : "Product idea · Phase 1"}</div>
        <h2 className="sc-title">{String(result.idea || "").toUpperCase()}</h2>

        {hasNpd && <FilterStrip result={result} />}

        {hasNpd && result.overallVerdict === "CLEARED" && (
          <div className="npd-banner npd-banner-cleared">
            Ready for prototype (Filter 6 lab/consumer/pack) — outside this tool's scope.
          </div>
        )}
        {hasNpd && result.overallVerdict === "NEEDS_INPUT" && (
          <div className="npd-banner npd-banner-needs">
            Evidence gap, not a fail. Fill the missing fields on the NPD Screen and re-run.
            <ul>
              {NPD_FILTERS.filter((f) => result[f.key]?.verdict === "NEEDS_INPUT").map((f) => (
                <li key={f.key}><b>{f.title}:</b> {filterReason(result[f.key])}</li>
              ))}
            </ul>
          </div>
        )}
        {hasNpd && result.overallVerdict === "FAIL" && (
          <div className="npd-banner npd-banner-fail">
            Capped at 10g. A failed filter cannot earn a higher weight class.
            {result.escalationStatus === "escalated" && (
              <p className="npd-escalated">Exception raised to CKR — AI verdict unchanged.</p>
            )}
          </div>
        )}

        <div className="sc-metrics">
          <div className="sc-metric">
            <span className="sc-metric-label">Novelty</span>
            <span className="sc-metric-val">{scoreToFive(result.novelty.score)}/5</span>
          </div>
          <div className="sc-metric">
            <span className="sc-metric-label">Relevance</span>
            <span className="sc-metric-val">{scoreToFive(result.market.score)}/5</span>
          </div>
          <div className="sc-metric">
            <span className="sc-metric-label">Evidence</span>
            <span className="sc-metric-val">{scoreToFive(result.evidence.score)}/5</span>
          </div>
        </div>

        <div className="sc-finance">
          <div className="sc-finance-row">
            <div className="sc-finance-item">
              <span className="sc-fin-label">Revenue Potential</span>
              <span className="sc-fin-val">{revenueInfo.label}</span>
            </div>
            <div className="sc-finance-item">
              <span className="sc-fin-label">Classification</span>
              <span className="sc-fin-val">{ideaWeight || "—"}</span>
            </div>
          </div>
          <div className="sc-finance-tam">
            <span className="sc-fin-label">TAM Valuation</span>
            <p>{result.tamValuation || "—"}</p>
          </div>
        </div>

        <div className="sc-inv">
          <div className="sc-inv-head">
            <div className="sc-fin-label">Investment vs Revenue</div>
            <div className="sc-inv-badge">{investmentGrid.quadrantLabel}</div>
          </div>
          <p className="sc-inv-guidance">{investmentGrid.quadrantGuidance}</p>

          <div className="inv-board" role="img" aria-label={investmentGrid.quadrantLabel}>
            <div className="inv-corner" aria-hidden="true" />
            <div className="inv-col-label">Low revenue</div>
            <div className="inv-col-label">High revenue</div>
            <div className="inv-row-label">High investment</div>
            <div className={`inv-cell${investmentGrid.grid["high-low"] ? " active" : ""}`}>
              <strong>High · Low</strong>
              <span>Caution</span>
            </div>
            <div className={`inv-cell${investmentGrid.grid["high-high"] ? " active" : ""}`}>
              <strong>High · High</strong>
              <span>Scale</span>
            </div>
            <div className="inv-row-label">Low investment</div>
            <div className={`inv-cell${investmentGrid.grid["low-low"] ? " active" : ""}`}>
              <strong>Low · Low</strong>
              <span>Niche</span>
            </div>
            <div className={`inv-cell${investmentGrid.grid["low-high"] ? " active" : ""}`}>
              <strong>Low · High</strong>
              <span>Attractive</span>
            </div>
          </div>

          <div className="sc-inv-meta">
            <div><span className="sc-fin-label">Category / Platform</span><p>{investmentGrid.category}</p></div>
            <div>
              <span className="sc-fin-label">Plants</span>
              <p>{investmentGrid.plants?.length
                ? investmentGrid.plants.map((p) => p.name).join(" · ")
                : "To be confirmed"}</p>
            </div>
            <div>
              <span className="sc-fin-label">Key assets / machinery</span>
              <p>{investmentGrid.machinery?.length
                ? investmentGrid.machinery.join(", ")
                : "—"}</p>
            </div>
            <div>
              <span className="sc-fin-label">Plan</span>
              <p>{investmentGrid.planSummary || "—"}</p>
            </div>
            <div>
              <span className="sc-fin-label">Why this investment band</span>
              <p>{investmentGrid.investmentReason}</p>
            </div>
            <div>
              <span className="sc-fin-label">Revenue band used</span>
              <p>
                {investmentGrid.revenueLevel === "high" ? "High" : "Low"}
                {" "}(threshold ≥ ₹{Math.round(investmentGrid.revenueThresholdCrores * 100)} Lakhs)
              </p>
            </div>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="sc-tags">
            {tags.map((t) => (
              <span key={t} className="sc-tag"># {t.toUpperCase()}</span>
            ))}
          </div>
        )}

        <div className="sc-analysis">
          <p className="sc-analysis-text">"{result.analysisSummary || result.oneLiner || ""}"</p>
          <button type="button" className="sc-audio" onClick={playBriefing}>
            <Volume2 size={14} /> Audio Briefing
          </button>
        </div>

        {result.refinementPivot && (
          <div className="sc-pivot">
            <div className="sc-pivot-label">Refinement Pivot</div>
            <p>{result.refinementPivot}</p>
          </div>
        )}

        {hasNpd && result.overallVerdict === "FAIL" && result.canEscalateToCKR && result.escalationStatus !== "escalated" && (
          <button type="button" className="escalate-btn" onClick={onEscalate}>
            <Flag size={15} /> Raise exception → escalate to CKR
          </button>
        )}
      </div>
    </article>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
.primus *{box-sizing:border-box;}
.primus{
  --bg:#FAF9F5; --bg-soft:#F3F1EA; --ink:#006CB4; --ink-deep:#00568F; --muted:#4F7FA8; --muted-2:#7AA0BE;
  --line:#E5E2D8; --line-soft:#EEEBE3; --panel:#FFFFFF; --panel-2:#F5F3EC;
  --gold:#006CB4; --gold-ink:#FFFFFF; --teal:#0088C7; --coral:#E45757; --sky:#006CB4;
  --fd:'Space Grotesk',system-ui,sans-serif; --fm:'IBM Plex Mono',ui-monospace,monospace;
  --shadow:0 10px 30px rgba(0,108,180,.07); --shadow-hover:0 14px 36px rgba(0,108,180,.1);
  font-family:var(--fd); color:var(--ink); background:
    radial-gradient(ellipse 80% 50% at 10% -10%, rgba(0,108,180,.06), transparent 55%),
    radial-gradient(ellipse 70% 40% at 100% 0%, rgba(212,160,23,.05), transparent 50%),
    var(--bg);
  min-height:100%; padding:32px 28px 48px; line-height:1.5;
}
.primus h1{font-size:28px;font-weight:700;letter-spacing:-.6px;margin:2px 0 0;color:var(--ink);}
.primus h1 .dot{color:var(--ink-deep);}
.eyebrow{font-family:var(--fm);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);}
.masthead{display:flex;align-items:center;gap:14px;max-width:1280px;margin:0 auto 32px;animation:rise .45s ease both;}
.page-back-bar{max-width:1280px;margin:-10px auto 18px;padding:0 2px;}
.page-back{display:inline-flex;align-items:center;gap:8px;background:none;border:1px solid var(--line);border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;font-family:var(--fd);transition:background .15s,border-color .15s;}
.page-back:hover{background:#fff;border-color:rgba(0,108,180,.35);color:var(--ink-deep);}
.hist-row:disabled{opacity:.65;cursor:wait;}
.hist-score{display:inline-flex;align-items:center;justify-content:center;min-height:18px;}
.log-score{display:inline-flex;align-items:center;justify-content:center;min-height:20px;}
.hist-err{margin:0 0 10px;font-size:12.5px;}
.brand-btn{display:flex;align-items:center;gap:14px;background:none;border:none;padding:0;cursor:pointer;text-align:left;color:inherit;}
.brand-btn h1{margin:0;}
.brandmark{width:48px;height:48px;border:1.5px solid var(--ink);border-radius:14px;display:grid;place-items:center;background:linear-gradient(160deg,#E8F4FC,var(--bg));box-shadow:var(--shadow);}
.brandmark .star{color:var(--ink);font-size:22px;}
.top-nav{display:flex;align-items:center;gap:6px;margin-left:auto;margin-right:10px;}
.nav-tab{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid transparent;color:var(--muted);border-radius:999px;padding:8px 14px;font-family:var(--fd);font-size:13px;font-weight:600;cursor:pointer;transition:.15s;}
.nav-tab:hover{color:var(--ink);background:rgba(0,108,180,.06);}
.nav-tab.active{color:var(--ink);background:rgba(0,108,180,.1);border-color:rgba(0,108,180,.22);}
.live{font-family:var(--fm);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);display:flex;align-items:center;gap:7px;background:rgba(0,108,180,.08);border:1px solid rgba(0,108,180,.22);padding:7px 12px;border-radius:999px;}
.pulse{width:8px;height:8px;border-radius:50%;background:var(--ink);box-shadow:0 0 0 0 var(--ink);animation:pl 2s infinite;}
@keyframes pl{0%{box-shadow:0 0 0 0 rgba(0,108,180,.45);}70%{box-shadow:0 0 0 7px rgba(0,108,180,0);}100%{box-shadow:0 0 0 0 rgba(0,108,180,0);}}
@keyframes rise{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}

.grid{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.9fr) minmax(300px,.85fr);gap:24px;align-items:start;animation:rise .5s ease .05s both;}
.result{max-width:720px;margin:0 auto;animation:rise .45s ease both;}
.log-page{max-width:1080px;margin:0 auto;animation:rise .45s ease both;}
.log-panel{padding-top:28px;}
.log-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px;flex-wrap:wrap;}
.log-title{margin:0 0 6px;font-size:22px;color:var(--ink);}
.log-sub{margin:0;font-size:13px;color:var(--muted);max-width:520px;line-height:1.45;}
.log-empty{display:flex;align-items:center;justify-content:center;gap:10px;padding:40px 12px;color:var(--muted);font-size:14px;}
.log-list{display:flex;flex-direction:column;border-top:1px solid var(--line-soft);}
.log-row{display:grid;grid-template-columns:56px 92px 52px minmax(0,1fr) 140px;gap:12px;align-items:center;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid var(--line-soft);padding:14px 4px;cursor:pointer;border-radius:8px;transition:background .15s;}
.log-row:hover{background:var(--bg-soft);}
.log-row:disabled{opacity:.6;cursor:wait;}
.log-score{font-family:var(--fm);font-weight:700;font-size:18px;}
.log-status{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:5px 10px;border-radius:999px;width:fit-content;}
.log-status-approved{background:rgba(36,168,102,.12);color:#1F8A55;}
.log-status-promising{background:rgba(201,162,39,.16);color:#8A6E12;}
.log-status-rejected{background:rgba(228,87,87,.12);color:#C53D3D;}
.log-weight{font-family:var(--fm);font-size:11px;color:var(--ink);letter-spacing:.04em;}
.log-idea{font-size:13.5px;color:var(--ink-deep);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.log-date{font-size:11.5px;color:var(--muted);text-align:right;font-family:var(--fm);}
.hist-more{display:inline-flex;align-items:center;gap:6px;margin-top:10px;background:none;border:none;color:var(--ink);font-size:12.5px;font-weight:600;cursor:pointer;padding:4px 0;}
.hist-more:hover{color:var(--ink-deep);}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:28px;position:relative;box-shadow:var(--shadow);transition:box-shadow .2s ease,transform .2s ease;}
.panel.console{padding:32px 34px 28px;min-height:420px;display:flex;flex-direction:column;}
.panel.side{padding:24px 22px;}
.panel:hover{box-shadow:var(--shadow-hover);}
.panel-tab,.ol-tab{position:absolute;top:-11px;left:20px;font-family:var(--fm);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#fff;background:var(--ink);padding:4px 12px;border-radius:20px;font-weight:600;}

.type-toggle{display:inline-flex;gap:4px;background:var(--bg-soft);border:1px solid var(--line);border-radius:999px;padding:4px;margin:8px 0 18px;}
.type-tab{border:none;background:transparent;color:var(--muted);font-family:var(--fd);font-size:13px;font-weight:600;padding:8px 16px;border-radius:999px;cursor:pointer;transition:background .15s,color .15s;}
.type-tab:hover{color:var(--ink);}
.type-tab.active{background:#fff;color:var(--ink-deep);box-shadow:0 1px 4px rgba(0,108,180,.12);}
.log-type-toggle{margin:0 0 18px;}
.sc-type-pill{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);background:rgba(0,108,180,.1);border:1px solid rgba(0,108,180,.2);padding:5px 10px;border-radius:999px;margin-bottom:12px;}

.field{display:block;margin-bottom:18px;flex:1;}
.lbl{display:flex;align-items:center;gap:6px;font-family:var(--fm);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink);margin-bottom:10px;}
.lbl em{font-style:normal;color:var(--muted);text-transform:none;letter-spacing:0;font-family:var(--fd);font-size:11px;}
.primus textarea,.primus input,.primus select{width:100%;background:var(--bg-soft);border:1px solid var(--line);border-radius:14px;color:var(--ink);font-family:var(--fd);font-size:15px;padding:14px 16px;resize:vertical;outline:none;transition:border-color .15s,box-shadow .15s,background .15s;line-height:1.55;}
.primus select{resize:none;cursor:pointer;}
.primus textarea.idea-input{min-height:220px;font-size:15.5px;padding:18px 20px;}
.primus textarea:focus,.primus input:focus,.primus select:focus{border-color:var(--ink);background:#fff;box-shadow:0 0 0 3px rgba(0,108,180,.16);}
.primus textarea::placeholder,.primus input::placeholder{color:var(--muted-2);}
.npd-fields{margin:0 0 8px;}
.npd-hint{font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.45;}
.npd-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;margin:0 0 8px;}
.npd-grid .field{margin-bottom:0;}
.npd-grid .span-2{grid-column:1 / -1;}
.npd-check{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:var(--ink-deep);line-height:1.4;cursor:pointer;}
.npd-check input{width:auto;margin-top:2px;accent-color:var(--ink);}
.npd-inline-hint{display:block;font-size:11px;color:var(--muted);margin-top:6px;font-family:var(--fm);}
.filter-strip{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 16px;}
.filter-tile{background:var(--bg-soft);border:1px solid var(--line);border-radius:14px;overflow:hidden;}
.filter-tile-h{display:flex;flex-wrap:wrap;align-items:center;gap:6px;width:100%;background:none;border:none;padding:12px;cursor:pointer;text-align:left;color:var(--ink);font-family:var(--fd);}
.filter-num{font-family:var(--fm);font-size:10px;letter-spacing:.08em;color:var(--muted);}
.filter-title{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;flex:1;min-width:120px;}
.filter-pill{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 8px;border-radius:999px;}
.filter-pill-pass{background:rgba(36,168,102,.14);color:#1F8A55;}
.filter-pill-fail{background:rgba(228,87,87,.14);color:#C53D3D;}
.filter-pill-needs{background:rgba(201,162,39,.18);color:#8A6E12;}
.filter-chevron{margin-left:auto;color:var(--muted);transition:transform .15s;}
.filter-chevron.rot{transform:rotate(180deg);}
.filter-body{padding:0 12px 12px;font-size:12.5px;color:var(--ink-deep);line-height:1.45;}
.filter-body p{margin:0 0 8px;}
.filter-proxy{font-size:11.5px;color:var(--muted)!important;}
.filter-sources{margin:0;padding-left:16px;}
.filter-sources a{color:var(--ink);word-break:break-all;}
.npd-banner{border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.45;margin:0 0 16px;}
.npd-banner ul{margin:8px 0 0;padding-left:18px;}
.npd-banner-cleared{background:rgba(36,168,102,.1);border:1px solid rgba(36,168,102,.25);color:#1F8A55;}
.npd-banner-needs{background:rgba(201,162,39,.12);border:1px solid rgba(201,162,39,.28);color:#8A6E12;}
.npd-banner-fail{background:rgba(228,87,87,.1);border:1px solid rgba(228,87,87,.25);color:#C53D3D;}
.npd-escalated{margin:8px 0 0;font-weight:600;}
.escalate-btn{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;margin-top:14px;background:#fff;border:1px solid rgba(228,87,87,.35);color:#C53D3D;border-radius:12px;padding:12px;font-family:var(--fd);font-weight:600;font-size:14px;cursor:pointer;}
.escalate-btn:hover{background:rgba(228,87,87,.06);}
.chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px;}
.chip{display:inline-flex;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--line);border-radius:20px;padding:5px 6px 5px 11px;font-size:12px;color:var(--ink);}
.chip button{background:none;border:none;color:var(--muted);cursor:pointer;display:grid;place-items:center;padding:2px;border-radius:50%;}
.chip button:hover{color:var(--coral);}
.chip.file img{width:20px;height:20px;border-radius:5px;object-fit:cover;margin-right:2px;}
.media-row{margin:4px 0 20px;}

.ghost{display:inline-flex;align-items:center;gap:7px;background:var(--panel-2);border:1px solid var(--line);color:var(--ink);border-radius:11px;padding:9px 14px;font-family:var(--fd);font-size:13px;cursor:pointer;transition:.15s;}
.ghost:hover{border-color:var(--ink);background:#fff;}
.ghost.sq{padding:9px;}
.run{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:9px;background:linear-gradient(135deg,#006CB4,#0088C7);color:#fff;border:none;border-radius:12px;padding:15px;font-family:var(--fd);font-weight:600;font-size:15px;cursor:pointer;transition:transform .15s,filter .15s,box-shadow .15s;box-shadow:0 8px 18px rgba(0,108,180,.28);margin-top:auto;}
.run:hover{filter:brightness(1.05);transform:translateY(-1px);}
.run:active{transform:none;}
.run:disabled{opacity:.6;cursor:default;transform:none;box-shadow:none;}
.run.inline{width:auto;padding:12px 20px;margin-top:0;}
.err{display:flex;align-items:center;gap:8px;color:var(--coral);background:rgba(228,87,87,.08);border:1px solid rgba(228,87,87,.2);border-radius:10px;padding:10px 12px;font-size:13px;margin:2px 0 14px;}
.spin{animation:sp 1s linear infinite;}@keyframes sp{to{transform:rotate(360deg);}}

.side-note{font-size:12.5px;color:var(--muted);margin:6px 0 14px;line-height:1.45;}
.side-note b{color:var(--ink);}
.matrix{display:flex;flex-direction:column;gap:2px;}
.matrix-row{display:flex;gap:11px;padding:11px 0;border-bottom:1px solid var(--line-soft);color:var(--ink);}
.matrix-row>div{flex:1;min-width:0;}
.mr-top{display:flex;justify-content:space-between;gap:8px;color:var(--ink);font-size:13px;}
.mr-top span{font-family:var(--fm);color:var(--ink);flex-shrink:0;}
.mr-blurb{font-size:11.5px;color:var(--muted);margin-top:2px;line-height:1.4;}
.matrix-row.phase2{color:var(--muted-2);opacity:.8;}
.matrix-row.phase2 .mr-top span{color:var(--muted-2);}

.hist{margin-top:16px;padding-top:4px;}
.hist-h{display:flex;align-items:center;gap:7px;font-family:var(--fm);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);margin-bottom:9px;}
.hist-row{display:flex;align-items:center;gap:11px;width:100%;text-align:left;background:none;border:none;border-top:1px solid var(--line-soft);padding:10px 2px;cursor:pointer;border-radius:8px;transition:background .15s;}
.hist-row:hover{background:var(--bg-soft);}
.hist-row:hover .hist-idea{color:var(--ink-deep);}
.hist-score{font-family:var(--fm);font-weight:600;font-size:15px;min-width:26px;color:var(--ink);}
.hist-weight{font-family:var(--fm);font-size:10px;color:var(--ink);min-width:38px;letter-spacing:.04em;}
.hist-idea{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

.scorecard{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(0,108,180,.12);border:1px solid var(--line);color:var(--ink);font-family:var(--fd);}
.sc-header{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 22px;color:#fff;}
.sc-header-rejected{background:linear-gradient(135deg,#E45757,#D63A3A);color:#fff;}
.sc-header-promising{background:linear-gradient(135deg,#F8E9A8,#F3DE7A);color:#5C4A0A;}
.sc-header-approved{background:linear-gradient(135deg,#2FBE7A,#24A866);color:#fff;}
.sc-label{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;margin-bottom:4px;font-weight:500;}
.sc-score{display:block;font-size:44px;font-weight:700;line-height:1;letter-spacing:-.02em;}
.sc-status-block{text-align:right;}
.sc-status-pill{display:inline-block;background:rgba(0,0,0,.18);border-radius:20px;padding:6px 16px;font-size:13px;font-weight:600;letter-spacing:.02em;margin-top:18px;}
.sc-header-promising .sc-status-pill{background:rgba(92,74,10,.14);color:#5C4A0A;}
.sc-header-rejected .sc-status-pill,.sc-header-approved .sc-status-pill{background:rgba(0,0,0,.18);color:#fff;}
.sc-body{padding:22px;}
.sc-title{font-size:18px;font-weight:700;letter-spacing:.04em;margin:0 0 18px;color:var(--ink);line-height:1.3;}
.sc-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px;}
.sc-metric{background:var(--bg-soft);border-radius:12px;padding:12px;}
.sc-metric-label{display:block;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;font-weight:600;}
.sc-metric-val{font-size:20px;font-weight:700;color:var(--ink);}
.sc-finance{background:#F0F7FC;border-radius:12px;padding:14px 16px;margin-bottom:16px;}
.sc-finance-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;}
.sc-fin-label{display:block;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;font-weight:600;}
.sc-fin-val{font-size:14px;font-weight:700;color:var(--ink);line-height:1.35;}
.sc-finance-tam{border-top:1px solid var(--line);padding-top:12px;}
.sc-finance-tam p{margin:4px 0 0;font-size:13px;line-height:1.5;color:var(--ink-deep);}
.sc-inv{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:16px;}
.sc-inv-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;}
.sc-inv-badge{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:rgba(0,108,180,.12);color:var(--ink-deep);padding:6px 10px;border-radius:999px;border:1px solid rgba(0,108,180,.25);}
.sc-inv-guidance{margin:0 0 12px;font-size:12.5px;color:var(--ink-deep);line-height:1.45;}
.inv-board{display:grid;grid-template-columns:88px 1fr 1fr;grid-template-rows:auto 1fr 1fr;gap:8px;margin:8px 0 14px;}
.inv-corner{min-height:1px;}
.inv-col-label,.inv-row-label{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.3;}
.inv-row-label{justify-content:flex-end;padding-right:4px;text-align:right;}
.inv-cell{background:var(--bg-soft);border:1px solid var(--line-soft);border-radius:10px;padding:14px 10px;min-height:72px;display:flex;flex-direction:column;gap:4px;justify-content:center;}
.inv-cell strong{font-size:12px;color:var(--ink);}
.inv-cell span{font-size:11px;color:var(--muted);}
.inv-cell.active{background:#D6ECFA;border-color:#006CB4;box-shadow:0 0 0 2px rgba(0,108,180,.2);}
.inv-cell.active strong{color:var(--ink-deep);}
.inv-cell.active span{color:var(--ink);font-weight:600;}
.sc-inv-meta{display:grid;gap:10px;border-top:1px solid var(--line-soft);padding-top:12px;}
.sc-inv-meta p{margin:4px 0 0;font-size:12.5px;line-height:1.45;color:var(--ink-deep);}
@media (max-width:520px){
  .inv-board{grid-template-columns:72px 1fr 1fr;gap:6px;}
  .inv-cell{min-height:64px;padding:10px 8px;}
  .inv-col-label,.inv-row-label{font-size:8px;}
}
.sc-tags{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;}
.sc-tag{background:#E8F4FC;color:var(--ink);font-size:10px;font-weight:600;letter-spacing:.06em;padding:6px 12px;border-radius:20px;}
.sc-analysis{background:#E8F4FC;border-radius:12px;padding:16px;margin-bottom:14px;}
.sc-analysis-text{margin:0 0 14px;font-size:13.5px;line-height:1.55;color:var(--ink-deep);font-style:italic;}
.sc-audio{display:inline-flex;align-items:center;gap:6px;background:none;border:none;padding:0;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);cursor:pointer;font-family:var(--fd);}
.sc-audio:hover{color:var(--ink-deep);}
.sc-pivot{background:#F5FAFE;border:1px solid var(--line);border-radius:12px;padding:16px;}
.sc-pivot-label{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);margin-bottom:8px;}
.sc-pivot p{margin:0;font-size:13px;line-height:1.55;color:var(--ink-deep);}

.verdict-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:18px;flex-wrap:wrap;}

.modal-bg{position:fixed;inset:0;background:rgba(0,86,143,.35);backdrop-filter:blur(4px);display:grid;place-items:center;padding:22px;z-index:50;}
.modal{width:100%;max-width:520px;background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 20px 50px rgba(0,108,180,.18);}
.modal-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;}
.modal-h span{display:flex;align-items:center;gap:8px;font-family:var(--fm);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);}
.msg-area{margin-bottom:12px;font-size:14px;line-height:1.5;}
.modal-loading{display:flex;align-items:center;gap:10px;color:var(--muted);padding:26px 0;justify-content:center;}
.modal-foot{font-size:11.5px;color:var(--muted);text-align:center;margin:10px 0 0;}

@media(max-width:820px){
  .grid{grid-template-columns:1fr;gap:18px;}
  .result{max-width:100%;padding:0 4px;}
  .primus{padding:18px 16px 32px;}
  .masthead{margin-bottom:20px;flex-wrap:wrap;max-width:100%;}
  .page-back-bar{max-width:100%;}
  .panel.console{min-height:0;padding:26px 22px 22px;}
  .primus textarea.idea-input{min-height:160px;}
  .top-nav{order:3;width:100%;margin:8px 0 0;margin-right:0;}
  .log-row{grid-template-columns:48px 78px minmax(0,1fr);gap:8px;}
  .log-weight,.log-date{display:none;}
  .npd-grid{grid-template-columns:1fr;}
  .filter-strip{grid-template-columns:1fr;}
}
@media(prefers-reduced-motion:reduce){.pulse,.primus .masthead,.primus .grid,.primus .result{animation:none;}.run:hover{transform:none;}}
`;
