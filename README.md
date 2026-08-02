# WEBNAVFIT

**A browser-based reconstruction of NAVFIT98A.** Prepare U.S. Navy performance
evaluations — FITREP, EVAL, and Chief Eval — and print them onto the official
**NAVPERS 1610/2** form with pixel-exact fidelity. Everything runs in your
browser; there is **no server and nothing is uploaded**.

▶ **Live app: https://thepollywog.github.io/WEBNAVFIT/**

📖 **New here? Read the [User Guide](USER-GUIDE.md)** for step-by-step instructions.

> **Preparation aid only.** WEBNAVFIT is an unofficial tool for drafting
> evaluations. It is not affiliated with or endorsed by the U.S. Navy or BUPERS.
> The system of record remains eNavFit / NAVFIT98A. Do not enter classified
> information. See [Privacy](#privacy).

---

## Features

- **Summary groups** — organize reports by reporting senior and reporting period.
- **FITREP / EVAL / Chief Eval** entry with the correct traits and layout per
  report type.
- **Live trait averaging**, RSCA, promotion-recommendation summary, and BUPERS
  validation as you type.
- **Exact NAVPERS 1610/2 PDF output** — data drawn as monospace Courier at the
  real eNavFit sizes and positions, so the printed form is indistinguishable
  from an official one.
- **Click-to-edit form canvas** — fill the report visually on an image of the
  actual form, and drop draggable text / signature annotations anywhere.
- **Open & edit any PDF** — upload a PDF, fill its form fields in place, add
  text/signatures, and download the result.
- **Portable data** — everything is stored locally in your browser; export or
  import the whole database as a single `.json` file.

## Privacy

WEBNAVFIT is **100% client-side**:

- Your data lives only in your browser's **IndexedDB**. It is never transmitted.
- **PDF generation and editing** use [pdf-lib](https://pdf-lib.js.org/) and
  [pdf.js](https://mozilla.github.io/pdf.js/) locally — uploaded PDFs never
  leave your machine.
- The only network requests are for the app's own static assets (bundled at
  build time). It works offline once loaded.

Because it is a pure static site, you can also self-host it on any static host
(S3, Netlify, your own web server) or run it locally — see below.

## Run locally

```sh
npm install        # first time only
npm run dev        # dev server at http://localhost:8772
# production build:
npm run build && npm run preview
```

Requires Node 20+.

## Deploy to GitHub Pages

This repo ships a workflow at `.github/workflows/deploy.yml` that builds the app
and publishes `dist/` to GitHub Pages on every push to `main`.

To enable it on a fork:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main` (or run it manually from **Actions → Deploy → Run workflow**).

The site is served from `https://<user>.github.io/<repo>/`. `vite.config.js`
sets `base: "./"` (relative URLs) and a `.nojekyll` file ships in the build, so
it works from that subpath with no extra configuration.

## Tech

Vue 3 + Vuetify 3, built with Vite. No backend.

| Path | Purpose |
| ---- | ------- |
| `src/lib/model.js` | Report/folder records + trait ordering per report type. |
| `src/lib/calc.js` | Trait/summary averaging, RSCA, promotion summary, validation. |
| `src/lib/store.js` | IndexedDB persistence + JSON export/import. |
| `src/lib/refdata.json` | Reference data (dropdowns, trait descriptors). |
| `src/lib/fields-blank.json` | Official-form field geometry + font sizes (PDF points), measured from real eNavFit output. |
| `src/lib/pdf.js` | Generates the NAVPERS 1610/2 PDF with pdf-lib. |
| `src/lib/pdfForm.js` | Reads & fills AcroForm fields of uploaded PDFs. |
| `src/lib/pdfRender.js` | Rasterizes uploaded PDF pages (pdf.js) for the editor. |
| `src/components/FitrepCanvasEditor.vue` | Click-to-edit form canvas (FITREP + uploaded-PDF modes). |
| `src/components/ReportEditor.vue` | Full report editor with live average + validation. |
| `src/components/FormPreview.vue` | Fullscreen PDF preview + Save PDF. |
| `public/form-bg{1,2}.png` | Crisp raster of the official blank NAVPERS 1610/2. |

## PDF fidelity

"Save PDF" builds the file client-side with **pdf-lib** — never via the
browser's Print (which injects headers/URLs). Each page is a raster of the
official blank form with the report's data drawn as vector text in **Courier**
at the exact sizes the real eNavFit tool uses (12 pt for single-line fields,
9.6/9 pt for the narrative blocks), positioned from measurements of a genuine
filled form. Generation takes ~0.3 s per report.

## License

[MIT](LICENSE) — the code is free to use and modify. The NAVPERS 1610/2 form
layout is a U.S. Government work.
