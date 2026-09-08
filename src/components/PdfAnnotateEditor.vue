<script setup>
import { reactive, ref, computed, onMounted, nextTick } from "vue";
import { useDisplay } from "vuetify";
import {
  mdiClose,
  mdiDotsVertical,
  mdiDownload,
  mdiFilePdfBox,
  mdiFitToPageOutline,
  mdiFormatText,
  mdiMagnifyMinusOutline,
  mdiMagnifyPlusOutline,
  mdiSignatureFreehand,
} from "@mdi/js";
import { stampAnnotations, downloadPdf } from "../lib/pdf.js";
import { renderPdfPages } from "../lib/pdfRender.js";
import { readFormFields, fillFormFields } from "../lib/pdfForm.js";

// Annotate/fill an arbitrary uploaded PDF — sign it, fill its own AcroForm
// fields if it has any, and drop free-form text/signatures anywhere on the
// page. Unrelated to any WEBNAVFIT report; that editing surface lives in
// ReportEditor.vue's "Direct Edit" tab (see ReportCanvasPanel.vue) — this
// component used to do double duty for both, which is why it isn't called
// FitrepCanvasEditor any more.
const props = defineProps({
  pdfBytes: { type: Object, required: true },
  pdfName: { type: String, default: "document.pdf" },
});
const emit = defineEmits(["close"]);

const { mdAndUp } = useDisplay();

const dialog = ref(true);
const zoom = ref(1.15);
const PX = 96 / 72;                 // pt→px at 100%

// Zoom floor is well under the old 0.6: fitting a 612pt page into a 390px phone
// needs about 0.42, and clamping above that would defeat fit-to-width.
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2;
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

// The scroll container, measured for fit-to-width.
const scrollEl = ref(null);

/**
 * Scale the page so its full width is visible. This is the only sane default on
 * a phone: at 1.15 a 612pt page is 938px wide, so a 390px screen opens showing
 * the left third of the form with no indication the rest exists.
 */
function fitWidth() {
  const el = scrollEl.value;
  const pg = pages.value[0];
  if (!el || !pg) return;
  // clientWidth excludes the scrollbar; subtract the container's own padding.
  const cs = getComputedStyle(el);
  const pad = parseFloat(cs.paddingLeft || 0) + parseFloat(cs.paddingRight || 0);
  const avail = el.clientWidth - pad;
  if (avail > 0) zoom.value = clampZoom(avail / (pg.ptW * PX));
}

// carries only free-form annotations; there's no report field data here.
const form = reactive({ _annotations: [] });

// Each page: { num, ptW, ptH, bg (img src) }
const pages = ref([]);
const loading = ref(true);
const loadErr = ref("");

// pdfFields: [{ name, type, value, options, widgets:[{page,x,y,w,h}] }]
// pdfFieldValues: reactive { [name]: value } bound to the on-page inputs.
const pdfFields = ref([]);
const pdfFieldValues = reactive({});
const hasPdfForm = computed(() => pdfFields.value.length > 0);

const title = computed(() => props.pdfName || "document.pdf");

