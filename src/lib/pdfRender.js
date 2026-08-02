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
