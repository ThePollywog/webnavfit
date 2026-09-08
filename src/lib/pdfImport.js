/*
 * pdfImport.js — read a completed, real eNavFit/NAVFIT98A FITREP PDF export
 * (NAVPERS 1610/2 only) back into a report record.
 *
 * A real export has no AcroForm fields (see pdfForm.js for that case) — it's
 * flattened text drawn at fixed positions on the official form. fields-blank.json's
 * (x,y,w,h) coordinates were originally reverse-engineered from a real sample via
 * pdfplumber (see pdf.js's baseline comment), and the checkbox marks are literal
 * "X" text glyphs, not vector art — so the same coordinate map used to WRITE the
 * generated PDF can bucket a real PDF's text runs back into the right fields.
 *
 * This is inherently best-effort: font/version differences in a given eNavFit
 * export could shift text a point or two from where our own generator places it.
 * Every extracted value flows through the normal ReportEditor for review before
 * saving, and ambiguous fields are surfaced via `warnings` rather than guessed at
 * silently.
 */
import FIELDS from "./fields-blank.json";
import * as FF from "./fitrepFields.js";
import { newReport } from "./model.js";
import { extractPageTextItems } from "./pdfRender.js";

// Not real fields — computed/no-longer-drawn, so never present to extract from.
const SKIP_GROUPS = new Set(["FormTitle", "f45memberx", "f45groupx"]);

function isMarkGlyph(str) {
  return /^[Xx✕✗]$/.test(str.trim());
}

// A widget's own box, on the page it actually lives on.
function widgetItems(pages, w) {
  return pages[w.page - 1] || [];
}

function isMarked(pages, w) {
  return widgetItems(pages, w).some((it) => {
    if (!isMarkGlyph(it.str)) return false;
    const midX = it.xTop + it.width / 2;
    const midY = it.yTop + it.height / 2;
    return midX >= w.x - 2 && midX <= w.x + w.w + 2 && midY >= w.y - 2 && midY <= w.y + w.h + 2;
  });
}

// The form's own printed captions ("14. From:", "27. SSN", ...) render at a
// fixed ~7.4-8pt height regardless of which field they sit beside, while every
// real answer (even the smallest, 9pt narrative text) renders taller. A blank
// field's nearest text is often its own caption or a neighboring one — always
// excluding caption-height runs, rather than relying on distance alone, is
// what tells "genuinely blank" apart from "there's a real value nearby."
const CAPTION_MAX_HEIGHT = 8.5;
function dropCaptions(items) {
  return items.filter((it) => it.height > CAPTION_MAX_HEIGHT);
}

// Join same-line items left to right. Real exports may hand back whole words
// as one run or single characters (our own generator draws char-by-char) — a
// small gap between consecutive runs is treated as a real word space, no gap
// means they're parts of the same run.
function joinLineItems(items) {
  const sorted = [...items].sort((a, b) => a.xTop - b.xTop);
  let out = "", prevRight = null;
  for (const it of sorted) {
    if (prevRight != null && it.xTop - prevRight > 1.5) out += " ";
    out += it.str;
    prevRight = it.xTop + it.width;
  }
  return out.trim();
}

// Real exports lay out each printed line at one shared baseline, so items on
// the same visual row land at (near-)identical yTop — reliable enough to
// cluster on directly rather than guessing a fixed y-tolerance. Adjacent
// fields sit close enough vertically (line pitch ~15-16pt against a ~14pt box
// height) that a tolerance-range match would often span two real rows at
// once; picking only the single nearest row avoids that bleed.
function clusterRows(items) {
  const sorted = [...items].sort((a, b) => a.yTop - b.yTop);
  const rows = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(it.yTop - last.yTop) < 0.75) last.items.push(it);
    else rows.push({ yTop: it.yTop, items: [it] });
  }
  return rows;
}

