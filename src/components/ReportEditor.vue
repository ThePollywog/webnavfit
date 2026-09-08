<script setup>
import { reactive, ref, computed, watch, nextTick } from "vue";
import { useDisplay } from "vuetify";
import {
  mdiAlertCircleOutline, mdiCheckCircleOutline, mdiClose, mdiContentSave,
  mdiFileDocumentEditOutline,
} from "@mdi/js";
import { REPORT_TYPES } from "../lib/model.js";
import ReportFormFields from "./ReportFormFields.vue";
import ReportCanvasPanel from "./ReportCanvasPanel.vue";
import ReportPreviewPanel from "./ReportPreviewPanel.vue";

// This is the ONE dialog for editing a report — Form / Direct Edit / Preview
// are tabs over a single shared draft, not three separate dialogs. Previously
// each of those was its own fullscreen v-dialog with its own cloned copy of
// the report, which could stack (Quick Preview opened on top of this editor)
// and could silently diverge (an edit made in one wasn't visible in another
// until an explicit re-sync). Passing `form` by reference to all three panels
// below means there is nothing left to keep in sync.
const props = defineProps({
  report: { type: Object, required: true },
  initialTab: { type: String, default: "form" },
});
const emit = defineEmits(["save", "close"]);

const { mdAndUp } = useDisplay();

// local editable copy; committed to the store on save. Made ONCE per open and
// handed to every panel by reference, so a Direct Edit click or a Form
// keystroke is visible on every other tab immediately.
const form = reactive({ ...props.report });
const dialog = reactive({ open: true });
const activeTab = ref(props.initialTab);

const rt = computed(() => REPORT_TYPES[form.ReportType] || { label: form.ReportType, form: "" });

// FullName used to only get rebuilt right before Save/Preview fired — fine
// when there was one form to keep in sync, wrong now that Direct Edit and
// Preview can be showing it live on another tab while you're still typing the
// name fields. `immediate` also seeds it correctly the moment the dialog opens.
function buildFullName() {
  let n = (form.LastName || "").trim();
  if (form.FirstName) n += (n ? ", " : "") + form.FirstName.trim();
  if (form.MI) n += " " + form.MI.trim();
  if (form.Suffix) n += " " + form.Suffix.trim();
  form.FullName = n;
}
watch(() => [form.LastName, form.FirstName, form.MI, form.Suffix], buildFullName, { immediate: true });

function save(close) {
  buildFullName();
  // A shallow spread only copies top-level keys — a nested value (form._annotations,
  // set up by ReportCanvasPanel the moment it mounts, which now happens for every
  // open since all three tabs stay mounted) comes through as a Vue reactive Proxy,
  // not a plain array. IndexedDB's structured-clone `put()` can silently reject a
  // Proxy in some browsers (DataCloneError), and since nothing here awaits/catches
  // the emitted save, that shows up as "I clicked Save and nothing happened." A
  // full JSON round-trip strips all reactivity, matching what the canvas editor's
  // own save always did before this dialog absorbed it.
  emit("save", JSON.parse(JSON.stringify(form)));
  if (close) doClose();
}
function doClose() { dialog.open = false; emit("close"); }

const formPanelRef = ref(null);
const validation = computed(() => formPanelRef.value?.validation || { ok: true, errors: [] });
function scrollToValidation() {
  activeTab.value = "form";
  nextTick(() => formPanelRef.value?.scrollToAlert());
}
</script>

