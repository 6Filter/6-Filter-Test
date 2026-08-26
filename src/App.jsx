import { useState, useRef, useEffect } from "react";
import {
  Gauge, TrendingUp, X, Send,
  RefreshCw, Copy, Check, AlertTriangle, Loader2,
  FileUp, FileText, ArrowRight, ArrowLeft, History, Volume2,
  Scale, Tag, Cpu, ChevronDown, Flag, Trash2, Download
} from "lucide-react";
import { revenueDisplayFor, scoreToFive, toneOf } from "./scoringUi.js";
import { deductionsFor, mistakesFor, overallPassFail } from "./verdictSequence.js";
import { buildInvestmentGrid } from "../lib/investmentGrid.js";
import { nearestFixedPricePoint } from "../lib/npdMaster.js";
import { resolveBrandFit } from "../lib/ckBrands.js";
import { LLM_CATALOG, normalizeProvider, providerLabel } from "../lib/llmCatalog.js";
import { sanitizeImageBase64, sniffImageMediaType } from "../lib/mediaType.js";
import { hideFilterTalk } from "../lib/publicCopy.js";
import { deriveMoves, gateCardsFor, heroVerdict, scoreOutOf100 } from "../lib/weightage/deriveMoves.js";

async function callModel(userText, system, image = null, provider = "claude") {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userText, system, image, provider }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Model API failed (${res.status}).`);
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

async function analyzeAndStoreIdea(idea, image = null, ideaType = "product", npd = {}, provider = "claude") {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ideaType === "product" ? 180000 : 90000);
  try {
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea,
        ideaType,
        provider,
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

async function deleteIdeaFromLog(id) {
  const res = await fetch(`/api/ideas/${encodeURIComponent(id)}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not delete this run.");
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

async function uploadSupportingDoc(id, doc) {
  const res = await fetch(`/api/ideas/${encodeURIComponent(id)}/supporting-doc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: doc.name, mediaType: doc.mediaType, data: doc.data }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not attach that document.");
  return data;
}

async function removeSupportingDoc(id, docId) {
  const res = await fetch(`/api/ideas/${encodeURIComponent(id)}/supporting-doc/${encodeURIComponent(docId)}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not remove that document.");
  return data;
}

const SUPPORTING_DOC_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const SUPPORTING_DOC_TYPE_ERR = "Supporting documents must be PDF or Word (.pdf, .doc, .docx).";
const SUPPORTING_DOC_SIZE_ERR = "That file is too large — 8 MB max.";
const SUPPORTING_DOC_MAX_BYTES = 8 * 1024 * 1024;

function sniffSupportingMediaType(file) {
  const t = String(file?.type || "").toLowerCase();
  if (SUPPORTING_DOC_TYPES.has(t)) return t;
  const n = String(file?.name || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".doc")) return "application/msword";
  return "";
}

function isImageUpload(name, mime) {
  return (
    String(mime || "").startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|heic|heif|tif|tiff|avif|svg)$/i.test(String(name || ""))
  );
}

async function rasterizeImageFile(file) {
  const bitmap = await createImageBitmap(file);
  const MAX = 1568;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height, 1));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (typeof bitmap.close === "function") bitmap.close();
  const dataUrl = canvas.toDataURL("image/png");
  const data = sanitizeImageBase64(dataUrl);
  if (!data) throw new Error("empty png");
  return {
    name: String(file.name || "upload").replace(/\.[^.]+$/, "") + ".png",
    mediaType: "image/png",
    data,
    preview: dataUrl,
  };
}

function readFileAsAttachment(file, isImage) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const data = sanitizeImageBase64(result.includes("base64,") ? result : result.split(",")[1] || "");
      resolve({
        name: file.name,
        mediaType: isImage
          ? sniffImageMediaType(data, file.name, file.type)
          : file.type ||
            (String(file.name).toLowerCase().endsWith(".pdf")
              ? "application/pdf"
              : String(file.name).toLowerCase().endsWith(".docx")
                ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                : String(file.name).toLowerCase().endsWith(".doc")
                  ? "application/msword"
                  : "application/octet-stream"),
        data,
        preview: isImage ? result : null,
      });
    };
    reader.readAsDataURL(file);
  });
}

const NPD_FILTERS = [
  { key: "filter1", num: "01", title: "Opportunity to Grow", hint: "Attribute · benchmark · gap", icon: TrendingUp },
  { key: "filter2", num: "02", title: "Net Margin Gate", hint: "Division floor at launch", icon: Scale },
  { key: "filter3", num: "03", title: "Price Resilient", hint: "2-pt proxy · volume loss ≤10%", icon: Tag },
  { key: "filter4", num: "04", title: "Tech & Habit Shift", hint: "5–10 year format trend", icon: Cpu },
];

function filterReason(filter) {
  return hideFilterTalk(
    String(filter?.verdictReason || filter?.reason || filter?.evidenceSummary || "").trim()
  );
}

