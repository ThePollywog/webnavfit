import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Build stamp. The GitHub Pages workflow runs `npm version patch` and commits
// the bump before building, so package.json's version is already a real,
// distinct semver per deployment — no run-number suffix needed. Locally
// (where that bump hasn't happened) the version reads "1.0.0-dev".
const sha = (process.env.GITHUB_SHA || "").slice(0, 7);
const version = process.env.GITHUB_SHA ? pkg.version : `${pkg.version}-dev`;

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
