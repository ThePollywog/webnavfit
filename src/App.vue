<script setup>
import { onMounted, ref, watch } from "vue";
import { useDisplay } from "vuetify";
import {
  mdiClipboardTextOutline,
  mdiDotsVertical,
  mdiMenu,
  mdiOpenInNew,
  mdiWeatherNight,
  mdiWeatherSunny,
} from "@mdi/js";
import { useAppStore } from "./composables/useAppStore.js";
import { useAppTheme } from "./composables/useAppTheme.js";
import FolderTree from "./components/FolderTree.vue";
import ReportList from "./components/ReportList.vue";
import ReportEditor from "./components/ReportEditor.vue";
import FormPreview from "./components/FormPreview.vue";
import LookupTables from "./components/LookupTables.vue";
import FitrepCanvasEditor from "./components/FitrepCanvasEditor.vue";

const app = useAppStore();
const { isDark, toggle } = useAppTheme();

// Three layout tiers, because the pieces of chrome stop fitting at different
// widths rather than all at once:
//   lgAndUp  (1264px) — the drawer can hold a permanent 284px lane. Below it the
//                       drawer overlays, exactly as SALTDOG's shell does, so the
//                       first paint on a phone is content rather than a menu.
//   smAndUp  (600px)  — room for the File/Tools/Help bar and the version badge.
//                       A tablet in portrait gets the real menus, not a kebab.
//   mdAndUp  (960px)  — room for prose: the full system name and the footer's
//                       long disclaimer.
const { lgAndUp, mdAndUp, smAndUp } = useDisplay();

const drawer = ref(lgAndUp.value);
watch(lgAndUp, (v) => (drawer.value = v));

