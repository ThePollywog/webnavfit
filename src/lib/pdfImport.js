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

function itemsInRow(items, f, padY) {
  return items.filter((it) => {
    const midY = it.yTop + it.height / 2;
    return midY >= f.y - padY && midY <= f.y + f.h + padY;
  });
}

function extractSingleLine(pages, f) {
  const items = widgetItems(pages, f).filter(
    (it) => it.xTop >= f.x - 3 && it.xTop <= f.x + f.w + 30
  );
  return joinLineItems(itemsInRow(items, f, Math.max(3, f.h * 0.3)));
}

// Bucket items into pitch-sized lines within the box, then rejoin: a real
// eNavFit export's line breaks are ITS OWN word-wrap, not the writer's
// original paragraph breaks, so consecutive non-empty lines are collapsed
// back into flowing text with a single space; a genuinely empty line (a real
// blank line the writer left) is kept as a paragraph break.
function extractMultiline(pages, f) {
  const items = widgetItems(pages, f).filter(
    (it) => it.xTop >= f.x - 3 && it.xTop <= f.x + f.w + 30
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
    if (isMultiline && !value) warnings.push(`${label}: empty — narrative fields are rarely blank on a real report, worth a check.`);
    if (value) FF.writeGroup(group, report, value);
  }

  return { report, warnings };
}
