<script setup>
import { mdiDelete, mdiFolderOutline, mdiPencil, mdiPlus } from "@mdi/js";
import { useAppStore } from "../composables/useAppStore.js";
const app = useAppStore();
const emit = defineEmits(["select"]);

async function addFolder() {
  const name = prompt("New summary group name:", "Summary Group");
  if (name != null) await app.addFolder(name.trim() || "Summary Group");
}
async function rename(f) {
  const name = prompt("Rename summary group:", f.FolderName);
  if (name != null && name.trim()) await app.renameFolder(f.FolderID, name.trim());
}
async function remove(f) {
  if (confirm(`Delete "${f.FolderName}" and all its reports?`)) await app.deleteFolder(f.FolderID);
}
</script>

<template>
  <nav aria-label="Summary groups">
    <v-list nav>
      <!-- Not v-list-subheader: it wraps its slot in a text element that lays
           out as a block, so the add button ends up on its own line under the
           label instead of opposite it. -->
      <div class="d-flex align-center px-2 pt-2 pb-1">
        <span class="salt-eyebrow mb-0">Summary Groups</span>
        <v-spacer />
        <v-btn
          size="x-small"
          :icon="mdiPlus"
          variant="tonal"
          aria-label="Add summary group"
          title="Add summary group"
          @click="addFolder"
        />
      </div>

      <v-list-item
        v-for="f in app.state.folders"
        :key="f.FolderID"
        :active="f.FolderID === app.state.selectedFolderId"
        color="primary"
        :prepend-icon="mdiFolderOutline"
        @click="emit('select', f.FolderID)"
      >
        <v-list-item-title>{{ f.FolderName }}</v-list-item-title>
        <template #append>
          <v-btn
            size="x-small"
            :icon="mdiPencil"
            variant="text"
            aria-label="Rename summary group"
            title="Rename"
            @click.stop="rename(f)"
          />
          <v-btn
            size="x-small"
            :icon="mdiDelete"
            variant="text"
            color="error"
            aria-label="Delete summary group"
            title="Delete group"
            @click.stop="remove(f)"
          />
        </template>
      </v-list-item>

      <v-list-item v-if="!app.state.folders.length">
        <span class="text-body-2" style="opacity: 0.7">No summary groups yet.</span>
      </v-list-item>
    </v-list>
  </nav>
</template>
