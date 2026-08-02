<script setup>
import { onMounted, ref } from "vue";
import { useAppStore } from "./composables/useAppStore.js";
import FolderTree from "./components/FolderTree.vue";
import ReportList from "./components/ReportList.vue";
import ReportEditor from "./components/ReportEditor.vue";
import FormPreview from "./components/FormPreview.vue";
import LookupTables from "./components/LookupTables.vue";
import FitrepCanvasEditor from "./components/FitrepCanvasEditor.vue";

const app = useAppStore();

// Build stamp injected by vite.config.js (`define`). On a Pages deploy this is
// package version + the incrementing workflow run number; locally, "-dev".
const version = __APP_VERSION__;
const commit = __APP_COMMIT__;

// editor / preview dialog state
const editorReport = ref(null);
const previewReport = ref(null);
const showLookup = ref(false);
const showAbout = ref(false);
const showHowTo = ref(false);
const fileInput = ref(null);
const pdfInput = ref(null);
// The click-to-edit canvas editor is the single PDF editing system. It has two
// modes: a FITREP report on the official form, or an arbitrary uploaded PDF.
const canvasReport = ref(null);   // FITREP mode
const canvasPdfBytes = ref(null); // PDF mode (Uint8Array)
const canvasPdfName = ref("document.pdf");
function openCanvasEditor(report) { canvasPdfBytes.value = null; canvasReport.value = report; }
function onCanvasSave(updated) { app.saveReport(updated); }
function closeCanvas() { canvasReport.value = null; canvasPdfBytes.value = null; }

// Open an arbitrary PDF in the canvas editor (annotate / sign / download).
function openPdf() { pdfInput.value.click(); }
async function onPdfPicked(e) {
  const file = e.target.files[0];
  if (!file) { return; }
  canvasReport.value = null;
  canvasPdfName.value = file.name;
  canvasPdfBytes.value = new Uint8Array(await file.arrayBuffer());
  e.target.value = "";
}

onMounted(() => app.init());

function openEditor(report) { editorReport.value = { ...report }; }
function onEditorSave(updated) { app.saveReport(updated); }
function onEditorClose() { editorReport.value = null; }
function openPreview(report) { previewReport.value = report; }
function closePreview() { previewReport.value = null; }

async function newReport(type) {
  const rep = await app.newReportInGroup(type);
  if (rep) openEditor(rep);
}

// ---- File menu ----
async function fileNew() {
  if (!confirm("Start a NEW database? This clears all summary groups and reports.")) return;
  await app.wipe();
  await app.init();
  app.toast("New database created.");
}
async function fileExport() {
  const data = await app.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "navfit98a-export.json"; a.click();
  URL.revokeObjectURL(url);
}
function fileImport() { fileInput.value.click(); }
async function onFilePicked(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    await app.importAll(JSON.parse(text), { replace: true });
    await app.init();
    app.toast("Database imported.");
  } catch (err) { app.toast("Import failed: " + err.message); }
  e.target.value = "";
}

const menus = [
  { title: "File", items: [
    { title: "New Database", action: fileNew },
    { title: "Open / Import (.json)…", action: fileImport },
    { title: "Export (.json)…", action: fileExport },
  ] },
  { title: "Tools", items: [
    { title: "Auto Summary", action: () => app.autoSummary() },
    { title: "Open PDF…", action: openPdf },
    { title: "Lookup Tables", action: () => (showLookup.value = true) },
  ] },
  { title: "Help", items: [
    { title: "How To", action: () => (showHowTo.value = true) },
    { title: "About", action: () => (showAbout.value = true) },
  ] },
];
</script>

