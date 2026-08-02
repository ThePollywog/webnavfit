import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Build stamp. The GitHub Pages workflow exports GITHUB_RUN_NUMBER (a counter
// that increments on every run) and GITHUB_SHA, so each deployment gets a
// distinct, monotonically increasing build number without committing a bump —
// the workflow only has `contents: read`. Locally these are unset and the
// version reads "1.0.0-dev".
const runNumber = process.env.GITHUB_RUN_NUMBER || "";
const sha = (process.env.GITHUB_SHA || "").slice(0, 7);
const version = runNumber ? `${pkg.version}.${runNumber}` : `${pkg.version}-dev`;

// Vue 3 + Vuetify 3 build for the NAVFIT98A web app.
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  base: "./",
  server: { port: 8772 },
  build: { outDir: "dist" },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(sha),
  },
});
