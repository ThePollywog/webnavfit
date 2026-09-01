/*
 * pdfRender.js — rasterize an arbitrary PDF (uploaded by the user) into page
 * images so it can be shown as an annotatable background in the canvas editor.
 *
 * Uses pdf.js purely in the browser. The worker is bundled by Vite (import.meta
 * worker URL), so there is no CDN dependency and it works offline / on gh-pages.
 */
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.mjs?worker";

// Wire the worker up once (module workers via Vite ?worker).
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

// Render the page WITHOUT annotation/field appearances. We overlay our own
// editable inputs on the form fields, so baking a field's existing value into
// the background image would double up (ghost the old value behind the input).
// AnnotationMode.DISABLE paints only the page content, keeping fields blank.
const NO_ANNOTATIONS = pdfjsLib.AnnotationMode.DISABLE;

/**
 * Render every page of a PDF to a PNG data URL.
 * @param {Uint8Array} bytes  the PDF file bytes
 * @param {number} scale      raster scale (2 ≈ 144dpi, crisp for on-screen edit)
 * @returns {Promise<Array<{width:number,height:number,ptW:number,ptH:number,dataUrl:string}>>}
 *          width/height are pixels; ptW/ptH are the PDF point dimensions.
 */
export async function renderPdfPages(bytes, scale = 2) {
  // pdf.js consumes the buffer, so hand it a private copy.
  const task = pdfjsLib.getDocument({ data: bytes.slice(0) });
  const doc = await task.promise;
  const pages = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });      // point dimensions
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      // pdf.js v6 renders straight to the canvas element.
      await page.render({ canvas, viewport: vp, annotationMode: NO_ANNOTATIONS }).promise;
      pages.push({
        width: canvas.width, height: canvas.height,
        ptW: vp1.width, ptH: vp1.height,
        dataUrl: canvas.toDataURL("image/png"),
      });
      page.cleanup();
    }
  } finally {
    task.destroy();
  }
  return pages;
}

/**
 * Extract every page's text runs with their position converted to the same
 * TOP-LEFT, points convention used throughout this app (fields-blank.json,
 * the canvas editor, pdf.js's own field layout) — pdfplumber's "top" measured
 * from the page top, which is what those coordinates were reverse-engineered
 * from originally. pdf.js instead hands back a bottom-left-origin transform
 * per run, so each item is converted here rather than at every call site.
 *
 * @param {Uint8Array} bytes  the PDF file bytes
 * @returns {Promise<Array<Array<{str:string, xTop:number, yTop:number, width:number, height:number}>>>}
 *          one array per page, in the PDF's own reading order.
 */
export async function extractPageTextItems(bytes) {
  const task = pdfjsLib.getDocument({ data: bytes.slice(0) });
  const doc = await task.promise;
  const pages = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const { height: pageH } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push(
        content.items
          .filter((it) => it.str && it.str.trim() !== "")
          .map((it) => {
            // transform: [scaleX, skewX, skewY, scaleY, x, yBaseline] — yBaseline
            // is bottom-left-origin. "height" approximates the glyph's full
            // extent, so top ≈ page height − baseline − height is a reasonable
            // stand-in for pdfplumber's "top" (a small fudge, tuned against a
            // real sample rather than derived exactly, since pdf.js doesn't
            // expose per-glyph ascent/descent the way pdfplumber does).
            const x = it.transform[4];
            const yBaseline = it.transform[5];
            const height = it.height || Math.abs(it.transform[3]) || 12;
            return { str: it.str, xTop: x, yTop: pageH - yBaseline - height, width: it.width || 0, height };
          })
      );
      page.cleanup();
    }
  } finally {
    task.destroy();
  }
  return pages;
}
