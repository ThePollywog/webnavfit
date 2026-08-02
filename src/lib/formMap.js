/*
 * formMap.js — maps a report record onto the official NAVPERS 1610/2 widgets.
 * Returns { text, checks, radios } keyed by widget group name. Ported verbatim
 * from the verified vanilla print module so overlay placement stays exact.
 */
import { traitsFor, DUTY_STATUS } from "./model.js";
import * as Calc from "./calc.js";

const TRAIT_GROUPS = ["f33x", "f34x", "f35x", "f36x", "f37x", "f38x", "f39x"];
const RADIO_GROUPS = TRAIT_GROUPS.concat(["f05x", "f42x", "f46rx"]);
export function isRadio(group) { return RADIO_GROUPS.indexOf(group) !== -1; }
export { TRAIT_GROUPS };

function composeName(ln, fi, mi) {
  let s = ln || "";
  if (fi) s += (s ? ", " : "") + fi;
  if (mi) s += " " + mi;
  return s.trim();
}
export function memberName(r) {
  if (r.FullName) return r.FullName;
  let s = r.LastName || "";
  if (r.FirstName) s += (s ? ", " : "") + r.FirstName;
  if (r.MI) s += " " + r.MI;
  if (r.Suffix) s += " " + r.Suffix;
  return s.trim();
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
  const parts = [], name = composeName(r.RRSLastName, r.RRSFI, r.RRSMI);
  if (name) parts.push(name);
  if (r.RRSGrade) parts.push(r.RRSGrade);
  if (r.RRSCommand) parts.push(r.RRSCommand);
  if (r.RRSUIC) parts.push("UIC " + r.RRSUIC);
  return parts.join("  ");
}

export function buildValues(r, opts = {}) {
  const traits = traitsFor(r.ReportType);
  const name = memberName(r);
  const text = {}, checks = {}, radios = {};

  text.f01x = name;
  text.f02xOfficer = r.Rate; text.f02x = r.Rate;
  text.f03x = r.Desig; text.f04x = r.SSN;
  text.f06x = r.UIC; text.f07x = r.ShipStation;
  text.f08x = r.PromotionStatus; text.f09x = r.DateReported;
  text.f14x = r.FromDate; text.f15x = r.ToDate;
  text.f20x = r.PhysicalReadiness; text.f21x = r.BilletSubcat;
  text.f22x = r.ReportingSenior || composeName(r.RSLastName, r.RSFI, r.RSMI);
  text.f23x = r.RSGrade; text.f24x = r.RSDesig; text.f25x = r.RSTitle;
  text.f26x = r.RSUIC; text.f27x = r.RSSSN;
  text.f28x = r.Achievements; text.f29x = r.Duties; text.f29ax = r.PrimaryDuty;
  text.f30x = r.DateCounseled;
  text.f31x = composeName(r.CounselerLN, r.CounselerFI, r.CounselerMI);
  text.f40ax = r.RecommendA; text.f40bx = r.RecommendB;
  text.f41 = r.Comments;
  text.f43ax = r.SummarySP; text.f43bx = r.SummaryProg; text.f43cx = r.SummaryProm;
  text.f43dx = r.SummaryMP; text.f43ex = r.SummaryEP;
  text.f44x = composeAddress(r);
  text.f45dx = r.RaterDate;
  text.f45memberx = Calc.fmt(Calc.memberTraitAverage(r), 2);
  if (opts.summaryGroupAverage != null && opts.summaryGroupAverage !== "")
    text.f45groupx = typeof opts.summaryGroupAverage === "number"
      ? Calc.fmt(opts.summaryGroupAverage, 2) : String(opts.summaryGroupAverage);
  text.f46ax = name;
  text.f46dx = r.SeniorRaterDate;
  text.f47x = composeRRS(r);

  checks.f10x = !!r.Periodic; checks.f11x = !!r.DetInd;
  checks.f12x = !!r.Frocking; checks.f13x = !!r.Special;
  checks.f16x = !!r.NOB;
  checks.f17x = !!r.Regular; checks.f18x = !!r.Concurrent; checks.f19x = !!r.OpsCdr;

  for (let i = 0; i < DUTY_STATUS.length; i++) if (r[DUTY_STATUS[i]]) { radios.f05x = i; break; }
  for (let k = 0; k < TRAIT_GROUPS.length; k++) radios[TRAIT_GROUPS[k]] = Number(r[traits[k]]) || 0;
  radios.f42x = Number(r.PromotionRecom) || 0;
  if (r.StatementYes) radios.f46rx = 0; else if (r.StatementNo) radios.f46rx = 1;

  return { text, checks, radios };
}

// Fixed-pitch wrap for narrative blocks (returns the physical lines).
export function wrapLines(text, cols) {
  const out = [];
  String(text == null ? "" : text).split("\n").forEach((para) => {
    if (para.length === 0) { out.push(""); return; }
    const words = para.split(" "); let line = "";
    for (let w of words) {
      while (w.length > cols) { if (line) { out.push(line); line = ""; } out.push(w.slice(0, cols)); w = w.slice(cols); }
      if (line === "") line = w;
      else if (line.length + 1 + w.length <= cols) line += " " + w;
      else { out.push(line); line = w; }
    }
    out.push(line);
  });
  return out;
}
