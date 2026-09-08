<script setup>
import { computed, onMounted, ref, nextTick } from "vue";
import { useDisplay } from "vuetify";
import {
  mdiFitToPageOutline,
  mdiFormatText,
  mdiMagnifyMinusOutline,
  mdiMagnifyPlusOutline,
  mdiSignatureFreehand,
} from "@mdi/js";
import FITREP_FIELDS from "../lib/fields-blank.json";
import EVAL_FIELDS from "../lib/fields-eval.json";
import CHIEF_FIELDS from "../lib/fields-chief.json";
import * as FitrepFF from "../lib/fitrepFields.js";
import * as EvalFF from "../lib/evalFields.js";
import * as ChiefFF from "../lib/chiefFields.js";
import * as Calc from "../lib/calc.js";
import { renderPdfPages } from "../lib/pdfRender.js";
import { bakedGroupsFor } from "../lib/pdf.js";

// `form` is the ONE shared draft owned by the parent workspace — mutated
// directly here (FF.writeGroup below writes straight into it), so a click-to-
// edit change is immediately visible on the Form and Preview tabs too.
const props = defineProps({ form: { type: Object, required: true } });
const form = props.form;

// Field geometry + read/write bindings differ per report type: FITREP, EVAL
// and CHIEF are three distinct NAVPERS forms with their own group names and
// (for EVAL/CHIEF) their own vector template PDF. All three binding modules
// share an identical API (readGroup/writeGroup/isRadioGroup/RADIO_GROUPS/
// CHECK_FIELD/MULTILINE/LABEL — see fitrepFields.js), so only this lookup
// needs to be type-aware; every widget-rendering helper below just uses
// whichever `FF`/`FIELDS` this resolves to. Previously this panel was
// FITREP-only and always rendered FITREP's raster background regardless of
// the report's real type — opening an EVAL or CHIEF report here showed the
// wrong form entirely. avgGroup is each form's own "computed member trait
// average" placeholder group (see pdf.js's FORM_DEFS / buildValues*), which
// this panel displays read-only rather than lets you type into; the other
// computedGroups (group average, summary rank, RSCA, ...) are cross-report or
// generation-time-only values with no meaning in a single-report editor, so
// they're simply not drawn here — matching how FITREP's group-average box
// already behaved before this panel supported EVAL/CHIEF at all.
//
// Whether a "text"-typed widget is one of TEXT_FIELD's simple 1:1 bindings or
// one of a few composed ones outside it (FITREP's f44x/f47x, EVAL's
// f48addrx/f52rrsx, CHIEF's f51x/f52x) doesn't matter here: every module's
// readGroup/writeGroup already handles its own composed groups correctly, so
// trusting the widget's own JSON `type` — rather than re-deriving "is this
// text" from TEXT_FIELD membership plus a hardcoded FITREP-only exception —
// is both simpler and correct for all three forms.
const FORM_MAP = {
  FITREP: { fields: FITREP_FIELDS, ff: FitrepFF, bg: "blank-fitrep.pdf", avgGroup: "f45memberx", computedGroups: new Set(["f45memberx", "f45groupx"]) },
  EVAL: { fields: EVAL_FIELDS, ff: EvalFF, bg: "blank-eval.pdf", avgGroup: "f40avgx", computedGroups: new Set(["f40avgx", "f50gavgx"]) },
  CHIEF: { fields: CHIEF_FIELDS, ff: ChiefFF, bg: "blank-chief-eval.pdf", avgGroup: "f43x", computedGroups: new Set(["f43x", "f44x", "f45x", "f42ax", "f42bx"]) },
};
const formDef = computed(() => FORM_MAP[form.ReportType] || FORM_MAP.FITREP);
const FIELDS = computed(() => formDef.value.fields);
const FF = computed(() => formDef.value.ff);

// These blank template PDFs ship with stray content already baked into a few
// cells (an "X" in the promotion-recommendation NOB box, "0.00"/"0" trait-
// average and summary-count placeholders — see pdf.js's BAKED_GROUPS comment
// for the full story). pdf.js paints over them with a white rectangle before
// drawing the real value into a generated PDF; this panel renders the same
// background as a plain image with no such masking, so without doing the
// same thing here, the live overlay (a real checkmark, a real average) just
// draws on top of the still-visible baked mark underneath it — reported as
// "double text" in blocks 42/43 and the member trait average.
const bakedGroups = computed(() => bakedGroupsFor(form.ReportType));

