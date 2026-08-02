<script setup>
import { computed, ref } from "vue";
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
    { title: "Preview", icon: "mdi-eye", color: "primary", fn: () => emit("preview", raw) },
    { title: "Edit", icon: "mdi-pencil", color: "primary", fn: () => emit("edit", raw) },
    { title: "Edit on form", icon: "mdi-file-edit-outline", color: "primary", fn: () => editReportPdf(raw) },
    { title: "Save PDF", icon: "mdi-file-pdf-box", color: "primary", fn: () => saveReportPdf(raw) },
    { title: "Delete report", icon: "mdi-delete", color: "error", fn: () => confirmDelete(raw) },
  ];
}

function nameOf(r) {
  return r.FullName || [r.LastName, r.FirstName].filter(Boolean).join(", ") || "(unnamed)";
}
function periodOf(r) {
  return r.FromDate || r.ToDate ? `${r.FromDate || "?"} – ${r.ToDate || "?"}` : "—";
}

const rows = computed(() => app.state.reports.map((r) => ({
  raw: r,
  name: nameOf(r),
  type: (REPORT_TYPES[r.ReportType] || {}).label || r.ReportType,
  period: periodOf(r),
  prom: promLabelById[Number(r.PromotionRecom) || 0] || "NOB",
  avg: Calc.memberTraitAverage(r),
  validated: r.IsValidated,
})));

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
    <div class="d-flex align-center mb-4 flex-wrap ga-2">
      <h2 class="nf-heading text-h5" style="border-left:3px solid #3b6ea5;padding-left:10px">
        {{ app.selectedFolder.value.FolderName }}
      </h2>
      <v-spacer />
      <v-btn color="secondary" variant="outlined" prepend-icon="mdi-plus" @click="emit('new-report','FITREP')">New FITREP</v-btn>
      <v-btn color="secondary" variant="outlined" prepend-icon="mdi-plus" @click="emit('new-report','EVAL')">New EVAL</v-btn>
      <v-btn color="secondary" variant="outlined" prepend-icon="mdi-plus" @click="emit('new-report','CHIEF')">New Chief Eval</v-btn>
      <v-btn color="primary" prepend-icon="mdi-file-pdf-box" :loading="savingGroup"
             :disabled="!app.state.reports.length" @click="saveGroupPdf">
        Save PDF
      </v-btn>
    </div>

    <!-- Reports table -->
    <v-card class="mb-4" border flat>
      <v-data-table
        class="reports-table"
        :headers="headers"
        :items="rows"
        :items-per-page="-1"
        density="comfortable"
        hover
        no-data-text="No reports. Use the New buttons above."
        @click:row="onRowClick"
      >
        <template #item.avg="{ item }">
          {{ item.avg == null ? "—" : Calc.fmt(item.avg, 2) }}
        </template>
        <template #item.validated="{ item }">
          <v-chip :color="item.validated ? 'success' : 'error'" size="small" variant="flat">
            {{ item.validated ? "True" : "False" }}
          </v-chip>
        </template>
        <template #item.name="{ item }">
          <span class="report-name">{{ item.name }}</span>
        </template>
        <template #item.actions="{ item }">
          <!-- @click.stop so using the actions menu doesn't also trigger the
               row-click edit handler. -->
          <v-menu location="bottom end" @click.stop>
            <template #activator="{ props }">
              <v-btn v-bind="props" icon="mdi-dots-vertical" variant="text"
                     size="small" color="medium-emphasis" title="Actions"
                     @click.stop />
            </template>
            <v-list density="compact" min-width="180">
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
    <v-card border flat class="pa-4" style="border-top:1px solid #cbd5e0">
      <div class="text-overline mb-2" style="color:#1f3a5f">Summary Group</div>
      <div class="d-flex ga-10 flex-wrap mb-3">
        <div>
          <div class="text-h4" style="color:#1f3a5f;font-weight:800">
            {{ app.summaryGroupAverage.value == null ? "—" : Calc.fmt(app.summaryGroupAverage.value, 2) }}
          </div>
          <div class="text-caption text-medium-emphasis">SUMMARY GROUP AVERAGE</div>
        </div>
        <div>
          <div class="text-h4" style="color:#1f3a5f;font-weight:800">
            {{ app.rsca.value == null ? "—" : Calc.fmt(app.rsca.value, 2) }}
          </div>
          <div class="text-caption text-medium-emphasis">RSCA</div>
        </div>
        <div>
          <div class="text-h4" style="color:#1f3a5f;font-weight:800">{{ app.state.reports.length }}</div>
          <div class="text-caption text-medium-emphasis">REPORTS</div>
        </div>
      </div>
      <div class="text-caption text-medium-emphasis mb-1">Promotion Summary (Block 43)</div>
      <div class="d-inline-flex" style="border:1px solid #cbd5e0">
        <div v-for="(c, i) in promCells" :key="c.label" class="text-center px-4 py-1"
             :style="i ? 'border-left:1px solid #cbd5e0' : ''">
          <div class="text-caption text-medium-emphasis">{{ c.label }}</div>
          <div class="text-h6" style="color:#1f3a5f;font-weight:700">{{ c.n }}</div>
        </div>
      </div>
    </v-card>
  </div>

  <v-card v-else flat class="pa-6 text-medium-emphasis">
    Select or create a summary group.
  </v-card>
</template>

<style scoped>
/* Row actions live in a single overflow (kebab) menu at the end of each row. */
.report-name { font-weight: 500; }
/* The whole row is clickable (opens Edit), so show a pointer over data rows. */
.reports-table :deep(tbody tr) { cursor: pointer; }
</style>
