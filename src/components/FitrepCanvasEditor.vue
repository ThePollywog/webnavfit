<script setup>
import { reactive, ref, computed, onMounted } from "vue";
import {
  mdiClose,
  mdiDownload,
  mdiFilePdfBox,
  mdiFormTextbox,
  mdiFormatText,
  mdiMagnifyMinusOutline,
  mdiMagnifyPlusOutline,
  mdiSignatureFreehand,
} from "@mdi/js";
import FIELDS from "../lib/fields-blank.json";
import * as FF from "../lib/fitrepFields.js";
import * as Calc from "../lib/calc.js";
import { REPORT_TYPES } from "../lib/model.js";
import { reportPdfBytes, stampAnnotations, downloadPdf } from "../lib/pdf.js";
import { renderPdfPages } from "../lib/pdfRender.js";
import { readFormFields, fillFormFields } from "../lib/pdfForm.js";

const props = defineProps({
  // FITREP mode: edit a report on the official form.
  report: { type: Object, default: null },
  // PDF mode: annotate an arbitrary uploaded PDF (Uint8Array).
  pdfBytes: { type: Object, default: null },
  pdfName: { type: String, default: "document.pdf" },
});
const emit = defineEmits(["close", "save"]);

// Which system are we in? A report → FITREP form editing; else uploaded-PDF mode.
const pdfMode = computed(() => !props.report && !!props.pdfBytes);

const dialog = ref(true);
const zoom = ref(1.15);
const PX = 96 / 72;                 // pt→px at 100%

// working copy of the report (FITREP mode); PDF mode carries only annotations.
const form = reactive(
  props.report ? JSON.parse(JSON.stringify(props.report)) : { _annotations: [] }
);

// ---- FITREP-mode derived bits ----
const rt = props.report ? (REPORT_TYPES[form.ReportType] || { label: form.ReportType, form: "" }) : null;
const memberAvg = computed(() => (props.report ? Calc.memberTraitAverage(form) : null));

// ============================================================
// PAGES: a unified model so both modes share rendering + annotations.
// Each page: { num, ptW, ptH, bg (img src), widgets:[] }
// FITREP mode uses the two official form images (612×792) with form widgets.
// PDF mode renders the uploaded PDF's pages to images (no widgets).
// ============================================================
const pages = ref([]);
const loading = ref(pdfMode.value);
const loadErr = ref("");

// ---- uploaded-PDF AcroForm fields (PDF mode) ----
// pdfFields: [{ name, type, value, options, widgets:[{page,x,y,w,h}] }]
// pdfFieldValues: reactive { [name]: value } bound to the on-page inputs.
const pdfFields = ref([]);
const pdfFieldValues = reactive({});
const hasPdfForm = computed(() => pdfFields.value.length > 0);

const title = computed(() => {
  if (pdfMode.value) return props.pdfName || "document.pdf";
  return (rt ? rt.label : "") + " — " + (FF.readGroup("f01x", form) || "unnamed");
});

onMounted(async () => {
  if (pdfMode.value) {
    try {
      const rendered = await renderPdfPages(props.pdfBytes, 2);
      pages.value = rendered.map((p, i) => ({
        num: i + 1, ptW: p.ptW, ptH: p.ptH, bg: p.dataUrl, widgets: [],
      }));
      if (!pages.value.length) loadErr.value = "This PDF has no pages.";
      // Detect fillable AcroForm fields and seed the editable values.
      try {
        const { fields } = await readFormFields(props.pdfBytes);
        pdfFields.value = fields;
        fields.forEach((f) => { pdfFieldValues[f.name] = f.value; });
      } catch { pdfFields.value = []; }
    } catch (e) {
      loadErr.value = "Could not open PDF: " + (e.message || e);
    } finally {
      loading.value = false;
    }
  } else {
    pages.value = [1, 2].map((pn) => ({
      num: pn, ptW: 612, ptH: 792, bg: `form-bg${pn}.png`,
      widgets: FIELDS.filter((f) => f.page === pn && f.group !== "FormTitle"),
    }));
  }
});

function pageByNum(pn) { return pages.value.find((p) => p.num === pn); }