function nearestRow(items, f) {
  const rows = clusterRows(items);
  const targetMid = f.y + f.h / 2;
  let best = null, bestDist = Infinity;
  for (const row of rows) {
    const rowH = Math.max(...row.items.map((it) => it.height));
    const mid = row.yTop + rowH / 2;
    const dist = Math.abs(mid - targetMid);
    if (dist < bestDist) { best = row; bestDist = dist; }
  }
  // Adjacent single-line fields can sit less than one box-height apart, so a
  // wide tolerance risks claiming a neighbor's answer for an actually-blank
  // field. Requiring the match to be within roughly half a line keeps each
  // row attached to at most the one field it visually belongs to.
  return best && bestDist <= Math.max(6, f.h * 0.6) ? best.items : [];
}

function extractSingleLine(pages, f) {
  const items = dropCaptions(
    widgetItems(pages, f).filter((it) => it.xTop >= f.x - 3 && it.xTop <= f.x + f.w + 4)
  );
  return joinLineItems(nearestRow(items, f));
}

// Bucket items into pitch-sized lines within the box, then rejoin: a real
// eNavFit export's line breaks are ITS OWN word-wrap, not the writer's
// original paragraph breaks, so consecutive non-empty lines are collapsed
// back into flowing text with a single space; a genuinely empty line (a real
// blank line the writer left) is kept as a paragraph break.
function extractMultiline(pages, f) {
  const items = dropCaptions(
    widgetItems(pages, f).filter((it) => it.xTop >= f.x - 3 && it.xTop <= f.x + f.w + 30)
  );
  const pitch = f.pitch || (f.size || 12) + 1.5;
  const maxLines = Math.max(1, Math.round(f.h / pitch) + 1);
  const lines = Array.from({ length: maxLines }, () => []);
  for (const it of items) {
    const li = Math.round((it.yTop - f.y) / pitch);
    if (li >= 0 && li < maxLines) lines[li].push(it);
  }
  const rendered = lines.map(joinLineItems);

  const out = [];
  let para = "";
  for (const ln of rendered) {
    if (ln === "") {
      if (para) { out.push(para); para = ""; }
      out.push("");
    } else {
      para = para ? para + " " + ln : ln;
    }
  }
  if (para) out.push(para);
  while (out.length && out[0] === "") out.shift();
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n\n");
}

/**
 * @param {Uint8Array} bytes  the uploaded PDF's bytes
 * @returns {Promise<{report: object, warnings: string[]}>}
 */
export async function importFitrepPdf(bytes) {
  const pages = await extractPageTextItems(bytes);
  const page1Text = (pages[0] || []).map((it) => it.str).join(" ").toUpperCase();
  if (!page1Text.includes("FITNESS REPORT")) {
    throw new Error("This doesn't look like a FITREP (NAVPERS 1610/2) PDF.");
  }

  const report = newReport("FITREP", null);
  const warnings = [];

  const byGroup = new Map();
  for (const f of FIELDS) {
    if (SKIP_GROUPS.has(f.group)) continue;
    if (!byGroup.has(f.group)) byGroup.set(f.group, []);
    byGroup.get(f.group).push(f);
  }

  for (const [group, widgets] of byGroup) {
    const label = FF.LABEL[group] || group;

    if (FF.isRadioGroup(group)) {
      const marked = widgets.filter((w) => isMarked(pages, w));
      if (marked.length === 0) {
        warnings.push(`${label}: no selection detected — review manually.`);
      } else {
        if (marked.length > 1) warnings.push(`${label}: multiple marks detected — used the first.`);
        FF.writeGroup(group, report, Number(marked[0].on));
      }
      continue;
    }

    if (FF.CHECK_FIELD[group]) {
      FF.writeGroup(group, report, widgets.some((w) => isMarked(pages, w)));
      continue;
    }

    // Text/multiline: a group may repeat (e.g. name/rate/SSN run in the page
    // header on both pages) — take the first non-empty extraction.
    const isMultiline = FF.MULTILINE.has(group);
    let value = "";
    for (const w of widgets) {
      value = isMultiline ? extractMultiline(pages, w) : extractSingleLine(pages, w);
      if (value) break;
    }
    // f47x (concurrent reporting senior) is legitimately blank on the vast
    // majority of reports — only the true narrative blocks are worth flagging.
    if (isMultiline && !value && group !== "f47x") {
      warnings.push(`${label}: empty — narrative fields are rarely blank on a real report, worth a check.`);
    }
    if (value) FF.writeGroup(group, report, value);
  }

  return { report, warnings };
}
