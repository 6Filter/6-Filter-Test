/**
 * Off-screen render of the Go/No-Go output page, then capture to PDF.
 * Keeps the user on Log while exporting a screened idea.
 */
import { createRoot } from "react-dom/client";
import { GoNoGoResultPage, PROP_CSS } from "./PropositionForm.jsx";
import {
  createOutputPdfDocument,
  exportElementToPdf,
  outputPdfFilename,
  sanitizePdfFilenamePart,
} from "../lib/exportOutputPdf.js";

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

/**
 * @param {object} full Full proposition (must include goNoGo.classification)
 * @param {{ currentUser?: object|null, pdf?: object, startNewIdea?: boolean, save?: boolean, filename?: string }} [opts]
 */
export async function exportPropositionOutputPdf(full, opts = {}) {
  const result = full?.goNoGo;
  if (!result?.classification) {
    throw new Error("This idea has no Go/No-Go output yet. Run the screen first.");
  }

  const host = document.createElement("div");
  host.setAttribute("data-gonogo-pdf-host", "1");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = [
    "position:fixed",
    "left:-14000px",
    "top:0",
    "width:980px",
    "max-width:980px",
    "z-index:-1",
    "pointer-events:none",
    "opacity:1",
    "overflow:visible",
  ].join(";");
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    await new Promise((resolve) => {
      root.render(
        <main className="prop-page output-page" data-view="goNoGoResult" data-pdf-export="1">
          <style>{PROP_CSS}</style>
          <GoNoGoResultPage
            result={result}
            advisoryChecks={full.advisoryChecks || result.checkLabels || {}}
            category={full.category || result.category}
            ideaName={full.name || result.ideaName}
            doc={full}
            savedDoc={full}
            saving={false}
            pdfMode
            currentUser={opts.currentUser || null}
            onBack={() => {}}
            onSubmit={() => {}}
            onRequestReview={undefined}
            onApproveReview={undefined}
            managerBusy={false}
            managerComment=""
            onManagerComment={() => {}}
          />
        </main>
      );
      waitFrames(3).then(resolve);
    });

    const el = host.querySelector(".gonogo-result-page");
    if (!el) throw new Error("Could not render the output page for PDF.");

    return await exportElementToPdf(el, {
      filename: opts.filename || outputPdfFilename(full, result),
      backgroundColor: "#0d0715",
      pdf: opts.pdf,
      startNewIdea: Boolean(opts.startNewIdea),
      save: opts.save !== false && !opts.pdf,
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

/**
 * One combined PDF for every screened idea in the month list.
 * @param {object[]} fullDocs
 * @param {{ monthKey?: string, currentUser?: object|null }} [opts]
 */
export async function exportMonthPropositionsPdf(fullDocs, opts = {}) {
  const docs = (Array.isArray(fullDocs) ? fullDocs : []).filter(
    (d) => d?.goNoGo?.classification || d?.classification
  );
  if (!docs.length) {
    throw new Error("No screened ideas in this month to export as PDF.");
  }
  const pdf = createOutputPdfDocument();
  let index = 0;
  for (const raw of docs) {
    const full = raw.goNoGo?.classification
      ? raw
      : { ...raw, goNoGo: raw.goNoGo || { classification: raw.classification } };
    await exportPropositionOutputPdf(full, {
      currentUser: opts.currentUser || null,
      pdf,
      startNewIdea: index > 0,
      save: false,
    });
    index += 1;
  }
  const monthBit = sanitizePdfFilenamePart(opts.monthKey || "month", "month");
  const filename = `6-filter-month-${monthBit}.pdf`;
  pdf.save(filename);
  return { filename, ideas: docs.length, pages: pdf.getNumberOfPages() };
}
