<script setup>
import { useDisplay } from "vuetify";
import refdata from "../lib/refdata.js";
defineProps({ modelValue: Boolean });
defineEmits(["update:modelValue"]);

const { mdAndUp } = useDisplay();

const tables = [
  { title: "Promotion Recommendation Scale", headers: ["Value", "Recommendation"], mono: [0],
    rows: [...refdata.promotionRecom].sort((a,b)=>a.val-b.val).map((p) => [p.val.toFixed(1), p.label]) },
  { title: "Promotion Status", headers: ["Status"], mono: [],
    rows: refdata.promotionStatus.map((p) => [p.label]) },
  { title: "Physical Readiness", headers: ["Rating"], mono: [],
    rows: refdata.physicalReadiness.map((p) => [p.label]) },
  { title: "Billet Subcategories", headers: ["Code"], mono: [0],
    rows: refdata.billetSubCat.map((b) => [b]) },
  { title: "Warfare Devices", headers: ["Code"], mono: [0],
    rows: refdata.warfareDevices.map((w) => [w]) },
];
</script>

<template>
  <!-- Fullscreen below md: these are five expandable lists, and in a boxed
       dialog on a phone they scroll inside a container that is itself inside a
       scrolling page. -->
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)"
            max-width="720" scrollable :fullscreen="!mdAndUp">
    <v-card>
      <div class="salt-band">Reference</div>
      <v-card-title class="salt-heading">Lookup Tables</v-card-title>
      <v-card-text>
        <!--
          Plain semantic tables rather than v-table: these are short, fixed
          reference lists that want no sort state and no virtual scroller, and
          .salt-table is the same treatment the companion app's reference cards
          use. A real <table> with <th scope="col"> is also what screen readers
          and printers handle best.
        -->
        <v-expansion-panels multiple>
          <v-expansion-panel v-for="t in tables" :key="t.title">
            <template #title>
              <span class="salt-heading text-body-2">{{ t.title }}</span>
            </template>
            <template #text>
              <div class="salt-scroll-x">
                <table class="salt-table">
                  <caption class="sr-only">{{ t.title }}</caption>
                  <thead>
                    <tr><th v-for="h in t.headers" :key="h" scope="col">{{ h }}</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, i) in t.rows" :key="i">
                      <td v-for="(c, j) in r" :key="j" :class="{ mono: t.mono.includes(j) }">{{ c }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
