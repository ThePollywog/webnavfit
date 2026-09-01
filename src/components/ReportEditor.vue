<script setup>
import { reactive, computed } from "vue";
import { useDisplay } from "vuetify";
import { mdiClose, mdiContentSave, mdiEyeOutline, mdiFileDocumentEditOutline } from "@mdi/js";
import * as Calc from "../lib/calc.js";
import { REPORT_TYPES, traitsFor, OCCASIONS, REPORT_KINDS, DUTY_STATUS } from "../lib/model.js";
import refdata from "../lib/refdata.js";
import { BLOCK_HELP } from "../lib/blockHelp.js";
import DateField from "./DateField.vue";
import FieldHelp from "./FieldHelp.vue";

const props = defineProps({ report: { type: Object, required: true } });
const emit = defineEmits(["save", "close", "preview"]);

// `inline` radio groups and the side-by-side trait rows both assume desktop
// width; below md they stack. Block 42 alone is six radios with labels like
// "Must Promote (4.0)", which no phone fits on one line.
const { mdAndUp } = useDisplay();

// local editable copy; committed to the store on save
const form = reactive({ ...props.report });
const dialog = reactive({ open: true });

const rt = computed(() => REPORT_TYPES[form.ReportType] || { label: form.ReportType, form: "" });
const traitCols = computed(() => traitsFor(form.ReportType));
const descriptors = computed(() => (refdata.reportTraits || {})[form.ReportType] || []);

// dropdown option lists
const promoStatus = refdata.promotionStatus.map((p) => p.label);
const billet = refdata.billetSubCat;

// Block 20 (Physical Readiness): per BUPERSINST 1610.10, enter ONE letter per
// PFA cycle completed in the reporting period (up to 4 chars), from the valid
// PFA code set. Build the entry by appending codes; keep only valid letters.
const pfaCodes = refdata.physicalReadiness;              // [{code,label}]
const PFA_VALID = pfaCodes.map((c) => c.code);           // ["P","B","M","W","F","N"]
function appendPfa(code) {
  const cur = (form.PhysicalReadiness || "").toUpperCase();
  if (cur.length >= 4) return;
  form.PhysicalReadiness = cur + code;
}
function clearPfa() { form.PhysicalReadiness = ""; }
// sanitize typed input to valid uppercase codes, max 4
function onPfaInput(v) {
  const cleaned = String(v || "").toUpperCase().split("")
    .filter((ch) => PFA_VALID.includes(ch)).slice(0, 4).join("");
  if (cleaned !== form.PhysicalReadiness) form.PhysicalReadiness = cleaned;
}
const states = refdata.states.map((s) => ({ title: `${s.cd} — ${s.name}`, value: s.cd }));
const promoRecom = [...refdata.promotionRecom].sort((a, b) => a.val - b.val);

const grades = [
  { v: 0, label: "NOB" }, { v: 1, label: "1.0" }, { v: 2, label: "2.0" },
  { v: 3, label: "3.0" }, { v: 4, label: "4.0" }, { v: 5, label: "5.0" },
];
function descFor(d, v) { return v === 1 ? d.d10 : v === 3 ? d.d30 : v === 5 ? d.d50 : ""; }

// Help for one trait, assembled rather than authored: the block number, title,
// scope line and the 1.0/3.0/5.0 anchor text all come from refdata (generated from
// NAVFIT98A's own tables, so it is the form's wording), and the grading rules that
// apply to every trait come from BLOCK_HELP.Traits.
//
// This is also the only route to the anchor text on a phone. It was previously
// reachable only through a v-tooltip on each grade button, which opens on hover —
// so on touch, the doctrine that tells a writer which mark to pick was invisible.
function traitHelp(idx) {
  const d = descriptors.value[idx] || {};
  const base = BLOCK_HELP.Traits;
  return {
    block: d.block || String(33 + idx),
    title: d.title || traitCols.value[idx],
    what: d.sub ? `${d.sub} ${base.what}` : base.what,
    format: base.format,
    anchors: [
      { mark: "1.0", label: "Below Standards", text: d.d10 },
      { mark: "3.0", label: "Meets Standards", text: d.d30 },
      { mark: "5.0", label: "Greatly Exceeds Standards", text: d.d50 },
    ].filter((a) => a.text),
    watch: base.watch,
  };
}

