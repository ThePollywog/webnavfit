/*
 * navfitAccdb.js — export summary groups/reports as a NAVFIT98A .accdb.
 *
 * Starts from public/navfit98a-template.accdb (a real NAVFIT98A database with
 * its tables emptied — see scripts/make-accdb-template.mjs) and fills Folders
 * and Reports the way NAVFIT98A itself lays them out:
 *   - Folder 1 is NAVFIT's built-in "Root"; summary groups hang off it.
 *   - Reports.Parent is the text "a <FolderID>".
 *   - ReportType is NAVFIT's spelling ("FitRep", not "FITREP").
 */
import { AccdbFile } from "./accdb.js";
import { traitsFor, TRAIT_COLUMNS } from "./model.js";

const REPORT_TYPE = { FITREP: "FitRep", EVAL: "Eval", CHIEF: "Chief" };
const DATE_FIELDS = ["DateReported", "FromDate", "ToDate", "RaterDate", "SeniorRaterDate"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// "25Sep30" (YYMMMDD, as DateField writes it) -> Date, or null.
function navyDate(s) {
  const m = /^(\d{2})([A-Za-z]{3})(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2].toUpperCase());
  return mon < 0 ? null : new Date(2000 + Number(m[1]), mon, Number(m[3]));
}

const crlf = (s) => (s ? String(s).replace(/\r?\n/g, "\r\n") : s);
const digits = (s) => String(s || "").replace(/\D/g, "");

function composeName(ln, fi, mi) {
  let s = ln || "";
  if (fi) s += (s ? ", " : "") + fi;
  if (mi) s += " " + mi;
  return s.trim();
}
function composeAddress(r) {
  const lines = [r.RSAddress1, r.RSAddress2].filter(Boolean);
  let city = [r.RSCity, r.RSState].filter(Boolean).join(", ");
  if (r.RSZipCd) city += (city ? " " : "") + r.RSZipCd;
  if (city) lines.push(city);
  return lines.join("\r\n");
}

function folderRow(f, id, parent) {
  return {
    ...f, FolderID: id, Parent: parent,
    SSN: digits(f.SSN), RSSSN: digits(f.RSSSN),
    AutoSummary: true,
  };
}

function reportRow(r, id, folderId) {
  const row = {
    ...r,
    ReportID: id,
    Parent: `a ${folderId}`,
    ReportType: REPORT_TYPE[r.ReportType] || r.ReportType,
    SSN: digits(r.SSN), RSSSN: digits(r.RSSSN),
    ReportingSenior: r.ReportingSenior || composeName(r.RSLastName, r.RSFI, r.RSMI),
    Counseler: composeName(r.CounselerLN, r.CounselerFI, r.CounselerMI),
    RSAddress: composeAddress(r),
    Achievements: crlf(r.Achievements), Duties: crlf(r.Duties),
    Comments: crlf(r.Comments), Qualifications: crlf(r.Qualifications),
    UserComments: crlf(r.UserComments),
  };
  for (const f of DATE_FIELDS) row[f] = navyDate(r[f]);
  // Only the seven traits on this report's form carry a grade.
  const traits = traitsFor(r.ReportType);
  for (const col of TRAIT_COLUMNS) row[col] = traits.includes(col) ? Number(r[col]) || 0 : null;
  // CHIEF's per-trait "Performance Comments" have no dedicated column; they
  // fill that trait's three 255-char DN fields.
  if (r.ReportType === "CHIEF") {
    for (const col of traits) {
      const text = crlf(r[`${col}Comments`] || "");
      for (let i = 0; i < 3; i++) row[`${col}DN${i + 1}`] = text.slice(i * 255, (i + 1) * 255);
    }
  }
  return row;
}

/**
 * @param {object[]} folders  app folder records (summary groups)
 * @param {object[]} reports  app report records; Parent = app FolderID
 * @returns {Promise<Uint8Array>} the .accdb bytes
 */
export async function buildNavfitAccdb(folders, reports) {
  const res = await fetch(`${import.meta.env.BASE_URL}navfit98a-template.accdb`);
  if (!res.ok) throw new Error("Could not load the NAVFIT98A template database.");
  return fillNavfitAccdb(new Uint8Array(await res.arrayBuffer()), folders, reports);
}

export function fillNavfitAccdb(template, folders, reports) {
  const db = new AccdbFile(template);

  const folderIds = new Map();   // app FolderID -> NAVFIT FolderID
  folders.forEach((f, i) => folderIds.set(String(f.FolderID), i + 2));
  const folderRows = [{ FolderName: "Root", FolderID: 1, Parent: 0, AutoSummary: true }];
  for (const f of folders) {
    const parent = folderIds.get(String(f.Parent)) || 1;
    folderRows.push(folderRow(f, folderIds.get(String(f.FolderID)), parent));
  }

  const reportRows = reports
    .filter((r) => folderIds.has(String(r.Parent)))
    .map((r, i) => reportRow(r, i + 1, folderIds.get(String(r.Parent))));

  db.writeTable("Folders", folderRows, (f) => `Summary group "${f.FolderName}"`);
  db.writeTable("Reports", reportRows, (r) => r.FullName || [r.LastName, r.FirstName].filter(Boolean).join(", ") || "Unnamed report");
  return db.toBytes();
}

export function downloadAccdb(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/msaccess" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename || "navfit98a.accdb";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
