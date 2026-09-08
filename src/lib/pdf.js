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
import FITREP_FIELDS from "./fields-blank.json";
import EVAL_FIELDS from "./fields-eval.json";
import CHIEF_FIELDS from "./fields-chief.json";
import { traitsFor, DUTY_STATUS } from "./model.js";
import * as Calc from "./calc.js";

const PAGE_W = 612, PAGE_H = 792;
const INK = rgb(0.02, 0.05, 0.12);

// Trait radio groups (blocks 33-39) and other single-select radio groups, per
// report type — EVAL's block numbers/group names diverge from FITREP's past
// block 39 even though the underlying widget positions for 1-39 are identical.
const TRAIT_GROUPS = ["f33x", "f34x", "f35x", "f36x", "f37x", "f38x", "f39x"];
const FITREP_RADIO_GROUPS = TRAIT_GROUPS.concat(["f05x", "f42x", "f46rx"]);
const EVAL_RADIO_GROUPS = TRAIT_GROUPS.concat(["f05x", "f45indx", "f47retx", "f51stmtx"]);
// CHIEF's trait grade is a typed decimal (0-5, 0 == NOB), not a radio pick —
// its only radio group is duty status.
const CHIEF_RADIO_GROUPS = ["f05x"];

// These boxes on the source template PDFs ship with stray content already
// baked into their cells — placeholder "X"/"0.00"/"0" marks present even with
// nothing merged in (verified against each un-merged background). Left alone,
// our own value draws on top and either doubles up visibly (a checkbox) or
// overlaps character-for-character into a garbled glyph (a "0.00" average
// whenever the real value isn't coincidentally the same digits). Whiting out
// each box before drawing guarantees only our own value ever shows.
const FITREP_BAKED_GROUPS = new Set([
  "f42x", "f43ax", "f43bx", "f43cx", "f43dx", "f43ex", "f45memberx", "f45groupx",
]);
const EVAL_BAKED_GROUPS = new Set([
  "f40avgx", "f45indx", "f46sumSP", "f46sumProg", "f46sumProm", "f46sumMP", "f46sumEP", "f50gavgx",
]);
const CHIEF_BAKED_GROUPS = new Set([
  ...TRAIT_GROUPS, "f41x", "f42ax", "f42bx", "f43x", "f44x", "f45x",
  "f48ax", "f48bx", "f48cx", "f48dx", "f48ex",
]);

