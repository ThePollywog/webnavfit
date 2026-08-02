# WEBNAVFIT — User Guide

WEBNAVFIT helps you draft U.S. Navy performance evaluations (FITREP, EVAL, and
Chief Eval) and print them onto the official **NAVPERS 1610/2** form. It runs
entirely in your web browser — nothing is uploaded and no account is required.

**Open it here:** https://thepollywog.github.io/WEBNAVFIT/

> ⚠️ **Preparation aid only.** This is an unofficial drafting tool, not affiliated
> with the Navy or BUPERS. The official system of record is eNavFit / NAVFIT98A —
> always submit through official channels. **Do not enter classified information.**

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [Where your data is stored](#2-where-your-data-is-stored)
3. [Step 1 — Create a summary group](#3-step-1--create-a-summary-group)
4. [Step 2 — Add a report](#4-step-2--add-a-report)
5. [Step 3 — Fill out the report](#5-step-3--fill-out-the-report)
6. [Trait marks, averages & validation](#6-trait-marks-averages--validation)
7. [Preview & save the PDF](#7-preview--save-the-pdf)
8. [Edit on the form (click-to-edit + signatures)](#8-edit-on-the-form-click-to-edit--signatures)
9. [Summary group totals & Auto Summary](#9-summary-group-totals--auto-summary)
10. [Open & edit any PDF](#10-open--edit-any-pdf)
11. [Back up, restore & move your data](#11-back-up-restore--move-your-data)
12. [Menu reference](#12-menu-reference)
13. [FAQ & troubleshooting](#13-faq--troubleshooting)

---

## 1. The big picture

WEBNAVFIT mirrors how NAVFIT98A works:

```
Summary Group  (a reporting senior + a reporting period)
   └── Report   (one FITREP / EVAL / Chief Eval per Sailor)
   └── Report
   └── ...
```

You create a **summary group**, add one **report** per member, fill each one
out, and print the official form. The summary group automatically tallies
promotion recommendations and the group trait average across its reports.

The screen has three areas:

- **Top bar** — the WEBNAVFIT wordmark and the **File / Tools / Help** menus.
- **Left sidebar** — your list of summary groups.
- **Main area** — the reports in the selected group, plus that group's stats.

---

## 2. Where your data is stored

Everything you enter is saved **locally in your browser** (in its IndexedDB
storage). That means:

- ✅ It's private — nothing is sent anywhere.
- ✅ It persists between visits on the **same browser and device**.
- ⚠️ It is **not** synced across devices or browsers, and clearing your browser
  data will erase it.

To move your work to another computer, or to keep a backup, use
**File ▸ Export** (see [section 11](#11-back-up-restore--move-your-data)).

---

## 3. Step 1 — Create a summary group

A summary group represents one **reporting senior** and one **reporting period**.

1. In the left sidebar, click the **➕ (Add summary group)** button.
2. Give it a name (e.g. `CDR SMITH — 2025 Periodic`).
3. Click the group in the sidebar to select it. Its reports appear on the right.

To **rename** a group, hover it and click the ✎ pencil. To **delete** it (and
all its reports), click the 🗑 trash — you'll be asked to confirm.

---

## 4. Step 2 — Add a report

With a summary group selected, use the buttons at the top of the main area:

- **New FITREP** — officers (W2–O6).
- **New EVAL** — E1–E6.
- **New Chief Eval** — E7–E9.

Each report type uses the correct set of performance traits and the right form
layout. A new report opens the editor immediately.

The reports table shows every report in the group with its name, type, period,
promotion recommendation, member trait average, and validation status.

---

## 5. Step 3 — Fill out the report

Open a report by clicking the **✎ Edit** icon on its row (or double-click the
name). The editor is a full-screen form organized by the numbered blocks of the
NAVPERS 1610/2:

- **Identity (blocks 1–4):** name, rank/rate, designator, DoD ID / SSN.
- **Status & occasion (5–21):** duty status, UIC, ship/station, promotion
  status, dates reported/from/to, occasion for report, type of report, physical
  readiness (block 20), billet subcategory.
- **Reporting senior (22–27):** name, grade, designator, title, UIC, SSN.
- **Narrative (28/29):** command employment & achievements; primary/collateral/
  watchstanding duties (with the primary-duty abbreviation).
- **Traits (33–39):** the performance-trait marks — see below.
- **Comments (40/41):** career recommendations and the performance comments.
- **Promotion & signatures (42–47):** promotion recommendation, addresses, dates.

**Date fields** have a calendar picker — click the field and choose a date; it
is stored in the Navy `DDMMMYY` format (e.g. `23OCT14`).

**Block 20 (Physical Readiness)** accepts the BUPERS PFA codes — `P`, `B`, `M`,
`W`, `F`, `N` — one letter per cycle.

Changes are kept as you go. Close the editor to return to the list.

---

## 6. Trait marks, averages & validation

For each performance trait (blocks 33–39) choose a grade: **NOB** (not observed)
or **1.0 – 5.0**. As you set marks:

- The **Member Trait Average** updates live (shown in the editor and the list).
- **Block 42 Promotion Recommendation** and the summary-group tallies update.
- **Validation** flags anything BUPERS rules require you to substantiate — for
  example, any **1.0** mark, three or more **2.0** marks, or a **2.0** in block
  34/35 must be justified in the comments. The report's **Validated** chip in the
  list turns green when it passes.

Validation is a drafting aid; always confirm against current BUPERSINST
guidance before submitting.

---

## 7. Preview & save the PDF

From any report row:

- **👁 Preview** opens a full-screen view of the filled official form. You can
  zoom, and Save the PDF from here.
- **📄 Save PDF** downloads the completed **NAVPERS 1610/2** as a real PDF.

The PDF is built entirely in your browser with the data drawn in Courier at the
exact sizes and positions the official eNavFit tool uses — the output is
designed to be indistinguishable from an official print. It does **not** contain
the browser's print headers/URLs.

To save the **entire summary group** as one multi-page PDF, use the **Save PDF**
button at the top of the reports list.

---

## 8. Edit on the form (click-to-edit + signatures)

Click the **▦ Edit on form** icon on a report row to open the **click-to-edit
canvas**. This shows an image of the actual NAVPERS 1610/2 with editable fields
laid directly on top:

- **Click any field** and type — text, checkboxes, and trait marks are all
  editable in place.
- **Add Text** / **Add Signature** — click the toolbar button, then click on the
  page to drop a movable text or signature annotation. Drag it to position;
  use the small toolbar on a selected annotation to resize, bold, or delete it.
- **Zoom** with the magnifier buttons.
- **Save** keeps your changes on the report; **Save & PDF** also downloads the
  finished form.

This is the easiest way to add a signature block or a note that isn't a standard
form field.

---

## 9. Summary group totals & Auto Summary

Below the reports table, the **Summary Group** panel shows:

- **Summary Group Average** — the average of the members' trait averages.
- **RSCA** — Reporting Senior Cumulative Average.
- **Report count** and the **Promotion Summary** (block 43) counts: NOB / SP /
  Prog / Prom / MP / EP.

**Tools ▸ Auto Summary** writes those block-43 promotion counts into each report
so they print correctly on the form.

---

## 10. Open & edit any PDF

**Tools ▸ Open PDF…** lets you work on an arbitrary PDF — handy for other Navy
forms:

1. Choose a PDF file. Its pages render on screen.
2. If the PDF has **fillable form fields**, they appear as editable boxes
   (highlighted) right where they belong — fill them in.
3. Use **Add Text** / **Add Signature** to drop annotations anywhere, just like
   the form canvas.
4. **Download PDF** saves a copy with your field values and annotations baked in.

The uploaded PDF never leaves your browser.

---

## 11. Back up, restore & move your data

Because data lives only in your browser, use export/import to back it up or move
it between computers:

- **File ▸ Export (.json)…** — downloads your entire database (all groups and
  reports) as one `.json` file. Keep this as your backup.
- **File ▸ Open / Import (.json)…** — loads a previously exported file,
  replacing the current data.
- **File ▸ New Database** — clears everything to start fresh (you'll be asked to
  confirm; export first if you might want it back).

**Tip:** export regularly, especially before clearing browser data, switching
browsers, or using a shared/lab computer.

---

## 12. Menu reference

**File**
- **New Database** — erase all data and start over.
- **Open / Import (.json)…** — restore from an exported backup.
- **Export (.json)…** — download a full backup.

**Tools**
- **Auto Summary** — fill each report's block-43 promotion counts.
- **Open PDF…** — open any PDF to fill fields / add signatures.
- **Lookup Tables** — browse the reference data (ranks, designators, codes, trait
  descriptors).

**Help**
- **How To** — a quick in-app summary.
- **About** — version and background.

**Report row actions:** 👁 Preview · ✎ Edit · ▦ Edit on form · 📄 Save PDF · 🗑 Delete.

---

## 13. FAQ & troubleshooting

**Is my data private?**
Yes. Everything stays in your browser's local storage and is never transmitted.
PDF generation and editing happen locally too.

**I don't see my reports on another computer.**
Data doesn't sync across devices. Use **File ▸ Export** on the first computer and
**File ▸ Open / Import** on the second.

**My data disappeared.**
Clearing browser data / cache, using private/incognito mode, or a different
browser will each show an empty database. Restore from your exported `.json`.

**Can I use this offline?**
Yes — once the page has loaded, it works without a network connection.

**Does the printed PDF look like the real form?**
Yes. The output is drawn onto a high-resolution image of the genuine blank
NAVPERS 1610/2 using the same font and placement as eNavFit.

**Is this official / can I submit the PDF directly?**
No. WEBNAVFIT is an unofficial preparation aid. Submit evaluations through the
official eNavFit / NAVFIT98A process per current BUPERS guidance.

**I found a bug or want a feature.**
Open an issue at https://github.com/ThePollywog/WEBNAVFIT/issues.
