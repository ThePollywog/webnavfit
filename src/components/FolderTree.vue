<script setup>
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
  <v-list density="compact" nav>
    <v-list-subheader class="nf-heading d-flex align-center">
      Summary Groups
      <v-spacer />
      <v-btn size="x-small" icon="mdi-plus" color="secondary" variant="flat" @click="addFolder" title="Add summary group" />
    </v-list-subheader>

    <v-list-item
      v-for="f in app.state.folders"
      :key="f.FolderID"
      :active="f.FolderID === app.state.selectedFolderId"
      color="primary"
      prepend-icon="mdi-folder"
      @click="emit('select', f.FolderID)"
    >
      <v-list-item-title>{{ f.FolderName }}</v-list-item-title>
      <template #append>
        <v-btn size="x-small" icon="mdi-pencil" variant="text" @click.stop="rename(f)" title="Rename" />
        <v-btn size="x-small" icon="mdi-delete" variant="text" color="error" @click.stop="remove(f)" title="Delete group" />
      </template>
    </v-list-item>

    <v-list-item v-if="!app.state.folders.length" class="text-medium-emphasis">
      No summary groups yet.
    </v-list-item>
  </v-list>
</template>
