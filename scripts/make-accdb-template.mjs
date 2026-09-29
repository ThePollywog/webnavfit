#!/usr/bin/env node
/*
 * make-accdb-template.mjs — build public/navfit98a-template.accdb from a
 * NAVFIT98A database by emptying its Folders / Reports / Summary tables and
 * zeroing every free page, so no member data (or deleted-row remnants) ships.
 * Use the blank database that ships with NAVFIT98A (Data/NF98A_empty.accdb)
 * so the template matches the current NAVFIT schema:
 *
 *   node scripts/make-accdb-template.mjs NAVFIT98/Data/NF98A_empty.accdb
 *
 * Afterwards it re-reads every text value from the source with mdbtools and
 * fails if any of them can still be found in the output (ASCII or UTF-16).
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { AccdbFile } from "../src/lib/accdb.js";

const src = process.argv[2];
const out = new URL("../public/navfit98a-template.accdb", import.meta.url);
if (!src) { console.error("usage: make-accdb-template.mjs <source.accdb>"); process.exit(1); }

const db = new AccdbFile(fs.readFileSync(src));
for (const t of ["Folders", "Reports", "Summary"]) db.writeTable(t, []);
db.scrubFreePages();
const bytes = db.toBytes();

// Leak check: every distinct value (4+ chars) in the source tables. "Root" is
// NAVFIT's built-in top folder name and also appears in its system objects.
const ALLOWED = new Set(["Root"]);
const needles = new Set();
for (const t of ["Folders", "Reports", "Summary"]) {
  const csv = execFileSync("mdb-export", ["-Q", "-d", "\u0001", "-R", "\u0002", src, t], { encoding: "utf8" });
  csv.split("\u0002").slice(1).forEach((line) =>
    line.split("\u0001").forEach((v) => { v = v.trim(); if (ALLOWED.has(v)) return; if (v.length >= 4 && !/^[\d.:\/ -]+$/.test(v) || /^\d{9}$/.test(v)) needles.add(v); }));
}
const hay = Buffer.from(bytes);
let leaks = 0;
for (const v of needles) {
  for (const probe of [v.slice(0, 24), v.slice(0, 24).toUpperCase()]) {
    if (hay.includes(Buffer.from(probe, "latin1")) || hay.includes(Buffer.from(probe, "utf16le"))) { leaks++; break; }
  }
}
if (leaks) { console.error(`ABORT: ${leaks} source value(s) still present in the template; not written.`); process.exit(2); }

fs.writeFileSync(out, bytes);
console.log(`wrote ${out.pathname} (${bytes.length} bytes); checked ${needles.size} source values, none present.`);
