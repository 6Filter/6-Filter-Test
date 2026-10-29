/**
 * Off-screen render of the Go/No-Go output page, then capture to PDF.
 * Keeps the user on Log while exporting a screened idea.
 */
import { createRoot } from "react-dom/client";
import { GoNoGoResultPage, PROP_CSS } from "./PropositionForm.jsx";
import { exportElementToPdf, outputPdfFilename } from "../lib/exportOutputPdf.js";

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
 * @param {{ currentUser?: object|null }} [opts]
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
      filename: outputPdfFilename(full, result),
      backgroundColor: "#0d0715",
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
