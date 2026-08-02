<script setup>
import { reactive, computed, watch } from "vue";
import * as Calc from "../lib/calc.js";
import { REPORT_TYPES, traitsFor, OCCASIONS, REPORT_KINDS, DUTY_STATUS } from "../lib/model.js";
import refdata from "../lib/refdata.js";
import DateField from "./DateField.vue";

const props = defineProps({ report: { type: Object, required: true } });
const emit = defineEmits(["save", "close", "preview"]);

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
      <v-toolbar color="primary" density="comfortable" class="editor-bar">
        <v-icon icon="mdi-file-document-edit-outline" size="20" class="ms-3" />
        <v-toolbar-title>
          <span style="font-weight:700;letter-spacing:.3px">{{ rt.label }}</span>
          <span class="text-caption ms-2" style="opacity:.85">{{ rt.form }}</span>
        </v-toolbar-title>
        <v-spacer />
        <v-btn variant="tonal" color="primary" @click="save(false)">Save</v-btn>
        <v-btn variant="flat" color="primary" class="ms-2" @click="save(true)">Save &amp; Close</v-btn>
        <v-btn variant="text" class="ms-2" prepend-icon="mdi-eye" @click="doPreview">Quick Preview</v-btn>
        <v-btn variant="text" icon="mdi-close" @click="doClose" />
      </v-toolbar>

      <v-card-text class="pa-4" style="background:#f4f6f9">
        <!-- live status -->
        <v-alert :type="validation.ok ? 'success' : 'warning'" variant="tonal" class="mb-4" border="start">
          <div class="d-flex align-center flex-wrap ga-4">
            <div><b>Member Trait Average:</b>
              <span class="text-h6 ms-1">{{ memberAvg == null ? "NOB / ungraded" : Calc.fmt(memberAvg, 2) }}</span>
            </div>
            <v-divider vertical />
            <div v-if="validation.ok"><b>✓ Ready to validate — no errors.</b></div>
            <div v-else>
              <b>{{ validation.errors.length }} item(s) to resolve:</b>
              <ul class="ms-4"><li v-for="(e,i) in validation.errors" :key="i">{{ e.message }}</li></ul>
            </div>
          </div>
        </v-alert>

        <!-- Identity -->
        <v-card class="mb-3" border flat>
          <v-card-title class="nf-section-title">Member Identity</v-card-title>
          <v-card-text>
            <v-row dense>
              <v-col cols="12" md="4"><v-text-field v-model="form.LastName" label="1. Last Name" maxlength="27" /></v-col>
              <v-col cols="12" md="4"><v-text-field v-model="form.FirstName" label="First Name" maxlength="27" /></v-col>
              <v-col cols="6" md="2"><v-text-field v-model="form.MI" label="MI" maxlength="3" /></v-col>
              <v-col cols="6" md="2"><v-text-field v-model="form.Suffix" label="Suffix" maxlength="10" /></v-col>
              <v-col cols="12" md="4"><v-text-field v-model="form.Rate" label="2. Grade / Rate" maxlength="5" /></v-col>
              <v-col cols="12" md="4"><v-text-field v-model="form.Desig" label="3. Designator" maxlength="12" /></v-col>
              <v-col cols="12" md="4"><v-text-field v-model="form.SSN" label="4. DoD ID / SSN" maxlength="10" /></v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Duty status + command -->
        <v-card class="mb-3" border flat>
          <v-card-title class="nf-section-title">Duty Status & Command (Blocks 5-9)</v-card-title>
          <v-card-text>
            <v-radio-group v-model="statusModel" inline label="5. Duty Status" class="mb-2">
              <v-radio label="ACT" value="Active" /><v-radio label="TAR/FTS" value="TAR" />
              <v-radio label="INACT" value="Inactive" /><v-radio label="AT/ADSW/265" value="ATADSW" />
            </v-radio-group>
            <v-row dense>
              <v-col cols="6" md="2"><v-text-field v-model="form.UIC" label="6. UIC" maxlength="5" /></v-col>
              <v-col cols="12" md="4"><v-text-field v-model="form.ShipStation" label="7. Ship / Station" maxlength="18" /></v-col>
              <v-col cols="12" md="3"><v-select v-model="form.PromotionStatus" :items="promoStatus" label="8. Promotion Status" clearable /></v-col>
              <v-col cols="12" md="3"><DateField v-model="form.DateReported" label="9. Date Reported (YYMMMDD)" /></v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Occasion / period / observation -->
        <v-card class="mb-3" border flat>
          <v-card-title class="nf-section-title">Occasion, Period & Type (Blocks 10-21)</v-card-title>
          <v-card-text>
            <v-radio-group v-model="occasionModel" inline label="Occasion for Report">
              <v-radio label="10. Periodic" value="Periodic" /><v-radio label="11. Detachment of Individual" value="DetInd" />
              <v-radio label="12. Detachment of RS" value="Frocking" /><v-radio label="13. Special" value="Special" />
            </v-radio-group>
            <v-row dense class="mb-1">
              <v-col cols="6" md="3"><DateField v-model="form.FromDate" label="14. From (YYMMMDD)" /></v-col>
              <v-col cols="6" md="3"><DateField v-model="form.ToDate" label="15. To (YYMMMDD)" /></v-col>
              <v-col cols="12" md="6" class="d-flex align-center">
                <v-checkbox v-model="form.NOB" label="16. Not Observed Report" hide-details />
              </v-col>
            </v-row>
            <v-radio-group v-model="typeModel" inline label="Type of Report">
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
                  style="font-family:'Courier New',monospace"
                />
                <div class="d-flex flex-wrap ga-1 mt-2">
                  <v-btn v-for="c in pfaCodes" :key="c.code" size="x-small" variant="tonal"
                         color="primary" :title="c.label" @click="appendPfa(c.code)">
                    {{ c.code }}
                  </v-btn>
                  <v-btn size="x-small" variant="text" @click="clearPfa">Clear</v-btn>
                </div>
                <div class="text-caption text-medium-emphasis mt-1" style="line-height:1.4">
                  <div v-for="c in pfaCodes" :key="c.code">{{ c.label }}</div>
                </div>
              </v-col>
              <v-col cols="12" md="6"><v-select v-model="form.BilletSubcat" :items="billet" label="21. Billet Subcategory" clearable /></v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Reporting senior -->
        <v-card class="mb-3" border flat>
          <v-card-title class="nf-section-title">Reporting Senior & Address (Blocks 22-27, 44)</v-card-title>
          <v-card-text>
            <v-row dense>
              <v-col cols="12" md="6"><v-text-field v-model="form.ReportingSenior" label="22. Reporting Senior (Last, FI MI)" maxlength="18" /></v-col>
              <v-col cols="6" md="2"><v-text-field v-model="form.RSGrade" label="23. Grade" maxlength="5" /></v-col>
              <v-col cols="6" md="2"><v-text-field v-model="form.RSDesig" label="24. Desig" maxlength="5" /></v-col>
              <v-col cols="12" md="2"><v-text-field v-model="form.RSTitle" label="25. Title" maxlength="14" /></v-col>
              <v-col cols="6" md="2"><v-text-field v-model="form.RSUIC" label="26. UIC" maxlength="5" /></v-col>
              <v-col cols="6" md="2"><v-text-field v-model="form.RSSSN" label="27. DoD ID/SSN" maxlength="10" /></v-col>
              <v-col cols="12" md="4"><v-text-field v-model="form.RSAddress1" label="44. Address 1" maxlength="30" /></v-col>
              <v-col cols="12" md="4"><v-text-field v-model="form.RSAddress2" label="Address 2" maxlength="30" /></v-col>
              <v-col cols="6" md="2"><v-text-field v-model="form.RSCity" label="City" maxlength="15" /></v-col>
              <v-col cols="3" md="1"><v-select v-model="form.RSState" :items="states" label="St" /></v-col>
              <v-col cols="3" md="1"><v-text-field v-model="form.RSZipCd" label="Zip" maxlength="9" /></v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Narrative -->
        <v-card class="mb-3" border flat>
          <v-card-title class="nf-section-title">Employment, Duties & Counseling (Blocks 28-32)</v-card-title>
          <v-card-text>
            <v-textarea v-model="form.Achievements" label="28. Command Employment & Achievements" rows="3" auto-grow class="mb-2" />
            <v-textarea v-model="form.Duties" label="29. Primary / Collateral / Watchstanding Duties" rows="3" auto-grow class="mb-2" />
            <v-row dense>
              <v-col cols="12" md="4"><v-text-field v-model="form.PrimaryDuty" label="29. Primary Duty Abbreviation" maxlength="14" /></v-col>
              <v-col cols="12" md="3"><DateField v-model="form.DateCounseled" label="30. Date Counseled" /></v-col>
              <v-col cols="12" md="3"><v-text-field v-model="form.CounselerLN" label="31. Counselor Last Name" maxlength="20" /></v-col>
              <v-col cols="6" md="1"><v-text-field v-model="form.CounselerFI" label="FI" maxlength="1" /></v-col>
              <v-col cols="6" md="1"><v-text-field v-model="form.CounselerMI" label="MI" maxlength="3" /></v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Performance traits -->
        <v-card class="mb-3" border flat>
          <v-card-title class="nf-section-title">Performance Traits (Blocks 33-39)</v-card-title>
          <v-card-text>
            <div v-for="(col, idx) in traitCols" :key="col" class="trait-row py-3">
              <div class="d-flex align-center flex-nowrap ga-4">
                <div class="trait-label">
                  <div style="font-weight:700;color:#1f3a5f">{{ (descriptors[idx] || {}).block || (33 + idx) }}. {{ col }}</div>
                  <div class="text-body-2">{{ (descriptors[idx] || {}).title }}</div>
                  <div class="text-caption text-medium-emphasis">{{ (descriptors[idx] || {}).sub }}</div>
                </div>
                <div class="d-flex flex-nowrap align-center ga-2 trait-grades">
                  <v-tooltip v-for="g in grades" :key="g.v" :text="descFor(descriptors[idx] || {}, g.v) || g.label" location="top" :disabled="!descFor(descriptors[idx] || {}, g.v)">
                    <template #activator="{ props }">
                      <v-btn v-bind="props" class="trait-grade-btn"
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
        <v-card class="mb-3" border flat>
          <v-card-title class="nf-section-title">Recommendations & Comments (Blocks 40-41)</v-card-title>
          <v-card-text>
            <v-row dense class="mb-1">
              <v-col cols="12" md="6"><v-text-field v-model="form.RecommendA" label="40. Milestone Recommendation 1" maxlength="20" /></v-col>
              <v-col cols="12" md="6"><v-text-field v-model="form.RecommendB" label="40. Milestone Recommendation 2" maxlength="20" /></v-col>
            </v-row>
            <v-textarea v-model="form.Comments" label="41. Comments on Performance"
                        rows="12" :rules="[commentsRule]"
                        :hint="`${commentLines} / 18 lines · 92 chars/line`" persistent-hint
                        style="font-family:'Courier New',monospace" />
          </v-card-text>
        </v-card>

        <!-- Promotion + statement + signatures -->
        <v-card class="mb-3" border flat>
          <v-card-title class="nf-section-title">Promotion, Statement & Signatures (Blocks 42-47)</v-card-title>
          <v-card-text>
            <v-radio-group v-model.number="form.PromotionRecom" inline label="42. Promotion Recommendation">
              <v-radio v-for="p in promoRecom" :key="p.val" :label="`${p.label} (${p.val.toFixed(1)})`" :value="Math.round(p.val)" />
            </v-radio-group>
            <v-radio-group v-model="statementModel" inline label="46. Member Statement Intent">
              <v-radio label="Intends to submit a statement" value="yes" />
              <v-radio label="Does not intend to submit a statement" value="no" />
            </v-radio-group>
            <v-row dense>
              <v-col cols="12" md="5"><v-text-field v-model="form.Rater" label="45. Reporting Senior (typed)" maxlength="28" /></v-col>
              <v-col cols="12" md="3"><DateField v-model="form.RaterDate" label="45. Date Signed" /></v-col>
              <v-col cols="12" md="4"><DateField v-model="form.SeniorRaterDate" label="46. Member Date Signed" /></v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-card-text>

      <v-card-actions class="pa-3" style="border-top:1px solid #cbd5e0;background:#ffffff">
        <v-spacer />
        <v-btn variant="flat" color="primary" @click="save(true)">Save &amp; Close</v-btn>
        <v-btn variant="text" @click="doClose">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.editor-bar { border-bottom: 2px solid #3b6ea5; }
.nf-section-title {
  background: #eef1f6; color: #1f3a5f; border-left: 3px solid #3b6ea5;
  text-transform: uppercase; letter-spacing: .5px; font-size: 12px; font-weight: 700;
  padding: 8px 14px;
}
.trait-row { border-top: 1px solid #e2e8f0; overflow-x: auto; }
.trait-row:first-child { border-top: none; }
/* fixed label so every trait's grade row starts at the same x, in a flat line */
.trait-label { flex: 0 0 230px; width: 230px; }
.trait-grades { flex: 1 1 auto; }
/* equal-width grade buttons that never wrap */
.trait-grades :deep(.trait-grade-btn) { flex: 1 1 0; min-width: 60px; }
</style>
