/*
 * calc.js — evaluation math and validation (ES module port).
 * Identical logic to the verified vanilla app: member/summary-group averages,
 * RSCA, promotion summary, summary rank, and NF_Validate substantiation rules.
 */
import { traitsFor, OCCASIONS } from "./model.js";

// Round half-up to n decimals. Snap floating-point error via toPrecision(15)
// so half-way values (e.g. 4.145) round up correctly at trait magnitudes.
export function round(v, n) {
  if (v == null || isNaN(v)) return null;
  const f = Math.pow(10, n == null ? 2 : n);
  const scaled = Number((v * f).toPrecision(15));
  return Math.round(scaled) / f;
}
export function fmt(v, n) {
  const r = round(v, n);
  return r == null ? "" : r.toFixed(n == null ? 2 : n);
}

export function memberTraitAverage(report) {
  const cols = traitsFor(report.ReportType);
  let sum = 0, count = 0;
  for (const c of cols) {
    const g = Number(report[c]) || 0;
    if (g >= 1 && g <= 5) { sum += g; count++; }
  }
  return count === 0 ? null : round(sum / count, 2);
}

export function isGraded(report) {
  if (report.NOB) return false;
  return memberTraitAverage(report) != null;
}

export function summaryGroupAverage(reports) {
  let sum = 0, count = 0;
  for (const r of reports) {
    if (!isGraded(r)) continue;
    const a = memberTraitAverage(r);
    if (a != null) { sum += a; count++; }
  }
  return count === 0 ? null : round(sum / count, 2);
}

export function promotionSummary(reports) {
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reports) {
    const p = Number(r.PromotionRecom) || 0;
    if (counts[p] == null) counts[p] = 0;
    counts[p]++;
  }
  return { NOB: counts[0], SP: counts[1], Prog: counts[2], Prom: counts[3], MP: counts[4], EP: counts[5] };
}

export function rsca(reports) {
  let sum = 0, count = 0;
  for (const r of reports) {
    const p = Number(r.PromotionRecom) || 0;
    if (p >= 1 && p <= 5) { sum += p; count++; }
  }
  return count === 0 ? null : round(sum / count, 2);
}

export function summaryRank(report, reports) {
  const mine = Number(report.PromotionRecom) || 0;
  if (mine < 1) return null;
  const graded = reports.filter((r) => {
    const p = Number(r.PromotionRecom) || 0; return p >= 1 && p <= 5;
  });
  const better = graded.filter((r) => (Number(r.PromotionRecom) || 0) > mine).length;
  return { rank: better + 1, of: graded.length };
}

export function validate(report) {
  const errors = [];
  const type = report.ReportType;
  const cols = traitsFor(type);
  const comments = (report.Comments || "").trim();
  const hasComments = comments.length > 0;

  let ones = 0, twos = 0;
  const twoTraits = [];
  for (const c of cols) {
    const g = Number(report[c]) || 0;
    if (g === 1) ones++;
    if (g === 2) { twos++; twoTraits.push(c); }
  }
  const climateCol = "EO";

  function needSub(reason) {
    if (!hasComments) {
      errors.push({ code: "SUBSTANTIATION", message: reason +
        " must be specifically substantiated in comments (block " +
        (type === "FITREP" ? "41" : "43") + "), which is empty." });
    }
  }
  if (ones > 0) needSub(ones + " mark(s) of 1.0");
  if (twos >= 3) needSub("Three or more 2.0 marks");
  if (twoTraits.indexOf(climateCol) !== -1) needSub("A 2.0 in the Command/Organizational Climate block");

  if (!report.LastName && !report.FullName) errors.push({ code: "NAME", message: "Member name (block 1) is required." });
  if (!report.FromDate || !report.ToDate) errors.push({ code: "PERIOD", message: "Reporting period From/To (blocks 14-15) is required." });
  if (!report.NOB && (Number(report.PromotionRecom) || 0) < 1) errors.push({ code: "PROMOTION", message: "A promotion recommendation (block 42) is required on an observed report." });
  const occ = OCCASIONS.filter((o) => report[o]);
  if (occ.length !== 1) errors.push({ code: "OCCASION", message: "Exactly one Occasion for Report (blocks 10-13) must be selected." });

  return { ok: errors.length === 0, errors };
}
