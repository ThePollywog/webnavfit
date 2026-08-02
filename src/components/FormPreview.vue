<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { REPORT_TYPES } from "../lib/model.js";
import { reportPdfBytes, downloadPdf } from "../lib/pdf.js";

const props = defineProps({
  report: { type: Object, required: true },
  mode: { type: String, default: "full" },   // kept for API compatibility; always fullscreen
});
const emit = defineEmits(["close", "edit-form"]);

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
    <v-card class="d-flex flex-column" style="height:100vh">
      <v-toolbar color="surface" density="comfortable" flat class="preview-bar no-print">
        <v-icon icon="mdi-file-document-outline" color="primary" size="20" class="ms-3" />
        <v-toolbar-title class="preview-title">{{ title }}</v-toolbar-title>
        <v-spacer />
        <v-btn variant="text" prepend-icon="mdi-file-edit-outline" class="me-2" @click="editOnForm">
          Edit on Form
        </v-btn>
        <v-btn variant="flat" color="primary" prepend-icon="mdi-content-save" @click="save" :disabled="!lastBytes">
          Save PDF
        </v-btn>
        <v-btn variant="text" icon="mdi-close" class="ms-1" @click="close" />
      </v-toolbar>

      <div class="preview-body">
        <v-progress-linear v-if="loading" indeterminate color="primary" />
        <v-alert v-if="error" type="error" variant="tonal" class="ma-4">{{ error }}</v-alert>
        <iframe v-if="pdfUrl && !error" :src="pdfUrl" class="pdf-frame" title="FITREP preview" />
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.preview-bar { border-bottom: 1px solid rgb(var(--v-theme-outline, 200 200 200)); }
.preview-title {
  font-size: 14px; letter-spacing: .3px; font-weight: 600;
}
.preview-body { flex: 1; min-height: 0; background: #525659; position: relative; }
.pdf-frame { width: 100%; height: 100%; border: 0; display: block; }
</style>
