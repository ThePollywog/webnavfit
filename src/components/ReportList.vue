<script setup>
import { computed, ref } from "vue";
import { useDisplay } from "vuetify";
import {
  mdiAlertCircleOutline,
  mdiCheckCircleOutline,
  mdiChevronRight,
  mdiDelete,
  mdiDotsVertical,
  mdiEyeOutline,
  mdiFileEditOutline,
  mdiFilePdfBox,
  mdiPencil,
  mdiPlus,
} from "@mdi/js";
import { useAppStore } from "../composables/useAppStore.js";
import * as Calc from "../lib/calc.js";
import { REPORT_TYPES } from "../lib/model.js";
import refdata from "../lib/refdata.js";
import { reportPdfBytes, groupPdfBytes, downloadPdf } from "../lib/pdf.js";
import FieldHelp from "./FieldHelp.vue";

const app = useAppStore();
const emit = defineEmits(["new-report", "edit", "preview", "edit-pdf"]);

// Two separate thresholds, because the table and the button row run out of room
// at different widths.
//
// mdAndUp (960px) gates the New-report buttons: the three labels plus Save PDF
// need ~550px on their own, which leaves nothing for the group name beside them.
const { mdAndUp, width } = useDisplay();

// The table is gated on a measured width rather than a breakpoint, because the
// constraint is the table's own minimum: its seven columns lay out at 704px, and
// anything narrower makes it scroll sideways inside its card — which hides the
// column saying whether each report is valid, the reason to look at this screen
// at all. So below the fit width the table is replaced outright by a card list,
// and at or above it a tablet in portrait gets the real grid instead of cards
// that waste the width. 736 = 704 + the container's 16px side padding.
const TABLE_MIN_W = 736;
const showTable = computed(() => width.value >= TABLE_MIN_W);

const savingGroup = ref(false);

// One entry per New-report type, so the desktop button row and the phone
// dropdown are generated from the same list.
const NEW_TYPES = [
  { type: "FITREP", label: "New FITREP" },
  { type: "EVAL", label: "New EVAL" },
  { type: "CHIEF", label: "New Chief Eval" },
];

const promLabelById = {};
refdata.promotionRecom.forEach((p) => { promLabelById[Math.round(p.val)] = p.label; });

function safeName(s) { return String(s || "report").replace(/[^A-Za-z0-9]+/g, "_"); }

// Save one report as a filled NAVPERS 1610/2 PDF (no browser print chrome).
async function saveReportPdf(r) {
  const bytes = await reportPdfBytes(r, {});
  downloadPdf(bytes, `NAVPERS_1610-2_${safeName(nameOf(r))}.pdf`);
}

// Open this report in the interactive canvas editor (click-to-edit the form).
function editReportPdf(r) {
  emit("edit-pdf", r);
}

// Clicking anywhere on a row opens the report editor (the actions menu stops
// propagation, so it won't also fire this).
function onRowClick(_event, { item }) {
  emit("edit", item.raw);
}

// Save the whole summary group as one merged PDF (all reports, in order).
async function saveGroupPdf() {
  if (!app.state.reports.length) { app.toast("No reports to save."); return; }
  savingGroup.value = true;
  try {
    const sga = app.summaryGroupAverage.value;
    const bytes = await groupPdfBytes(app.state.reports, { summaryGroupAverage: sga });
    downloadPdf(bytes, `NAVPERS_1610-2_${safeName(app.selectedFolder.value.FolderName)}.pdf`);
  } catch (e) {
    app.toast("Could not build PDF: " + (e.message || e));
  } finally {
    savingGroup.value = false;
  }
}

const headers = [
  { title: "Name", key: "name" },
  { title: "Type", key: "type" },
  { title: "Period", key: "period" },
  { title: "Promotion Rec", key: "prom" },
  { title: "Member Trait Avg", key: "avg", align: "center" },
  { title: "Validated", key: "validated", align: "center" },
  { title: "", key: "actions", align: "end", sortable: false, width: 56 },
];

// Row actions surfaced through a single overflow (kebab) menu — the standard
// Vuetify pattern for more than a couple of per-row actions.
function rowActions(raw) {
  return [
    { title: "Preview", icon: mdiEyeOutline, color: "primary", fn: () => emit("preview", raw) },
    { title: "Edit", icon: mdiPencil, color: "primary", fn: () => emit("edit", raw) },
    { title: "Edit on form", icon: mdiFileEditOutline, color: "primary", fn: () => editReportPdf(raw) },
    { title: "Save PDF", icon: mdiFilePdfBox, color: "primary", fn: () => saveReportPdf(raw) },
    { title: "Delete report", icon: mdiDelete, color: "error", fn: () => confirmDelete(raw) },
  ];
}

function nameOf(r) {
  return r.FullName || [r.LastName, r.FirstName].filter(Boolean).join(", ") || "(unnamed)";
}
function periodOf(r) {
  return r.FromDate || r.ToDate ? `${r.FromDate || "?"} – ${r.ToDate || "?"}` : "—";
}

