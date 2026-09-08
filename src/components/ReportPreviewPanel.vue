<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { mdiContentSave } from "@mdi/js";
import { reportPdfBytes, downloadPdf } from "../lib/pdf.js";

// `form` is the ONE shared draft owned by the parent workspace — this renders
// whatever is currently in it (including edits from the Form and Direct Edit
// tabs that haven't been saved yet), same as "Quick Preview" always did.
const props = defineProps({ form: { type: Object, required: true } });

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

async function render() {
  loading.value = true; error.value = "";
  try {
    const bytes = await reportPdfBytes(props.form, {});
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
  const n = (memberName(props.form) || "report").replace(/[^A-Za-z0-9]+/g, "_");
  return `NAVPERS_${props.form.ReportType || "report"}_${n}.pdf`;
}

onMounted(render);
watch(() => props.form, render, { deep: true });
onBeforeUnmount(() => { if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value); });
</script>

<template>
  <div class="preview-shell">
    <v-toolbar color="surface" density="compact" flat class="preview-bar">
      <v-spacer />
      <v-btn variant="flat" color="primary" size="small" :prepend-icon="mdiContentSave" @click="save" :disabled="!lastBytes">
        Save PDF
      </v-btn>
    </v-toolbar>
    <div class="preview-body">
      <v-progress-linear v-if="loading" indeterminate color="primary" />
      <v-alert v-if="error" type="error" class="ma-4">{{ error }}</v-alert>
      <iframe v-if="pdfUrl && !error" :src="pdfUrl" class="pdf-frame" title="Report preview" />
    </div>
  </div>
</template>

<style scoped>
.preview-shell { height: 100%; display: flex; flex-direction: column; }
.preview-bar { border-bottom: 2px solid rgb(var(--v-theme-accent)); flex: 0 0 auto; }
/* The mat around the page stays a fixed dark neutral in both themes. It frames a
   sheet of white paper, so it is not a themeable surface: tying it to
   `background` would put a white page on a near-white field in light mode and
   lose the page edge entirely. */
.preview-body { flex: 1; min-height: 0; background: #33383F; position: relative; }
.pdf-frame { width: 100%; height: 100%; border: 0; display: block; }
</style>
