import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

// Vue 3 + Vuetify 3 build for the NAVFIT98A web app.
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  base: "./",
  server: { port: 8772 },
  build: { outDir: "dist" },
});