<template>
  <v-app>
    <!-- Title bar -->
    <v-app-bar color="primary" flat density="comfortable" class="no-print">
      <template #prepend>
        <v-icon icon="mdi-clipboard-text-outline" size="22" class="ms-3" />
      </template>
      <v-app-bar-title>
        <span class="app-wordmark">WEBNAVFIT</span>
        <span class="app-subtitle ms-3">Navy Evaluation Report System</span>
      </v-app-bar-title>
      <template #append>
        <v-chip size="small" variant="outlined" class="me-3 app-version"
                :title="commit ? `build ${version} (${commit})` : `build ${version}`">
          v{{ version }}
        </v-chip>
      </template>
    </v-app-bar>

    <!-- Menu bar -->
    <v-app-bar color="surface" flat density="compact" class="app-menubar no-print" style="top:64px">
      <v-menu v-for="m in menus" :key="m.title">
        <template #activator="{ props }">
          <v-btn v-bind="props" variant="text" size="small" class="app-menu-btn">
            {{ m.title }}
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item v-for="it in m.items" :key="it.title" @click="it.action">
            <v-list-item-title>{{ it.title }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
      <input ref="fileInput" type="file" accept="application/json" style="display:none" @change="onFilePicked" />
      <input ref="pdfInput" type="file" accept="application/pdf" style="display:none" @change="onPdfPicked" />
    </v-app-bar>

    <!-- Folder tree (summary groups) -->
    <v-navigation-drawer permanent width="320" class="no-print">
      <FolderTree @select="app.selectFolder" @open-report="openEditor" />
    </v-navigation-drawer>

    <!-- Main content -->
    <v-main style="--v-layout-top:112px">
      <v-container fluid class="pa-4">
        <ReportList
          @new-report="newReport"
          @edit="openEditor"
          @preview="openPreview"
          @edit-pdf="openCanvasEditor"
        />
      </v-container>
    </v-main>

    <!-- Status bar -->
    <v-footer app color="surface" class="app-statusbar no-print">
      <span class="text-caption text-medium-emphasis">
        {{ app.state.loading ? "Loading…" : "Ready" }}
        <template v-if="app.selectedFolder.value">
          — {{ app.selectedFolder.value.FolderName }} ({{ app.state.reports.length }} report{{ app.state.reports.length === 1 ? "" : "s" }})
        </template>
      </span>
    </v-footer>

    <!-- Editor dialog -->
    <ReportEditor
      v-if="editorReport"
      :report="editorReport"
      @save="onEditorSave"
      @close="onEditorClose"
      @preview="openPreview"
    />

    <!-- Full-screen PDF preview (real filled NAVPERS 1610/2) -->
    <FormPreview
      v-if="previewReport"
      :report="previewReport"
      @close="closePreview"
      @edit-form="(r) => { closePreview(); openCanvasEditor(r); }"
    />

    <!-- Lookup / Help / About -->
    <LookupTables v-model="showLookup" />

    <!-- The single PDF editing system: click-to-edit a FITREP on the official
         form, or annotate/sign an arbitrary uploaded PDF. -->
    <FitrepCanvasEditor
      v-if="canvasReport || canvasPdfBytes"
      :report="canvasReport"
      :pdf-bytes="canvasPdfBytes"
      :pdf-name="canvasPdfName"
      @save="onCanvasSave"
      @close="closeCanvas"
    />
    <v-dialog v-model="showHowTo" max-width="640">
      <v-card>
        <v-card-title class="nf-heading">How To Use WEBNAVFIT</v-card-title>
        <v-card-text>
          <ol style="line-height:1.8">
            <li>Add a <b>Summary Group</b> (the <b>+</b> in the left sidebar) for a reporting senior and period.</li>
            <li>Select it, then <b>New FITREP / EVAL / Chief Eval</b> to add a report.</li>
            <li>Fill the report; trait marks drive the live <b>Member Trait Average</b> and validation.</li>
            <li>On a report row: <b>👁 Preview</b> the official form, <b>✎ Edit</b> the fields,
              <b>▦ Edit on form</b> (click-to-edit the form image + add signatures), or
              <b>Save PDF</b> to download.</li>
            <li><b>Tools ▸ Auto Summary</b> fills the block-43 counts; <b>Tools ▸ Open PDF…</b>
              opens any PDF to fill its fields and sign it.</li>
            <li>Data stays in your browser. <b>File ▸ Export</b> saves a portable .json backup;
              <b>Open / Import</b> restores it. For full instructions see the User Guide on GitHub.</li>
          </ol>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="showHowTo=false">Close</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="showAbout" max-width="520">
      <v-card>
        <v-card-title class="nf-heading">About</v-card-title>
        <v-card-text>
          <p class="text-h6 mb-2">WEBNAVFIT</p>
          <p>A browser recreation of the U.S. Navy's NAVFIT98A evaluation report system —
          summary-group management, FITREP/EVAL/Chief data entry, trait &amp; summary-group
          averaging, validation, and printing onto the official NAVPERS 1610/2 form.</p>
          <p class="text-caption text-medium-emphasis mt-2">Data model derived from NAVFIT98A v2.2.0.33. Preparation aid only.</p>
          <p class="text-caption text-medium-emphasis">
            Build {{ version }}<template v-if="commit"> · commit {{ commit }}</template>
          </p>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="showAbout=false">Close</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Toast -->
    <v-snackbar v-model="app.state.toast.show" color="primary" timeout="2400" location="bottom">
      {{ app.state.toast.text }}
    </v-snackbar>
  </v-app>
</template>

<style scoped>
.app-wordmark { font-weight: 700; letter-spacing: 1.5px; font-size: 18px; }
.app-subtitle { font-size: 12px; opacity: .8; font-weight: 400; }
.app-menubar { border-bottom: 1px solid #cbd5e0; }
.app-menu-btn { letter-spacing: .2px; font-weight: 600; color: #4a5568; }
.app-statusbar { border-top: 1px solid #cbd5e0; min-height: 28px; }
.app-version { font-variant-numeric: tabular-nums; letter-spacing: .3px; opacity: .85; }
</style>
