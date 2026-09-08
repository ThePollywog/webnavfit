/*
 * chiefFields.js — maps NAVPERS 1616/27 (CHIEF) form widgets (fields-chief.json)
 * to editable bindings on a report object.
 *
 * Blocks 1-9, 14-15, 21-32 are pixel-identical to FITREP/EVAL and reuse their
 * group names; blocks 10-13/16-20 sit at CHIEF's own coordinates (measured
 * from blank-chief-eval.pdf — its occasion/type-of-report row is laid out
 * differently) but keep the FITREP/EVAL group names since they're the same
 * fields. Blocks 33-52 are CHIEF's own layout — its trait grid is a typed
 * decimal grade PLUS a freeform "Performance Comments" column per trait
 * (unlike FITREP/EVAL's 6-option radio grid), and its summary block splits
 * fields FITREP combines. See fitrepFields.js for the general shape of this API.
 */
import { traitsFor, DUTY_STATUS } from "./model.js";

// Traits are a typed decimal (0-5, 0 == NOB per this app's existing grade
// convention) — a plain text field, not a radio group, so CHIEF has no trait
// entries in RADIO_GROUPS at all.
export const RADIO_GROUPS = ["f05x"];
export function isRadioGroup(g) { return RADIO_GROUPS.indexOf(g) !== -1; }

export const CHECK_FIELD = {
  f10x: "Periodic", f11x: "DetInd", f12x: "Frocking", f13x: "Special",
  f16x: "NOB", f17x: "Regular", f18x: "Concurrent", f19x: "OpsCdr",
  f49yx: "StatementYes", f49nx: "StatementNo",
};

const TRAIT_GROUPS = ["f33x", "f34x", "f35x", "f36x", "f37x", "f38x", "f39x"];
// Trait comment columns, one per trait group, in the same order.
const TRAIT_CMT_GROUPS = TRAIT_GROUPS.map((g) => g + "cmt");

export const TEXT_FIELD = {
  f01x: "FullName", f02xOfficer: "Rate", f02x: "Rate", f03x: "Desig", f04x: "SSN",
  f06x: "UIC", f07x: "ShipStation", f08x: "PromotionStatus", f09x: "DateReported",
  f14x: "FromDate", f15x: "ToDate", f20x: "PhysicalReadiness", f21x: "BilletSubcat",
  f22x: "ReportingSenior", f23x: "RSGrade", f24x: "RSDesig", f25x: "RSTitle",
  f26x: "RSUIC", f27x: "RSSSN", f28x: "Achievements", f29x: "Duties", f29ax: "PrimaryDuty",
  f30x: "DateCounseled", f31x: "CounselerLN",
  f40x: "Comments",
  f46x: "RecommendA", f47x: "RecommendB",
  f48ax: "SummarySP", f48bx: "SummaryProg", f48cx: "SummaryProm",
  f48dx: "SummaryMP", f48ex: "SummaryEP",
  f51phonex: "RSPhone", f51dsnx: "RSDSN",
};
// f42ax/f42bx (Summary Ranking) and f44x/f45x (RSCA / Group Summary) are
// computed at generation time (Calc.summaryRank / Calc.rsca /
// Calc.summaryGroupAverage), not stored report fields — see pdf.js. They're
// intentionally absent from TEXT_FIELD.

export const MULTILINE = new Set([...TRAIT_CMT_GROUPS, "f28x", "f29x", "f40x", "f51x"]);