onMounted(async () => {
  try {
    const rendered = await renderPdfPages(props.pdfBytes, 2);
    pages.value = rendered.map((p, i) => ({ num: i + 1, ptW: p.ptW, ptH: p.ptH, bg: p.dataUrl }));
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
  if (!mdAndUp.value) {
    await nextTick();
    fitWidth();
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

function boxStyle(f) {
  const s = PX * zoom.value;
  return {
    left: f.x * s + "px", top: f.y * s + "px",
    width: f.w * s + "px", height: f.h * s + "px",
  };
}
function pageStyle(pg) {
  const s = PX * zoom.value;
  return { width: pg.ptW * s + "px", height: pg.ptH * s + "px" };
}

// ============================================================
// FREE-FORM ANNOTATIONS (draggable text / signatures).
// Stored on form._annotations as { id, page, xPct, yPct, text, size, bold, sig }.
// xPct/yPct are fractions of THAT page (top-left of the text), mapping 1:1 to
// the PDF stamper regardless of zoom or page size.
// ============================================================
let annSeq = 0;

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

// ---- drag handling ----
// Pointer events, not mouse events. A touch never emits mousemove/mouseup, so
// the mouse-only version meant annotations and signatures — the entire point of
// this editor on a phone — could be placed but never repositioned.
// setPointerCapture routes every subsequent move to the element we grabbed even
// when the finger outruns it, which replaces the window-level listeners.
//
// Called from two places: the annotation's border, and the .cv-ann-grip handle.
// Either way `ev.currentTarget` is the capture element and pointermove bubbles
// from it back up to .cv-ann, so the maths below is the same for both.
let drag = null;
function startDrag(a, ev) {
  if (ev.target.tagName === "INPUT") return;   // let the input take focus/typing
  const pg = pageByNum(a.page); if (!pg) return;
  selectedAnn.value = a.id;
  const el = ev.currentTarget;
  const rect = el.closest(".cv-page").getBoundingClientRect();
  const s = PX * zoom.value;
  drag = {
    a, pg, rect, s, el, id: ev.pointerId,
    offX: ev.clientX - (rect.left + a.xPct * pg.ptW * s),
    offY: ev.clientY - (rect.top + a.yPct * pg.ptH * s),
  };
  el.setPointerCapture?.(ev.pointerId);
  ev.preventDefault();
}
function onDrag(ev) {
  if (!drag || ev.pointerId !== drag.id) return;
  const { a, pg, rect, s, offX, offY } = drag;
  a.xPct = Math.max(0, Math.min(0.98, (ev.clientX - rect.left - offX) / (pg.ptW * s)));
  a.yPct = Math.max(0, Math.min(0.99, (ev.clientY - rect.top - offY) / (pg.ptH * s)));
  // Stop the page from panning under the finger while it is moving a widget.
  ev.preventDefault();
}
function endDrag(ev) {
  if (drag && ev?.pointerId !== undefined) drag.el?.releasePointerCapture?.(ev.pointerId);
  drag = null;
}

// ---- download ----
function safeName(s) { return String(s || "document").replace(/[^A-Za-z0-9]+/g, "_"); }

async function download() {
  // Fill the edited AcroForm fields, then stamp any free-form annotations.
  let bytes = props.pdfBytes.slice(0);
  if (hasPdfForm.value) bytes = await fillFormFields(bytes, { ...pdfFieldValues });
  if (form._annotations.length) bytes = await stampAnnotations(bytes, form._annotations);
  const base = (props.pdfName || "document.pdf").replace(/\.pdf$/i, "");
  downloadPdf(bytes, `${safeName(base)}-edited.pdf`);
}
</script>

<template>
  <v-dialog v-model="dialog" fullscreen scrollable @after-leave="emit('close')">
    <v-card class="d-flex flex-column cv-shell">
      <!-- Desktop toolbar: title, the two placing modes, zoom, and download. -->
      <v-toolbar v-if="mdAndUp" color="surface" density="comfortable" flat class="cv-bar">
        <v-icon :icon="mdiFilePdfBox" size="20" color="primary" class="ms-4" />
        <v-toolbar-title class="salt-heading text-subtitle-1 ms-1">{{ title }}
          <span class="text-caption ms-2" style="opacity: 0.7">
            uploaded PDF ·
            <template v-if="hasPdfForm">edit fields, add text &amp; signatures</template>
            <template v-else>add text &amp; signatures</template>
          </span>
        </v-toolbar-title>
        <v-spacer />
        <v-btn size="small" :variant="placing==='text' ? 'flat' : 'text'" :color="placing==='text' ? 'primary' : undefined"
               :prepend-icon="mdiFormatText" @click="startPlace('text')">Add Text</v-btn>
        <v-btn size="small" :variant="placing==='sig' ? 'flat' : 'text'" :color="placing==='sig' ? 'primary' : undefined"
               :prepend-icon="mdiSignatureFreehand" @click="startPlace('sig')">Add Signature</v-btn>
        <v-divider vertical class="mx-2" />
        <v-btn variant="text" :icon="mdiMagnifyMinusOutline" aria-label="Zoom out" @click="zoom = clampZoom(zoom - 0.15)" />
        <span class="mono text-caption mx-1">{{ Math.round(zoom*100) }}%</span>
        <v-btn variant="text" :icon="mdiMagnifyPlusOutline" aria-label="Zoom in" @click="zoom = clampZoom(zoom + 0.15)" />
        <v-btn variant="text" :icon="mdiFitToPageOutline" aria-label="Fit page width" title="Fit width" @click="fitWidth" />
        <v-btn variant="flat" color="primary" class="ms-2" :prepend-icon="mdiDownload" @click="download">
          Download PDF
        </v-btn>
        <v-btn variant="text" :icon="mdiClose" class="ms-1" aria-label="Close editor" @click="dialog=false" />
      </v-toolbar>

      <!-- Phone toolbar: two rows, identity/exit then the tools. -->
      <template v-else>
        <v-toolbar color="surface" density="compact" flat>
          <v-icon :icon="mdiFilePdfBox" size="18" color="primary" class="ms-3" />
          <v-toolbar-title class="salt-heading text-body-2 ms-1 text-truncate">{{ title }}</v-toolbar-title>
          <v-menu location="bottom end">
            <template #activator="{ props }">
              <v-btn v-bind="props" :icon="mdiDotsVertical" variant="text" size="small" aria-label="More actions" />
            </template>
            <v-list density="compact" min-width="200">
              <v-list-item @click="download">
                <template #prepend><v-icon :icon="mdiDownload" size="20" /></template>
                <v-list-item-title>Download PDF</v-list-item-title>
              </v-list-item>
              <v-list-item @click="fitWidth">
                <template #prepend><v-icon :icon="mdiFitToPageOutline" size="20" /></template>
                <v-list-item-title>Fit width</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
          <v-btn variant="text" size="small" :icon="mdiClose" aria-label="Close editor" @click="dialog=false" />
        </v-toolbar>

        <v-toolbar color="surface" density="compact" flat class="cv-bar">
          <v-btn size="small" class="ms-1" :variant="placing==='text' ? 'flat' : 'text'"
                 :color="placing==='text' ? 'primary' : undefined"
                 :icon="mdiFormatText" aria-label="Add text" title="Add text" @click="startPlace('text')" />
          <v-btn size="small" :variant="placing==='sig' ? 'flat' : 'text'"
                 :color="placing==='sig' ? 'primary' : undefined"
                 :icon="mdiSignatureFreehand" aria-label="Add signature" title="Add signature" @click="startPlace('sig')" />
          <v-divider vertical class="mx-1" />
          <v-btn variant="text" size="small" :icon="mdiMagnifyMinusOutline" aria-label="Zoom out" @click="zoom = clampZoom(zoom - 0.15)" />
          <span class="mono text-caption" style="min-width: 3.2em; text-align: center">{{ Math.round(zoom*100) }}%</span>
          <v-btn variant="text" size="small" :icon="mdiMagnifyPlusOutline" aria-label="Zoom in" @click="zoom = clampZoom(zoom + 0.15)" />
          <v-spacer />
          <v-btn variant="flat" color="primary" size="small" class="me-1" :prepend-icon="mdiDownload" @click="download">
            PDF
          </v-btn>
        </v-toolbar>
      </template>

      <div class="cv-scroll" ref="scrollEl">
        <div v-if="loading" class="cv-loading">
          <v-progress-circular indeterminate color="primary" size="42" />
          <div class="mt-3">Rendering PDF…</div>
        </div>
        <v-alert v-else-if="loadErr" type="warning" class="ma-6">{{ loadErr }}</v-alert>

        <div class="cv-hint" v-if="placing">Click on the page to place the {{ placing==='sig' ? 'signature' : 'text' }}.</div>

        <div v-for="pg in pages" :key="pg.num" class="cv-page" :class="{ placing: !!placing }" :style="pageStyle(pg)"
             @click="onPageClick(pg.num, $event)">
          <img :src="pg.bg" class="cv-bg" :style="pageStyle(pg)" alt="" draggable="false" />

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
               @pointerdown.stop="startDrag(a, $event)"
               @pointermove="onDrag"
               @pointerup="endDrag"
               @pointercancel="endDrag"
               @click.stop>
            <input class="cv-ann-input" :style="{ fontSize: annFontPx(a)+'px' }"
                   :value="a.text" @input="editAnn(a, $event)"
                   @focus="selectedAnn=a.id" />
            <div class="cv-ann-tools" v-if="selectedAnn===a.id">
              <!-- Explicit drag handle. The text input fills the annotation edge
                   to edge, and startDrag has to ignore INPUT targets or the field
                   could never be typed in — which left only the 2px border as a
                   grab area. That is fiddly with a mouse and unhittable with a
                   finger, so the move affordance gets its own button. -->
              <button class="cv-ann-btn cv-ann-grip" title="Drag to move"
                      aria-label="Move annotation"
                      @pointerdown.stop="startDrag(a, $event)"
                      @mousedown.stop @click.stop>⠿</button>
              <button class="cv-ann-btn" title="Bigger" @pointerdown.stop @mousedown.stop @click.stop="a.size=(a.size||11)+2">A+</button>
              <button class="cv-ann-btn" title="Smaller" @pointerdown.stop @mousedown.stop @click.stop="a.size=Math.max(6,(a.size||11)-2)">A−</button>
              <button v-if="!a.sig" class="cv-ann-btn" title="Bold" :class="{active:a.bold}" @pointerdown.stop @mousedown.stop @click.stop="a.bold=!a.bold">B</button>
              <button class="cv-ann-btn del" title="Delete" @pointerdown.stop @mousedown.stop @click.stop="deleteAnn(a)">✕</button>
            </div>
          </div>
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/*
 * The chrome (toolbar, alerts, buttons) is theme-driven like the rest of the app.
 * Everything from `--cv-*` down is painted ON a sheet of white paper — a rendered
 * page of the uploaded PDF — so it is fixed in both themes. Tying the field ink
 * to `on-surface` would put pale grey text on white paper the moment dark mode
 * is on, and the whole point of this editor is that what you see is what the
 * downloaded PDF will contain.
 *
 * The values are the light theme's navy and green, so light mode is a seamless
 * continuation of the palette and dark mode reads as a lit page on a dark desk.
 */
/* height:100% rather than 100vh. Vuetify's fullscreen dialog already anchors its
   content to all four edges, and on mobile Safari 100vh is the *large* viewport
   — it ignores the URL bar, so the bottom of the page and the zoom controls end
   up under browser chrome. Filling the parent lets the layout viewport decide. */
.cv-shell { height: 100%; }

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
/* The grip is the one button that is dragged rather than clicked, so it needs
   its own cursor and its own touch-action — the browser decides whether a
   gesture is a scroll before any pointermove reaches JS. */
.cv-ann-grip {
  cursor: grab;
  touch-action: none;
  font-size: 13px;
  letter-spacing: 0;
}
.cv-ann-grip:active { cursor: grabbing; }

/* ---- touch / narrow ---- */

/* touch-action: none is what makes dragging an annotation possible at all on a
   touchscreen. Without it the browser claims the gesture for scrolling the mat
   before pointermove ever reaches us, and the widget stays put while the page
   slides. Scoped to the annotation, so one-finger panning still works
   everywhere else on the page. */
.cv-ann {
  touch-action: none;
}

@media (max-width: 959px) {
  /* 24px of mat on each side is 12% of a phone's width. The page edge only has
     to be visible, not generous. */
  .cv-scroll {
    padding: 10px;
    gap: 12px;
  }

  /* The tool strip sits above a widget that may be near the top of the page,
     and at 22x20 its buttons are far under a finger's width. Bigger, and
     below the widget instead of above, where the finger is already resting. */
  .cv-ann-tools {
    top: auto;
    bottom: -34px;
    gap: 4px;
    padding: 3px;
  }
  .cv-ann-btn {
    width: 34px;
    height: 30px;
    font-size: 13px;
  }
}
</style>