function VerdictStory({ result }) {
  const deductions = deductionsFor(result);
  const mistakes = mistakesFor(result);
  return (
    <ol className="verdict-seq">
      <li>
        <span className="vs-step">02</span>
        <div>
          <h3>Where marks were deducted</h3>
          {deductions.length === 0 ? (
            <p className="vs-empty">No marks deducted on the scored dimensions.</p>
          ) : (
            <ul>
              {deductions.map((row) => (
                <li key={row.title}>
                  <div className="vs-row-top">
                    <b>{row.title}</b>
                    <span className="vs-marks">{row.marks}</span>
                  </div>
                  {row.detail ? <p>{row.detail}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </li>
      <li>
        <span className="vs-step">03</span>
        <div>
          <h3>Mistakes</h3>
          {mistakes.length === 0 ? (
            <p className="vs-empty">No specific mistakes recorded.</p>
          ) : (
            <ul className="vs-mistakes">
              {mistakes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </li>
    </ol>
  );
}

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

function formatDurationMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "—";
  const totalSec = Math.round(n / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s}s`;
}


export default function App() {
  const [view, setView] = useState("compose");
  const [ideaType, setIdeaType] = useState("product");
  const [idea, setIdea] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [productHistory, setProductHistory] = useState([]);
  const [processHistory, setProcessHistory] = useState([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState("");
  const [logFilter, setLogFilter] = useState("product");

  const [benchmarkExists, setBenchmarkExists] = useState(false);
  const [pointsBeat, setPointsBeat] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");

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
  const [deletingId, setDeletingId] = useState(null);
  const [llmProvider, setLlmProvider] = useState("claude");
  const [providerStatus, setProviderStatus] = useState(LLM_CATALOG);
  const [loadSec, setLoadSec] = useState(0);
  const [hasCalibration, setHasCalibration] = useState(true);

  const fileRef = useRef(null);

  async function refreshHistories() {
    const [products, processes] = await Promise.all([
      fetchIdeaHistory(50, "product"),
      fetchIdeaHistory(50, "process"),
    ]);
    setProductHistory(products);
    setProcessHistory(processes);
    return { products, processes };
  }

  async function confirmDeleteRun(h, source = "compose") {
    if (!h?.id || deletingId) return;
    const ok = window.confirm("Remove this run from the production log? This cannot be undone.");
    if (!ok) return;
    setDeletingId(h.id);
    if (source === "log") setLogError("");
    else setError("");
    try {
      await deleteIdeaFromLog(h.id);
      setProductHistory((rows) => rows.filter((r) => r.id !== h.id));
      setProcessHistory((rows) => rows.filter((r) => r.id !== h.id));
      if (result?.id === h.id) {
        setResult(null);
        setView(source === "log" ? "log" : "compose");
      }
    } catch (e) {
      const msg = e.message || "Could not delete this run.";
      if (source === "log") setLogError(msg);
      else setError(msg);
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    refreshHistories().catch(() => {});
    try {
      const stored = localStorage.getItem("primus-llm-provider");
      if (stored) setLlmProvider(normalizeProvider(stored));
    } catch {
      /* ignore */
    }
    fetch("/api/providers")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.providers) && data.providers.length) {
          setProviderStatus(data.providers);
        }
      })
      .catch(() => {});
    fetch("/api/calibration")
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.hasAny === "boolean") setHasCalibration(data.hasAny);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoadSec(0);
      return;
    }
    setLoadSec(0);
    const tick = setInterval(() => setLoadSec((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [loading]);

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
  const liveBrandFit = ideaType === "product" ? resolveBrandFit(idea) : null;
  const ideasScreenedCount = productHistory.length + processHistory.length;
  const productWithVerdict = productHistory.filter((h) => h.overallVerdict);
  const passRateLabel = productWithVerdict.length
    ? `${Math.round(
        (productWithVerdict.filter((h) => h.overallVerdict === "CLEARED").length /
          productWithVerdict.length) *
          100
      )}%`
    : "—";
  const timedRuns = [...productHistory, ...processHistory].filter((h) => {
    const n = Number(h.durationMs);
    return Number.isFinite(n) && n > 0;
  });
  const avgScreenTimeLabel = timedRuns.length
    ? formatDurationMs(
        timedRuns.reduce((sum, h) => sum + Number(h.durationMs), 0) / timedRuns.length
      )
    : "—";

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const name = String(f.name || "").toLowerCase();
    const mime = String(f.type || "").toLowerCase();
    const ok =
      isImageUpload(name, mime) ||
      mime === "application/pdf" ||
      mime === "application/msword" ||
      mime.includes("wordprocessingml") ||
      /\.(pdf|docx?)$/i.test(name);
    if (!ok) {
      setError("Upload a PDF, Word file (.doc / .docx), or image (JPG, PNG, GIF, WebP, BMP).");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError("Keep the file under 8 MB.");
      return;
    }
    setError("");
    const isImage = isImageUpload(name, mime);
    try {
      if (isImage) {
        try {
          setAttachment(await rasterizeImageFile(f));
        } catch {
          setAttachment(await readFileAsAttachment(f, true));
        }
      } else {
        setAttachment(await readFileAsAttachment(f, false));
      }
    } catch {
      setError("Could not read that file. Try a JPG or PNG.");
    }
  };

  async function analyze() {
    if (!idea.trim() && !attachment) {
      setError(
        ideaType === "process"
          ? "Describe the process idea or upload a PDF, Word file, or image."
          : "Describe the product idea or upload a PDF, Word file, or image."
      );
      return;
    }
    if (ideaType === "product") {
      if (pricePerUnit === "" || !Number.isFinite(Number(pricePerUnit)) || Number(pricePerUnit) <= 0) {
        setError("Enter a price per unit.");
        return;
      }
      if (benchmarkExists && (pointsBeat === "" || !Number.isFinite(Number(pointsBeat)))) {
        setError("Enter how many points this idea beats the market leader (0–10).");
        return;
      }
    }
    setLoading(true); setError("");
    const startedAt = performance.now();

    try {
      const npd =
        ideaType === "product"
          ? {
              benchmarkExists,
              pointsBeat: benchmarkExists && pointsBeat !== "" ? Number(pointsBeat) : null,
              pricePerUnit: pricePerUnit === "" ? null : Number(pricePerUnit),
            }
          : {};
      const full = await analyzeAndStoreIdea(idea.trim(), attachment, ideaType, npd, llmProvider);
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
        llmProvider: full.llmProvider || llmProvider,
        llmLabel: full.llmLabel || providerLabel(llmProvider),
        durationMs: Math.round(performance.now() - startedAt),
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
        `6 FILTER TEST PHASE-1 SCORE: ${result.phase1.toFixed(1)}/${max} (Efficiency ${e}, Feasibility ${f}, Scalability ${s}).`;
    } else {
      const n = result.novelty.score, m = result.market.score, ev = result.evidence.score;
      system = "You draft concise, confident internal messages for a product manager submitting an idea to their manager. Sentence case, no fluff, no emoji.";
      text =
        `Draft a short message to my manager submitting this product idea for review. Under 110 words. ` +
        `Confident but not overselling; end with a clear ask to review and greenlight the next validation phase.\n\n` +
        `IDEA: ${result.idea}\nPOSITIONING: ${result.oneLiner}\n` +
        `6 FILTER TEST PHASE-1 SCORE: ${result.phase1.toFixed(1)}/${max} (Novelty ${n}, Market Relevance ${m}, Evidence ${ev}).`;
    }
    const docNote = result.overallVerdict === "CLEARED" && result.supportingDocs?.length
      ? `\nSUPPORTING RESEARCH ATTACHED: ${result.supportingDocs.map((d) => d.name).join(", ")}. Mention in one line that supporting research is attached.`
      : "";
    try {
      setMsgText((await callModel(text + docNote, system, null, llmProvider)).trim());
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
      setEscalateError("Name the specific check being disputed.");
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

  async function onUploadSupportingDoc(doc) {
    if (!result?.id) throw new Error("This idea has not been saved yet.");
    const updated = await uploadSupportingDoc(result.id, doc);
    setResult(updated);
    setProductHistory((h) =>
      h.map((row) => (row.id === updated.id ? { ...row, supportingDocs: updated.supportingDocs || [] } : row))
    );
  }

  async function onRemoveSupportingDoc(docId) {
    if (!result?.id) throw new Error("This idea has not been saved yet.");
    const updated = await removeSupportingDoc(result.id, docId);
    setResult(updated);
    setProductHistory((h) =>
      h.map((row) => (row.id === updated.id ? { ...row, supportingDocs: updated.supportingDocs || [] } : row))
    );
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
    <div className={`primus ${view === "result" ? "screen-verdict" : view === "log" ? "screen-log" : "screen-brief"}`}>
      <style>{CSS}</style>

      <header className="masthead">
        <button type="button" className="brand-btn" onClick={() => setView("compose")} aria-label="Go to validate">
          <div className="brandmark"><span className="star">✦</span></div>
          <div>
            <div className="eyebrow">NPD SCREENING</div>
            <h1>6 Filter Test</h1>
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
        <label className="model-switch" title="Compare NPD results across models. Keys stay on the server.">
          <span className="pulse" />
          <span className="model-switch-lbl">Model</span>
          <select
            value={llmProvider}
            onChange={(e) => {
              const next = normalizeProvider(e.target.value);
              setLlmProvider(next);
              try {
                localStorage.setItem("primus-llm-provider", next);
              } catch {
                /* ignore */
              }
            }}
            aria-label="LLM provider"
          >
            {providerStatus.map((p) => (
              <option key={p.id} value={p.id} disabled={p.configured === false}>
                {p.label}
                {p.id === "claude" ? " · default" : ""}
                {p.configured === false ? " · not configured" : ""}
              </option>
            ))}
          </select>
        </label>
      </header>

      {backLabel && (
        <div className="page-back-bar">
          <button type="button" className="page-back" onClick={goBack}>
            <ArrowLeft size={15} /> {backLabel}
          </button>
        </div>
      )}

      {view === "compose" && (
        <>
        <section className="brief-hero">
          <div className="brief-hero-text">
            <div className="eyebrow">NPD SCREENING · V4</div>
            <h2 className="brief-hero-h">Every idea meets the same four gates.</h2>
            <p className="brief-hero-sub">
              No exceptions, no vibes. Opportunity, margin, price, and technology shift,
              checked the same way every time.
            </p>
          </div>
          <div className="brief-stats">
            <div className="brief-stat">
              <div className="brief-stat-lbl">Ideas screened</div>
              <div className="brief-stat-val">{ideasScreenedCount}</div>
            </div>
            <div className="brief-stat">
              <div className="brief-stat-lbl">Pass rate</div>
              <div className="brief-stat-val brief-stat-pass">{passRateLabel}</div>
            </div>
            <div className="brief-stat">
              <div className="brief-stat-lbl">Avg screen time</div>
              <div className="brief-stat-val">{avgScreenTimeLabel}</div>
            </div>
          </div>
        </section>
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
                    ? "Type the process idea, or upload a PDF / Word file / image with the insight."
                    : "Type the product idea, or upload a PDF / Word file / image with the insight."
                }
              />
            </label>

            <div className="attach-block">
              <span className="lbl">Or attach idea / insight</span>
              <div className="media-row">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,image/*"
                  onChange={onFile}
                  hidden
                />
                {!attachment ? (
                  <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
                    <FileUp size={15} /> Upload PDF, Word, or image
                  </button>
                ) : (
                  <span className="chip file">
                    {attachment.preview ? <img src={attachment.preview} alt="" /> : <FileText size={15} />}
                    {attachment.name}
                    <button type="button" onClick={() => setAttachment(null)}><X size={12} /></button>
                  </span>
                )}
              </div>
              <p className="attach-hint">
                PDF, Word (.doc / .docx), or image (JPG, PNG, GIF, WebP). You can run the screen from the file alone.
              </p>
            </div>

            {ideaType === "product" && (
              <div className="npd-fields">
                <p className="npd-hint">
                  Price and market-leader points are the brief. Division, margin, volume loss, attribute, and benchmark are inferred on the server.
                </p>
                {!hasCalibration && (
                  <p className="ci-nudge ci-nudge-compose">
                    Have Nielsen/Kantar data for a related category? Running a blind calibration first is the single highest-leverage thing you can do here.
                  </p>
                )}
                {liveBrandFit?.mismatch && (
                  <p className="npd-brand-warn">{liveBrandFit.reason}</p>
                )}
                {!liveBrandFit?.mismatch && liveBrandFit?.reason && (
                  <p className="npd-brand-ok">{liveBrandFit.reason}</p>
                )}
                <div className="npd-grid">
                  <label className="field">
                    <span className="lbl">Price per unit (₹) <em>required</em></span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={pricePerUnit}
                      onChange={(e) => setPricePerUnit(e.target.value)}
                      placeholder="e.g. 99"
                    />
                    {pricePerUnit !== "" && nearestFixedPricePoint(Number(pricePerUnit)) != null && (
                      <span className="npd-inline-hint">
                        Nearest fixed point: ₹{nearestFixedPricePoint(Number(pricePerUnit))}
                      </span>
                    )}
                  </label>
                  <label className="npd-check span-2">
                    <input
                      type="checkbox"
                      checked={benchmarkExists}
                      onChange={(e) => {
                        setBenchmarkExists(e.target.checked);
                        if (!e.target.checked) setPointsBeat("");
                      }}
                    />
                    A market leader already exists — how many points will this idea beat it on a 10-point scale?
                  </label>
                  {benchmarkExists && (
                    <label className="field span-2">
                      <span className="lbl">Points vs market leader (0–10) <em>required if a leader exists</em></span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="10"
                        step="0.1"
                        value={pointsBeat}
                        onChange={(e) => setPointsBeat(e.target.value)}
                        placeholder="Must beat the leader by ≥2"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            {error && <div className="err"><AlertTriangle size={14} /> {error}</div>}

            <button className="run" onClick={analyze} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={17} className="spin" />
                  {openingId
                    ? "Opening…"
                    : ideaType === "product"
                      ? loadSec > 0
                        ? `Screening · ${loadSec}s`
                        : "Screening…"
                      : loadSec > 0
                        ? `Validating · ${loadSec}s`
                        : "Validating…"}
                </>
              ) : (
                <>
                  <Gauge size={17} /> {ideaType === "product" ? "Run screen" : "Run validation"}
                </>
              )}
            </button>
            {loading && ideaType === "product" && (
              <p className="run-hint">Scoring and research are running together.</p>
            )}
          </section>

          <aside className="compose-aside">
            <PhonePreview mode="brief" idea={idea} ideaType={ideaType} />
            <div className="panel side">
            <div className="panel-tab">Recent screens</div>
            {composeHistory.length === 0 && (
              <p className="side-note">Screened ideas will land here. Scoring runs on the server — this panel is only history.</p>
            )}

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
                  const isDeleting = deletingId === h.id;
                  return (
                    <div key={h.id} className="hist-row-wrap">
                      <button
                        type="button"
                        className="hist-row"
                        onClick={() => openHistory(h, "compose")}
                        disabled={loading || Boolean(deletingId)}
                      >
                        <span className="hist-score" style={{ color: t.color }}>
                          {isOpening ? <Loader2 size={14} className="spin" /> : Number(h.phase1 || 0).toFixed(0)}
                        </span>
                        <span className="hist-weight">
                          {ideaTypeOf(h) === "process" ? "PROC" : (h.ideaWeight || "—")}
                        </span>
                        <span className="hist-model">{h.llmLabel || "Claude"}</span>
                        <span className="hist-idea">{h.idea}</span>
                      </button>
                      <button
                        type="button"
                        className="hist-del"
                        aria-label="Delete this run from the log"
                        title="Delete from log"
                        disabled={loading || Boolean(deletingId)}
                        onClick={() => confirmDeleteRun(h, "compose")}
                      >
                        {isDeleting ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  );
                })}
                <button type="button" className="hist-more" onClick={() => openLogTab(ideaType)}>
                  View {ideaType === "process" ? "process" : "product"} log <ArrowRight size={13} />
                </button>
              </div>
            )}
            </div>
          </aside>
        </main>
        </>
      )}

      {view === "log" && (
        <main className="log-page">
          <section className="panel log-panel">
            <div className="panel-tab">Log · History</div>
            <div className="log-head">
              <div>
                <h2 className="log-title">Validation log</h2>
                <p className="log-sub">
                  Separate histories for Product and Process. Click a row to open the scorecard, or the trash icon to remove it from the log.
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
                  const isOpening = openingId === h.id;
                  const isDeleting = deletingId === h.id;
                  const pf = overallPassFail(h);
                  const isProcess = ideaTypeOf(h) === "process";
                  return (
                    <div key={h.id} className="log-row-wrap">
                      <button
                        type="button"
                        className="log-row"
                        onClick={() => openHistory(h, "log")}
                        disabled={loading || Boolean(deletingId)}
                      >
                        <span className="log-score" style={{ color: t.color }}>
                          {isOpening ? <Loader2 size={16} className="spin" /> : Number(h.phase1 || 0).toFixed(1)}
                        </span>
                        <span className={`log-status log-status-${pf.key}`}>{pf.label}</span>
                        <span className="log-weight">
                          {isProcess ? `/${max}` : (h.gramClass || h.ideaWeight || "—")}
                        </span>
                        <span className="log-model">{h.llmLabel || "Claude"}</span>
                        <span className="log-idea">{h.idea}</span>
                        <span className="log-date">{formatLogDate(h.ts)}</span>
                      </button>
                      <button
                        type="button"
                        className="log-del"
                        aria-label="Delete this run from the log"
                        title="Delete from log"
                        disabled={loading || Boolean(deletingId)}
                        onClick={() => confirmDeleteRun(h, "log")}
                      >
                        {isDeleting ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      )}

      {view === "result" && result && (
        <main className="result result-wide">
          <Readout
            result={result}
            onEscalate={() => {
            const failed = result?.failedFilters || [];
            setEscalateFilter(failed[0] || "");
            setEscalateEvidence("");
            setEscalateError("");
            setEscalateOpen(true);
          }}
            onNewScreen={reset}
            onUploadSupportingDoc={onUploadSupportingDoc}
            onRemoveSupportingDoc={onRemoveSupportingDoc}
          />
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
                {result?.overallVerdict === "CLEARED" && result.supportingDocs?.length > 0 && (
                  <div className="supporting-doc-list">
                    {result.supportingDocs.map((d) => (
                      <span key={d.id} className="chip file">
                        <FileText size={15} /> {d.name}
                        <a href={`/api/ideas/${encodeURIComponent(result.id)}/supporting-doc/${encodeURIComponent(d.id)}`}>
                          <Download size={12} />
                        </a>
                      </span>
                    ))}
                  </div>
                )}
                <p className="modal-foot">
                  {result?.overallVerdict === "CLEARED" && result.supportingDocs?.length > 0
                    ? `Attach the file${result.supportingDocs.length > 1 ? "s" : ""} above when you send this — 6 Filter Test won't message your manager for you.`
                    : "Review before sending — 6 Filter Test won't message your manager for you."}
                </p>
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
              This does not change the AI verdict. It flags the record for human review. Name the failed check and the evidence you dispute.
            </p>
            <label className="field">
              <span className="lbl">Failed check</span>
              <select value={escalateFilter} onChange={(e) => setEscalateFilter(e.target.value)}>
                <option value="">Select a check</option>
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

function formatCr(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return `₹${x.toLocaleString("en-IN", { maximumFractionDigits: 1 })} Cr`;
}

function formatPctSigned(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const pct = x * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function growthBadgeLabel(classification) {
  const s = String(classification || "");
  if (s.startsWith("VOLUME-LED")) return "VOLUME-LED";
  if (s.startsWith("PRICE-LED")) return "PRICE-LED";
  if (s.startsWith("MIXED")) return "MIXED";
  return "";
}

function CategoryIntelPanel({ filter, kind }) {
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState("");
  const recon = filter?.reconciliation || {};
  const engines = Array.isArray(recon.engines) && recon.engines.length
    ? recon.engines
    : (Array.isArray(filter?.enginesRun) ? filter.enginesRun.map((e) => ({
        engineId: e.engineId,
        value: e.estimateCr,
        weakness: e.weakness,
        deviationPct: null,
      })) : []);
  const notRun = Array.isArray(filter?.enginesNotRun) ? filter.enginesNotRun : [];
  const growth = filter?.growthDecomposition || {};
  const badge = growthBadgeLabel(growth.classification);
  const filings = Array.isArray(filter?.trademarkFilingsFound) ? filter.trademarkFilingsFound : [];
  const notes = Array.isArray(filter?.calibrationNotes) ? filter.calibrationNotes : [];

  async function exportWorkbook() {
    const runId = filter?.sizingRunId;
    if (!runId) return;
    setExporting(true);
    setExportErr("");
    try {
      const res = await fetch(`/api/category-sizing/export/${encodeURIComponent(runId)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed.");
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `category-sizing-${String(runId).slice(0, 8)}.xlsx`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      setExportErr(e.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="ci-panel">
      <h4 className="ci-h">Category Intelligence</h4>

      {kind === "filter1" && (
        <>
          <p className="ci-archetype">
            <strong>{filter.categoryArchetype || "Unclassified archetype"}</strong>
            {filter.growthStage ? ` · growth stage: ${filter.growthStage}` : ""}
          </p>
          <p className="ci-engines">
            Ran: {(filter.enginesRun || []).map((e) => e.engineId).join(", ") || "none"}.
            {notRun.length > 0 && (
              <> Not run: {notRun.map((e) => `${e.engineId} (${e.reason || "missing input"})`).join("; ")}.</>
            )}
          </p>
          {notes.map((n) => (
            <p className="ci-cal-note" key={n}>{n}</p>
          ))}

          <table className="ci-table">
            <thead>
              <tr>
                <th>Engine</th>
                <th>Estimate</th>
                <th>Dev. from median</th>
                <th>Weakness for this category</th>
              </tr>
            </thead>
            <tbody>
              {engines.length === 0 ? (
                <tr><td colSpan={4}>No grounded engines — nothing to reconcile.</td></tr>
              ) : engines.map((e) => (
                <tr key={e.engineId}>
                  <td>{e.engineId}</td>
                  <td>{formatCr(e.value ?? e.estimateCr)}</td>
                  <td>{formatPctSigned(e.deviationPct)}</td>
                  <td>{e.weakness || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="ci-range">
            Published range {formatCr(recon.p10Cr ?? recon.p10)} – <strong>{formatCr(recon.p50Cr ?? recon.p50)}</strong> – {formatCr(recon.p90Cr ?? recon.p90)}
            {recon.status ? ` · ${recon.status}` : ""}
            {recon.spreadPct != null && Number.isFinite(Number(recon.spreadPct))
              ? ` · spread ${(Number(recon.spreadPct) * 100).toFixed(0)}%`
              : ""}
          </p>

          {badge && (
            <span className={`ci-badge ci-badge-${badge.toLowerCase()}`}>{badge}</span>
          )}
          {growth.classification && <p className="ci-growth">{growth.classification}</p>}
        </>
      )}

      {kind === "filter4" && (
        <>
          <p className="ci-archetype">
            Format trend: <strong>{filter.formatTrendDirection || "unclassified"}</strong>
            {filter.earlyWarningSignal ? ` · early warning: ${filter.earlyWarningSignal}` : ""}
          </p>
          {filter.digitalProxySignal && <p><strong>Digital proxy.</strong> {filter.digitalProxySignal}</p>}
          {filter.analogTransferSignal && <p><strong>Analog transfer.</strong> {filter.analogTransferSignal}</p>}
          {filings.length > 0 && (
            <table className="ci-table">
              <thead>
                <tr><th>Applicant</th><th>Filed</th><th>Note</th></tr>
              </thead>
              <tbody>
                {filings.map((f, i) => (
                  <tr key={`${f.applicant || "tm"}-${i}`}>
                    <td>{f.applicant || "—"}</td>
                    <td>{f.filedDate || "—"}</td>
                    <td>{f.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <div className="ci-limits">
        <strong>What free data can&apos;t tell you here</strong>
        <p>{filter.whatCouldNotBeEstablished || "Not stated."}</p>
      </div>

      {kind === "filter1" && filter.calibrationNudge && (
        <p className="ci-nudge">
          Have Nielsen/Kantar data for a related category? Running a blind calibration first is the single highest-leverage thing you can do here.
        </p>
      )}

      {kind === "filter1" && filter.sizingRunId && (
        <button type="button" className="ci-export" onClick={exportWorkbook} disabled={exporting}>
          {exporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
          {exporting ? "Exporting…" : "Export to sizing workbook"}
        </button>
      )}
      {exportErr && <p className="ci-export-err">{exportErr}</p>}
    </div>
  );
}

function ReportExportButtons({ result, variant = "card" }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  if (!result?.id) return null;

  async function download(format) {
    setBusy(format);
    setErr("");
    try {
      const res = await fetch(
        `/api/ideas/${encodeURIComponent(result.id)}/export?format=${encodeURIComponent(format)}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Export failed (${res.status}).`);
      }
      const blob = await res.blob();
      const ext = format === "docx" ? "docx" : "pdf";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `6-filter-test-${String(result.id).slice(0, 8)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErr(e.message || "Could not export the report.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`report-export report-export-${variant}`}>
      <button
        type="button"
        className="report-export-btn"
        disabled={Boolean(busy)}
        onClick={() => download("pdf")}
      >
        <Download size={14} /> {busy === "pdf" ? "Preparing PDF…" : "Download PDF"}
      </button>
      <button
        type="button"
        className="report-export-btn"
        disabled={Boolean(busy)}
        onClick={() => download("docx")}
      >
        <FileText size={14} /> {busy === "docx" ? "Preparing Word…" : "Download Word"}
      </button>
      {err ? <p className="report-export-err">{err}</p> : null}
    </div>
  );
}

function PhonePreview({ mode, idea, ideaType, result }) {
  if (mode === "verdict" && result) {
    const hero = heroVerdict(result);
    const score = scoreOutOf100(result);
    return (
      <div className="phone phone-dark" aria-hidden="true">
        <div className="phone-notch" />
        <div className="phone-body">
          <div className="phone-eyebrow">Verdict</div>
          <div className={`phone-word phone-word-${hero.tone}`}>{hero.word}</div>
          <div className="phone-score">{score}<span>/100</span></div>
          <p className="phone-idea">{String(result.idea || "").slice(0, 80)}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="phone phone-cream" aria-hidden="true">
      <div className="phone-notch" />
      <div className="phone-body">
        <div className="phone-eyebrow">6 Filter Test</div>
        <p className="phone-idea">{idea?.trim() || (ideaType === "process" ? "Process idea" : "Product idea")}</p>
      </div>
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
                {filter.brandFit?.mismatch && filter.brandFit?.reason && (
                  <p className="filter-brand">{filter.brandFit.reason}</p>
                )}
                {filter.evidenceSummary && filter.evidenceSummary !== filterReason(filter) && (
                  <p>{filter.evidenceSummary}</p>
                )}
                {meta.key === "filter3" && (
                  <p className="filter-proxy">Points-beat is a 10-point proxy, not a substitute for the lab/consumer panel.</p>
                )}
                {(meta.key === "filter1" || meta.key === "filter4") && (
                  <CategoryIntelPanel filter={filter} kind={meta.key} />
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

function SupportingResearch({ result, onUpload, onRemove }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const docs = result.supportingDocs || [];

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr("");
    if (!sniffSupportingMediaType(file)) {
      setErr(SUPPORTING_DOC_TYPE_ERR);
      return;
    }
    if (file.size > SUPPORTING_DOC_MAX_BYTES) {
      setErr(SUPPORTING_DOC_SIZE_ERR);
      return;
    }
    setBusy(true);
    try {
      const parsed = await readFileAsAttachment(file, false);
      if (!SUPPORTING_DOC_TYPES.has(String(parsed.mediaType || "").toLowerCase())) {
        throw new Error(SUPPORTING_DOC_TYPE_ERR);
      }
      await onUpload(parsed);
    } catch (ex) {
      setErr(ex.message || "Could not attach that document.");
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(docId) {
    setErr("");
    setBusy(true);
    try {
      await onRemove(docId);
    } catch (ex) {
      setErr(ex.message || "Could not remove that document.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="supporting-research">
      <div className="lbl">Supporting research</div>
      <p className="supporting-hint">
        Attach a market research study or any research backing this idea — it goes
        with the idea when you forward it to your supervisor.
      </p>
      <div className="media-row">
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" onChange={onFile} hidden />
        <button type="button" className="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
          <FileUp size={15} /> {busy ? "Attaching…" : "Attach PDF or Word"}
        </button>
      </div>
      {err && <div className="err"><AlertTriangle size={14} /> {err}</div>}
      {docs.length > 0 && (
        <div className="supporting-doc-list">
          {docs.map((d) => (
            <span key={d.id} className="chip file">
              <FileText size={15} />
              {d.name}
              <a href={`/api/ideas/${encodeURIComponent(result.id)}/supporting-doc/${encodeURIComponent(d.id)}`} title="Download">
                <Download size={12} />
              </a>
              <button type="button" onClick={() => removeDoc(d.id)} disabled={busy}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Readout({ result, onEscalate, onNewScreen, onUploadSupportingDoc, onRemoveSupportingDoc }) {
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
    const verdict = overallPassFail(result);
    const headerKey = verdict.key === "passed" ? "approved" : verdict.key === "failed" ? "rejected" : "promising";
    return (
      <article className="scorecard">
        <header className={`sc-header sc-header-${headerKey}`}>
          <div className="sc-score-block">
            <span className="sc-label">01 · Verdict</span>
            <span className="sc-score sc-verdict-word">{verdict.label}</span>
          </div>
          <div className="sc-status-block">
            <span className="sc-label">Score / {maxPts}</span>
            <span className="sc-status-pill">{safePts.toFixed(1)}</span>
          </div>
        </header>

        <div className="sc-body">
          <div className="sc-type-pill">Process idea · Phase 1 · {result.llmLabel || "Claude"}</div>
          <h2 className="sc-title">{String(result.idea || "").toUpperCase()}</h2>
          <ReportExportButtons result={result} variant="card" />
          <VerdictStory result={result} />

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
  const hero = heroVerdict(result);
  const score = scoreOutOf100(result);
  const cards = hasNpd ? gateCardsFor(result) : [];
  const moves = hasNpd ? deriveMoves({
    filter1: result.filter1,
    filter2: result.filter2,
    filter3: result.filter3,
    filter4: result.filter4,
  }) : [];
  const whyTitle = result.overallVerdict === "FAIL" ? "Why it failed" : "Why it succeeded";
  const whyItems = NPD_FILTERS
    .map((f) => filterReason(result[f.key]))
    .filter(Boolean);
  const npd = result.npdInputs || {};
  const investmentGrid =
    result.investmentGrid ||
    buildInvestmentGrid(
      result.idea,
      result.adjustedRevenueCr ?? revenueInfo.crores ?? result.revenuePotentialCrores,
      result.tamValuation
    );

  return (
    <div className="verdict-shell">
      <section className={`verdict-hero verdict-hero-${hero.tone}`}>
        <div className="vh-left">
          <button type="button" className="vh-new" onClick={onNewScreen}>← New screen</button>
          <div className="vh-eyebrow">Verdict</div>
          <div className="vh-word">{hero.word}</div>
          <p className="vh-summary">{hideFilterTalk(result.oneLiner || result.analysisSummary || "")}</p>
          <ReportExportButtons result={result} variant="hero" />
          {result.overallVerdict === "CLEARED" && (
            <SupportingResearch
              result={result}
              onUpload={onUploadSupportingDoc}
              onRemove={onRemoveSupportingDoc}
            />
          )}
        </div>
        <div className="vh-right">
          <div className="vh-score">{score}<span>/100</span></div>
          <p className="vh-idea">{hideFilterTalk(result.idea)}</p>
          <p className="vh-meta">
            {npd.pricePerUnit != null ? `₹${npd.pricePerUnit}` : "—"}
            {npd.pointsBeat != null ? ` · leader ${npd.pointsBeat} pts` : ""}
            {npd.division ? ` · ${npd.division}` : ""}
            {ideaWeight ? ` · ${ideaWeight}` : ""}
          </p>
        </div>
      </section>

      {hasNpd && (
        <section className="gate-ladder">
          {cards.map((c) => (
            <article className={`gate-card gate-${c.badge.toLowerCase()}`} key={c.n}>
              <div className="gate-top">
                <span className="gate-n">{c.n}</span>
                <span className={`gate-badge gate-badge-${c.badge.toLowerCase()}`}>{c.badge}</span>
              </div>
              <h3>{c.title}</h3>
              <p className="gate-metric">{c.metric}</p>
              <div className="gate-bar"><i style={{ width: `${c.barW}%` }} /></div>
              <p className="gate-threshold">{c.threshold}</p>
              <p className="gate-detail">{hideFilterTalk(c.detail)}</p>
            </article>
          ))}
        </section>
      )}

      <div className="verdict-grid">
        {result.brandFit?.mismatch && (
          <div className="npd-banner npd-banner-fail verdict-span">
            Brand line miss: {result.brandFit.reason}
          </div>
        )}

        <div className="why-panel">
          <h3>{whyTitle}</h3>
          {whyItems.length === 0 ? (
            <p className="vs-empty">No notes recorded.</p>
          ) : (
            <ul>
              {whyItems.map((item) => (
                <li key={item}>— {item}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="why-panel">
          <h3>What would change the verdict</h3>
          {moves.length === 0 ? (
            <p className="vs-empty">No mechanical moves from the current numbers.</p>
          ) : (
            <ul className="moves-list">
              {moves.map((m) => (
                <li key={m.tag + m.text}>
                  <span className="move-tag">{m.tag}</span>
                  {hideFilterTalk(m.text)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="verdict-span">
          <VerdictStory result={result} />
        </div>

        <div className="sc-metrics verdict-span">
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
          <div className="sc-tags verdict-span">
            {tags.map((t) => (
              <span key={t} className="sc-tag"># {t.toUpperCase()}</span>
            ))}
          </div>
        )}

        <div className="sc-analysis verdict-span">
          <p className="sc-analysis-text">"{hideFilterTalk(result.analysisSummary || result.oneLiner || "")}"</p>
          <button type="button" className="sc-audio" onClick={playBriefing}>
            <Volume2 size={14} /> Audio Briefing
          </button>
        </div>

        {result.refinementPivot && (
          <div className="sc-pivot verdict-span">
            <div className="sc-pivot-label">Refinement Pivot</div>
            <p>{hideFilterTalk(result.refinementPivot)}</p>
          </div>
        )}

        {hasNpd && result.overallVerdict === "FAIL" && result.canEscalateToCKR && result.escalationStatus !== "escalated" && (
          <button type="button" className="escalate-btn verdict-span" onClick={onEscalate}>
            <Flag size={15} /> Raise exception → escalate to CKR
          </button>
        )}
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
.primus *{box-sizing:border-box;}
.screen-brief {
  --bg: #0A0A09; --card: #131311; --panel: #131311; --panel-2: #1B1916;
  --border: rgba(236,234,227,.08); --border-2: rgba(236,234,227,.14);
  --ink: #ECEAE3; --ink-deep: #ECEAE3;
  --muted: rgba(236,234,227,.55); --muted-2: rgba(236,234,227,.45);
  --muted-3: rgba(236,234,227,.4); --faint: rgba(236,234,227,.3);
  --accent: #E3A93F; --accent-hover: #EDBB5C; --accent-on: #0A0A09;
  --pass: #6FBF73; --fail: #E2716B; --watch: #E3A93F; --coral: #E2716B;
  --bg-soft: #1B1916; --line: rgba(236,234,227,.08); --line-soft: rgba(236,234,227,.05);
  --accent-rgb: 227,169,63; --pass-rgb: 111,191,115; --fail-rgb: 226,113,107; --ink-rgb: 236,234,227;
}
.screen-log {
  --bg: #F5F2EA; --card: #FBFAF7; --panel: #FBFAF7; --panel-2: #EFEBE1; --border: #E4DECF; --border-2: #DCD5C6;
  --ink: #14202B; --ink-deep: #14202B; --muted: #5A6673; --muted-2: #7C8592; --muted-3: #8A93A0; --faint: #B5AF9F;
  --accent: #0C558F; --accent-hover: #08406D; --accent-on: #FBFAF7;
  --pass: #1F7A4C; --fail: #B23A2E; --watch: #B0771F;
  --bg-soft: #EFEBE1; --line: #E4DECF; --line-soft: #DCD5C6;
  --gold: #0C558F; --gold-ink: #FBFAF7; --teal: #0C558F; --coral: #B23A2E; --sky: #0C558F;
}
.screen-verdict {
  --bg: #0B1B2A; --card: #12283C; --panel: #12283C; --panel-2: #163044;
  --ink: #F0EEE7; --ink-deep: #F0EEE7; --ink-muted-85: rgba(240,238,231,.85);
  --ink-muted-65: rgba(240,238,231,.65); --ink-muted-55: rgba(240,238,231,.55);
  --ink-muted-45: rgba(240,238,231,.45); --border: rgba(240,238,231,.14);
  --pass: #63C08D; --fail: #F08A7A; --watch: #E3B25C;
  --hero-cleared: #14513A; --hero-fail: #5C2320; --hero-watch: #5C4A20;
  --muted: rgba(240,238,231,.65); --muted-2: rgba(240,238,231,.45); --muted-3: rgba(240,238,231,.45);
  --bg-soft: #163044; --line: rgba(240,238,231,.14); --line-soft: rgba(240,238,231,.08);
  --accent: #63C08D; --accent-on: #0B1B2A; --coral: #F08A7A;
  --gold: #E3B25C; --gold-ink: #0B1B2A; --teal: #63C08D; --sky: #63C08D;
  --accent-rgb: 99,192,141; --pass-rgb: 99,192,141; --fail-rgb: 240,138,122; --ink-rgb: 240,238,231;
}
.primus{
  --fd:'Plus Jakarta Sans',system-ui,sans-serif; --fm:'IBM Plex Mono',ui-monospace,monospace;
  --shadow:0 10px 30px rgba(20,32,43,.07); --shadow-hover:0 14px 36px rgba(20,32,43,.1);
  font-family:var(--fd); color:var(--ink); background: var(--bg);
  min-height:100%; padding:32px 28px 48px; line-height:1.5;
}
.primus h1{font-size:28px;font-weight:700;letter-spacing:-.6px;margin:2px 0 0;color:var(--ink);}
.primus h1 .dot{color:var(--ink-deep);}
.eyebrow{font-family:var(--fm);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted-3);}
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
.model-switch{display:flex;align-items:center;gap:8px;background:rgba(0,108,180,.08);border:1px solid rgba(0,108,180,.22);padding:5px 10px 5px 12px;border-radius:999px;font-family:var(--fm);color:var(--ink);}
.model-switch-lbl{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
.model-switch select{appearance:none;background:transparent;border:none;color:var(--ink);font-family:var(--fd);font-size:13px;font-weight:600;padding:2px 18px 2px 0;cursor:pointer;max-width:150px;}
.model-switch select:focus{outline:none;}
.hist-model,.log-model{font-family:var(--fm);font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink);background:rgba(0,108,180,.08);border-radius:999px;padding:2px 7px;flex-shrink:0;}
.pulse{width:8px;height:8px;border-radius:50%;background:var(--ink);box-shadow:0 0 0 0 var(--ink);animation:pl 2s infinite;}
@keyframes pl{0%{box-shadow:0 0 0 0 rgba(0,108,180,.45);}70%{box-shadow:0 0 0 7px rgba(0,108,180,0);}100%{box-shadow:0 0 0 0 rgba(0,108,180,0);}}
@keyframes rise{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}

.screen-brief .masthead{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:14px 18px;max-width:1280px;}
.screen-brief .brandmark{background:var(--card);border-color:var(--accent);}
.screen-brief .type-toggle{background:var(--panel-2);border-color:var(--border);}
.screen-brief textarea.idea-input,.screen-brief textarea,.screen-brief input{background:var(--card);border-color:var(--border);color:var(--ink);}
.screen-brief .run{background:var(--accent);color:var(--accent-on);border-radius:999px;box-shadow:none;}
.screen-brief .run:hover{background:var(--accent-hover);filter:none;}
.screen-brief .pulse{background:var(--pass);box-shadow:none;animation:none;}
.screen-brief .nav-tab:hover{background:rgba(var(--accent-rgb),.08);}
.screen-brief .nav-tab.active{background:rgba(var(--accent-rgb),.14);border-color:rgba(var(--accent-rgb),.35);}
.screen-brief .live{background:rgba(var(--pass-rgb),.12);border-color:rgba(var(--pass-rgb),.3);}
.screen-brief .model-switch{background:rgba(var(--ink-rgb),.06);border-color:rgba(var(--ink-rgb),.14);}
.screen-brief .hist-model,.screen-brief .log-model{background:rgba(var(--ink-rgb),.08);}
.screen-brief textarea:focus,.screen-brief input:focus,.screen-brief select:focus{border-color:var(--accent);background:var(--card);box-shadow:0 0 0 3px rgba(var(--accent-rgb),.22);}
.screen-brief .type-tab.active{background:var(--card);color:var(--ink);box-shadow:none;border:1px solid var(--border);}
.screen-brief .page-back:hover{background:var(--card);border-color:rgba(var(--accent-rgb),.35);}
.screen-brief .ci-nudge{background:rgba(var(--accent-rgb),.12);border-color:rgba(var(--accent-rgb),.3);color:#F0C868;}
.screen-brief .npd-brand-warn{color:#F0958D;}
.screen-brief .npd-brand-ok{color:#8FD79A;}
.screen-brief .ghost:hover{background:var(--card);border-color:rgba(var(--accent-rgb),.35);}
.screen-brief .err{background:rgba(var(--fail-rgb),.12);border-color:rgba(var(--fail-rgb),.32);}
.screen-brief .panel-tab{color:var(--accent-on);background:var(--ink);}
.brief-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:32px;max-width:1280px;margin:0 auto 28px;flex-wrap:wrap;}
.brief-hero-text{display:flex;flex-direction:column;gap:10px;max-width:560px;}
.brief-hero-h{font-size:28px;font-weight:600;letter-spacing:-.01em;color:var(--ink);margin:0;line-height:1.25;}
.brief-hero-sub{font-size:13.5px;color:var(--muted);line-height:1.6;margin:0;}
.brief-stats{display:flex;border:1px solid var(--border);border-radius:14px;overflow:hidden;}
.brief-stat{padding:14px 20px;border-right:1px solid var(--border);}
.brief-stat:last-child{border-right:none;}
.brief-stat-lbl{font-family:var(--fm);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted-3);}
.brief-stat-val{font-size:19px;font-weight:600;color:var(--ink);margin-top:4px;}
.brief-stat-pass{color:var(--pass);}
.screen-verdict .masthead{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:14px 18px;max-width:1280px;}
.screen-verdict .brandmark{background:var(--card);border-color:var(--ink);}
.screen-verdict .pulse{background:var(--pass);animation:none;}
.screen-verdict .masthead,.screen-verdict .page-back,.screen-verdict .nav-tab{color:var(--ink);}
.screen-verdict .nav-tab:hover{background:rgba(240,238,231,.06);}
.screen-verdict .nav-tab.active{background:rgba(240,238,231,.08);border-color:var(--border);}
.screen-verdict .model-switch{background:rgba(240,238,231,.08);border-color:var(--border);color:var(--ink);}
.screen-verdict .page-back:hover{background:rgba(240,238,231,.08);border-color:var(--border);}
.compose-aside{display:flex;flex-direction:column;gap:16px;}
.phone-dots li{display:flex;align-items:center;}
.result-wide{max-width:1280px;margin:0 auto;}
.filter-rules{margin:8px 0 12px;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:12px 14px;}
.filter-rules-h{font-family:var(--fm);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-3);margin-bottom:6px;}
.filter-rule{display:flex;gap:12px;padding:6px 0;border-top:1px solid var(--border);}
.filter-rule:first-of-type{border-top:none;padding-top:0;}
.filter-rule-n{font-family:var(--fm);font-size:11px;color:var(--muted-3);min-width:22px;}
.filter-rule b{display:block;font-size:13px;}
.filter-rule p{margin:2px 0 0;font-size:12px;color:var(--muted-2);}
.phone{width:100%;max-width:280px;margin:0 auto 18px;border-radius:28px;padding:12px 12px 18px;border:1px solid var(--border);}
.phone-cream{background:var(--card);color:var(--ink);}
.phone-dark{background:#0B1B2A;color:#F0EEE7;border-color:rgba(240,238,231,.14);}
.phone-notch{width:72px;height:8px;border-radius:999px;background:currentColor;opacity:.18;margin:4px auto 12px;}
.phone-eyebrow{font-family:var(--fm);font-size:9px;letter-spacing:.14em;text-transform:uppercase;opacity:.55;margin-bottom:6px;}
.phone-idea{font-size:12px;line-height:1.4;margin:0 0 10px;max-height:48px;overflow:hidden;}
.phone-rules,.phone-dots{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:11px;}
.phone-rules span,.phone-dots span{font-family:var(--fm);opacity:.7;margin-right:6px;}
.phone-word{font-size:28px;font-weight:800;letter-spacing:-.03em;}
.phone-word-cleared{color:#63C08D;}
.phone-word-fail{color:#F08A7A;}
.phone-word-watch{color:#E3B25C;}
.phone-score{font-size:22px;font-weight:800;}
.phone-score span{font-size:11px;font-weight:500;opacity:.55;margin-left:4px;}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;}
.dot-pass{background:#63C08D;}
.dot-fail{background:#F08A7A;}
.dot-watch{background:#E3B25C;}
.verdict-hero{display:grid;grid-template-columns:1.2fr .8fr;gap:24px;border-radius:20px;padding:28px 32px;margin-bottom:18px;color:#F0EEE7;}
.verdict-hero-cleared{background:var(--hero-cleared);}
.verdict-hero-fail{background:var(--hero-fail);}
.verdict-hero-watch{background:var(--hero-watch);}
.vh-new{background:rgba(240,238,231,.12);border:1px solid rgba(240,238,231,.2);color:#F0EEE7;border-radius:999px;padding:6px 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;font-family:var(--fm);}
.vh-eyebrow{font-family:var(--fm);font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.7;margin:16px 0 6px;}
.vh-word{font-size:86px;font-weight:800;line-height:.9;letter-spacing:-.04em;}
.vh-summary{font-size:15px;line-height:1.45;opacity:.85;max-width:520px;}
.vh-score{display:flex;align-items:baseline;gap:4px;font-size:clamp(72px, 12vw, 190px);font-weight:800;line-height:.85;letter-spacing:-.05em;white-space:nowrap;}
.vh-score span{font-size:18px;font-weight:500;opacity:.55;margin-left:6px;}
.vh-idea{margin:12px 0 6px;font-size:14px;line-height:1.4;}
.vh-meta{font-family:var(--fm);font-size:11px;opacity:.55;margin:0;}
.gate-ladder{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px;}
.gate-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;}
.gate-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
.gate-n{font-family:var(--fm);font-size:11px;color:var(--ink-muted-45);}
.gate-badge{font-size:9px;font-weight:800;letter-spacing:.08em;padding:3px 8px;border-radius:999px;color:#0B1B2A;}
.gate-badge-pass{background:var(--pass);}
.gate-badge-fail{background:var(--fail);}
.gate-badge-watch{background:var(--watch);}
.gate-card h3{margin:0 0 8px;font-size:14px;font-weight:700;}
.gate-metric{margin:0 0 10px;font-size:13px;font-weight:700;}
.gate-pass .gate-metric{color:var(--pass);}
.gate-fail .gate-metric{color:var(--fail);}
.gate-watch .gate-metric{color:var(--watch);}
.gate-bar{height:4px;background:rgba(240,238,231,.12);border-radius:999px;overflow:hidden;margin-bottom:8px;}
.gate-pass .gate-bar i{background:var(--pass);}
.gate-fail .gate-bar i{background:var(--fail);}
.gate-watch .gate-bar i{background:var(--watch);}
.gate-bar i{display:block;height:100%;}
.gate-threshold{font-family:var(--fm);font-size:10px;color:var(--ink-muted-45);margin:0 0 6px;}
.gate-detail{font-size:12px;color:var(--ink-muted-65);margin:0;line-height:1.4;}
.verdict-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:stretch;}
.verdict-grid > .verdict-span,
.verdict-grid > .sc-metrics,
.verdict-grid > .sc-analysis,
.verdict-grid > .sc-pivot,
.verdict-grid > .sc-tags,
.verdict-grid > .escalate-btn{grid-column:1 / -1;}
.verdict-grid > .why-panel{display:flex;flex-direction:column;height:100%;}
.why-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 16px;}
.why-panel{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;min-height:100%;}
.why-panel h3{margin:0 0 10px;font-family:var(--fm);font-size:11px;letter-spacing:.12em;text-transform:uppercase;}
.why-panel ul{margin:0;padding:0;list-style:none;}
.why-panel li{font-size:13px;line-height:1.45;margin:0 0 8px;color:var(--ink-muted-85);}
.moves-list li{display:flex;gap:8px;align-items:flex-start;}
.move-tag{font-family:var(--fm);font-size:9px;letter-spacing:.08em;background:rgba(240,238,231,.12);padding:3px 6px;border-radius:6px;flex-shrink:0;}
.screen-verdict .scorecard,.screen-verdict .sc-body,.screen-verdict .sc-finance,.screen-verdict .sc-inv,.screen-verdict .sc-analysis,.screen-verdict .sc-pivot,.screen-verdict .filter-tile,.screen-verdict .ci-panel{background:var(--card);color:var(--ink);border-color:var(--border);}
.screen-verdict .sc-title,.screen-verdict .filter-body{color:var(--ink);}
.screen-verdict .ci-table th{background:rgba(240,238,231,.06);color:var(--ink-muted-45);}

.grid{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.9fr) minmax(300px,.85fr);gap:24px;align-items:start;animation:rise .5s ease .05s both;}
.result{max-width:720px;margin:0 auto;animation:rise .45s ease both;}
.result.result-wide{max-width:1280px;}
.log-page{max-width:1080px;margin:0 auto;animation:rise .45s ease both;}
.log-panel{padding-top:28px;}
.log-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px;flex-wrap:wrap;}
.log-title{margin:0 0 6px;font-size:22px;color:var(--ink);}
.log-sub{margin:0;font-size:13px;color:var(--muted);max-width:520px;line-height:1.45;}
.log-empty{display:flex;align-items:center;justify-content:center;gap:10px;padding:40px 12px;color:var(--muted);font-size:14px;}
.log-list{display:flex;flex-direction:column;border-top:1px solid var(--line-soft);}
.log-row-wrap{border-bottom:1px solid var(--line-soft);}
.log-row{display:grid;grid-template-columns:56px 92px 52px 72px minmax(0,1fr) 140px;gap:12px;align-items:center;flex:1;min-width:0;text-align:left;background:none;border:none;padding:14px 4px;cursor:pointer;border-radius:8px;transition:background .15s;}
.log-row:hover{background:var(--bg-soft);}
.log-row:disabled{opacity:.6;cursor:wait;}
.log-score{font-family:var(--fm);font-weight:700;font-size:18px;}
.log-status{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:5px 10px;border-radius:999px;width:fit-content;}
.log-status-approved,.log-status-passed{background:rgba(36,168,102,.12);color:#1F8A55;}
.log-status-promising,.log-status-needs{background:rgba(201,162,39,.16);color:#8A6E12;}
.log-status-rejected,.log-status-failed{background:rgba(228,87,87,.12);color:#C53D3D;}
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
.primus textarea.idea-input{min-height:160px;font-size:15.5px;padding:18px 20px;}
.primus textarea:focus,.primus input:focus,.primus select:focus{border-color:var(--ink);background:#fff;box-shadow:0 0 0 3px rgba(0,108,180,.16);}
.screen-brief textarea:focus,.screen-brief input:focus,.screen-brief select:focus{border-color:var(--accent);background:var(--card);box-shadow:0 0 0 3px rgba(var(--accent-rgb),.22);}
.primus textarea::placeholder,.primus input::placeholder{color:var(--muted-2);}
.npd-fields{margin:0 0 8px;}
.npd-hint{font-size:12px;color:var(--muted);margin:0 0 12px;line-height:1.45;}
.npd-brand-warn{margin:6px 0 0;font-size:12px;color:#C53D3D;line-height:1.4;}
.npd-brand-ok{margin:6px 0 0;font-size:12px;color:#1F8A55;line-height:1.4;}
.filter-brand{margin-top:8px;font-size:12.5px;color:#C53D3D;line-height:1.4;}
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
.ci-panel{margin-top:10px;padding-top:10px;border-top:1px solid var(--line-soft);}
.ci-h{margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-family:var(--fm);}
.ci-archetype,.ci-engines,.ci-growth,.ci-cal-note{margin:0 0 8px;font-size:12.5px;line-height:1.45;}
.ci-table{width:100%;border-collapse:collapse;font-size:11.5px;margin:0 0 10px;}
.ci-table th,.ci-table td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top;}
.ci-table th{background:rgba(0,108,180,.08);font-family:var(--fm);font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);}
.ci-range{margin:0 0 8px;font-size:12.5px;}
.ci-badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.06em;padding:4px 8px;border-radius:999px;margin:0 0 8px;}
.ci-badge-volume-led{background:rgba(36,168,102,.14);color:#1F8A55;}
.ci-badge-price-led{background:rgba(228,87,87,.14);color:#C53D3D;}
.ci-badge-mixed{background:rgba(201,162,39,.18);color:#8A6E12;}
.ci-limits{background:rgba(0,108,180,.06);border:1px solid rgba(0,108,180,.16);border-radius:10px;padding:10px 12px;margin:8px 0;}
.ci-limits p{margin:4px 0 0!important;}
.ci-nudge{background:rgba(201,162,39,.12);border:1px solid rgba(201,162,39,.28);color:#8A6E12;border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.45;margin:8px 0;}
.ci-nudge-compose{margin:0 0 12px;}
.ci-export{display:inline-flex;align-items:center;gap:6px;margin-top:6px;background:#fff;border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:8px 12px;font-family:var(--fd);font-size:12.5px;cursor:pointer;}
.ci-export:hover{border-color:var(--ink);}
.ci-export:disabled{opacity:.6;cursor:default;}
.ci-export-err{color:#C53D3D;font-size:12px;margin:6px 0 0;}
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
.attach-block{margin:4px 0 18px;padding:14px 16px;background:var(--panel-2);border:1px dashed var(--line);border-radius:14px;}
.attach-block .lbl{display:block;margin-bottom:8px;}
.supporting-research{margin-top:14px;padding-top:14px;border-top:1px solid var(--border);}
.supporting-hint{font-size:12.5px;color:var(--muted);line-height:1.5;margin:2px 0 10px;}
.supporting-doc-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}
.supporting-doc-list .chip a{display:inline-flex;color:inherit;}
.verdict-hero .supporting-research{border-top-color:rgba(240,238,231,.18);}
.verdict-hero .supporting-hint,.verdict-hero .supporting-research .lbl{color:rgba(240,238,231,.7);}
.verdict-hero .supporting-research .ghost,.verdict-hero .supporting-doc-list .chip{background:rgba(240,238,231,.12);border-color:rgba(240,238,231,.22);color:#F0EEE7;}
.attach-hint{margin:8px 0 0;font-size:12px;color:var(--muted);line-height:1.45;}
.media-row{margin:0;}
.report-export{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:14px 0 0;}
.report-export-btn{display:inline-flex;align-items:center;gap:7px;background:var(--panel-2);border:1px solid var(--line);color:var(--ink);border-radius:999px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--fd);}
.report-export-btn:disabled{opacity:.6;cursor:default;}
.report-export-hero .report-export-btn{background:rgba(240,238,231,.12);border:1px solid rgba(240,238,231,.22);color:#F0EEE7;}
.report-export-err{width:100%;margin:4px 0 0;font-size:12px;color:var(--coral);}

.ghost{display:inline-flex;align-items:center;gap:7px;background:var(--panel-2);border:1px solid var(--line);color:var(--ink);border-radius:11px;padding:9px 14px;font-family:var(--fd);font-size:13px;cursor:pointer;transition:.15s;}
.ghost:hover{border-color:var(--ink);background:#fff;}
.ghost.sq{padding:9px;}
.run{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:9px;background:linear-gradient(135deg,#006CB4,#0088C7);color:#fff;border:none;border-radius:12px;padding:15px;font-family:var(--fd);font-weight:600;font-size:15px;cursor:pointer;transition:transform .15s,filter .15s,box-shadow .15s;box-shadow:0 8px 18px rgba(0,108,180,.28);margin-top:12px;}
.run-hint{margin:8px 0 0;text-align:center;font-size:12px;color:var(--muted);font-family:var(--fm);}
.run:hover{filter:brightness(1.05);transform:translateY(-1px);}
.run:active{transform:none;}
.run:disabled{opacity:.6;cursor:default;transform:none;box-shadow:none;}
.run.inline{width:auto;padding:12px 20px;margin-top:0;}
.err{display:flex;align-items:center;gap:8px;color:var(--fail);background:rgba(228,87,87,.08);border:1px solid rgba(228,87,87,.2);border-radius:10px;padding:10px 12px;font-size:13px;margin:2px 0 14px;}
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
.hist-row-wrap,.log-row-wrap{display:flex;align-items:center;gap:2px;}
.hist-row{display:flex;align-items:center;gap:11px;flex:1;min-width:0;text-align:left;background:none;border:none;border-top:1px solid var(--line-soft);padding:10px 2px;cursor:pointer;border-radius:8px;transition:background .15s;}
.hist-row:hover{background:var(--bg-soft);}
.hist-row:hover .hist-idea{color:var(--ink-deep);}
.hist-score{font-family:var(--fm);font-weight:600;font-size:15px;min-width:26px;color:var(--ink);}
.hist-weight{font-family:var(--fm);font-size:10px;color:var(--ink);min-width:38px;letter-spacing:.04em;}
.hist-idea{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.hist-del,.log-del{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;background:none;border:none;border-radius:8px;color:var(--muted);cursor:pointer;transition:background .15s,color .15s;}
.hist-del:hover,.log-del:hover{color:#C53D3D;background:rgba(228,87,87,.1);}
.hist-del:disabled,.log-del:disabled{opacity:.5;cursor:wait;}

.scorecard{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(0,108,180,.12);border:1px solid var(--line);color:var(--ink);font-family:var(--fd);}
.sc-header{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 22px;color:#fff;}
.sc-header-rejected{background:linear-gradient(135deg,#E45757,#D63A3A);color:#fff;}
.sc-header-promising{background:linear-gradient(135deg,#F8E9A8,#F3DE7A);color:#5C4A0A;}
.sc-header-approved{background:linear-gradient(135deg,#2FBE7A,#24A866);color:#fff;}
.sc-label{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;margin-bottom:4px;font-weight:500;}
.sc-score{display:block;font-size:44px;font-weight:700;line-height:1;letter-spacing:-.02em;}
.sc-verdict-word{font-size:36px;letter-spacing:-.03em;}
.verdict-seq{list-style:none;margin:0 0 18px;padding:0;display:flex;flex-direction:column;gap:12px;}
.verdict-seq>li{display:flex;gap:12px;background:var(--bg-soft);border:1px solid var(--line);border-radius:14px;padding:14px 16px;}
.vs-step{flex-shrink:0;font-family:var(--fm);font-size:11px;font-weight:700;letter-spacing:.08em;color:#fff;background:var(--ink);width:32px;height:32px;border-radius:50%;display:grid;place-items:center;}
.verdict-seq h3{margin:0 0 8px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink);}
.verdict-seq ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;}
.verdict-seq ul li p{margin:4px 0 0;font-size:12.5px;color:var(--ink-deep);line-height:1.45;}
.vs-row-top{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap;}
.vs-marks{font-family:var(--fm);font-size:11px;color:var(--ink);flex-shrink:0;}
.vs-mistakes li{font-size:13px;color:var(--ink-deep);line-height:1.45;padding-left:14px;position:relative;}
.vs-mistakes li::before{content:"";position:absolute;left:0;top:8px;width:6px;height:6px;border-radius:50%;background:var(--coral);}
.vs-empty{margin:0;font-size:13px;color:var(--muted);}
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
.inv-cell.active strong{color:#14202B;}
.inv-cell.active span{color:#14202B;font-weight:600;}
.screen-verdict .inv-cell.active{background:#E8F4FC;border-color:#7EB7D9;box-shadow:none;}
.screen-verdict .inv-cell.active strong,.screen-verdict .inv-cell.active span{color:#14202B;}
.screen-verdict .sc-finance-tam p,.screen-verdict .sc-inv-guidance,.screen-verdict .sc-inv-meta p{color:var(--ink-muted-85);}
.screen-verdict .sc-inv-badge{background:rgba(240,238,231,.12);color:var(--ink);border-color:var(--border);}
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
.screen-verdict .sc-analysis,.screen-verdict .sc-pivot,.screen-verdict .sc-tag,.screen-verdict .sc-metric,.screen-verdict .escalate-btn{background:var(--card);border:1px solid var(--border);color:var(--ink);}
.screen-verdict .sc-analysis-text,.screen-verdict .sc-pivot p{color:var(--ink-muted-85);}
.screen-verdict .sc-audio{color:var(--ink);}

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
  .verdict-hero{grid-template-columns:1fr;padding:22px;}
  .vh-word{font-size:56px;}
  .vh-score{font-size:72px;}
  .gate-ladder,.why-grid,.verdict-grid{grid-template-columns:1fr;}
  .compose-aside .phone{display:none;}
  .primus{padding:18px 16px 32px;}
  .masthead{margin-bottom:20px;flex-wrap:wrap;max-width:100%;}
  .page-back-bar{max-width:100%;}
  .panel.console{min-height:0;padding:26px 22px 22px;}
  .primus textarea.idea-input{min-height:160px;}
  .top-nav{order:3;width:100%;margin:8px 0 0;margin-right:0;}
  .log-row{grid-template-columns:48px 78px minmax(0,1fr);gap:8px;}
  .log-weight,.log-date,.log-model{display:none;}
  .npd-grid{grid-template-columns:1fr;}
  .filter-strip{grid-template-columns:1fr;}
}
@media(prefers-reduced-motion:reduce){.pulse,.primus .masthead,.primus .grid,.primus .result{animation:none;}.run:hover{transform:none;}}
`;