// exclusive boolean radio helpers (occasion, type, status)
function setExclusive(group, key) { group.forEach((k) => (form[k] = false)); form[key] = true; }
const occasionModel = computed({
  get: () => OCCASIONS.find((o) => form[o]) || null,
  set: (v) => setExclusive(OCCASIONS, v),
});
const typeModel = computed({
  get: () => REPORT_KINDS.find((o) => form[o]) || null,
  set: (v) => setExclusive(REPORT_KINDS, v),
});
const statusModel = computed({
  get: () => DUTY_STATUS.find((o) => form[o]) || null,
  set: (v) => setExclusive(DUTY_STATUS, v),
});
const statementModel = computed({
  get: () => (form.StatementYes ? "yes" : form.StatementNo ? "no" : null),
  set: (v) => { form.StatementYes = v === "yes"; form.StatementNo = v === "no"; },
});

// live computations
const memberAvg = computed(() => Calc.memberTraitAverage(form));
const validation = computed(() => Calc.validate(form));

// Block 41 comments: 18 lines x 92 chars. Count wrapped lines the NAVFIT way.
function wrapCount(line, cols) {
  if (line.length === 0) return 1;
  const words = line.split(" "); let rows = 1, len = 0;
  for (const w of words) {
    if (w.length > cols) { if (len > 0) { rows++; len = 0; } rows += Math.floor((w.length - 1) / cols); len = w.length % cols || cols; continue; }
    const add = (len === 0 ? 0 : 1) + w.length;
    if (len + add > cols) { rows++; len = w.length; } else len += add;
  }
  return rows;
}
function countLines(text, cols) { return String(text || "").split("\n").reduce((a, p) => a + wrapCount(p, cols), 0); }
const commentLines = computed(() => countLines(form.Comments, 92));
const commentsRule = (v) => countLines(v || "", 92) <= 18 || "Exceeds 18 lines × 92 chars";

function buildFullName() {
  let n = (form.LastName || "").trim();
  if (form.FirstName) n += (n ? ", " : "") + form.FirstName.trim();
  if (form.MI) n += " " + form.MI.trim();
  if (form.Suffix) n += " " + form.Suffix.trim();
  form.FullName = n;
}

function save(close) {
  buildFullName();
  emit("save", { ...form });
  if (close) doClose();
}
function doClose() { dialog.open = false; emit("close"); }
function doPreview() { buildFullName(); emit("preview", { ...form }); }
</script>

