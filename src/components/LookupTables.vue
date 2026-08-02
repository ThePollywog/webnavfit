<script setup>
import refdata from "../lib/refdata.js";
defineProps({ modelValue: Boolean });
defineEmits(["update:modelValue"]);

const tables = [
  { title: "Promotion Recommendation Scale", headers: ["Value", "Recommendation"],
    rows: [...refdata.promotionRecom].sort((a,b)=>a.val-b.val).map((p) => [p.val.toFixed(1), p.label]) },
  { title: "Promotion Status", headers: ["Status"], rows: refdata.promotionStatus.map((p) => [p.label]) },
  { title: "Physical Readiness", headers: ["Rating"], rows: refdata.physicalReadiness.map((p) => [p.label]) },
  { title: "Billet Subcategories", headers: ["Code"], rows: refdata.billetSubCat.map((b) => [b]) },
  { title: "Warfare Devices", headers: ["Code"], rows: refdata.warfareDevices.map((w) => [w]) },
];
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="720" scrollable>
    <v-card>
      <v-card-title class="nf-heading">Lookup Tables</v-card-title>
      <v-card-text>
        <v-expansion-panels multiple>
          <v-expansion-panel v-for="t in tables" :key="t.title" :title="t.title">
            <template #text>
              <v-table density="compact">
                <thead><tr><th v-for="h in t.headers" :key="h">{{ h }}</th></tr></thead>
                <tbody><tr v-for="(r,i) in t.rows" :key="i"><td v-for="(c,j) in r" :key="j">{{ c }}</td></tr></tbody>
              </v-table>
            </template>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
      <v-card-actions><v-spacer /><v-btn @click="$emit('update:modelValue', false)">Close</v-btn></v-card-actions>
    </v-card>
  </v-dialog>
</template>