// Uploaded-PDF form widgets on a given page, flattened to one entry per widget
// (a field may have several widgets across pages). Each carries its parent
// field's name/type/options so the overlay input can bind + render correctly.
function pdfWidgetsOnPage(pn) {
  const out = [];
  for (const f of pdfFields.value) {
    (f.widgets || []).forEach((w, i) => {
      if (w.page === pn) out.push({ ...w, key: f.name + "#" + i, name: f.name, ftype: f.type, options: f.options });
    });
  }
  return out;
}
function pdfFieldFontPx(w) { return Math.max(8, Math.min(15, w.h * PX * zoom.value * 0.62)); }

// convert a widget rect (pt, top-left) to CSS px at current zoom. A field may
// carry editor-only overrides (editorY/editorH) when its on-screen textarea
// should sit differently than where the PDF generator draws the text (e.g. a
// narrative that wraps around an inset box in the PDF).
function boxStyle(f) {
  const s = PX * zoom.value;
  const left = (f.editorX != null ? f.editorX : f.x) * s;
  const top = (f.editorY != null ? f.editorY : f.y) * s;
  const width = (f.editorW != null ? f.editorW : f.w) * s;
  const height = (f.editorH != null ? f.editorH : f.h) * s;
  return {
    left: left + "px", top: top + "px",
    width: width + "px", height: height + "px",
  };
}
function pageStyle(pg) {
  const s = PX * zoom.value;
  return { width: pg.ptW * s + "px", height: pg.ptH * s + "px" };
}
function fontPx(f) { return (f.size || 12) * PX * zoom.value; }
// line-height (px) for a multiline field's editable overlay, matching the PDF's
// per-line pitch so wrapped text in the textarea tracks the generated output.
function linePx(f) { return (f.pitch || (f.size || 12) + 1.5) * PX * zoom.value; }

// --- per-group helpers (FITREP widgets) ---
function isText(g) { return !!FF.TEXT_FIELD[g] || g === "f44x" || g === "f47x"; }
function isCheck(g) { return !!FF.CHECK_FIELD[g]; }
function isRadio(g) { return FF.isRadioGroup(g); }
function isMultiline(g) { return FF.MULTILINE.has(g); }

function textVal(g) { return FF.readGroup(g, form); }
function setText(g, v) { FF.writeGroup(g, form, v); }

function checkOn(g) { return FF.readGroup(g, form) === true; }
function toggleCheck(g) { FF.writeGroup(g, form, !checkOn(g)); }

function radioOn(f) { return FF.readGroup(f.group, form) === Number(f.on); }
function selectRadio(f) {
  const cur = FF.readGroup(f.group, form);
  FF.writeGroup(f.group, form, cur === Number(f.on) ? -1 : Number(f.on));
}

function computedBox(g) {
  if (g === "f45memberx") return Calc.fmt(memberAvg.value, 2);
  return "";
}

const activeGroup = ref(null);   // for the helper label

// ============================================================
// FREE-FORM ANNOTATIONS (draggable text / signatures) — shared by both modes.
// Stored on form._annotations as { id, page, xPct, yPct, text, size, bold, sig }.
// xPct/yPct are fractions of THAT page (top-left of the text), mapping 1:1 to
// the PDF generator/stamper regardless of zoom or page size.
// ============================================================
if (!Array.isArray(form._annotations)) form._annotations = [];
let annSeq = form._annotations.reduce((m, a) => Math.max(m, a.id || 0), 0);

const placing = ref(null);   // 'text' | 'sig' | null — click a page to drop one
const selectedAnn = ref(null);

function annsForPage(pn) { return form._annotations.filter((a) => a.page === pn); }

function annStyle(a) {
  const pg = pageByNum(a.page); if (!pg) return {};
  const s = PX * zoom.value;
  return { left: a.xPct * pg.ptW * s + "px", top: a.yPct * pg.ptH * s + "px" };
}
function annFontPx(a) { return (a.sig ? (a.size || 20) : (a.size || 11)) * PX * zoom.value; }

function startPlace(kind) { placing.value = placing.value === kind ? null : kind; }

// click on a page while in placing mode → create an annotation there
function onPageClick(pn, ev) {
  if (!placing.value) return;
  const pg = pageByNum(pn); if (!pg) return;
  const rect = ev.currentTarget.getBoundingClientRect();
  const s = PX * zoom.value;
  const xPct = (ev.clientX - rect.left) / (pg.ptW * s);
  const yPct = (ev.clientY - rect.top) / (pg.ptH * s);
  const ann = {
    id: ++annSeq, page: pn, xPct, yPct,
    text: placing.value === "sig" ? "Signature" : "Text",
    size: placing.value === "sig" ? 20 : 11,
    bold: false, sig: placing.value === "sig",
  };
  form._annotations.push(ann);
  selectedAnn.value = ann.id;
  placing.value = null;
}

