/*
 * pdf.js — generate a real, print-ready NAVPERS 1610/2 PDF.
 *
 * Approach: draw the report data as VECTOR TEXT (pdf-lib StandardFonts.Courier,
 * 10pt, regular, black) on top of the official blank form, embedded as VECTOR
 * pages from public/blank-fitrep.pdf (not a raster image), so the background
 * stays crisp at any zoom/print resolution. Courier == the sample PDF's
 * Courier New 10pt regular, so field text is visually identical (and NOT
 * bold). Field positions come from the official AcroForm widget rectangles
 * (fields-blank.json, PDF points, top-left origin). Generation is fast
 * (~300ms) and produces a clean file with no browser print headers.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import FIELDS from "./fields-blank.json";
import { traitsFor, DUTY_STATUS } from "./model.js";
import * as Calc from "./calc.js";

const PAGE_W = 612, PAGE_H = 792;
const INK = rgb(0.02, 0.05, 0.12);

// Trait radio groups (blocks 33-39) and other single-select radio groups.
const TRAIT_GROUPS = ["f33x", "f34x", "f35x", "f36x", "f37x", "f38x", "f39x"];
const RADIO_GROUPS = TRAIT_GROUPS.concat(["f05x", "f42x", "f46rx"]);
function isRadio(g) { return RADIO_GROUPS.indexOf(g) !== -1; }

// ---- name / address composition (matches the on-form layout) ----
function composeName(ln, fi, mi) {
  let s = ln || "";
  if (fi) s += (s ? ", " : "") + fi;
  if (mi) s += " " + mi;
  return s.trim();
}
function memberName(r) {
  if (r.FullName) return r.FullName;
  let s = r.LastName || "";
  if (r.FirstName) s += (s ? ", " : "") + r.FirstName;
  if (r.MI) s += " " + r.MI;
  if (r.Suffix) s += " " + r.Suffix;
  return s.trim();
}
function composeAddress(r) {
  const lines = [];
  if (r.RSAddress1) lines.push(r.RSAddress1);
  if (r.RSAddress2) lines.push(r.RSAddress2);
  let city = [r.RSCity, r.RSState].filter(Boolean).join(", ");
  if (r.RSZipCd) city += (city ? " " : "") + r.RSZipCd;
  if (city) lines.push(city);
  return lines.join("\n");
}
function composeRRS(r) {
  const parts = [], name = composeName(r.RRSLastName, r.RRSFI, r.RRSMI);
  if (name) parts.push(name);
  if (r.RRSGrade) parts.push(r.RRSGrade);
  if (r.RRSCommand) parts.push(r.RRSCommand);
  if (r.RRSUIC) parts.push("UIC " + r.RRSUIC);
  return parts.join("  ");
}

// Fixed-pitch word wrap → physical lines (matches the form's block wrapping).
function wrapLines(text, cols) {
  const out = [];
  String(text == null ? "" : text).split("\n").forEach((para) => {
    if (para.length === 0) { out.push(""); return; }
    const words = para.split(" ");
    let line = "";
    for (let w of words) {
      while (w.length > cols) { if (line) { out.push(line); line = ""; } out.push(w.slice(0, cols)); w = w.slice(cols); }
      if (line === "") line = w;
      else if (line.length + 1 + w.length <= cols) line += " " + w;
      else { out.push(line); line = w; }
    }
    out.push(line);
  });
  return out;
}

// Like wrapLines, but the first physical line holds at most `firstCols` chars
// (to clear an inset box, e.g. block 29's abbreviation), and every later line
// uses the full `cols` width.
function wrapWithIndent(text, firstCols, cols) {
  const words = String(text == null ? "" : text).replace(/\n/g, " ").split(" ").filter(Boolean);
  const out = [];
  let line = "", limit = firstCols;
  for (let w of words) {
    while (w.length > limit) { if (line) { out.push(line); line = ""; } out.push(w.slice(0, limit)); w = w.slice(limit); limit = cols; }
    if (line === "") line = w;
    else if (line.length + 1 + w.length <= limit) line += " " + w;
    else { out.push(line); line = w; limit = cols; }
  }
  if (line) out.push(line);
  return out;
}

// Report → { text:{group}, checks:{group}, radios:{group->idx} }
function buildValues(r, opts = {}) {
  const traits = traitsFor(r.ReportType);
  const name = memberName(r);
  const text = {}, checks = {}, radios = {};

  text.f01x = name;
  text.f02xOfficer = r.Rate; text.f02x = r.Rate;
  text.f03x = r.Desig; text.f04x = r.SSN;
  text.f06x = r.UIC; text.f07x = r.ShipStation;
  text.f08x = r.PromotionStatus; text.f09x = r.DateReported;
  text.f14x = r.FromDate; text.f15x = r.ToDate;
  text.f20x = r.PhysicalReadiness; text.f21x = r.BilletSubcat;
  text.f22x = r.ReportingSenior || composeName(r.RSLastName, r.RSFI, r.RSMI);
  text.f23x = r.RSGrade; text.f24x = r.RSDesig; text.f25x = r.RSTitle;
  text.f26x = r.RSUIC; text.f27x = r.RSSSN;
  text.f28x = r.Achievements; text.f29x = r.Duties; text.f29ax = r.PrimaryDuty;
  text.f30x = r.DateCounseled;
  text.f31x = composeName(r.CounselerLN, r.CounselerFI, r.CounselerMI);
  text.f40ax = r.RecommendA; text.f40bx = r.RecommendB;
  text.f41 = r.Comments;
  // The blank form's pre-printed "0" placeholders were removed from the
  // background, so default empty summary counts to "0" to match the form.
  const sc = (v) => (v == null || v === "" ? "0" : String(v));
  text.f43ax = sc(r.SummarySP); text.f43bx = sc(r.SummaryProg); text.f43cx = sc(r.SummaryProm);
  text.f43dx = sc(r.SummaryMP); text.f43ex = sc(r.SummaryEP);
  text.f44x = composeAddress(r);
  text.f45dx = r.RaterDate;
  text.f45memberx = Calc.fmt(Calc.memberTraitAverage(r), 2);
  if (opts.summaryGroupAverage != null && opts.summaryGroupAverage !== "")
    text.f45groupx = typeof opts.summaryGroupAverage === "number"
      ? Calc.fmt(opts.summaryGroupAverage, 2) : String(opts.summaryGroupAverage);
  text.f46ax = name;
  text.f46dx = r.SeniorRaterDate;
  text.f47x = composeRRS(r);

  checks.f10x = !!r.Periodic; checks.f11x = !!r.DetInd;
  checks.f12x = !!r.Frocking; checks.f13x = !!r.Special;
  checks.f16x = !!r.NOB;
  checks.f17x = !!r.Regular; checks.f18x = !!r.Concurrent; checks.f19x = !!r.OpsCdr;

  for (let i = 0; i < DUTY_STATUS.length; i++) if (r[DUTY_STATUS[i]]) { radios.f05x = i; break; }
  for (let k = 0; k < TRAIT_GROUPS.length; k++) radios[TRAIT_GROUPS[k]] = Number(r[traits[k]]) || 0;
  radios.f42x = Number(r.PromotionRecom) || 0;
  if (r.StatementYes) radios.f46rx = 0; else if (r.StatementNo) radios.f46rx = 1;

  return { text, checks, radios };
}

// Cache the blank form's PDF bytes (fetched once, copied per use).
let bgPromise = null;
function loadBackgrounds() {
  if (!bgPromise) {
    bgPromise = fetch("blank-fitrep.pdf").then((r) => r.arrayBuffer());
  }
  return bgPromise;
}

// Draw one report's two pages into an existing PDFDocument.
// fonts = { courier, bold, sig } embedded once by the caller.
async function drawReport(doc, fonts, bgPdfBytes, report, opts) {
  const font = fonts.courier, fontBold = fonts.bold, sigFont = fonts.sig;
  const vals = buildValues(report, opts || {});
  const [bgPage1, bgPage2] = await doc.embedPdf(bgPdfBytes.slice(0), [0, 1]);

  const pages = [doc.addPage([PAGE_W, PAGE_H]), doc.addPage([PAGE_W, PAGE_H])];
  pages[0].drawPage(bgPage1, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
  pages[1].drawPage(bgPage2, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

  // Field `y` is the GLYPH TOP measured from the page top (matching the real
  // eNavFit output via pdfplumber). pdf-lib positions by baseline from the
  // bottom, so convert: baseline = PAGE_H - top - ascent. Courier's cap/ascent
  // in pdf-lib is a calibrated 0.806 * size.
  const ASCENT = 0.806;
  // Nudge every field glyph up by 1 CSS pixel (1/96in = 0.75pt) relative to the
  // calibrated baseline.
  const PX = 0.75;
  const baseline = (top, size) => PAGE_H - top - ASCENT * size + PX;
  // The eNavFit data font advances 0.6188 em/char; pdf-lib's StandardFont Courier
  // advances 0.6 em, and pdf-lib 1.17 drawText has NO character-spacing option.
  // So place each glyph manually at the reference pitch to match its x's exactly.
  const PITCH_EM = 0.6188;
  const drawMono = (page, text, x, y, size) => {
    const adv = PITCH_EM * size;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch !== " ") page.drawText(ch, { x: x + i * adv, y, size, font, color: INK });
    }
  };

  // The page-1 title ("FITNESS REPORT & COUNSELING RECORD (W2-O6)") is printed
  // natively on the blank-fitrep.pdf background in its own font — we no longer
  // redraw it, so the title always matches the official form exactly.

  for (const f of FIELDS) {
    if (f.group === "FormTitle") continue;
    const page = pages[f.page - 1];
    const size = f.size || 12;

    if (f.type === "check") {
      const on = isRadio(f.group)
        ? (vals.radios[f.group] != null && vals.radios[f.group] === Number(f.on))
        : !!vals.checks[f.group];
      if (!on) continue;
      // The real form marks a selected box with a Courier "X" glyph (same data
      // font/size), centered in the 14.4x12.2 square. Match it exactly.
      const gx = f.x + (f.w - size * 0.6) / 2;
      page.drawText("X", { x: gx, y: baseline(f.y + 1.6, size), size, font, color: INK });
      continue;
    }

    const raw = vals.text[f.group];
    if (raw == null || raw === "") continue;

    if (f.multiline) {
      const cols = f.cols || 92;
      const pitch = f.pitch || (size + 1.5);
      let lines;
      if (f.indentX != null) {
        // Block 29: the first physical line is shortened to clear the "primary
        // duty" abbreviation box, then the rest wrap at full width from x.
        const firstCols = Math.max(1, cols - Math.round((f.indentX - f.x) / (size * 0.6)));
        lines = wrapWithIndent(raw, firstCols, cols);
      } else {
        lines = wrapLines(raw, cols);
      }
      lines.forEach((ln, i) => {
        let x = (i === 0 && f.indentX != null) ? f.indentX : f.x;
        // eNavFit centers whole-line ***...*** markers within the comment column.
        const trimmed = ln.trim();
        if (trimmed.startsWith("***") && trimmed.endsWith("***")) {
          x = f.x + ((cols - trimmed.length) / 2) * (PITCH_EM * size);
          ln = trimmed;
        }
        drawMono(page, ln, x, baseline(f.y + pitch * i, size), size);
      });
    } else {
      // f.x is the measured glyph-left of the reference data for every single-line
      // field (including summary counts / averages), so draw straight at it.
      drawMono(page, String(raw), f.x, baseline(f.y, size), size);
    }
  }

  // ---- free-form annotations (draggable text / signatures) ----
  // report._annotations: [{ page:1|2, xPct, yPct, text, size, bold, sig }]
  // xPct/yPct are the top-left of the text as fractions of the page, so they
  // render at the same spot regardless of the editor's zoom.
  const anns = report._annotations || [];
  for (const a of anns) {
    if (!a || !a.text) continue;
    const page = pages[(a.page || 1) - 1];
    if (!page) continue;
    const size = a.sig ? (a.size || 20) : (a.size || 11);
    const useFont = a.sig ? sigFont : (a.bold ? fontBold : font);
    const xTop = (a.xPct || 0) * PAGE_W;
    const yTop = (a.yPct || 0) * PAGE_H;
    page.drawText(String(a.text), {
      x: xTop, y: PAGE_H - yTop - size, size, font: useFont, color: INK,
    });
  }
}

async function embedFonts(doc) {
  return {
    courier: await doc.embedFont(StandardFonts.Courier),   // field data
    bold: await doc.embedFont(StandardFonts.HelveticaBold), // annotation text
    sig: await doc.embedFont(StandardFonts.TimesRomanItalic), // signature annotations
  };
}

export async function reportPdfBytes(report, opts) {
  const bgPdfBytes = await loadBackgrounds();
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  await drawReport(doc, fonts, bgPdfBytes, report, opts);
  return doc.save();
}

export async function groupPdfBytes(reports, opts = {}) {
  const bgPdfBytes = await loadBackgrounds();
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  for (const r of reports) await drawReport(doc, fonts, bgPdfBytes, r, opts);
  return doc.save();
}

// Stamp free-form annotations (draggable text / signatures) onto an EXISTING,
// arbitrary PDF the user uploaded. Same annotation model the FITREP editor uses:
//   annotations: [{ page:1-based, xPct, yPct, text, size, bold, sig }]
// xPct/yPct are the top-left of the text as fractions of that page's size, so a
// stamp lands where the editor showed it regardless of zoom or page dimensions.
export async function stampAnnotations(pdfBytes, annotations = []) {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const fonts = await embedFonts(doc);
  const pages = doc.getPages();
  for (const a of annotations) {
    if (!a || !a.text) continue;
    const page = pages[(a.page || 1) - 1];
    if (!page) continue;
    const { width, height } = page.getSize();
    const size = a.sig ? (a.size || 20) : (a.size || 11);
    const useFont = a.sig ? fonts.sig : (a.bold ? fonts.bold : fonts.courier);
    const xTop = (a.xPct || 0) * width;
    const yTop = (a.yPct || 0) * height;
    page.drawText(String(a.text), {
      x: xTop, y: height - yTop - size, size, font: useFont, color: INK,
    });
  }
  return doc.save();
}

export function downloadPdf(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename || "fitrep.pdf";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function openPdf(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
