/**
 * Browser-only: capture a Go/No-Go output DOM node into a multi-page A4 PDF.
 */
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const OUTPUT_BG = "#0d0715";

export function sanitizePdfFilenamePart(raw, fallback = "idea") {
  const cleaned = String(raw || "")
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return cleaned || fallback;
}

export function outputPdfFilename(doc = {}, result = null) {
  const idea = sanitizePdfFilenamePart(doc.name || result?.ideaName || "idea");
  const cls = sanitizePdfFilenamePart(
    result?.classification || doc.goNoGo?.classification || doc.classification || "output",
    "output"
  );
  return `6-filter-${idea}-${cls}.pdf`;
}

/**
 * Replace conic-gradient score rings (poorly supported by html2canvas) with an SVG arc.
 */
function hardenScoreRingInClone(clonedRoot) {
  const rings = clonedRoot.querySelectorAll?.(".score-ring") || [];
  rings.forEach((ring) => {
    const label = String(ring.getAttribute("aria-label") || "");
    const m = label.match(/(\d+(?:\.\d+)?)/);
    const pct = Math.max(0, Math.min(100, m ? Number(m[1]) : 0));
    const computed = ring.style?.background || "";
    const colorMatch = computed.match(/conic-gradient\((#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\))/);
    const arc = colorMatch?.[1] || "#7c5cff";
    const size = Math.max(ring.offsetWidth || 112, 96);
    const stroke = Math.max(8, Math.round(size * 0.08));
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const dash = (pct / 100) * c;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;";
    const track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    track.setAttribute("cx", String(size / 2));
    track.setAttribute("cy", String(size / 2));
    track.setAttribute("r", String(r));
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "#2a1a3f");
    track.setAttribute("stroke-width", String(stroke));
    const prog = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    prog.setAttribute("cx", String(size / 2));
    prog.setAttribute("cy", String(size / 2));
    prog.setAttribute("r", String(r));
    prog.setAttribute("fill", "none");
    prog.setAttribute("stroke", arc);
    prog.setAttribute("stroke-width", String(stroke));
    prog.setAttribute("stroke-linecap", "round");
    prog.setAttribute("stroke-dasharray", `${dash} ${c}`);
    prog.setAttribute("transform", `rotate(-90 ${size / 2} ${size / 2})`);
    svg.appendChild(track);
    svg.appendChild(prog);
    ring.style.background = "#1a1028";
    ring.style.position = "relative";
    ring.insertBefore(svg, ring.firstChild);
    const inner = ring.querySelector(".score-ring-inner");
    if (inner) inner.style.position = "relative";
    if (inner) inner.style.zIndex = "1";
  });
}

function paintElementOntoPdf(pdf, canvas, { startNewIdea = false } = {}) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 6;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const imgHeight = (canvas.height * usableWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/png");

  if (startNewIdea) pdf.addPage();

  let heightLeft = imgHeight;
  let position = margin;
  pdf.addImage(imgData, "PNG", margin, position, usableWidth, imgHeight, undefined, "FAST");
  heightLeft -= usableHeight;

  while (heightLeft > 0.5) {
    position = margin - (imgHeight - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, position, usableWidth, imgHeight, undefined, "FAST");
    heightLeft -= usableHeight;
  }
}

/**
 * @param {HTMLElement} element
 * @param {{ filename?: string, backgroundColor?: string, scale?: number, pdf?: import("jspdf").jsPDF, startNewIdea?: boolean, save?: boolean }} [opts]
 */
export async function exportElementToPdf(element, opts = {}) {
  if (!element || typeof document === "undefined") {
    throw new Error("Nothing to export to PDF.");
  }
  const filename = String(opts.filename || "6-filter-output.pdf").replace(/[^\w.\-]+/g, "_");
  const backgroundColor = opts.backgroundColor || OUTPUT_BG;
  const scale = Math.min(2.5, Math.max(1.5, Number(opts.scale) || 2));
  const ownsPdf = !opts.pdf;

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor,
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: Math.max(element.scrollWidth, element.clientWidth, 900),
    windowHeight: Math.max(element.scrollHeight, element.clientHeight),
    onclone(clonedDoc, clonedEl) {
      clonedDoc.querySelectorAll(".pdf-hide").forEach((n) => n.remove());
      hardenScoreRingInClone(clonedEl || clonedDoc);
      const page = clonedEl?.closest?.(".output-page") || clonedDoc.querySelector(".output-page");
      if (page) {
        page.style.background = backgroundColor;
        page.style.minHeight = "0";
      }
      if (clonedEl) {
        clonedEl.classList.add("is-pdf-capture");
        clonedEl.style.background = backgroundColor;
      }
    },
  });

  const pdf =
    opts.pdf || new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  paintElementOntoPdf(pdf, canvas, { startNewIdea: Boolean(opts.startNewIdea) });

  if (opts.save !== false && ownsPdf) {
    pdf.save(filename);
  }
  return { filename, pages: pdf.getNumberOfPages(), pdf };
}

/** Create an A4 PDF document for multi-idea month exports. */
export function createOutputPdfDocument() {
  return new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
}