function editAnn(a, ev) { a.text = ev.target.value; }
function deleteAnn(a) {
  const i = form._annotations.indexOf(a);
  if (i >= 0) form._annotations.splice(i, 1);
  if (selectedAnn.value === a.id) selectedAnn.value = null;
}

// drag handling
let drag = null;
function startDrag(a, ev) {
  if (ev.target.tagName === "INPUT") return;   // let the input take focus/typing
  const pg = pageByNum(a.page); if (!pg) return;
  selectedAnn.value = a.id;
  const pageEl = ev.currentTarget.closest(".cv-page");
  const rect = pageEl.getBoundingClientRect();
  const s = PX * zoom.value;
  drag = { a, pg, rect, s, offX: ev.clientX - (rect.left + a.xPct * pg.ptW * s), offY: ev.clientY - (rect.top + a.yPct * pg.ptH * s) };
  window.addEventListener("mousemove", onDrag);
  window.addEventListener("mouseup", endDrag);
  ev.preventDefault();
}
function onDrag(ev) {
  if (!drag) return;
  const { a, pg, rect, s, offX, offY } = drag;
  a.xPct = Math.max(0, Math.min(0.98, (ev.clientX - rect.left - offX) / (pg.ptW * s)));
  a.yPct = Math.max(0, Math.min(0.99, (ev.clientY - rect.top - offY) / (pg.ptH * s)));
}
function endDrag() {
  drag = null;
  window.removeEventListener("mousemove", onDrag);
  window.removeEventListener("mouseup", endDrag);
}

// ---- save / download ----
function safeName(s) { return String(s || "document").replace(/[^A-Za-z0-9]+/g, "_"); }

async function save(close) {
  if (!pdfMode.value) emit("save", JSON.parse(JSON.stringify(form)));
  if (close) dialog.value = false;
}
async function saveAndDownload() {
  if (pdfMode.value) {
    // Fill the edited AcroForm fields, then stamp any free-form annotations.
    let bytes = props.pdfBytes.slice(0);
    if (hasPdfForm.value) bytes = await fillFormFields(bytes, { ...pdfFieldValues });
    if (form._annotations.length) bytes = await stampAnnotations(bytes, form._annotations);
    const base = (props.pdfName || "document.pdf").replace(/\.pdf$/i, "");
    downloadPdf(bytes, `${safeName(base)}-edited.pdf`);
    return;
  }
  emit("save", JSON.parse(JSON.stringify(form)));
  const bytes = await reportPdfBytes(form, {});
  const nm = safeName(FF.readGroup("f01x", form) || "report");
  downloadPdf(bytes, `NAVPERS_1610-2_${nm}.pdf`);
}
</script>

