/*
 * evalFields.js — maps NAVPERS 1616/26 (EVAL) form widgets (fields-eval.json)
 * to editable bindings on a report object.
 *
 * Blocks 1-39 are pixel-identical to the FITREP form (same coordinates,
 * verified against both blank templates) and reuse fitrepFields.js's group
 * names directly, so this module only adds the blocks unique to EVAL
 * (40-52). See fitrepFields.js for the general shape of this API.
 */
import { traitsFor, DUTY_STATUS } from "./model.js";

const TRAIT_GROUPS = ["f33x", "f34x", "f35x", "f36x", "f37x", "f38x", "f39x"];
// f47retx (Retention Recommendation) is a yes/no radio pair — readGroup/
// writeGroup already handle it, but it was missing here, which silently made
// it un-selectable anywhere that classifies widgets via isRadioGroup (e.g.
// the Direct Edit canvas panel).
export const RADIO_GROUPS = TRAIT_GROUPS.concat(["f05x", "f45indx", "f47retx", "f51stmtx"]);
export function isRadioGroup(g) { return RADIO_GROUPS.indexOf(g) !== -1; }

export const CHECK_FIELD = {
  f10x: "Periodic", f11x: "DetInd", f12x: "Frocking", f13x: "Special",
  f16x: "NOB", f17x: "Regular", f18x: "Concurrent", f19x: "OpsCdr",
};

export const TEXT_FIELD = {
  f01x: "FullName", f02xOfficer: "Rate", f02x: "Rate", f03x: "Desig", f04x: "SSN",
  f06x: "UIC", f07x: "ShipStation", f08x: "PromotionStatus", f09x: "DateReported",
  f14x: "FromDate", f15x: "ToDate", f20x: "PhysicalReadiness", f21x: "BilletSubcat",
  f22x: "ReportingSenior", f23x: "RSGrade", f24x: "RSDesig", f25x: "RSTitle",
  f26x: "RSUIC", f27x: "RSSSN", f28x: "Achievements", f29x: "Duties", f29ax: "PrimaryDuty",
  f30x: "DateCounseled", f31x: "CounselerLN",
  f41recx: "RecommendA", f42datex: "RaterDate", f43cmtx: "Comments", f44qualx: "Qualifications",
  f46sumSP: "SummarySP", f46sumProg: "SummaryProg", f46sumProm: "SummaryProm",
  f46sumMP: "SummaryMP", f46sumEP: "SummaryEP",
  f49datex: "SeniorRaterDate",
};

// f52rrsx (concurrent RS) is composed, like FITREP's f47x.
export const MULTILINE = new Set(["f28x", "f29x", "f43cmtx", "f44qualx", "f48addrx", "f52rrsx"]);

export const LABEL = {
  f01x: "1. Name (Last, First MI)", f02xOfficer: "2. Rate/Rating", f03x: "3. Designator",
  f04x: "4. DoD ID/SSN", f05x: "5. Duty Status", f06x: "6. UIC", f07x: "7. Ship/Station",
  f08x: "8. Promotion Status", f09x: "9. Date Reported", f14x: "14. From", f15x: "15. To",
  f16x: "16. Not Observed", f17x: "17. Regular", f18x: "18. Concurrent", f19x: "19. Ops Cdr",
  f20x: "20. Physical Readiness", f21x: "21. Billet Subcategory",
  f22x: "22. Reporting Senior", f28x: "28. Command Achievements", f29x: "29. Duties",
  f33x: "33. Professional Knowledge", f34x: "34. Quality of Work",
  f35x: "35. Command/Org Climate", f36x: "36. Military Bearing/Character",
  f37x: "37. Personal Job Accomplishment", f38x: "38. Teamwork", f39x: "39. Leadership",
  f40avgx: "40. Individual Trait Average", f41recx: "41. Recommendation",
  f42datex: "42. Rater Signature Date", f43cmtx: "43. Comments on Performance",
  f44qualx: "44. Qualifications/Achievements", f45indx: "45. Individual Promotion Recommendation",
  f46sumSP: "46. Summary: Significant Problems", f46sumProg: "46. Summary: Progressing",
  f46sumProm: "46. Summary: Promotable", f46sumMP: "46. Summary: Must Promote", f46sumEP: "46. Summary: Early Promote",
  f47retx: "47. Retention Recommendation", f48addrx: "48. Reporting Senior Address",
  f49datex: "49. Senior Rater Signature Date", f50gavgx: "50. Summary Group Average",
  f51stmtx: "51. Individual Statement", f52rrsx: "52. Concurrent Reporting Senior",
};

export const GRADE_LABEL = ["NOB", "1.0", "2.0", "3.0", "4.0", "5.0"];

export function readGroup(group, report) {
  if (TEXT_FIELD[group]) return report[TEXT_FIELD[group]] || "";
  if (CHECK_FIELD[group]) return !!report[CHECK_FIELD[group]];
  if (group === "f48addrx") return composeAddress(report);
  if (group === "f52rrsx") return composeRRS(report);
  if (group === "f40avgx" || group === "f50gavgx") return ""; // computed, drawn elsewhere
  if (TRAIT_GROUPS.indexOf(group) !== -1) {
    const col = traitsFor(report.ReportType)[TRAIT_GROUPS.indexOf(group)];
    return Number(report[col]) || 0;
  }
  if (group === "f45indx") return Number(report.PromotionRecom) || 0;
  if (group === "f05x") { for (let i = 0; i < DUTY_STATUS.length; i++) if (report[DUTY_STATUS[i]]) return i; return -1; }
  if (group === "f47retx") return report.RetentionYes ? 0 : report.RetentionNo ? 1 : -1;
  if (group === "f51stmtx") return report.StatementYes ? 0 : report.StatementNo ? 1 : -1;
  return "";
}

export function writeGroup(group, report, value) {
  if (TEXT_FIELD[group]) {
    report[TEXT_FIELD[group]] = value;
    if (group === "f01x" && typeof value === "string") report.LastName = value.split(",")[0].trim();
    return;
  }
  if (CHECK_FIELD[group]) { report[CHECK_FIELD[group]] = !!value; return; }
  if (TRAIT_GROUPS.indexOf(group) !== -1) {
    const col = traitsFor(report.ReportType)[TRAIT_GROUPS.indexOf(group)];
    report[col] = Number(value) || 0;
    return;
  }
  if (group === "f45indx") { report.PromotionRecom = Number(value) || 0; return; }
  if (group === "f05x") { DUTY_STATUS.forEach((k, i) => { report[k] = (i === Number(value)); }); return; }
  if (group === "f47retx") { report.RetentionYes = value === 0; report.RetentionNo = value === 1; return; }
  if (group === "f51stmtx") { report.StatementYes = value === 0; report.StatementNo = value === 1; return; }
  if (group === "f48addrx") { report.RSAddress1 = value; return; }
  if (group === "f52rrsx") { report.RRSCommand = value; return; }
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
