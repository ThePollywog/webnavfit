/*
 * fitrepFields.js — maps NAVPERS 1610/2 form widgets (fields-blank.json) to editable
 * bindings on a report object, for the interactive canvas editor.
 *
 * Each entry describes how a widget group reads/writes the report. Text groups
 * bind to a single report field (or a composed value). Radio groups (traits,
 * duty status, promotion, statement) map an integer/enum to the selected index.
 * Standalone checkboxes map a boolean report field.
 *
 * Geometry (x,y,w,h in PDF points, top-left origin) lives in fields-blank.json; this
 * module is purely the data binding + widget classification.
 */
import { traitsFor, DUTY_STATUS } from "./model.js";

// Radio groups: one selection among sibling widgets (by their `on` value).
const TRAIT_GROUPS = ["f33x", "f34x", "f35x", "f36x", "f37x", "f38x", "f39x"];
export const RADIO_GROUPS = TRAIT_GROUPS.concat(["f05x", "f42x", "f46rx"]);
export function isRadioGroup(g) { return RADIO_GROUPS.indexOf(g) !== -1; }

// Standalone checkboxes → boolean report fields.
export const CHECK_FIELD = {
  f10x: "Periodic", f11x: "DetInd", f12x: "Frocking", f13x: "Special",
  f16x: "NOB", f17x: "Regular", f18x: "Concurrent", f19x: "OpsCdr",
};

// Text widgets → simple report field (1:1). Composed ones handled separately.
export const TEXT_FIELD = {
  f01x: "FullName", f02xOfficer: "Rate", f02x: "Rate", f03x: "Desig", f04x: "SSN",
  f06x: "UIC", f07x: "ShipStation", f08x: "PromotionStatus", f09x: "DateReported",
  f14x: "FromDate", f15x: "ToDate", f20x: "PhysicalReadiness", f21x: "BilletSubcat",
  f22x: "ReportingSenior", f23x: "RSGrade", f24x: "RSDesig", f25x: "RSTitle",
  f26x: "RSUIC", f27x: "RSSSN", f28x: "Achievements", f29x: "Duties", f29ax: "PrimaryDuty",
  f30x: "DateCounseled", f31x: "CounselerLN",
  f40ax: "RecommendA", f40bx: "RecommendB", f41: "Comments",
  f43ax: "SummarySP", f43bx: "SummaryProg", f43cx: "SummaryProm",
  f43dx: "SummaryMP", f43ex: "SummaryEP",
  f45dx: "RaterDate", f46dx: "SeniorRaterDate",
};

// Groups that are multi-line narrative (bigger editing box on the canvas).
export const MULTILINE = new Set(["f28x", "f29x", "f41", "f44x", "f47x"]);

// Human labels for the click-to-edit tooltip / helper.
export const LABEL = {
  f01x: "1. Name (Last, First MI)", f02xOfficer: "2. Grade/Rate", f03x: "3. Designator",
  f04x: "4. DoD ID/SSN", f05x: "5. Duty Status", f06x: "6. UIC", f07x: "7. Ship/Station",
  f08x: "8. Promotion Status", f09x: "9. Date Reported", f14x: "14. From", f15x: "15. To",
  f16x: "16. Not Observed", f17x: "17. Regular", f18x: "18. Concurrent", f19x: "19. Ops Cdr",
  f20x: "20. Physical Readiness", f21x: "21. Billet Subcategory",
  f22x: "22. Reporting Senior", f28x: "28. Command Achievements", f29x: "29. Duties",
  f41: "41. Comments", f42x: "42. Promotion Recommendation",
  f33x: "33. Professional Expertise", f34x: "34. Command/Org Climate",
  f35x: "35. Military Bearing", f36x: "36. Teamwork", f37x: "37. Mission Accomplishment",
  f38x: "38. Leadership", f39x: "39. Tactical Performance",
};

// Trait grade labels 0..5.
export const GRADE_LABEL = ["NOB", "1.0", "2.0", "3.0", "4.0", "5.0"];

// --- read a group's current value from the report ---
export function readGroup(group, report) {
  if (TEXT_FIELD[group]) {
    // f44x address + f47x concurrent-RS are composed read-only-ish; keep raw pieces
    return report[TEXT_FIELD[group]] || "";
  }
  if (CHECK_FIELD[group]) return !!report[CHECK_FIELD[group]];
  if (group === "f44x") return composeAddress(report);
  if (group === "f47x") return composeRRS(report);
  if (group === "f45memberx" || group === "f45groupx") return ""; // computed, drawn elsewhere
  if (TRAIT_GROUPS.indexOf(group) !== -1) {
    const col = traitsFor(report.ReportType)[TRAIT_GROUPS.indexOf(group)];
    return Number(report[col]) || 0;         // 0..5
  }
  if (group === "f42x") return Number(report.PromotionRecom) || 0;
  if (group === "f05x") { for (let i = 0; i < DUTY_STATUS.length; i++) if (report[DUTY_STATUS[i]]) return i; return -1; }
  if (group === "f46rx") return report.StatementYes ? 0 : report.StatementNo ? 1 : -1;
  return "";
}

// --- write a group's value back into the report (mutates) ---
export function writeGroup(group, report, value) {
  if (TEXT_FIELD[group]) {
    report[TEXT_FIELD[group]] = value;
    // keep LastName roughly in sync when the name box is edited directly
    if (group === "f01x" && typeof value === "string") report.LastName = value.split(",")[0].trim();
    return;
  }
  if (CHECK_FIELD[group]) { report[CHECK_FIELD[group]] = !!value; return; }
  if (TRAIT_GROUPS.indexOf(group) !== -1) {
    const col = traitsFor(report.ReportType)[TRAIT_GROUPS.indexOf(group)];
    report[col] = Number(value) || 0;
    return;
  }
  if (group === "f42x") { report.PromotionRecom = Number(value) || 0; return; }
  if (group === "f05x") {
    DUTY_STATUS.forEach((k, i) => { report[k] = (i === Number(value)); });
    return;
  }
  if (group === "f46rx") {
    report.StatementYes = value === 0; report.StatementNo = value === 1;
    return;
  }
  if (group === "f44x") { report.RSAddress1 = value; return; }   // simple: dump into line 1
  if (group === "f47x") { report.RRSCommand = value; return; }
}

function composeAddress(r) {
  const lines = [];
  if (r.RSAddress1) lines.push(r.RSAddress1);
  if (r.RSAddress2) lines.push(r.RSAddress2);
  let city = [r.RSCity, r.RSState].filter(Boolean).join(", ");
  if (r.RSZipCd) city += (city ? " " : "") + r.RSZipCd;
  if (city) lines.push(city);
  return lines.join("\n");
}
function composeRRS(r) {
  const parts = [];
  const nm = [r.RRSLastName, r.RRSFI].filter(Boolean).join(", ");
  if (nm) parts.push(nm);
  if (r.RRSGrade) parts.push(r.RRSGrade);
  if (r.RRSCommand) parts.push(r.RRSCommand);
  return parts.join("  ");
}