const { mdAndUp } = useDisplay();

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

const memberAvg = computed(() => Calc.memberTraitAverage(form));

// ============================================================
// PAGES: rendered from this report type's own vector template PDF (the same
// ones pdf.js draws generated PDFs onto), via the existing renderPdfPages
// helper — no separate raster-image asset to keep in sync per type.
// ============================================================
const pages = ref([]);
const loading = ref(true);
const loadErr = ref("");

onMounted(async () => {
  try {
    const bytes = await fetch(formDef.value.bg).then((r) => r.arrayBuffer());
    const rendered = await renderPdfPages(new Uint8Array(bytes), 2);
    pages.value = rendered.map((p, i) => ({
      num: i + 1, ptW: p.ptW, ptH: p.ptH, bg: p.dataUrl,
      widgets: FIELDS.value.filter((f) => f.page === i + 1),
    }));
    if (!pages.value.length) loadErr.value = "This form template has no pages.";
  } catch (e) {
    loadErr.value = "Could not render the form: " + (e.message || e);
  } finally {
    loading.value = false;
  }
  // Open fitted on anything narrower than a desktop. On desktop 1.15 is a
  // deliberate slight magnification for reading the form's small print, and the
  // page already fits, so leave it.
  if (!mdAndUp.value) {
    await nextTick();
    fitWidth();
  }
});

function pageByNum(pn) { return pages.value.find((p) => p.num === pn); }

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
// Mirrors pdf.js's own whiteout rectangle exactly (same trim, anchored at the
// widget's top): a 2pt trim for a checkbox, 4pt for a text/average box, both
// short enough to leave the cell's own bottom grid line uncovered.
function maskStyle(f) {
  const s = PX * zoom.value;
  const trim = f.type === "check" ? 2 : 4;
  const h = Math.max(1, f.h - trim);
  return { left: f.x * s + "px", top: f.y * s + "px", width: f.w * s + "px", height: h * s + "px" };
}
function pageStyle(pg) {
  const s = PX * zoom.value;
  return { width: pg.ptW * s + "px", height: pg.ptH * s + "px" };
}
function fontPx(f) { return (f.size || 12) * PX * zoom.value; }
// line-height (px) for a multiline field's editable overlay, matching the PDF's
// per-line pitch so wrapped text in the textarea tracks the generated output.
function linePx(f) { return (f.pitch || (f.size || 12) + 1.5) * PX * zoom.value; }

// --- per-group helpers ---
// A widget's own JSON `type` decides text vs. check; the only text-typed
// widgets excluded here are each form's computedGroups (handled separately,
// see FORM_MAP above). Takes the widget itself (not just the group name) so
// it can check `type` directly rather than re-deriving it.
function isText(f) { return f.type === "text" && !formDef.value.computedGroups.has(f.group); }
function isCheck(g) { return !!FF.value.CHECK_FIELD[g]; }
function isRadio(g) { return FF.value.isRadioGroup(g); }
function isMultiline(g) { return FF.value.MULTILINE.has(g); }

function textVal(g) { return FF.value.readGroup(g, form); }
function setText(g, v) { FF.value.writeGroup(g, form, v); }

function checkOn(g) { return FF.value.readGroup(g, form) === true; }
function toggleCheck(g) { FF.value.writeGroup(g, form, !checkOn(g)); }

function radioOn(f) { return FF.value.readGroup(f.group, form) === Number(f.on); }
function selectRadio(f) {
  const cur = FF.value.readGroup(f.group, form);
  FF.value.writeGroup(f.group, form, cur === Number(f.on) ? -1 : Number(f.on));
}

function computedBox(g) {
  if (g === formDef.value.avgGroup) return Calc.fmt(memberAvg.value, 2);
  return "";
}

const activeGroup = ref(null);   // for the helper label

// ============================================================
// FREE-FORM ANNOTATIONS (draggable text / signatures).
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
</script>

