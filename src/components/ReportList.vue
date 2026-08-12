<script setup>
import { computed, ref } from "vue";
import {
  mdiAlertCircleOutline,
  mdiCheckCircleOutline,
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

const app = useAppStore();
const emit = defineEmits(["new-report", "edit", "preview", "edit-pdf"]);

const savingGroup = ref(false);

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
    <div class="d-flex align-center mb-6 flex-wrap ga-2">
      <div>
        <span class="salt-eyebrow">Summary Group</span>
        <h2 class="salt-heading text-h5">{{ app.selectedFolder.value.FolderName }}</h2>
      </div>
      <v-spacer />
      <v-btn variant="outlined" :prepend-icon="mdiPlus" @click="emit('new-report','FITREP')">New FITREP</v-btn>
      <v-btn variant="outlined" :prepend-icon="mdiPlus" @click="emit('new-report','EVAL')">New EVAL</v-btn>
      <v-btn variant="outlined" :prepend-icon="mdiPlus" @click="emit('new-report','CHIEF')">New Chief Eval</v-btn>
      <v-btn color="primary" :prepend-icon="mdiFilePdfBox" :loading="savingGroup"
             :disabled="!app.state.reports.length" @click="saveGroupPdf">
        Save PDF
      </v-btn>
    </div>

    <!-- Reports table -->
    <v-card class="mb-4">
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
      <div class="pa-4">
        <div class="d-flex ga-10 flex-wrap mb-4">
          <div>
            <div class="salt-stat text-h4">
              {{ app.summaryGroupAverage.value == null ? "—" : Calc.fmt(app.summaryGroupAverage.value, 2) }}
            </div>
            <span class="salt-eyebrow mt-1">Summary group average</span>
          </div>
          <div>
            <div class="salt-stat text-h4">
              {{ app.rsca.value == null ? "—" : Calc.fmt(app.rsca.value, 2) }}
            </div>
            <span class="salt-eyebrow mt-1">RSCA</span>
          </div>
          <div>
            <div class="salt-stat text-h4">{{ app.state.reports.length }}</div>
            <span class="salt-eyebrow mt-1">Reports</span>
          </div>
        </div>

        <span class="salt-eyebrow mb-2">Promotion summary (Block 43)</span>
        <!-- A real table rather than divs: six labelled counts ARE tabular data,
             and .salt-table already rules them the way the form does. -->
        <div class="salt-scroll-x d-inline-block">
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
</style>
