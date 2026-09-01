<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useDisplay } from "vuetify";
import { mdiClose, mdiContentSave, mdiFileDocumentOutline, mdiFileEditOutline } from "@mdi/js";
import { REPORT_TYPES } from "../lib/model.js";
import { reportPdfBytes, downloadPdf } from "../lib/pdf.js";

const props = defineProps({
  report: { type: Object, required: true },
  mode: { type: String, default: "full" },   // kept for API compatibility; always fullscreen
});
const emit = defineEmits(["close", "edit-form"]);

const { mdAndUp } = useDisplay();

const dialog = ref(true);
const loading = ref(true);
const error = ref("");
const pdfUrl = ref("");
let lastBytes = null;

function memberName(r) {
  if (r.FullName) return r.FullName;
  let s = r.LastName || "";
  if (r.FirstName) s += (s ? ", " : "") + r.FirstName;
  return s.trim();
}
const rt = REPORT_TYPES[props.report.ReportType] || { label: props.report.ReportType };
const title = rt.label + (memberName(props.report) ? " — " + memberName(props.report) : "");

async function render() {
  loading.value = true; error.value = "";
  try {
    const bytes = await reportPdfBytes(props.report, {});
    lastBytes = bytes;
    if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value);
    // #toolbar=1 keeps the built-in PDF viewer controls; view=FitH fits width.
    pdfUrl.value = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })) + "#view=FitH";
  } catch (e) {
    error.value = e.message || String(e);
  } finally {
    loading.value = false;
  }
}

function save() {
  if (lastBytes) downloadPdf(lastBytes, filename());
}
function filename() {
  const n = (memberName(props.report) || "report").replace(/[^A-Za-z0-9]+/g, "_");
  return `NAVPERS_1610-2_${n}.pdf`;
}
function close() { dialog.value = false; }
function editOnForm() {
  // hand the report to the interactive click-to-edit canvas editor
  emit("edit-form", props.report);
}

onMounted(render);
watch(() => props.report, render, { deep: true });
onBeforeUnmount(() => { if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value); });
</script>

<template>
  <v-dialog v-model="dialog" fullscreen scrollable @after-leave="emit('close')">
    <v-card class="d-flex flex-column preview-shell">
      <v-toolbar color="surface" :density="mdAndUp ? 'comfortable' : 'compact'" flat class="preview-bar no-print">
        <v-icon :icon="mdiFileDocumentOutline" color="primary" size="20" class="ms-3 ms-sm-4" />
        <!-- No v-spacer after the title: it already grows (`flex: 1 1 0%`), and a
             spacer would split the slack with it rather than yield to it. -->
        <v-toolbar-title class="salt-heading text-subtitle-1 ms-1 text-truncate">{{ title }}</v-toolbar-title>
        <!-- The report name here is a person's name and can be long, so below md
             both actions shed their labels rather than squeezing the title to a
             few characters. -->
        <template v-if="mdAndUp">
          <v-btn variant="text" :prepend-icon="mdiFileEditOutline" class="me-2" @click="editOnForm">
            Edit on Form
          </v-btn>
          <v-btn variant="flat" color="primary" :prepend-icon="mdiContentSave" @click="save" :disabled="!lastBytes">
            Save PDF
          </v-btn>
        </template>
        <template v-else>
          <v-btn variant="text" size="small" :icon="mdiFileEditOutline"
                 aria-label="Edit on form" title="Edit on form" @click="editOnForm" />
          <v-btn variant="flat" color="primary" size="small" :icon="mdiContentSave"
                 aria-label="Save PDF" title="Save PDF" @click="save" :disabled="!lastBytes" />
        </template>
        <v-btn variant="text" :size="mdAndUp ? undefined : 'small'" :icon="mdiClose"
               class="ms-1" aria-label="Close preview" @click="close" />
      </v-toolbar>

      <div class="preview-body">
        <v-progress-linear v-if="loading" indeterminate color="primary" />
        <v-alert v-if="error" type="error" class="ma-4">{{ error }}</v-alert>
        <iframe v-if="pdfUrl && !error" :src="pdfUrl" class="pdf-frame" title="FITREP preview" />
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* height:100% rather than 100vh: on mobile Safari 100vh is the large viewport,
   which puts the bottom of the PDF frame under the URL bar. Vuetify's fullscreen
   dialog already anchors to all four edges, so filling the parent is both
   simpler and correct. */
.preview-shell { height: 100%; }

/* Gold under the toolbar, as in the editors. */
.preview-bar { border-bottom: 2px solid rgb(var(--v-theme-accent)); }
/* The mat around the page stays a fixed dark neutral in both themes. It frames a
   sheet of white paper, so it is not a themeable surface: tying it to
   `background` would put a white page on a near-white field in light mode and
   lose the page edge entirely. */
.preview-body { flex: 1; min-height: 0; background: #33383F; position: relative; }
.pdf-frame { width: 100%; height: 100%; border: 0; display: block; }
</style>