<template>
  <div class="cv-shell">
    <v-toolbar color="surface" density="compact" flat class="cv-bar">
      <span class="text-caption me-3 d-none d-sm-inline">
        Member Avg: <b class="mono">{{ memberAvg == null ? "—" : Calc.fmt(memberAvg,2) }}</b>
      </span>
      <v-btn size="small" :variant="placing==='text' ? 'flat' : 'text'" :color="placing==='text' ? 'primary' : undefined"
             :prepend-icon="mdiFormatText" @click="startPlace('text')">
        <span class="d-none d-sm-inline">Add Text</span>
      </v-btn>
      <v-btn size="small" :variant="placing==='sig' ? 'flat' : 'text'" :color="placing==='sig' ? 'primary' : undefined"
             :prepend-icon="mdiSignatureFreehand" @click="startPlace('sig')">
        <span class="d-none d-sm-inline">Add Signature</span>
      </v-btn>
      <v-divider vertical class="mx-2" />
      <v-btn variant="text" :icon="mdiMagnifyMinusOutline" aria-label="Zoom out" @click="zoom = clampZoom(zoom - 0.15)" />
      <span class="mono text-caption mx-1">{{ Math.round(zoom*100) }}%</span>
      <v-btn variant="text" :icon="mdiMagnifyPlusOutline" aria-label="Zoom in" @click="zoom = clampZoom(zoom + 0.15)" />
      <v-btn variant="text" :icon="mdiFitToPageOutline" aria-label="Fit page width" title="Fit width" @click="fitWidth" />
    </v-toolbar>

    <div class="cv-scroll" ref="scrollEl">
      <div v-if="loading" class="cv-loading">
        <v-progress-circular indeterminate color="primary" size="42" />
        <div class="mt-3">Rendering form…</div>
      </div>
      <v-alert v-else-if="loadErr" type="warning" class="ma-6">{{ loadErr }}</v-alert>

      <div class="cv-hint" v-if="placing">Click on the page to place the {{ placing==='sig' ? 'signature' : 'text' }}.</div>
      <div v-else-if="activeGroup" class="cv-hint">{{ FF.LABEL[activeGroup] || activeGroup }}</div>

      <div v-for="pg in pages" :key="pg.num" class="cv-page" :class="{ placing: !!placing }" :style="pageStyle(pg)"
           @click="onPageClick(pg.num, $event)">
        <img :src="pg.bg" class="cv-bg" :style="pageStyle(pg)" alt="" draggable="false" />

        <div v-for="f in pg.widgets.filter((w) => bakedGroups.has(w.group))" :key="'mask-' + f.id"
             class="cv-mask" :style="maskStyle(f)" />

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
          <div v-else-if="f.group===formDef.avgGroup"
               class="cv-computed" :style="boxStyle(f)">{{ computedBox(f.group) }}</div>

          <!-- multi-line narrative: match the field's true size + line pitch -->
          <textarea v-else-if="isText(f) && isMultiline(f.group)"
                    class="cv-input cv-area"
                    :style="[boxStyle(f), { fontSize: fontPx(f)+'px', lineHeight: linePx(f)+'px' }]"
                    :value="textVal(f.group)"
                    @focus="activeGroup=f.group"
                    @input="setText(f.group, $event.target.value)"
                    :placeholder="FF.LABEL[f.group]||''" />

          <!-- single-line text -->
          <input v-else-if="isText(f)" type="text"
                 class="cv-input" :style="[boxStyle(f), { fontSize: fontPx(f)+'px' }]"
                 :value="textVal(f.group)"
                 @focus="activeGroup=f.group"
                 @input="setText(f.group, $event.target.value)"
                 :title="FF.LABEL[f.group]||f.group" />
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
                 finger, so the move affordance gets its own button. Dragging
                 from here means the annotation rides 34px above the fingertip
                 instead of underneath it. -->
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
  </div>
</template>

<style scoped>
/*
 * The chrome (toolbar, alerts) is theme-driven like the rest of the app.
 * Everything from `--cv-*` down is painted ON a sheet of white paper — a
 * rendered page of the official form — so it is fixed in both themes. Tying
 * the field ink to `on-surface` would put pale grey text on white paper the
 * moment dark mode is on, and the whole point of this panel is that what you
 * see is what the PDF will contain.
 *
 * The values are the light theme's navy, so light mode is a seamless
 * continuation of the palette and dark mode reads as a lit page on a dark desk.
 */
.cv-shell { height: 100%; display: flex; flex-direction: column; }

.cv-bar { border-bottom: 2px solid rgb(var(--v-theme-accent)); flex: 0 0 auto; }

.cv-page,
.cv-scroll {
  --cv-ink: #0A2E5C;          /* primary navy — what the PDF will show */
  --cv-edit: 10, 46, 92;      /* the same navy, for field tints */
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
.cv-mask { position: absolute; background: #fff; pointer-events: none; }

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
