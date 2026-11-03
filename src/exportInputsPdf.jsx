/**
 * Off-screen render of entered input fields, captured to PDF (screenshot pages).
 */
import { createRoot } from "react-dom/client";
import { PROPOSITION_TOP_FIELDS, SIX_FILTERS_FORM } from "../lib/propositionFields.js";
import { exportElementToPdf, sanitizePdfFilenamePart } from "../lib/exportOutputPdf.js";

function waitFrames(n = 2) {
  return new Promise((resolve) => {
    const step = (left) => {
      if (left <= 0) {
        window.setTimeout(resolve, 80);
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

function displayValue(raw) {
  if (raw == null || raw === "") return "—";
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}

function readField(doc, filterKey, fieldKey) {
  if (!filterKey) return doc?.[fieldKey];
  const blob = doc?.[filterKey];
  if (!blob || typeof blob !== "object") return undefined;
  if (fieldKey === "marginElasticity") {
    const me = blob.marginElasticity;
    if (!me || typeof me !== "object") return undefined;
    const min = me.minMrpInr;
    const max = me.maxMrpInr;
    if (min == null && max == null) return undefined;
    return `Min ₹${min ?? "—"} · Max ₹${max ?? "—"}`;
  }
  if (fieldKey === "techShiftRisk") {
    const risk = blob.techShiftRisk;
    if (!risk || typeof risk !== "object") return undefined;
    return risk.overallRisk || risk.overall || undefined;
  }
  return blob[fieldKey];
}

function InputsSnapshot({ doc }) {
  const sections = [
    {
      title: "Idea",
      rows: PROPOSITION_TOP_FIELDS.map((f) => ({
        label: f.label,
        value: displayValue(readField(doc, null, f.key)),
      })),
    },
    ...SIX_FILTERS_FORM.filter((s) => s.key !== "f6").map((spec) => ({
      title: `${spec.num} · ${spec.title}`,
      rows: (spec.fields || [])
        .filter((f) => f.key !== "forumVerdict" && f.key !== "verdictNote")
        .map((f) => ({
          label: f.label,
          value: displayValue(readField(doc, spec.key, f.key)),
        })),
    })),
  ];

  return (
    <div className="inputs-pdf-root">
      <header className="inputs-pdf-head">
        <p className="inputs-pdf-kicker">6 Filter Test · Entered inputs</p>
        <h1>{doc?.name || "Untitled idea"}</h1>
        <p className="inputs-pdf-meta">
          {[doc?.submitterName, doc?.submitterDepartment, doc?.category, doc?.division]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </header>
      {sections.map((section) => (
        <section key={section.title} className="inputs-pdf-section">
          <h2>{section.title}</h2>
          <dl>
            {section.rows.map((row) => (
              <div key={row.label} className="inputs-pdf-row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <style>{`
        .inputs-pdf-root{font-family:Georgia,"Times New Roman",serif;color:#16202B;background:#FFFDF8;padding:28px 32px 40px;width:920px;box-sizing:border-box;}
        .inputs-pdf-kicker{margin:0 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8C8574;font-family:system-ui,sans-serif;}
        .inputs-pdf-head h1{margin:0 0 8px;font-size:28px;line-height:1.2;font-weight:700;}
        .inputs-pdf-meta{margin:0 0 22px;font-size:13px;color:#5C5647;font-family:system-ui,sans-serif;}
        .inputs-pdf-section{margin:0 0 18px;padding:14px 16px;border:1px solid #E6E1D1;border-radius:12px;background:#fff;}
        .inputs-pdf-section h2{margin:0 0 10px;font-size:15px;font-family:system-ui,sans-serif;letter-spacing:.02em;}
        .inputs-pdf-section dl{margin:0;display:grid;gap:8px;}
        .inputs-pdf-row{display:grid;grid-template-columns:240px 1fr;gap:12px;padding:6px 0;border-top:1px solid #F1ECDD;}
        .inputs-pdf-row:first-of-type{border-top:0;}
        .inputs-pdf-row dt{margin:0;font-size:12px;color:#6E6858;font-family:system-ui,sans-serif;}
        .inputs-pdf-row dd{margin:0;font-size:13px;white-space:pre-wrap;word-break:break-word;}
      `}</style>
    </div>
  );
}

export function inputsPdfFilename(doc = {}) {
  const idea = sanitizePdfFilenamePart(doc.name || "idea");
  return `6-filter-${idea}-inputs.pdf`;
}

/**
 * @param {object} full Full proposition with entered fields
 * @param {{ save?: boolean, filename?: string }} [opts]
 */
export async function exportPropositionInputsPdf(full, opts = {}) {
  if (!full?.id && !full?.name && !full?.ideaDescription) {
    throw new Error("No idea to export.");
  }

  const host = document.createElement("div");
  host.setAttribute("data-inputs-pdf-host", "1");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = [
    "position:fixed",
    "left:-14000px",
    "top:0",
    "width:920px",
    "max-width:920px",
    "z-index:-1",
    "pointer-events:none",
    "opacity:1",
    "overflow:visible",
  ].join(";");
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    await new Promise((resolve) => {
      root.render(<InputsSnapshot doc={full} />);
      waitFrames(3).then(resolve);
    });
    const el = host.querySelector(".inputs-pdf-root");
    if (!el) throw new Error("Could not render inputs for PDF.");
    return await exportElementToPdf(el, {
      filename: opts.filename || inputsPdfFilename(full),
      backgroundColor: "#FFFDF8",
      save: opts.save !== false,
    });
  } finally {
    try {
      root.unmount();
    } catch {
      /* ignore */
    }
    host.remove();
  }
}