<template>
  <v-dialog v-model="dialog" fullscreen scrollable @after-leave="emit('close')">
    <v-card class="d-flex flex-column" style="height:100vh">
      <v-toolbar color="surface" density="comfortable" flat class="cv-bar">
        <v-icon :icon="pdfMode ? mdiFilePdfBox : mdiFormTextbox" size="20" color="primary" class="ms-4" />
        <v-toolbar-title class="salt-heading text-subtitle-1 ms-1">{{ title }}
          <span class="text-caption ms-2" style="opacity: 0.7">
            <template v-if="pdfMode">
              uploaded PDF ·
              <template v-if="hasPdfForm">edit fields, add text &amp; signatures</template>
              <template v-else>add text &amp; signatures</template>
            </template>
            <template v-else>{{ rt.form }} · click any field to edit</template>
          </span>
        </v-toolbar-title>
        <v-spacer />
        <span v-if="!pdfMode" class="text-caption me-3">
          Member Avg: <b class="mono">{{ memberAvg == null ? "—" : Calc.fmt(memberAvg,2) }}</b>
        </span>
        <v-btn size="small" :variant="placing==='text' ? 'flat' : 'text'" :color="placing==='text' ? 'primary' : undefined"
               :prepend-icon="mdiFormatText" @click="startPlace('text')">Add Text</v-btn>
        <v-btn size="small" :variant="placing==='sig' ? 'flat' : 'text'" :color="placing==='sig' ? 'primary' : undefined"
               :prepend-icon="mdiSignatureFreehand" @click="startPlace('sig')">Add Signature</v-btn>
        <v-divider vertical class="mx-2" />
        <v-btn variant="text" :icon="mdiMagnifyMinusOutline" aria-label="Zoom out" @click="zoom = Math.max(0.6, zoom - 0.15)" />
        <span class="mono text-caption mx-1">{{ Math.round(zoom*100) }}%</span>
        <v-btn variant="text" :icon="mdiMagnifyPlusOutline" aria-label="Zoom in" @click="zoom = Math.min(2, zoom + 0.15)" />
        <v-btn v-if="!pdfMode" variant="tonal" class="ms-3" @click="save(false)">Save</v-btn>
        <v-btn variant="flat" color="primary" class="ms-2" :prepend-icon="mdiDownload" @click="saveAndDownload">
          {{ pdfMode ? "Download PDF" : "Save & PDF" }}
        </v-btn>
        <v-btn variant="text" :icon="mdiClose" class="ms-1" aria-label="Close editor" @click="dialog=false" />
      </v-toolbar>

      <div class="cv-scroll">
        <div v-if="loading" class="cv-loading">
          <v-progress-circular indeterminate color="primary" size="42" />
          <div class="mt-3">Rendering PDF…</div>
        </div>
        <v-alert v-else-if="loadErr" type="warning" class="ma-6">{{ loadErr }}</v-alert>

        <div class="cv-hint" v-if="placing">Click on the page to place the {{ placing==='sig' ? 'signature' : 'text' }}.</div>
        <div v-else-if="activeGroup" class="cv-hint">{{ FF.LABEL[activeGroup] || activeGroup }}</div>

        <div v-for="pg in pages" :key="pg.num" class="cv-page" :class="{ placing: !!placing }" :style="pageStyle(pg)"
             @click="onPageClick(pg.num, $event)">
          <img :src="pg.bg" class="cv-bg" :style="pageStyle(pg)" alt="" draggable="false" />

          <template v-for="f in pg.widgets" :key="f.id">
            <!-- radio mark (traits, duty status, promotion, statement) -->
            <div v-if="f.type==='check' && isRadio(f.group)"
                 class="cv-mark" :class="{ on: radioOn(f) }" :style="boxStyle(f)"
                 :title="FF.LABEL[f.group] || f.group"
                 @mouseenter="activeGroup=f.group" @click="selectRadio(f)">
              <span v-if="radioOn(f)">✕</span>
            </div>

            <!-- standalone checkbox -->
            <div v-else-if="f.type==='check' && isCheck(f.group)"
                 class="cv-mark" :class="{ on: checkOn(f.group) }" :style="boxStyle(f)"
                 :title="FF.LABEL[f.group] || f.group"
                 @mouseenter="activeGroup=f.group" @click="toggleCheck(f.group)">
              <span v-if="checkOn(f.group)">✕</span>
            </div>

            <!-- computed average box (read-only) -->
            <div v-else-if="f.group==='f45memberx' || f.group==='f45groupx'"
                 class="cv-computed" :style="boxStyle(f)">{{ computedBox(f.group) }}</div>

            <!-- multi-line narrative: match the field's true size + line pitch -->
            <textarea v-else-if="isText(f.group) && isMultiline(f.group)"
                      class="cv-input cv-area"
                      :style="[boxStyle(f), { fontSize: fontPx(f)+'px', lineHeight: linePx(f)+'px' }]"
                      :value="textVal(f.group)"
                      @focus="activeGroup=f.group"
                      @input="setText(f.group, $event.target.value)"
                      :placeholder="FF.LABEL[f.group]||''" />

            <!-- single-line text -->
            <input v-else-if="isText(f.group)" type="text"
                   class="cv-input" :style="[boxStyle(f), { fontSize: fontPx(f)+'px' }]"
                   :value="textVal(f.group)"
                   @focus="activeGroup=f.group"
                   @input="setText(f.group, $event.target.value)"
                   :title="FF.LABEL[f.group]||f.group" />
          </template>

          <!-- uploaded-PDF AcroForm fields: editable inputs on each widget -->
          <template v-for="w in pdfWidgetsOnPage(pg.num)" :key="w.key">
            <!-- checkbox -->
            <div v-if="w.ftype==='checkbox'" class="cv-pdf-check" :style="boxStyle(w)"
                 :title="w.name" @click.stop="pdfFieldValues[w.name] = !pdfFieldValues[w.name]">
              <span v-if="pdfFieldValues[w.name]">✕</span>
            </div>

            <!-- dropdown / option list / radio → select of options -->
            <select v-else-if="(w.ftype==='dropdown' || w.ftype==='optionlist' || w.ftype==='radio') && w.options"
                    class="cv-pdf-input" :style="[boxStyle(w), { fontSize: pdfFieldFontPx(w)+'px' }]"
                    :title="w.name" v-model="pdfFieldValues[w.name]" @click.stop>
              <option value=""></option>
              <option v-for="o in w.options" :key="o" :value="o">{{ o }}</option>
            </select>

            <!-- text field -->
            <input v-else type="text" class="cv-pdf-input" :style="[boxStyle(w), { fontSize: pdfFieldFontPx(w)+'px' }]"
                   :title="w.name" v-model="pdfFieldValues[w.name]" @click.stop />
          </template>

          <!-- draggable free-form annotations -->
          <div v-for="a in annsForPage(pg.num)" :key="a.id"
               class="cv-ann" :class="{ sel: selectedAnn===a.id, sig: a.sig }"
               :style="annStyle(a)"
               @mousedown.stop="startDrag(a, $event)" @click.stop>
            <input class="cv-ann-input" :style="{ fontSize: annFontPx(a)+'px' }"
                   :value="a.text" @input="editAnn(a, $event)"
                   @focus="selectedAnn=a.id" />
            <div class="cv-ann-tools" v-if="selectedAnn===a.id">
              <button class="cv-ann-btn" title="Bigger" @mousedown.stop @click.stop="a.size=(a.size||11)+2">A+</button>
              <button class="cv-ann-btn" title="Smaller" @mousedown.stop @click.stop="a.size=Math.max(6,(a.size||11)-2)">A−</button>
              <button v-if="!a.sig" class="cv-ann-btn" title="Bold" :class="{active:a.bold}" @mousedown.stop @click.stop="a.bold=!a.bold">B</button>
              <button class="cv-ann-btn del" title="Delete" @mousedown.stop @click.stop="deleteAnn(a)">✕</button>
            </div>
          </div>
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/*
 * Two colour systems meet in this component and only one of them is themeable.
 *
 * The chrome (toolbar, alerts, buttons) is theme-driven like the rest of the app.
 * Everything from `--cv-*` down is painted ON a sheet of white paper — the
 * official form image, or a rendered page of someone's PDF — so it is fixed in
 * both themes. Tying the field ink to `on-surface` would put pale grey text on
 * white paper the moment dark mode is on, and the whole point of this editor is
 * that what you see is what the PDF will contain.
 *
 * The values are the light theme's navy and green, so light mode is a seamless
 * continuation of the palette and dark mode reads as a lit page on a dark desk.
 */