<template>
  <v-dialog v-model="dialog.open" fullscreen scrollable transition="dialog-bottom-transition" @after-leave="emit('close')">
    <v-card color="background">
      <!-- header -->
      <!-- Four labelled actions overflow a phone bar. Below md, Preview and Save
           become icons and "Save & Close" keeps its words: it is the one action
           whose consequence (leaving the form) shouldn't be guessed from a
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

        <template v-if="mdAndUp">
          <v-btn variant="text" :prepend-icon="mdiEyeOutline" @click="doPreview">Quick Preview</v-btn>
          <v-btn variant="tonal" class="ms-2" @click="save(false)">Save</v-btn>
          <v-btn variant="flat" color="primary" class="ms-2" @click="save(true)">Save &amp; Close</v-btn>
        </template>
        <template v-else>
          <v-btn variant="text" :icon="mdiEyeOutline" aria-label="Quick preview" @click="doPreview" />
          <v-btn variant="text" :icon="mdiContentSave" aria-label="Save" @click="save(false)" />
          <v-btn variant="flat" color="primary" size="small" class="ms-1" @click="save(true)">Done</v-btn>
        </template>
        <v-btn variant="text" :icon="mdiClose" class="ms-1" aria-label="Close editor" @click="doClose" />
      </v-toolbar>

      <v-card-text class="pa-2 pa-sm-4">
        <!-- live status -->
        <v-alert :type="validation.ok ? 'success' : 'warning'" class="mb-4" border="start">
          <div class="d-flex align-center flex-wrap ga-4">
            <div><b>Member Trait Average:</b>
              <span class="salt-stat text-h6 ms-1" style="color: inherit">{{ memberAvg == null ? "NOB / ungraded" : Calc.fmt(memberAvg, 2) }}</span>
            </div>
            <!-- A vertical divider collapses to zero height once the flex row
                 wraps, so it only earns its place while the row is one line. -->
            <v-divider v-if="mdAndUp" vertical />
            <div v-if="validation.ok"><b>✓ Ready to validate — no errors.</b></div>
            <div v-else>
              <b>{{ validation.errors.length }} item(s) to resolve:</b>
              <ul class="ms-4"><li v-for="(e,i) in validation.errors" :key="i">{{ e.message }}</li></ul>
            </div>
          </div>
        </v-alert>

        <!-- Identity -->
        <v-card class="mb-3">
          <div class="salt-band">Member Identity</div>
          <v-card-text>
            <v-row dense>
              <!-- Every block on the form carries a "?" explaining what belongs in
                   it. The help goes in the *outer* append slot (VInput's) rather
                   than append-inner (VField's), so it sits beside the box instead
                   of inside it: append-inner would collide with the adornments
                   some of these fields already have — DateField's calendar button
                   and v-select's dropdown arrow. -->
              <v-col cols="12" md="4">
                <v-text-field v-model="form.LastName" label="1. Last Name" maxlength="27">
                  <template #append><FieldHelp id="LastName" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model="form.FirstName" label="First Name" maxlength="27">
                  <template #append><FieldHelp id="FirstName" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="6" md="2">
                <v-text-field v-model="form.MI" label="MI" maxlength="3">
                  <template #append><FieldHelp id="MI" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="6" md="2">
                <v-text-field v-model="form.Suffix" label="Suffix" maxlength="10">
                  <template #append><FieldHelp id="Suffix" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model="form.Rate" label="2. Grade / Rate" maxlength="5">
                  <template #append><FieldHelp id="Rate" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model="form.Desig" label="3. Designator" maxlength="12">
                  <template #append><FieldHelp id="Desig" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model="form.SSN" label="4. DoD ID / SSN" maxlength="10">
                  <template #append><FieldHelp id="SSN" /></template>
                </v-text-field>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Duty status + command -->
        <v-card class="mb-3">
          <div class="salt-band">Duty Status & Command (Blocks 5-9)</div>
          <v-card-text>
            <!-- help-top: a radio group's append slot is centred against the whole
                 group, which on a phone (radios stacked) floats the "?" halfway
                 down the right edge, level with nothing in particular. The label is
                 what the help explains, so the button is pulled up to it. -->
            <v-radio-group v-model="statusModel" :inline="mdAndUp" label="5. Duty Status" class="mb-2 help-top">
              <template #append><FieldHelp id="DutyStatus" /></template>
              <v-radio label="ACT" value="Active" /><v-radio label="TAR/FTS" value="TAR" />
              <v-radio label="INACT" value="Inactive" /><v-radio label="AT/ADSW/265" value="ATADSW" />
            </v-radio-group>
            <v-row dense>
              <v-col cols="6" md="2">
                <v-text-field v-model="form.UIC" label="6. UIC" maxlength="5">
                  <template #append><FieldHelp id="UIC" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model="form.ShipStation" label="7. Ship / Station" maxlength="18">
                  <template #append><FieldHelp id="ShipStation" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="3">
                <v-select v-model="form.PromotionStatus" :items="promoStatus" label="8. Promotion Status" clearable>
                  <template #append><FieldHelp id="PromotionStatus" /></template>
                </v-select>
              </v-col>
              <v-col cols="12" md="3"><DateField v-model="form.DateReported" label="9. Date Reported (YYMMMDD)" help="DateReported" /></v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Occasion / period / observation -->
        <v-card class="mb-3">
          <div class="salt-band">Occasion, Period & Type (Blocks 10-21)</div>
          <v-card-text>
            <v-radio-group v-model="occasionModel" :inline="mdAndUp" label="Occasion for Report" class="help-top">
              <template #append><FieldHelp id="Occasion" /></template>
              <v-radio label="10. Periodic" value="Periodic" /><v-radio label="11. Detachment of Individual" value="DetInd" />
              <v-radio label="12. Detachment of RS" value="Frocking" /><v-radio label="13. Special" value="Special" />
            </v-radio-group>
            <v-row dense class="mb-1">
              <v-col cols="6" md="3"><DateField v-model="form.FromDate" label="14. From (YYMMMDD)" help="FromDate" /></v-col>
              <v-col cols="6" md="3"><DateField v-model="form.ToDate" label="15. To (YYMMMDD)" help="ToDate" /></v-col>
              <v-col cols="12" md="6" class="d-flex align-center">
                <v-checkbox v-model="form.NOB" label="16. Not Observed Report" hide-details>
                  <template #append><FieldHelp id="NOB" /></template>
                </v-checkbox>
              </v-col>
            </v-row>
            <v-radio-group v-model="typeModel" :inline="mdAndUp" label="Type of Report" class="help-top">
              <template #append><FieldHelp id="ReportKind" /></template>
              <v-radio label="17. Regular" value="Regular" /><v-radio label="18. Concurrent" value="Concurrent" />
              <v-radio label="19. Ops Cdr" value="OpsCdr" />
            </v-radio-group>
            <v-row dense>
              <v-col cols="12" md="6">
                <v-text-field
                  :model-value="form.PhysicalReadiness"
                  @update:model-value="onPfaInput"
                  label="20. Physical Readiness (PFA code per cycle)"
                  maxlength="4"
                  hint="One letter per PFA cycle in the period, e.g. PBF"
                  persistent-hint
                  class="salt-mono-field"
                >
                  <template #append><FieldHelp id="PhysicalReadiness" /></template>
                </v-text-field>
                <div class="d-flex flex-wrap ga-1 mt-2">
                  <v-btn v-for="c in pfaCodes" :key="c.code" size="x-small" variant="tonal"
                         class="mono" :title="c.label" @click="appendPfa(c.code)">
                    {{ c.code }}
                  </v-btn>
                  <v-btn size="x-small" variant="text" @click="clearPfa">Clear</v-btn>
                </div>
                <div class="text-caption mt-1" style="line-height: 1.4; opacity: 0.72">
                  <div v-for="c in pfaCodes" :key="c.code">{{ c.label }}</div>
                </div>
              </v-col>
              <v-col cols="12" md="6">
                <v-select v-model="form.BilletSubcat" :items="billet" label="21. Billet Subcategory" clearable>
                  <template #append><FieldHelp id="BilletSubcat" /></template>
                </v-select>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Reporting senior -->
        <v-card class="mb-3">
          <div class="salt-band">Reporting Senior & Address (Blocks 22-27, 44)</div>
          <v-card-text>
            <v-row dense>
              <v-col cols="12" md="6">
                <v-text-field v-model="form.ReportingSenior" label="22. Reporting Senior (Last, FI MI)" maxlength="18">
                  <template #append><FieldHelp id="ReportingSenior" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="6" md="2">
                <v-text-field v-model="form.RSGrade" label="23. Grade" maxlength="5">
                  <template #append><FieldHelp id="RSGrade" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="6" md="2">
                <v-text-field v-model="form.RSDesig" label="24. Desig" maxlength="5">
                  <template #append><FieldHelp id="RSDesig" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="2">
                <v-text-field v-model="form.RSTitle" label="25. Title" maxlength="14">
                  <template #append><FieldHelp id="RSTitle" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="6" md="2">
                <v-text-field v-model="form.RSUIC" label="26. UIC" maxlength="5">
                  <template #append><FieldHelp id="RSUIC" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="6" md="2">
                <v-text-field v-model="form.RSSSN" label="27. DoD ID/SSN" maxlength="10">
                  <template #append><FieldHelp id="RSSSN" /></template>
                </v-text-field>
              </v-col>
              <!-- Block 44 is one box on the form spread over five fields here, and
                   its help covers all five. The "?" goes on Address 1 only: City is
                   a 15-char field and St/Zip are a single grid column each, so a
                   second 44px adornment would leave them barely wider than their own
                   labels. -->
              <v-col cols="12" md="4">
                <v-text-field v-model="form.RSAddress1" label="44. Address 1" maxlength="30">
                  <template #append><FieldHelp id="RSAddress" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="4"><v-text-field v-model="form.RSAddress2" label="Address 2" maxlength="30" /></v-col>
              <v-col cols="6" md="2"><v-text-field v-model="form.RSCity" label="City" maxlength="15" /></v-col>
              <v-col cols="3" md="1"><v-select v-model="form.RSState" :items="states" label="St" /></v-col>
              <v-col cols="3" md="1"><v-text-field v-model="form.RSZipCd" label="Zip" maxlength="9" /></v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Narrative -->
        <v-card class="mb-3">
          <div class="salt-band">Employment, Duties & Counseling (Blocks 28-32)</div>
          <v-card-text>
            <!-- help-top on the textareas: an auto-grow field is the one place a
                 centred append is genuinely bad, since the "?" would drift further
                 from its label with every line typed. -->
            <v-textarea v-model="form.Achievements" label="28. Command Employment & Achievements" rows="3" auto-grow class="mb-2 help-top">
              <template #append><FieldHelp id="Achievements" /></template>
            </v-textarea>
            <v-textarea v-model="form.Duties" label="29. Primary / Collateral / Watchstanding Duties" rows="3" auto-grow class="mb-2 help-top">
              <template #append><FieldHelp id="Duties" /></template>
            </v-textarea>
            <v-row dense>
              <v-col cols="12" md="4">
                <v-text-field v-model="form.PrimaryDuty" label="29. Primary Duty Abbreviation" maxlength="14">
                  <template #append><FieldHelp id="PrimaryDuty" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="3"><DateField v-model="form.DateCounseled" label="30. Date Counseled" help="DateCounseled" /></v-col>
              <!-- As with block 44, block 31's help lives on the last-name field; FI
                   and MI are one grid column each. -->
              <v-col cols="12" md="3">
                <v-text-field v-model="form.CounselerLN" label="31. Counselor Last Name" maxlength="20">
                  <template #append><FieldHelp id="Counselor" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="6" md="1"><v-text-field v-model="form.CounselerFI" label="FI" maxlength="1" /></v-col>
              <v-col cols="6" md="1"><v-text-field v-model="form.CounselerMI" label="MI" maxlength="3" /></v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Performance traits -->
        <v-card class="mb-3">
          <div class="salt-band">Performance Traits (Blocks 33-39)</div>
          <v-card-text>
            <div v-for="(col, idx) in traitCols" :key="col" class="trait-row py-3">
              <div class="trait-inner d-flex align-center ga-4">
                <div class="trait-label">
                  <div class="d-flex align-start ga-1">
                    <div class="flex-grow-1">
                      <div class="salt-eyebrow">{{ (descriptors[idx] || {}).block || (33 + idx) }}. {{ col }}</div>
                      <div class="salt-heading text-body-2">{{ (descriptors[idx] || {}).title }}</div>
                    </div>
                    <!-- The trait's help shows all three published anchors at once,
                         which is what choosing a mark actually requires: you are
                         deciding which of 1.0 / 3.0 / 5.0 the performance matches,
                         and that is a comparison, not six separate lookups. -->
                    <FieldHelp :entry="traitHelp(idx)" />
                  </div>
                  <div class="text-caption" style="opacity: 0.72">{{ (descriptors[idx] || {}).sub }}</div>
                </div>
                <div class="d-flex flex-nowrap align-center ga-1 ga-sm-2 trait-grades">
                  <!-- Hover text is a convenience for a mouse, not the route to the
                       doctrine: it is disabled below md because it cannot be opened
                       by touch at all, and there the trait's "?" carries the same
                       text plus the two anchors this button isn't. -->
                  <v-tooltip v-for="g in grades" :key="g.v" :text="descFor(descriptors[idx] || {}, g.v) || g.label" location="top" :disabled="!mdAndUp || !descFor(descriptors[idx] || {}, g.v)">
                    <template #activator="{ props }">
                      <v-btn v-bind="props" class="trait-grade-btn mono"
                             :color="Number(form[col]) === g.v ? 'primary' : undefined"
                             :variant="Number(form[col]) === g.v ? 'flat' : 'outlined'"
                             size="small" @click="form[col] = g.v">{{ g.label }}</v-btn>
                    </template>
                  </v-tooltip>
                </div>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <!-- Comments + recommendations -->
        <v-card class="mb-3">
          <div class="salt-band">Recommendations & Comments (Blocks 40-41)</div>
          <v-card-text>
            <v-row dense class="mb-1">
              <v-col cols="12" md="6">
                <v-text-field v-model="form.RecommendA" label="40. Milestone Recommendation 1" maxlength="20">
                  <template #append><FieldHelp id="RecommendA" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="form.RecommendB" label="40. Milestone Recommendation 2" maxlength="20">
                  <template #append><FieldHelp id="RecommendA" /></template>
                </v-text-field>
              </v-col>
            </v-row>
            <v-textarea v-model="form.Comments" label="41. Comments on Performance"
                        rows="12" :rules="[commentsRule]"
                        :hint="`${commentLines} / 18 lines · 92 chars/line`" persistent-hint
                        class="salt-mono-field help-top">
              <template #append><FieldHelp id="Comments" /></template>
            </v-textarea>
          </v-card-text>
        </v-card>

        <!-- Promotion + statement + signatures -->
        <v-card class="mb-3">
          <div class="salt-band">Promotion, Statement & Signatures (Blocks 42-47)</div>
          <v-card-text>
            <v-radio-group v-model.number="form.PromotionRecom" :inline="mdAndUp" label="42. Promotion Recommendation" class="help-top">
              <template #append><FieldHelp id="PromotionRecom" /></template>
              <v-radio v-for="p in promoRecom" :key="p.val" :label="`${p.label} (${p.val.toFixed(1)})`" :value="Math.round(p.val)" />
            </v-radio-group>
            <v-radio-group v-model="statementModel" :inline="mdAndUp" label="46. Member Statement Intent" class="help-top">
              <template #append><FieldHelp id="Statement" /></template>
              <v-radio label="Intends to submit a statement" value="yes" />
              <v-radio label="Does not intend to submit a statement" value="no" />
            </v-radio-group>
            <v-row dense>
              <v-col cols="12" md="5">
                <v-text-field v-model="form.Rater" label="45. Reporting Senior (typed)" maxlength="28">
                  <template #append><FieldHelp id="Rater" /></template>
                </v-text-field>
              </v-col>
              <v-col cols="12" md="3"><DateField v-model="form.RaterDate" label="45. Date Signed" help="Rater" /></v-col>
              <v-col cols="12" md="4"><DateField v-model="form.SeniorRaterDate" label="46. Member Date Signed" help="MemberSigned" /></v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-card-text>

      <v-card-actions class="pa-3 editor-actions">
        <v-spacer />
        <v-btn variant="flat" color="primary" @click="save(true)">Save &amp; Close</v-btn>
        <v-btn variant="text" @click="doClose">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Gold under the toolbar: the accent's structural job, matching the rule the
   nav drawer and card headers draw. */
.editor-bar { border-bottom: 2px solid rgb(var(--v-theme-accent)); }
.editor-actions {
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-border-color), 0.9);
}
/* VInput lays prepend / control / append out as a flex row and centres the append
   against the control's full height. That is right for a one-line field and wrong
   for a tall one: on a stacked radio group, an auto-grow textarea, or block 41's
   twelve rows, a centred "?" ends up level with the middle of the control, far from
   the label it explains — and on block 41 it moves as the writer types. */