<template>
  <v-dialog v-model="dialog.open" fullscreen scrollable transition="dialog-bottom-transition" @after-leave="emit('close')">
    <v-card color="background" class="d-flex flex-column workspace-shell">
      <!-- header -->
      <!-- Four labelled actions overflow a phone bar. Below md, Save becomes an
           icon and "Save & Close" keeps its words: it is the one action whose
           consequence (leaving the workspace) shouldn't be guessed from a
           glyph. Close stays an icon at the far right in both tiers. -->
      <v-toolbar color="surface" density="comfortable" flat class="editor-bar">
        <!-- Decoration on a fullscreen editor whose identity the title already
             states, so on a phone it yields its ~30px to that title. "Chief
             Evaluation Report" needs every pixel of the bar it can get. -->
        <v-icon :icon="mdiFileDocumentEditOutline" size="20" color="primary"
                class="ms-4 d-none d-sm-flex" />
        <v-toolbar-title class="ms-3 ms-sm-1">
          <span class="salt-heading">{{ rt.label }}</span>
          <span class="salt-code text-caption ms-2 d-none d-sm-inline" style="opacity: 0.7">{{ rt.form }}</span>
        </v-toolbar-title>
        <!-- No v-spacer: v-toolbar-title is already `flex: 1 1 0%`, so it does
             the spacing itself. Adding a spacer (`flex: 1 1 auto`) makes the two
             split the slack instead — which is invisible on a desktop and, on a
             phone, handed the title 75px of the 143px it needed while the spacer
             sat next to it holding the other 75px empty. -->

        <!-- Live validation status, always visible (not gated by mdAndUp) since
             it's a single icon — the full breakdown lives in the alert at the
             top of the Form tab, which this switches to and scrolls straight to
             on click/tap regardless of which tab is currently open. -->
        <v-tooltip location="bottom" max-width="320">
          <template #activator="{ props: tip }">
            <v-btn v-bind="tip" :icon="validation.ok ? mdiCheckCircleOutline : mdiAlertCircleOutline"
                   :color="validation.ok ? 'success' : 'warning'" variant="text"
                   class="me-1" :aria-label="validation.ok ? 'No validation issues' : `${validation.errors.length} validation issue(s)`"
                   @click="scrollToValidation" />
          </template>
          <div v-if="validation.ok">Ready to validate — no errors.</div>
          <div v-else>
            <div v-for="(e, i) in validation.errors" :key="i">• {{ e.message }}</div>
          </div>
        </v-tooltip>

        <template v-if="mdAndUp">
          <v-btn variant="tonal" class="ms-2" @click="save(false)">Save</v-btn>
          <v-btn variant="flat" color="primary" class="ms-2" @click="save(true)">Save &amp; Close</v-btn>
        </template>
        <template v-else>
          <v-btn variant="text" :icon="mdiContentSave" aria-label="Save" @click="save(false)" />
          <v-btn variant="flat" color="primary" size="small" class="ms-1" @click="save(true)">Done</v-btn>
        </template>
        <v-btn variant="text" :icon="mdiClose" class="ms-1" aria-label="Close editor" @click="doClose" />

        <template #extension>
          <v-tabs v-model="activeTab" density="comfortable" class="workspace-tabs">
            <v-tab value="form">Form</v-tab>
            <v-tab value="direct">Direct Edit</v-tab>
            <v-tab value="preview">Preview</v-tab>
          </v-tabs>
        </template>
      </v-toolbar>

      <!-- All three panels stay mounted (v-show, not v-if): switching tabs
           must never lose an in-progress edit, and each panel owns its own
           scroll/zoom state that would otherwise reset every time you looked
           away from it. -->
      <div class="workspace-body">
        <div v-show="activeTab === 'form'" class="workspace-pane workspace-pane--scroll">
          <ReportFormFields ref="formPanelRef" :form="form" />
        </div>
        <div v-show="activeTab === 'direct'" class="workspace-pane">
          <ReportCanvasPanel :form="form" />
        </div>
        <div v-show="activeTab === 'preview'" class="workspace-pane">
          <ReportPreviewPanel :form="form" />
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* height:100% rather than 100vh. Vuetify's fullscreen dialog already anchors its
   content to all four edges, and on mobile Safari 100vh is the *large* viewport
   — it ignores the URL bar, so the bottom of the page and controls end up under
   browser chrome. Filling the parent lets the layout viewport decide. */
.workspace-shell { height: 100%; }

/* Gold under the toolbar: the accent's structural job, matching the rule the
   nav drawer and card headers draw. The tabs live in the toolbar's extension
   slot (a second row under the title/actions), so the accent now sits under
   that instead of directly under the title row. */
.editor-bar :deep(.v-toolbar__extension) { border-bottom: 2px solid rgb(var(--v-theme-accent)); padding: 0; }

.workspace-body { flex: 1; min-height: 0; position: relative; }
.workspace-pane { height: 100%; }
.workspace-pane--scroll { overflow-y: auto; }
</style>