.cv-bar { border-bottom: 2px solid rgb(var(--v-theme-accent)); }

.cv-page,
.cv-scroll {
  --cv-ink: #0A2E5C;          /* primary navy — what the PDF will show */
  --cv-edit: 10, 46, 92;      /* the same navy, for field tints */
  --cv-form: 30, 107, 69;     /* success green — an uploaded PDF's own fields */
}

/* The mat around the page: a fixed dark neutral in both themes. It frames white
   paper, so it is not a themeable surface — `background` would leave a white
   page on a near-white field in light mode with no visible page edge. */
.cv-scroll {
  flex: 1; min-height: 0; overflow: auto; background: #33383F; padding: 24px;
  display: flex; flex-direction: column; align-items: center; gap: 24px;
}
.cv-loading {
  color: #E8EDF4; display: flex; flex-direction: column; align-items: center;
  margin-top: 12vh; font-size: 14px;
}
.cv-hint {
  position: sticky; top: 0; align-self: flex-start; z-index: 5;
  background: var(--cv-ink); color: #fff;
  font-family: var(--salt-mono); font-size: 0.6875rem; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 10px;
}
.cv-page { position: relative; background: #fff; box-shadow: 0 3px 16px rgba(0, 0, 0, 0.5); flex: 0 0 auto; }
.cv-bg { position: absolute; left: 0; top: 0; user-select: none; pointer-events: none; }

.cv-input {
  position: absolute; border: 1px solid transparent; background: rgba(var(--cv-edit), 0.06);
  color: var(--cv-ink); font-family: var(--salt-mono); padding: 0; line-height: 1;
  outline: none; box-sizing: border-box;
}
.cv-input:hover { border-color: rgba(var(--cv-edit), 0.5); background: rgba(var(--cv-edit), 0.12); }
.cv-input:focus {
  border-color: var(--cv-ink); background: #fff;
  box-shadow: 0 0 0 2px rgba(var(--cv-edit), 0.3); z-index: 10;
}
/* multiline overlay: font-size + line-height come from inline style (per field);
   let it scroll if the text exceeds the block height. */
.cv-area { resize: none; overflow: auto; white-space: pre-wrap; }

.cv-mark {
  position: absolute; display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--cv-ink); font-weight: 700; box-sizing: border-box;
  border: 1px solid transparent;
}
.cv-mark:hover { background: rgba(var(--cv-edit), 0.18); border-color: rgba(var(--cv-edit), 0.5); }
/* A faint wash behind a marked box. The ✕ alone is thin at low zoom, and on a
   form of forty checkboxes the tint is what makes the selected one findable
   without reading every glyph. */