.help-top :deep(.v-input__append) {
  align-self: flex-start;
  margin-top: 0;
  padding-top: 2px;
}

.trait-row { border-top: 1px solid rgba(var(--v-border-color), 0.55); }
.trait-row:first-child { border-top: none; }
.trait-inner { flex-wrap: nowrap; }
/* fixed label so every trait's grade row starts at the same x, in a flat line */
.trait-label { flex: 0 0 230px; width: 230px; }
.trait-grades { flex: 1 1 auto; }
/* equal-width grade buttons that never wrap */
.trait-grades :deep(.trait-grade-btn) { flex: 1 1 0; min-width: 60px; }

/* The side-by-side layout needs 646px of row: a 230px label, a 16px gap, and six
   60px buttons with 8px between them. The row is the viewport less ~68px of
   dialog and card padding, so it survives down to a ~715px viewport — meaning a
   tablet in portrait keeps the layout that mirrors the paper form, and only a
   phone gives it up.
   Letting the label shrink instead was worse than stacking: each trait's label
   settled at a different width (113–161px), so the grade rows no longer started
   at a common x, and the narrow column pushed rows to 150px tall by wrapping.
   Below the threshold, stacking puts the six grades under their own label at full
   width: one tap-target row per trait, nothing scrolling sideways (which would
   put the grade you are choosing off-screen from the trait it belongs to), and
   the label still visible while you choose. */
@media (max-width: 767px) {
  .trait-inner { flex-wrap: wrap; }
  .trait-label { flex: 1 1 100%; width: auto; margin-bottom: 8px; }
  .trait-grades { flex: 1 1 100%; width: 100%; }
  /* min-width 0 lets six buttons share a 336px row; the 44px floor from the
     global mobile block keeps each one a legal touch target. */
  .trait-grades :deep(.trait-grade-btn) { min-width: 0; padding: 0 4px; }
}
</style>