// Per-report-type form definition: field geometry, background PDF, radio
// groups and baked-artifact boxes, and the value-builder for that form.
const FORM_DEFS = {
  FITREP: { fields: FITREP_FIELDS, bg: "blank-fitrep.pdf", radioGroups: FITREP_RADIO_GROUPS, baked: FITREP_BAKED_GROUPS, buildValues: buildValuesFitrep },
  EVAL: { fields: EVAL_FIELDS, bg: "blank-eval.pdf", radioGroups: EVAL_RADIO_GROUPS, baked: EVAL_BAKED_GROUPS, buildValues: buildValuesEval },
  CHIEF: { fields: CHIEF_FIELDS, bg: "blank-chief-eval.pdf", radioGroups: CHIEF_RADIO_GROUPS, baked: CHIEF_BAKED_GROUPS, buildValues: buildValuesChief },
};
function formDef(reportType) { return FORM_DEFS[reportType] || FORM_DEFS.FITREP; }

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
function buildValuesFitrep(r, opts = {}) {
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

// NAVPERS 1616/26 (EVAL). Blocks 1-39 sit at the same coordinates as FITREP
// (verified against both blank templates) and share its group names; blocks
// 40-52 are EVAL's own layout (see fields-eval.json / evalFields.js).
//
// Some signature dates on the real form (block 50's Reporting Senior date,
// blocks 51/52's own dates) have no corresponding report field in the shared
// model — those are physically wet-signed today and are left blank here,
// the same way FITREP already leaves most of its own signature dates blank.
function buildValuesEval(r, opts = {}) {
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
  // EVAL has a single recommendation box (FITREP has two) — combine both.
  text.f41recx = [r.RecommendA, r.RecommendB].filter(Boolean).join(", ");
  text.f42datex = r.RaterDate;
  text.f43cmtx = r.Comments;
  text.f44qualx = r.Qualifications;
  const sc = (v) => (v == null || v === "" ? "0" : String(v));
  text.f46sumSP = sc(r.SummarySP); text.f46sumProg = sc(r.SummaryProg); text.f46sumProm = sc(r.SummaryProm);
  text.f46sumMP = sc(r.SummaryMP); text.f46sumEP = sc(r.SummaryEP);
  text.f48addrx = composeAddress(r);
  text.f49datex = r.SeniorRaterDate;
  text.f40avgx = Calc.fmt(Calc.memberTraitAverage(r), 2);
  if (opts.summaryGroupAverage != null && opts.summaryGroupAverage !== "")
    text.f50gavgx = typeof opts.summaryGroupAverage === "number"
      ? Calc.fmt(opts.summaryGroupAverage, 2) : String(opts.summaryGroupAverage);
  text.f52rrsx = composeRRS(r);

  checks.f10x = !!r.Periodic; checks.f11x = !!r.DetInd;
  checks.f12x = !!r.Frocking; checks.f13x = !!r.Special;
  checks.f16x = !!r.NOB;
  checks.f17x = !!r.Regular; checks.f18x = !!r.Concurrent; checks.f19x = !!r.OpsCdr;

  for (let i = 0; i < DUTY_STATUS.length; i++) if (r[DUTY_STATUS[i]]) { radios.f05x = i; break; }
  for (let k = 0; k < TRAIT_GROUPS.length; k++) radios[TRAIT_GROUPS[k]] = Number(r[traits[k]]) || 0;
  radios.f45indx = Number(r.PromotionRecom) || 0;
  if (r.RetentionYes) radios.f47retx = 0; else if (r.RetentionNo) radios.f47retx = 1;
  if (r.StatementYes) radios.f51stmtx = 0; else if (r.StatementNo) radios.f51stmtx = 1;

  return { text, checks, radios };
}

// Short abbreviations for the promotion-recommendation scale, matching the
// existing SummarySP/Prog/Prom/MP/EP field-naming convention — CHIEF's own
// block 41/43-47 area is far too narrow for the full refdata labels
// ("Significant Problems", etc).
const RECOM_ABBR = ["NOB", "SP", "Prog", "Prom", "MP", "EP"];

// NAVPERS 1616/27 (CHIEF). Blocks 1-9/14-15/21-32 sit at FITREP/EVAL's
// coordinates and share their group names; blocks 10-13/16-20 are CHIEF's own
// row layout; blocks 33-52 are CHIEF's own grid (see fields-chief.json /
// chiefFields.js). Its trait grade is a typed decimal, not a radio pick, and
// each trait has its own freeform "Performance Comments" field (fN xcmt) with
// no FITREP/EVAL equivalent.
//
// Three fields here are computed at generation time rather than read off the
// report, the same way FITREP/EVAL's own group-average box already is:
//   - opts.summaryRank: {rank, of} from Calc.summaryRank(report, groupReports)
//   - opts.rsca: the reporting senior's overall RSCA, Calc.rsca(groupReports)
//   - opts.summaryGroupAverage: the summary group's trait average (existing)
// groupPdfBytes computes all three per-report; a lone reportPdfBytes() call
// (Quick Preview, with no group context) leaves them blank, same as today.
function buildValuesChief(r, opts = {}) {
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

  for (let k = 0; k < TRAIT_GROUPS.length; k++) {
    const col = traits[k];
    text[TRAIT_GROUPS[k]] = Calc.fmt(Number(col ? r[col] : 0) || 0, 1);
    text[TRAIT_GROUPS[k] + "cmt"] = r[col + "Comments"];
  }

  text.f40x = r.Comments;
  const promo = Number(r.PromotionRecom) || 0;
  text.f41x = RECOM_ABBR[promo] || "NOB";
  if (opts.summaryRank) {
    text.f42ax = String(opts.summaryRank.rank);
    text.f42bx = String(opts.summaryRank.of);
  }
  text.f43x = Calc.fmt(Calc.memberTraitAverage(r), 2);
  if (opts.rsca != null && opts.rsca !== "")
    text.f44x = typeof opts.rsca === "number" ? Calc.fmt(opts.rsca, 2) : String(opts.rsca);
  if (opts.summaryGroupAverage != null && opts.summaryGroupAverage !== "")
    text.f45x = typeof opts.summaryGroupAverage === "number"
      ? Calc.fmt(opts.summaryGroupAverage, 2) : String(opts.summaryGroupAverage);
  text.f46x = r.RecommendA; text.f47x = r.RecommendB;
  const sc = (v) => (v == null || v === "" ? "0" : String(v));
  text.f48ax = sc(r.SummarySP); text.f48bx = sc(r.SummaryProg); text.f48cx = sc(r.SummaryProm);
  text.f48dx = sc(r.SummaryMP); text.f48ex = sc(r.SummaryEP);
  text.f51x = composeAddress(r);
  text.f51phonex = r.RSPhone; text.f51dsnx = r.RSDSN;
  text.f52x = composeRRS(r);

  checks.f10x = !!r.Periodic; checks.f11x = !!r.DetInd;
  checks.f12x = !!r.Frocking; checks.f13x = !!r.Special;
  checks.f16x = !!r.NOB;
  checks.f17x = !!r.Regular; checks.f18x = !!r.Concurrent; checks.f19x = !!r.OpsCdr;
  checks.f49yx = !!r.StatementYes; checks.f49nx = !!r.StatementNo;

  for (let i = 0; i < DUTY_STATUS.length; i++) if (r[DUTY_STATUS[i]]) { radios.f05x = i; break; }

  return { text, checks, radios };
}

// Cache each form's blank PDF bytes (fetched once per type, copied per use).
const bgPromises = {};
function loadBackgrounds(reportType) {
  const def = formDef(reportType);
  if (!bgPromises[def.bg]) {
    bgPromises[def.bg] = fetch(def.bg).then((r) => r.arrayBuffer());
  }
  return bgPromises[def.bg];
}

// Draw one report's two pages into an existing PDFDocument.
// fonts = { courier, bold, sig } embedded once by the caller.
async function drawReport(doc, fonts, bgPdfBytes, report, opts) {
  const font = fonts.courier, fontBold = fonts.bold, sigFont = fonts.sig;
  const def = formDef(report.ReportType);
  const FIELDS = def.fields;
  const isRadio = (g) => def.radioGroups.indexOf(g) !== -1;
  const vals = def.buildValues(report, opts || {});
  const [bgPage1, bgPage2] = await doc.embedPdf(bgPdfBytes.slice(0), [0, 1]);

  const pages = [doc.addPage([PAGE_W, PAGE_H]), doc.addPage([PAGE_W, PAGE_H])];
  pages[0].drawPage(bgPage1, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
  pages[1].drawPage(bgPage2, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });

  // Field `y` is the GLYPH TOP measured from the page top (matching the real
  // eNavFit output via pdfplumber). pdf-lib positions by baseline from the
  // bottom, so convert: baseline = PAGE_H - top - ascent. Courier's cap/ascent
  // in pdf-lib is a calibrated 0.806 * size.
  const ASCENT = 0.806;
  // Nudge every field glyph up by 1 full point relative to the calibrated
  // baseline.
  const PX = 1.25;
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

    if (def.baked.has(f.group)) {
      // f.h reaches to (or past) the cell's own bottom grid line for the text
      // boxes (43/45) — measured, the rule sits ~10.3pt below f.y, not the
      // full 14, so a 2pt trim still clipped it; 4pt clears it. Block 42's
      // checkbox is much shorter (h=12.2) and isn't near a border, but a 4pt
      // trim there under-covers the box and re-exposes the baked NOB glyph's
      // tail underneath our own mark, so it keeps the smaller trim.
      const trim = f.type === "check" ? 2 : 4;
      const wh = Math.max(1, f.h - trim);
      page.drawRectangle({ x: f.x, y: PAGE_H - f.y - wh, width: f.w, height: wh, color: rgb(1, 1, 1) });
    }

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
      // ReportEditor warns when text won't fit, but generation stays defensive
      // regardless of how the value got here (import, direct model edit, a
      // future caller) — drawing past the box's own line count would run text
      // into whatever the form prints below it instead of just being cut off.
      const maxLines = Math.max(1, Math.floor(f.h / pitch));
      lines.slice(0, maxLines).forEach((ln, i) => {
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
  const bgPdfBytes = await loadBackgrounds(report.ReportType);
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  await drawReport(doc, fonts, bgPdfBytes, report, opts);
  return doc.save();
}

// Reports in one summary group are always the same ReportType in practice,
// but backgrounds are still fetched per-report to be safe against a mixed batch.
//
// CHIEF's own per-report summaryRank/rsca (see buildValuesChief) only make
// sense with the whole group in view, so — like the caller-supplied
// summaryGroupAverage — they're derived here rather than asked of the caller;
// a lone reportPdfBytes() call has no group and leaves them blank.
export async function groupPdfBytes(reports, opts = {}) {
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  const rsca = Calc.rsca(reports);
  for (const r of reports) {
    const bgPdfBytes = await loadBackgrounds(r.ReportType);
    const reportOpts = { ...opts, rsca, summaryRank: Calc.summaryRank(r, reports) };
    await drawReport(doc, fonts, bgPdfBytes, r, reportOpts);
  }
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

// The click-to-edit canvas panel renders each type's blank template PDF as
// its own background image — the same stray baked content this module masks
// with a white rectangle before drawing (see BAKED_GROUPS above) is exposed
// there too, so it needs the same group set to mask on-screen.
export function bakedGroupsFor(reportType) { return formDef(reportType).baked; }