.cv-mark.on { background: rgba(var(--cv-edit), 0.1); }
.cv-mark span { font-size: 90%; line-height: 1; }

.cv-computed {
  position: absolute; display: flex; align-items: center; justify-content: center;
  font-family: var(--salt-mono); color: var(--cv-ink); font-weight: 700; pointer-events: none;
}

/* Uploaded-PDF AcroForm overlays keep their own green tint. These are fields the
   PDF itself declares, not ones this app placed, and green vs navy is the only
   cue telling you which is which. */
.cv-pdf-input {
  position: absolute; border: 1px solid rgba(var(--cv-form), 0.45); background: rgba(var(--cv-form), 0.08);
  color: var(--cv-ink); font-family: var(--salt-sans); padding: 0 2px; line-height: 1;
  outline: none; box-sizing: border-box;
}
.cv-pdf-input:hover { background: rgba(var(--cv-form), 0.15); }
.cv-pdf-input:focus {
  border-color: var(--cv-ink); background: #fff;
  box-shadow: 0 0 0 2px rgba(var(--cv-edit), 0.3); z-index: 10;
}
.cv-pdf-check {
  position: absolute; display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--cv-ink); font-weight: 700; box-sizing: border-box;
  border: 1px solid rgba(var(--cv-form), 0.5); background: rgba(var(--cv-form), 0.08);
}
.cv-pdf-check:hover { background: rgba(var(--cv-form), 0.2); }
.cv-pdf-check span { font-size: 90%; line-height: 1; }

/* placing mode: page shows crosshair so it's clear you click to drop */
.cv-page.placing { cursor: crosshair; }

/* free-form annotations */
.cv-ann {
  position: absolute; cursor: move; white-space: nowrap;
  border: 1px dashed transparent; padding: 0;
}
.cv-ann:hover { border-color: rgba(var(--cv-edit), 0.6); }
.cv-ann.sel { border-color: var(--cv-ink); border-style: solid; }
.cv-ann-input {
  border: none; background: transparent; outline: none; padding: 0 1px;
  color: var(--cv-ink); font-family: var(--salt-sans); line-height: 1.1;
  cursor: text; min-width: 40px;
}
.cv-ann.sig .cv-ann-input { font-family: "Times New Roman", Georgia, serif; font-style: italic; }
.cv-ann.sel .cv-ann-input { background: #fff; }
.cv-ann-tools {
  position: absolute; top: -26px; left: 0; display: flex; gap: 2px;
  background: var(--cv-ink); padding: 2px;
}
.cv-ann-btn {
  border: none; background: transparent; color: #fff; font-size: 11px; font-weight: 700;
  width: 22px; height: 20px; cursor: pointer;
}
.cv-ann-btn:hover { background: rgba(255, 255, 255, 0.2); }
/* Gold for the engaged toggle — the accent, on the one control that has a state. */
.cv-ann-btn.active { background: #C8A951; color: var(--cv-ink); }
.cv-ann-btn.del { color: #F08A80; }
</style>
