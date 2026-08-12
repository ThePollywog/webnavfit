<script setup>
/*
 * DateField.vue — a text field for Navy YYMMMDD dates (e.g. "23Oct14" =
 * 14 Oct 2023) with a calendar picker. Stays fully typeable; the calendar
 * icon opens a v-date-picker that writes the value back in YYMMMDD format.
 */
import { ref, computed } from "vue";
import { mdiCalendarMonthOutline } from "@mdi/js";

const props = defineProps({
  modelValue: { type: String, default: "" },
  label: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const menu = ref(false);

// "23Oct14" -> Date(2023, 9, 14). Returns null if not parseable.
function parse(str) {
  const m = /^(\d{2})([A-Za-z]{3})(\d{2})$/.exec(String(str || "").trim());
  if (!m) return null;
  const yy = parseInt(m[1], 10);
  const mon = MONTHS.findIndex((mm) => mm.toLowerCase() === m[2].toLowerCase());
  const dd = parseInt(m[3], 10);
  if (mon < 0) return null;
  // 2-digit year → 2000-2099 (FITREPs are modern-era)
  return new Date(2000 + yy, mon, dd);
}
// Date -> "23Oct14"
function format(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const mon = MONTHS[d.getMonth()];
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mon}${dd}`;
}

// the date the picker should show (parsed from the current text, or today)
const pickerDate = computed({
  get() { return parse(props.modelValue) || undefined; },
  set(d) {
    emit("update:modelValue", format(Array.isArray(d) ? d[0] : d));
    menu.value = false;
  },
});

function onText(v) { emit("update:modelValue", v); }
</script>

<template>
  <v-text-field
    :model-value="modelValue"
    @update:model-value="onText"
    :label="label"
    maxlength="7"
    placeholder="YYMmmDD"
    hint="e.g. 23Oct14"
    class="salt-mono-field"
  >
    <template #append-inner>
      <v-menu v-model="menu" :close-on-content-click="false" location="bottom end">
        <template #activator="{ props: menuProps }">
          <v-icon v-bind="menuProps" :icon="mdiCalendarMonthOutline" style="cursor: pointer" title="Pick a date" />
        </template>
        <v-date-picker
          v-model="pickerDate"
          hide-header
          show-adjacent-months
          @update:model-value="menu = false"
        />
      </v-menu>
    </template>
  </v-text-field>
</template>
