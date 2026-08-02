/*
 * pdfForm.js — read and fill the AcroForm fields of an arbitrary uploaded PDF,
 * fully in the browser with pdf-lib. Powers the Open PDF view's field editing:
 * detect fillable fields (with on-page position), let the user edit them, then
 * fill + re-save.
 */
import {
  PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList,
  PDFRadioGroup,
} from "pdf-lib";

function fieldType(f) {
  if (f instanceof PDFTextField) return "text";
  if (f instanceof PDFCheckBox) return "checkbox";
  if (f instanceof PDFRadioGroup) return "radio";
  if (f instanceof PDFDropdown) return "dropdown";
  if (f instanceof PDFOptionList) return "optionlist";
  return "unknown";
}

// Current value of a field, in the shape our editor binds to.
function readValue(f, type) {
  try {
    if (type === "text") return f.getText() || "";
    if (type === "checkbox") return f.isChecked();
    if (type === "radio") return f.getSelected() || "";
    if (type === "dropdown") return (f.getSelected() || [])[0] || "";
    if (type === "optionlist") return (f.getSelected() || [])[0] || "";
  } catch { /* fields with no value throw — treat as empty */ }
  return type === "checkbox" ? false : "";
}

/**
 * Detect the fillable form fields of a PDF, with each on-page widget's rectangle
 * so the editor can overlay an input right on top of it.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<{
 *   hasForm: boolean,
 *   fields: Array<{
 *     name: string, type: string, value: (string|boolean),
 *     options: string[]|null,
 *     widgets: Array<{ page: number, x: number, y: number, w: number, h: number }>
 *   }>
 * }>}  widget rects are in PDF points, TOP-LEFT origin (matches the editor).
 */
export async function readFormFields(bytes) {
  const doc = await PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
  let form;
  try { form = doc.getForm(); } catch { return { hasForm: false, fields: [] }; }
  const pages = doc.getPages();
  const pageRefByHash = new Map();     // widget page ref → 1-based index
  pages.forEach((p, i) => pageRefByHash.set(p.ref, i));

  const out = [];
  for (const f of form.getFields()) {
    const type = fieldType(f);
    if (type === "unknown") continue;
    let options = null;
    try {
      if (type === "dropdown" || type === "optionlist") options = f.getOptions();
      if (type === "radio") options = f.getOptions();
    } catch { options = null; }

    // Locate each widget of this field on its page.
    const widgets = [];
    for (const w of f.acroField.getWidgets()) {
      const rect = w.getRectangle();                 // bottom-left origin, points
      const pRef = w.P();                             // page ref this widget sits on
      let pageIndex = pRef ? pageRefByHash.get(pRef) : undefined;
      if (pageIndex === undefined) pageIndex = 0;     // fall back to first page
      const ph = pages[pageIndex].getSize().height;
      widgets.push({
        page: pageIndex + 1,
        x: rect.x, y: ph - rect.y - rect.height,      // → top-left origin
        w: rect.width, h: rect.height,
      });
    }

    out.push({ name: f.getName(), type, value: readValue(f, type), options, widgets });
  }
  return { hasForm: out.length > 0, fields: out };
}

/**
 * Fill the AcroForm fields of a PDF and return the saved bytes.
 * @param {Uint8Array} bytes
 * @param {Object<string, string|boolean>} values  keyed by field name
 * @param {{flatten?: boolean}} [opts]
 */
export async function fillFormFields(bytes, values, { flatten = false } = {}) {
  const doc = await PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
  const form = doc.getForm();
  for (const f of form.getFields()) {
    const name = f.getName();
    if (!(name in values)) continue;
    const v = values[name];
    const type = fieldType(f);
    try {
      if (type === "text") f.setText(v == null ? "" : String(v));
      else if (type === "checkbox") { v ? f.check() : f.uncheck(); }
      else if (type === "radio") { if (v) f.select(String(v)); else f.clear(); }
      else if (type === "dropdown") { if (v) f.select(String(v)); else f.clear(); }
      else if (type === "optionlist") { if (v) f.select(String(v)); else f.clear(); }
    } catch { /* skip values a field rejects (e.g. option not in list) */ }
  }
  if (flatten) form.flatten();
  return doc.save();
}