const rows = computed(() => app.state.reports.map((r) => {
  // Derive validation from the report itself rather than trusting the stored
  // IsValidated flag, so records written before the flag was maintained (or
  // imported from another database) still show the right state.
  const v = Calc.validate(r);
  return {
    raw: r,
    name: nameOf(r),
    type: (REPORT_TYPES[r.ReportType] || {}).label || r.ReportType,
    period: periodOf(r),
    prom: promLabelById[Number(r.PromotionRecom) || 0] || "NOB",
    avg: Calc.memberTraitAverage(r),
    validated: v.ok,
    errors: v.errors,
  };
}));

const promCells = computed(() => {
  const s = app.promotionSummary.value;
  return [
    { label: "NOB", n: s.NOB }, { label: "SP", n: s.SP }, { label: "Prog", n: s.Prog },
    { label: "Prom", n: s.Prom }, { label: "MP", n: s.MP }, { label: "EP", n: s.EP },
  ];
});

async function confirmDelete(r) {
  if (confirm(`Delete report for ${nameOf(r)}?`)) await app.deleteReport(r.ReportID);
}
</script>

<template>
  <div v-if="app.selectedFolder.value">
    <!-- Header + new-report CTAs -->
    <div class="d-flex align-center mb-4 mb-sm-6 flex-wrap ga-2">
      <div class="group-title">
        <span class="salt-eyebrow">Summary Group</span>
        <h2 class="salt-heading text-h6 text-sm-h5">{{ app.selectedFolder.value.FolderName }}</h2>
      </div>
      <v-spacer />

      <!-- Four side-by-side CTAs wrap into a ragged two-line block on a phone.
           One menu plus one primary action reads as a decision instead. -->
      <template v-if="mdAndUp">
        <v-btn v-for="t in NEW_TYPES" :key="t.type" variant="outlined"
               :prepend-icon="mdiPlus" @click="emit('new-report', t.type)">
          {{ t.label }}
        </v-btn>
      </template>
      <v-menu v-else>
        <template #activator="{ props }">
          <v-btn v-bind="props" variant="outlined" :prepend-icon="mdiPlus">New Report</v-btn>
        </template>
        <v-list density="compact">
          <v-list-item v-for="t in NEW_TYPES" :key="t.type" @click="emit('new-report', t.type)">
            <v-list-item-title>{{ t.label }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-btn color="primary" :prepend-icon="mdiFilePdfBox" :loading="savingGroup"
             :disabled="!app.state.reports.length" @click="saveGroupPdf">
        Save PDF
      </v-btn>
    </div>

    <!-- Reports, phone layout: one card per report. Name and validation state
         lead, because those are what you scan for; the rest is supporting
         detail on the second line. -->
    <v-card v-if="!showTable" class="mb-4">
      <div class="salt-band">Reports</div>
      <div v-if="!rows.length" class="pa-4 text-body-2" style="opacity: 0.7">
        No reports. Use New Report above.
      </div>
      <div v-for="r in rows" :key="r.raw.ReportID" class="rpt-card d-flex align-center ga-2 pa-3"
           role="button" tabindex="0"
           @click="emit('edit', r.raw)" @keydown.enter="emit('edit', r.raw)"
           @keydown.space.prevent="emit('edit', r.raw)">
        <div class="flex-grow-1 overflow-hidden">
          <div class="d-flex align-center ga-2">
            <span class="font-weight-medium text-truncate">{{ r.name }}</span>
            <v-chip v-if="r.validated" color="success" size="x-small" :prepend-icon="mdiCheckCircleOutline">True</v-chip>
            <v-chip v-else color="error" size="x-small" :prepend-icon="mdiAlertCircleOutline">
              {{ r.errors.length }}
            </v-chip>
          </div>
          <div class="text-caption mt-1" style="opacity: 0.75">
            {{ r.type }} · {{ r.prom }} ·
            <span class="mono">{{ r.avg == null ? "—" : Calc.fmt(r.avg, 2) }}</span>
          </div>
          <div class="text-caption mono" style="opacity: 0.6">{{ r.period }}</div>
        </div>

        <v-menu location="bottom end">
          <template #activator="{ props }">
            <v-btn v-bind="props" :icon="mdiDotsVertical" variant="text" size="small"
                   aria-label="Report actions" @click.stop />
          </template>
          <v-list min-width="200">
            <v-list-item v-for="a in rowActions(r.raw)" :key="a.title" @click="a.fn()">
              <template #prepend><v-icon :icon="a.icon" :color="a.color" size="20" /></template>
              <v-list-item-title :class="a.color === 'error' ? 'text-error' : ''">
                {{ a.title }}
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
        <v-icon :icon="mdiChevronRight" size="18" style="opacity: 0.4" />
      </div>
    </v-card>

    <!-- Reports table (once its seven columns fit without sideways scrolling) -->
    <v-card v-else class="mb-4">
      <v-data-table
        class="salt-data-table"
        :headers="headers"
        :items="rows"
        :items-per-page="-1"
        hide-default-footer
        density="comfortable"
        hover
        no-data-text="No reports. Use the New buttons above."
        @click:row="onRowClick"
      >
        <template #item.avg="{ item }">
          <span class="mono">{{ item.avg == null ? "—" : Calc.fmt(item.avg, 2) }}</span>
        </template>
        <template #item.validated="{ item }">
          <!-- Hovering a failing chip lists the blocking items, so "False" is
               actionable instead of opaque. -->
          <v-tooltip v-if="!item.validated" location="top" max-width="420">
            <template #activator="{ props }">
              <v-chip v-bind="props" color="error" :prepend-icon="mdiAlertCircleOutline">
                False
              </v-chip>
            </template>
            <div class="text-caption"><b>{{ item.errors.length }} item(s) to resolve:</b></div>
            <ul class="text-caption ms-3">
              <li v-for="(e, i) in item.errors" :key="i">{{ e.message }}</li>
            </ul>
          </v-tooltip>
          <v-chip v-else color="success" :prepend-icon="mdiCheckCircleOutline">
            True
          </v-chip>
        </template>
        <template #item.name="{ item }">
          <span class="font-weight-medium">{{ item.name }}</span>
        </template>
        <template #item.actions="{ item }">
          <!-- @click.stop so using the actions menu doesn't also trigger the
               row-click edit handler. -->
          <v-menu location="bottom end" @click.stop>
            <template #activator="{ props }">
              <v-btn v-bind="props" :icon="mdiDotsVertical" variant="text"
                     size="small" aria-label="Report actions" title="Actions"
                     @click.stop />
            </template>
            <v-list min-width="180">
              <v-list-item v-for="a in rowActions(item.raw)" :key="a.title" @click="a.fn()">
                <template #prepend>
                  <v-icon :icon="a.icon" :color="a.color" size="20" />
                </template>
                <v-list-item-title :class="a.color === 'error' ? 'text-error' : ''">
                  {{ a.title }}
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </template>
      </v-data-table>
    </v-card>

    <!-- Summary-group stats -->
    <v-card>
      <div class="salt-band">Summary Group</div>
      <div class="pa-3 pa-sm-4">
        <!-- ga-10 is a 40px gutter; on a 360px screen three figures plus two of
             those gutters overflow, so the row wraps to two lines with one
             orphan. 24px keeps all three on one line down to the narrowest
             phone. -->
        <div class="d-flex ga-6 ga-sm-10 flex-wrap mb-4">
          <div>
            <div class="salt-stat text-h5 text-sm-h4">
              {{ app.summaryGroupAverage.value == null ? "—" : Calc.fmt(app.summaryGroupAverage.value, 2) }}
            </div>
            <span class="salt-eyebrow mt-1">Group average</span>
          </div>
          <div>
            <div class="salt-stat text-h5 text-sm-h4">
              {{ app.rsca.value == null ? "—" : Calc.fmt(app.rsca.value, 2) }}
            </div>
            <span class="salt-eyebrow mt-1">RSCA</span>
          </div>
          <div>
            <div class="salt-stat text-h5 text-sm-h4">{{ app.state.reports.length }}</div>
            <span class="salt-eyebrow mt-1">Reports</span>
          </div>
        </div>

        <!-- Block 43 is the one box on the form that isn't in the editor, because it
             describes the group rather than the report. Its help lives here with the
             counts, so the "what goes in this box" coverage is complete. -->
        <div class="d-flex align-center ga-1 mb-2">
          <span class="salt-eyebrow" style="margin-bottom: 0">Promotion summary (Block 43)</span>
          <FieldHelp id="SummaryCounts" />
        </div>
        <!-- A real table rather than divs: six labelled counts ARE tabular data,
             and .salt-table already rules them the way the form does. -->
        <!-- Six columns of counts stay a table on every size — it is already
             the narrowest honest form of this data — but on a phone it scrolls
             inside its own box rather than widening the page. -->
        <div class="salt-scroll-x">
          <table class="salt-table prom-table">
            <caption class="sr-only">Promotion recommendation counts for this summary group</caption>
            <thead>
              <tr>
                <th v-for="c in promCells" :key="c.label" scope="col">{{ c.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td v-for="c in promCells" :key="c.label" class="mono text-center">{{ c.n }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </v-card>
  </div>

  <v-card v-else class="pa-6">
    <span class="text-body-2" style="opacity: 0.7">Select or create a summary group.</span>
  </v-card>
</template>

<style scoped>
/* The whole row is clickable (opens Edit), so show a pointer over data rows. */
.salt-data-table :deep(tbody tr) { cursor: pointer; }
/* Counts read as a row of cells, so each column gets the same footprint rather
   than shrink-wrapping to the width of its digits. */
.prom-table th,
.prom-table td { min-width: 4.5rem; text-align: center; }

/* Phone card rows. Ruled like table rows so the list still reads as records. */
.rpt-card {
  border-top: 1px solid rgba(var(--v-border-color), 0.55);
  cursor: pointer;
  min-height: 64px;
}
.rpt-card:first-of-type { border-top: none; }
.rpt-card:active { background: rgba(var(--v-theme-on-surface), 0.06); }

/* The group name is user-supplied and can be long; it must ellipsize rather
   than shove the New/Save buttons off the right edge. */
.group-title { min-width: 0; max-width: 100%; }
.group-title h2 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
