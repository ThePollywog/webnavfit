<script setup>
/*
 * FieldHelp — the "?" next to a form field that explains what belongs in the box.
 *
 * Deliberately a click-activated v-menu rather than a tooltip. A tooltip opens on
 * hover, which does not exist on a phone: the trait grade buttons already carried
 * their doctrine text in a v-tooltip and it was simply unreachable for every touch
 * user. A menu opens on tap and on click, closes on outside tap and on Esc, and so
 * is one code path that works on both. It is capped to the viewport and scrolls
 * internally, so a long entry on a 390px screen stays on screen instead of running
 * off the bottom.
 */
import { computed } from "vue";
import { mdiHelpCircleOutline } from "@mdi/js";
import { BLOCK_HELP, HELP_SOURCE } from "../lib/blockHelp.js";

const props = defineProps({
  /** Key into BLOCK_HELP. */
  id: { type: String, default: "" },
  /** An entry passed directly, for content built at runtime (the traits). */
  entry: { type: Object, default: null },
});

const h = computed(() => props.entry || BLOCK_HELP[props.id] || null);

/* The trait anchor text arrives from refdata as the form's own bullet list, one
   "-item" per line ("-Has thorough professional knowledge\n-Competently performs
   ..."). HTML collapses those newlines, which ran the three points together into
   one sentence with stray hyphens in it, so they are split back out into a list. */
function bullets(text) {
  return String(text || "")
    .split("\n")
    .map((s) => s.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean);
}

// Screen-reader label. "Help" alone is useless when a form has forty of them, so
// it names the block the way the field's own label does. Whitespace is collapsed
// because some trait titles carry the form's own line break inside them
// ("TECHNICAL \nMASTERY"), which has no business in an accessible name.
const label = computed(() =>
  h.value
    ? `Help for block ${h.value.block}: ${String(h.value.title).replace(/\s+/g, " ").trim()}`
    : "Help",
);
</script>

<template>
  <v-menu
    v-if="h"
    :close-on-content-click="false"
    location="bottom end"
    origin="auto"
    max-width="380"
    :offset="4"
  >
    <template #activator="{ props: menuProps }">
      <!-- The project ships the SVG icon set rather than the webfont, so icons are
           imported paths passed to :icon, never class-name strings. -->
      <v-btn
        v-bind="menuProps"
        class="fh-btn"
        :icon="mdiHelpCircleOutline"
        variant="text"
        size="small"
        density="comfortable"
        :aria-label="label"
        :title="label"
        @mousedown.stop
      />
    </template>

    <v-card class="fh-card" border>
      <div class="salt-band d-flex align-center">
        <span class="fh-block mono">{{ h.block }}</span>
        <span class="fh-title">{{ h.title }}</span>
      </div>

      <v-card-text class="fh-body">
        <p class="fh-what">{{ h.what }}</p>

        <template v-if="h.format">
          <div class="salt-eyebrow mt-3">Format</div>
          <p class="fh-p">{{ h.format }}</p>
        </template>

        <!-- The trait entries carry the published 1.0 / 3.0 / 5.0 anchor language
             from the form itself, which is the whole point of opening help on a
             trait: the three marks side by side is what tells you which one the
             performance you are describing actually matches. -->
        <template v-if="h.anchors && h.anchors.length">
          <div class="salt-eyebrow mt-3">Standards</div>
          <div v-for="a in h.anchors" :key="a.mark" class="fh-anchor">
            <div class="fh-anchor-head">
              <span class="salt-stat mono">{{ a.mark }}</span>
              <span class="fh-anchor-label">{{ a.label }}</span>
            </div>
            <ul class="fh-bullets">
              <li v-for="(b, i) in bullets(a.text)" :key="i">{{ b }}</li>
            </ul>
          </div>
        </template>

        <template v-if="h.watch">
          <div class="salt-eyebrow mt-3">Watch out</div>
          <p class="fh-p">{{ h.watch }}</p>
        </template>

        <p class="fh-source">{{ HELP_SOURCE }}</p>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<style scoped>
/* The button sits in a field's append slot, where Vuetify's own 28px icon buttons
   set the rhythm. It keeps that size on a mouse and takes the 44px touch floor from
   app.css on a coarse pointer, same as the trait grades. */
.fh-btn {
  opacity: 0.65;
  margin-inline-start: 2px;
}
.fh-btn:hover,
.fh-btn:focus-visible {
  opacity: 1;
}

.fh-card {
  /* Below ~420px the 380px max-width would still crowd both screen edges. */
  max-width: min(380px, calc(100vw - 32px));
}

.fh-block {
  font-weight: 700;
  min-width: 3.25em;
}
.fh-title {
  letter-spacing: 0.06em;
}

.fh-body {
  /* Scroll the prose rather than the page: a long entry on a short phone screen
     must not push its own bottom past the fold, where there is no scroll context
     to reach it. */
  max-height: min(60vh, 460px);
  overflow-y: auto;
  padding: 12px 14px 10px;
  font-size: 0.8125rem;
  line-height: 1.5;
}

.fh-what {
  margin: 0;
  font-size: 0.875rem;
}

.fh-p {
  margin: 2px 0 0;
  opacity: 0.88;
}

.fh-anchor + .fh-anchor {
  margin-top: 8px;
}
.fh-anchor-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.fh-bullets {
  margin: 2px 0 0;
  padding-inline-start: 16px;
  opacity: 0.88;
}
.fh-bullets li::marker {
  color: rgb(var(--v-theme-accent));
}

.fh-anchor-label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.72;
}

.fh-source {
  margin: 12px 0 0;
  padding-top: 8px;
  border-top: 1px solid rgba(var(--v-border-color), 0.55);
  font-size: 0.6875rem;
  line-height: 1.4;
  opacity: 0.62;
}
</style>