export const LABEL = {
  f01x: "1. Name (Last, First MI Suffix)", f02xOfficer: "2. Rating", f03x: "3. Designation",
  f04x: "4. SSN", f05x: "5. Duty Status", f06x: "6. UIC", f07x: "7. Ship/Station",
  f08x: "8. Promotion Status", f09x: "9. Date Reported", f14x: "14. From", f15x: "15. To",
  f16x: "16. Not Observed", f17x: "17. Regular", f18x: "18. Concurrent", f19x: "19. Ops Cdr",
  f20x: "20. Physical Readiness", f21x: "21. Billet Subcategory",
  f22x: "22. Reporting Senior", f28x: "28. Command Employment/Achievements",
  f29x: "29. Primary/Watch-standing Duties",
  f33x: "33. Technical Mastery", f34x: "34. Institutional Expertise",
  f35x: "35. Professionalism", f36x: "36. Integrity", f37x: "37. Accountability",
  f38x: "38. Deckplate Leadership", f39x: "39. Team Effectiveness",
  f33xcmt: "33. Performance Comments", f34xcmt: "34. Performance Comments",
  f35xcmt: "35. Performance Comments", f36xcmt: "36. Performance Comments",
  f37xcmt: "37. Performance Comments", f38xcmt: "38. Performance Comments",
  f39xcmt: "39. Performance Comments",
  f40x: "40. Reporting Senior Comments on Performance",
  f41x: "41. Individual Promotion Recommendation",
  f42ax: "42. Summary Ranking", f42bx: "42. Summary Ranking (of)",
  f43x: "43. Member Trait Average", f44x: "44. RSCA", f45x: "45. Group Summary",
  f46x: "46. First Career Milestone Recommendation", f47x: "47. Second Career Milestone Recommendation",
  f48ax: "48. Significant Problems", f48bx: "48. Progressing", f48cx: "48. Promotable",
  f48dx: "48. Must Promote", f48ex: "48. Early Promote",
  f49yx: "49. Intends to Submit a Statement", f49nx: "49. Does Not Intend to Submit a Statement",
  f51x: "51. Reporting Senior Address", f51phonex: "51. Phone", f51dsnx: "51. DSN",
  f52x: "52. Concurrent Reporting Senior",
};

// Trait grade is a free decimal on this form (not a fixed 0-5 button grid),
// so there's no GRADE_LABEL lookup the way FITREP/EVAL have one.

export function readGroup(group, report) {
  if (TRAIT_GROUPS.indexOf(group) !== -1) {
    const col = traitsFor(report.ReportType)[TRAIT_GROUPS.indexOf(group)];
    return Number(report[col]) || 0;
  }
  if (TRAIT_CMT_GROUPS.indexOf(group) !== -1) {
    const col = traitsFor(report.ReportType)[TRAIT_CMT_GROUPS.indexOf(group)];
    return report[col + "Comments"] || "";
  }
  if (group === "f43x") return ""; // computed member trait average, drawn elsewhere
  if (group === "f44x" || group === "f45x") return ""; // computed RSCA / group summary
  if (group === "f42ax" || group === "f42bx") return ""; // computed summary rank
  if (group === "f51x") return composeAddress(report);
  if (group === "f52x") return composeRRS(report);
  if (TEXT_FIELD[group]) return report[TEXT_FIELD[group]] || "";
  if (CHECK_FIELD[group]) return !!report[CHECK_FIELD[group]];
  if (group === "f41x") return Number(report.PromotionRecom) || 0;
  if (group === "f05x") { for (let i = 0; i < DUTY_STATUS.length; i++) if (report[DUTY_STATUS[i]]) return i; return -1; }
  return "";
}

export function writeGroup(group, report, value) {
  if (TRAIT_GROUPS.indexOf(group) !== -1) {
    const col = traitsFor(report.ReportType)[TRAIT_GROUPS.indexOf(group)];
    report[col] = Number(value) || 0;
    return;
  }
  if (TRAIT_CMT_GROUPS.indexOf(group) !== -1) {
    const col = traitsFor(report.ReportType)[TRAIT_CMT_GROUPS.indexOf(group)];
    report[col + "Comments"] = value;
    return;
  }
  if (group === "f51x") { report.RSAddress1 = value; return; }
  if (group === "f52x") { report.RRSCommand = value; return; }
  if (TEXT_FIELD[group]) {
    report[TEXT_FIELD[group]] = value;
    if (group === "f01x" && typeof value === "string") report.LastName = value.split(",")[0].trim();
    return;
  }
  if (CHECK_FIELD[group]) { report[CHECK_FIELD[group]] = !!value; return; }
  if (group === "f41x") { report.PromotionRecom = Number(value) || 0; return; }
  if (group === "f05x") { DUTY_STATUS.forEach((k, i) => { report[k] = (i === Number(value)); }); return; }
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