// Choosing a group is the drawer's whole purpose, so on a phone — where it
// covers the content it is selecting — dismiss it once the choice is made.
// Watching the selection rather than handling the click covers both routes to
// it: tapping a group, and adding one (store.addFolder selects the new folder
// itself, so a click handler here would miss that case).
watch(
  () => app.state.selectedFolderId,
  () => { if (!lgAndUp.value) drawer.value = false; }
);

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
    <a href="#main" class="skip-link">Skip to content</a>

    <!-- Title bar. Unlike SALTDOG's it keeps the surface colour rather than
         filling with navy: the app bar sits directly above a menu bar and a
         drawer, and three stacked bands of chrome read as heavy when the top one
         is a solid block. The bottom border does the separating.

         The menu bar is an app-bar *extension* rather than a second v-app-bar.
         A second bar has to be pushed down with `top: 64px` and paid for with a
         matching `--v-layout-top`, both of which are wrong on a phone (bars are
         56px there, so the two overlap and the content sits under them).
         Vuetify measures the extension itself, and dropping it below sm shrinks
         the offset with no arithmetic on our side. -->
    <v-app-bar class="no-print" :extension-height="smAndUp ? 40 : 0">
      <v-app-bar-nav-icon
        :icon="mdiMenu"
        aria-label="Toggle summary groups"
        @click="drawer = !drawer"
      />

      <v-icon :icon="mdiClipboardTextOutline" size="22" color="primary" class="d-none d-sm-flex" />
      <div class="d-flex flex-column ms-sm-3 overflow-hidden">
        <!-- The full system name is the first thing to go: it is context, not
             navigation, and the wordmark below already identifies the app. -->
        <span class="salt-eyebrow mb-0 d-none d-md-block">Navy Evaluation Report System</span>
        <span class="salt-heading text-h6" style="line-height: 1.1">WEBNAVFIT</span>
      </div>

      <v-spacer />

      <!-- Reciprocal link to the companion app (SALTDOG's nav drawer points
           back here). New tab rather than same-tab navigation: an open report
           editor holds unsaved edits, and leaving the page would discard them.
           Below lg it keeps the icon and drops the label; the tooltip and
           aria-label carry the meaning that the text was carrying. -->
      <v-btn
        v-if="lgAndUp"
        href="https://thepollywog.github.io/saltdog/"
        target="_blank"
        rel="noopener"
        variant="outlined"
        size="small"
        class="mono salt-home-btn me-2"
        :append-icon="mdiOpenInNew"
      >
        SALT DOG HOME
      </v-btn>
      <v-btn
        v-else
        href="https://thepollywog.github.io/saltdog/"
        target="_blank"
        rel="noopener"
        variant="text"
        :icon="mdiOpenInNew"
        aria-label="SALTDOG home (opens in a new tab)"
        title="SALTDOG home"
      />

      <v-chip
        v-if="smAndUp"
        variant="outlined"
        class="mono me-2"
        :title="commit ? `build ${version} (${commit})` : `build ${version}`"
      >
        v{{ version }}
      </v-chip>
      <v-btn
        :icon="isDark ? mdiWeatherSunny : mdiWeatherNight"
        variant="text"
        :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="toggle"
      />

      <!-- Below sm the three menus collapse into one overflow, keeping their
           grouping as subheaders so File/Tools/Help stay distinguishable. -->
      <v-menu v-if="!smAndUp">
        <template #activator="{ props }">
          <v-btn v-bind="props" :icon="mdiDotsVertical" variant="text" aria-label="Menu" />
        </template>
        <v-list min-width="240" density="compact">
          <template v-for="(m, mi) in menus" :key="m.title">
            <v-divider v-if="mi > 0" class="my-1" />
            <v-list-subheader class="salt-eyebrow">{{ m.title }}</v-list-subheader>
            <v-list-item v-for="it in m.items" :key="it.title" @click="it.action">
              <v-list-item-title>{{ it.title }}</v-list-item-title>
            </v-list-item>
          </template>
        </v-list>
      </v-menu>

      <template v-if="smAndUp" #extension>
        <div class="d-flex align-center px-2 menu-bar">
          <v-menu v-for="m in menus" :key="m.title">
            <template #activator="{ props }">
              <v-btn v-bind="props" variant="text" size="small" class="salt-menu-btn">
                {{ m.title }}
              </v-btn>
            </template>
            <v-list>
              <v-list-item v-for="it in m.items" :key="it.title" @click="it.action">
                <v-list-item-title>{{ it.title }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </div>
      </template>
    </v-app-bar>

    <!-- Hidden file inputs. Outside the app bar so collapsing the menu bar on a
         phone can't unmount the very refs the menu actions click. -->
    <input ref="fileInput" type="file" accept="application/json" style="display: none" @change="onFilePicked" />
    <input ref="pdfInput" type="file" accept="application/pdf" style="display: none" @change="onPdfPicked" />

    <!-- Folder tree (summary groups). Temporary (overlay) below lg: 284px is
         three-quarters of a phone screen, so it cannot hold a lane there. -->
    <v-navigation-drawer v-model="drawer" :permanent="lgAndUp" :temporary="!lgAndUp" :width="284" class="no-print">
      <FolderTree @select="app.selectFolder" @open-report="openEditor" />
    </v-navigation-drawer>

    <!-- Main content -->
    <v-main>
      <!-- tabindex="-1" so the skip link can move focus here, not just scroll. -->
      <main id="main" tabindex="-1" class="salt-section">
        <v-container fluid class="py-4 py-sm-6 px-3 px-sm-4">
          <ReportList
            @new-report="newReport"
            @edit="openEditor"
            @preview="openPreview"
            @edit-pdf="openCanvasEditor"
          />
        </v-container>
      </main>
    </v-main>

    <!-- Status bar. The disclaimer is legally load-bearing but it is four lines
         of caption on a phone, which is a third of the viewport for text nobody
         re-reads. Below md it keeps the "unofficial" clause and the About
         dialog carries the rest. -->
    <v-footer app border class="no-print py-1 salt-safe-bottom">
      <span class="text-caption" style="opacity: 0.7">
        {{ app.state.loading ? "Loading…" : "Ready" }}
        <template v-if="app.selectedFolder.value">
          — {{ app.selectedFolder.value.FolderName }} ({{ app.state.reports.length }} report{{ app.state.reports.length === 1 ? "" : "s" }})
        </template>
        <template v-if="mdAndUp">
          · unofficial preparation aid, not a Department of the Navy publication.
          Runs entirely in your browser; no data is transmitted.
        </template>
        <template v-else> · unofficial aid · offline</template>
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

    <v-dialog v-model="showHowTo" max-width="640" scrollable :fullscreen="!mdAndUp">
      <v-card>
        <div class="salt-band">Getting started</div>
        <v-card-title class="salt-heading">How To Use WEBNAVFIT</v-card-title>
        <v-card-text>
          <ol style="line-height: 1.8">
            <li>Add a <b>Summary Group</b> (the <b>+</b> in the left sidebar) for a reporting senior and period.</li>
            <li>Select it, then <b>New FITREP / EVAL / Chief Eval</b> to add a report.</li>
            <li>Fill the report; trait marks drive the live <b>Member Trait Average</b> and validation.</li>
            <li>Every block has a <b>?</b> beside it explaining what belongs in that box,
              in what format, and what usually gets it wrong. On the performance traits
              it shows the published 1.0 / 3.0 / 5.0 standards for that trait.</li>
            <li>On a report row: <b>Preview</b> the official form, <b>Edit</b> the fields,
              <b>Edit on form</b> (click-to-edit the form image + add signatures), or
              <b>Save PDF</b> to download.</li>
            <li><b>Tools ▸ Auto Summary</b> fills the block-43 counts; <b>Tools ▸ Open PDF…</b>
              opens any PDF to fill its fields and sign it.</li>
            <li>Data stays in your browser. <b>File ▸ Export</b> saves a portable .json backup;
              <b>Open / Import</b> restores it. For full instructions see the User Guide on GitHub.</li>
          </ol>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showHowTo = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showAbout" max-width="520" scrollable>
      <v-card>
        <div class="salt-band">About</div>
        <v-card-text>
          <span class="salt-eyebrow">Navy Evaluation Report System</span>
          <h2 class="salt-heading text-h6 mb-3">WEBNAVFIT</h2>
          <p class="text-body-2">A browser recreation of the U.S. Navy's NAVFIT98A evaluation report system —
          summary-group management, FITREP/EVAL/Chief data entry, trait &amp; summary-group
          averaging, validation, and printing onto the official NAVPERS 1610/2 form.</p>
          <p class="text-caption mt-3" style="opacity: 0.75">Data model derived from NAVFIT98A v2.2.0.33. Preparation aid only.</p>
          <p class="text-caption mono" style="opacity: 0.75">
            Build {{ version }}<template v-if="commit"> · commit {{ commit }}</template>
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showAbout = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Toast -->
    <v-snackbar v-model="app.state.toast.show" color="primary" timeout="2400" location="bottom">
      {{ app.state.toast.text }}
    </v-snackbar>
  </v-app>
</template>

<style scoped>
.salt-menu-btn {
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface-variant));
}

/* Match the eyebrow's stamped look next to the version badge. !important
   because the global VBtn default sets letter-spacing through an inline
   `style`, which no class can outrank. */
.salt-home-btn {
  letter-spacing: 0.1em !important;
  font-size: 0.6875rem;
  font-weight: 700;
}

/* The extension slot is where the File/Tools/Help bar lives on desktop. It has
   no border of its own, so it needs the rule the app bar would have drawn. */
.menu-bar {
  height: 40px;
  width: 100%;
}

/* On a narrow bar the wordmark is the flex item that must yield, or it pushes
   the action buttons off the right edge instead of truncating itself. */
@media (max-width: 599px) {
  .salt-heading.text-h6 {
    font-size: 1rem !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
