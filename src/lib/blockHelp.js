/*
 * blockHelp.js — per-block guidance for the FITREP / EVAL / Chief Eval form.
 *
 * Content is a plain-language summary of the Navy Performance Evaluation System
 * guidance (BUPERSINST 1610.10 series, "EVALMAN") and the instructions printed
 * on NAVPERS 1610/2, 1616/26 and 1616/27. It is written to answer the question a
 * first-time writer actually has in front of each box: what goes in here, in what
 * format, and what gets the report kicked back.
 *
 * It is a preparation aid and is deliberately not a substitute for the
 * instruction: where the doctrine turns on a specific threshold, a forced
 * distribution table, or a list that changes between revisions, the entry says so
 * and points the writer at the current instruction rather than quoting a number
 * that may have moved. FieldHelp.vue prints that caveat under every entry.
 *
 * Keys are the field names used in ReportEditor.vue. Radio/checkbox groups are
 * keyed by their group name (DutyStatus, Occasion, ReportKind, ...) rather than a
 * model field, because the guidance is about choosing among the options.
 *
 * Shape:
 *   block   the block number(s) as they appear on the form
 *   title   the block's name on the form
 *   what    what belongs in the box
 *   format  format, length limits, and the option set where there is one
 *   watch   the mistake that most often gets this box wrong
 */

export const HELP_SOURCE =
  "Summarized from BUPERSINST 1610.10 series and the form instructions. " +
  "Verify against the current instruction before signing.";

// Build the YYMMMDD worked example from today's date (the browser's local
// clock) instead of a fixed date that goes stale.
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function todayExample() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mmm = MONTH_NAMES[d.getMonth()].slice(0, 3);
  const dd = String(d.getDate()).padStart(2, "0");
  const long = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  return `${long} is ${yy}${mmm}${dd}`;
}

export const BLOCK_HELP = {
  // ---- Block 1-4: member identity ----
  LastName: {
    block: "1",
    title: "Name",
    what:
      "The member's name exactly as it appears in their official record: last name, " +
      "first name in full, middle initial, and any generational suffix.",
    format: "Up to 27 characters. No rank, no nickname, no post-nominals.",
    watch:
      "A name that does not match the official record can file the report to the " +
      "wrong service record or get it returned unfiled.",
  },
  FirstName: {
    block: "1",
    title: "First Name",
    what: "The member's first name in full, not an initial.",
    format: "Up to 27 characters.",
  },
  MI: {
    block: "1",
    title: "Middle Initial",
    what: "Middle initial only. Leave blank if the member has no middle name.",
    format: "Up to 3 characters, so multiple middle names can be listed as initials.",
  },
  Suffix: {
    block: "1",
    title: "Suffix",
    what: "A generational suffix that is part of the legal name — JR, SR, II, III, IV.",
    watch: "Not a place for rank, warfare qualification, or designator.",
  },
  Rate: {
    block: "2",
    title: "Grade / Rate",
    what:
      "The grade or rate the member holds on the ending date of the reporting " +
      "period (block 15) — not the grade held at the start, and not one they have " +
      "only been selected for.",
    format: "Standard abbreviation: ENS, LTJG, LT, LCDR for officers; BM3, IT1, ETC for enlisted.",
    watch:
      "If the member advanced during the period, this shows the grade held at the " +
      "end. Frocked members are a special case — set block 8 to FROCKED and check " +
      "the instruction for which grade and summary group applies.",
  },
  Desig: {
    block: "3",
    title: "Designator",
    what:
      "The officer's four-digit designator, identifying their community and status " +
      "— for example 1110 surface warfare, 1310 naval aviator, 2100 medical corps.",
    format: "Four digits. Leave blank on an enlisted evaluation.",
  },
  SSN: {
    block: "4",
    title: "DoD ID Number",
    what:
      "The member's 10-digit DoD ID number, printed on their CAC. This is what " +
      "routes the report to the correct record.",
    format: "000-00-0000.",
    watch:
      "Current forms take the DoD ID, not the SSN. Do not enter a Social Security " +
      "number on a report you intend to submit.",
  },

  // ---- Block 5-9: duty status and command ----
  DutyStatus: {
    block: "5",
    title: "Duty Status",
    what: "The one status the member held for the majority of the reporting period.",
    format:
      "ACT — active duty. " +
      "TAR/FTS — Full Time Support: a career reservist on active duty supporting " +
      "the Reserve component. " +
      "INACT — a drilling reservist. " +
      "AT/ADSW/265 — a reservist on annual training, active duty for special work, " +
      "or a recall of about 265 days.",
    watch:
      "Duty status is one of the things that defines the summary group. Getting it " +
      "wrong moves the report into the wrong group and shifts the averages and " +
      "forced-distribution counts for everyone else in it.",
  },
  UIC: {
    block: "6",
    title: "UIC",
    what: "The five-character Unit Identification Code of the command writing the report.",
    format: "Five characters, e.g. 09876.",
    watch:
      "Usually the same as the reporting senior's UIC in block 26. They differ on a " +
      "concurrent report, where another command is reporting on the member.",
  },
  ShipStation: {
    block: "7",
    title: "Ship / Station",
    what: "The command the member was attached to during the reporting period.",
    format:
      "Up to 18 characters, so abbreviate the way the command normally does: " +
      "USS BAINBRIDGE, NAVSTA NORFOLK, VFA-106.",
  },
  PromotionStatus: {
    block: "8",
    title: "Promotion Status",
    what: "The member's promotion standing during the reporting period.",
    format:
      "REGULAR — holding the grade in block 2 normally. " +
      "FROCKED — authorized to wear the next grade without the pay or date of rank. " +
      "SELECTED — selected for promotion but not yet promoted. " +
      "SPOT — holding a spot promotion.",
    watch:
      "These are not cosmetic. Anything other than REGULAR can change which grade " +
      "the member is reported in and which summary group the report competes in, so " +
      "check the instruction rather than leaving the default in place.",
  },
  DateReported: {
    block: "9",
    title: "Date Reported",
    what:
      "The date the member reported to this command — not the start of this " +
      "reporting period.",
    format: `YYMMMDD, so ${todayExample()}.`,
    watch:
      "This stays the same on every report the command writes on this member. Only " +
      "blocks 14 and 15 move from one report to the next.",
  },

  // ---- Block 10-21: occasion, period, type ----
  Occasion: {
    block: "10–13",
    title: "Occasion for Report",
    what: "Why this report is being written. Exactly one occasion applies.",
    format:
      "Periodic — the regularly scheduled report for the member's grade and " +
      "competitive category. " +
      "Detachment of Individual — the member is leaving the command. " +
      "Detachment of Reporting Senior — the reporting senior is leaving. " +
      "Special — a report directed outside the normal cycle.",
    watch:
      "The occasion fixes the ending date in block 15, and periodic reports fall in " +
      "a month set by grade and competitive category rather than a month of the " +
      "command's choosing.",
  },
  FromDate: {
    block: "14",
    title: "Period of Report — From",
    what:
      "The first day this report covers. For a member with a previous report from " +
      "this command, it is the day after that report's To date: coverage of a " +
      "member's career must be continuous.",
    format: "YYMMMDD.",
    watch:
      "A gap leaves an unreported period in the record. An overlap with an existing " +
      "report gets this one returned.",
  },
  ToDate: {
    block: "15",
    title: "Period of Report — To",
    what:
      "The last day this report covers, set by the occasion in blocks 10–13: the " +
      "scheduled periodic date, the member's detachment date, or the reporting " +
      "senior's detachment date.",
    format: "YYMMMDD.",
    watch: "The grade in block 2 is the grade held on this date.",
  },
  NOB: {
    block: "16",
    title: "Not Observed Report",
    what:
      "Check this when the reporting senior has not observed the member long enough " +
      "to grade performance. An NOB report documents that the period was covered, " +
      "without trait marks or a promotion recommendation.",
    format:
      "On an NOB report the traits in blocks 33–39 and the recommendation in block " +
      "42 are left ungraded, and the report does not contribute to the summary " +
      "group average.",
    watch:
      "The instruction sets the minimum observation period required before an " +
      "observed report may be written — check it rather than estimating. NOB is not " +
      "a way to avoid documenting weak performance that was observed.",
  },
  ReportKind: {
    block: "17–19",
    title: "Type of Report",
    what: "Where this report comes from in relation to the member's chain of command.",
    format:
      "Regular — the report from the member's own reporting senior. " +
      "Concurrent — an additional report from another senior who also directed the " +
      "member's work during the same period. " +
      "Ops Cdr — rendered by an operational commander.",
    watch:
      "A concurrent report supplements the regular report rather than replacing it, " +
      "and it is not counted in the regular summary group.",
  },
  PhysicalReadiness: {
    block: "20",
    title: "Physical Readiness",
    what:
      "One character for each Physical Fitness Assessment cycle that fell inside " +
      "this reporting period, in order, oldest cycle first.",
    format:
      "P — passed PRT and BCA. " +
      "B — passed BCA, did not participate in the PRT for non-medical reasons. " +
      "M — medically waived from the entire PFA. " +
      "W — passed BCA, medically waived from PRT event(s). " +
      "F — overall PFA failure. " +
      "N — non-participation, for example pregnancy. " +
      "Up to four characters.",
    watch:
      "One character per cycle, not per event: if two cycles fell in the period, " +
      "enter two characters such as PF. Leave it blank only if no cycle occurred " +
      "during the period.",
  },
  BilletSubcat: {
    block: "21",
    title: "Billet Subcategory",
    what:
      "A subcategory used when the billet is not fairly comparable to the rest of " +
      "the summary group — commanding officer, OIC, individual augmentee, student, " +
      "instructor and similar assignments.",
    format: "Use NA or BASIC when no subcategory applies.",
    watch:
      "A subcategory separates the member into a different competitive group, which " +
      "changes the forced-distribution counts for the group they leave. Do not set " +
      "one to make the numbers work.",
  },

  // ---- Block 22-27, 44: reporting senior ----
  ReportingSenior: {
    block: "22",
    title: "Reporting Senior",
    what:
      "The name of the reporting senior — the officer who is legally responsible for " +
      "the report, its marks, and its recommendation.",
    format: "Last name, first initial, middle initial. Up to 18 characters.",
    watch:
      "The reporting senior must be someone authorized by the instruction to report " +
      "on a member of this grade; it is not automatically whoever supervises them.",
  },
  RSGrade: {
    block: "23",
    title: "Reporting Senior Grade",
    what: "The reporting senior's grade at the time of signature.",
    format: "Standard abbreviation, up to 5 characters.",
  },
  RSDesig: {
    block: "24",
    title: "Reporting Senior Designator",
    what: "The reporting senior's designator, if they are an officer.",
    format: "Four digits.",
  },
  RSTitle: {
    block: "25",
    title: "Reporting Senior Title",
    what: "The reporting senior's duty title — the billet they hold, not their grade.",
    format: "Up to 14 characters: CO, XO, OIC, DEPT HEAD, CMC.",
  },
  RSUIC: {
    block: "26",
    title: "Reporting Senior UIC",
    what: "The UIC of the reporting senior's command.",
    format: "Five characters.",
  },
  RSSSN: {
    block: "27",
    title: "Reporting Senior DoD ID",
    what:
      "The reporting senior's 10-digit DoD ID. This is what ties the report to the " +
      "reporting senior's cumulative average across everyone they report on.",
    format: "000-00-0000.",
    watch:
      "An inconsistent ID across a reporting senior's reports breaks their running " +
      "average, so it must match on every report they sign.",
  },
  RSAddress: {
    block: "44",
    title: "Reporting Senior Address",
    what:
      "The mailing address the member uses to send a statement about this report, " +
      "and where correspondence about it goes.",
    format: "Two address lines, city, state, ZIP.",
    watch:
      "This has to be an address that will actually reach the reporting senior. On " +
      "an adverse report it is part of the member's route to respond.",
  },

  // ---- Block 28-32: employment, duties, counseling ----
  Achievements: {
    block: "28",
    title: "Command Employment and Command Achievements",
    what:
      "What the command did during the reporting period: its mission, deployments, " +
      "inspections, and major evolutions. This is the context a selection board " +
      "needs to judge the member's performance.",
    format: "Describes the command, not the member.",
    watch:
      "This text is normally identical for everyone the command reports on in the " +
      "period — that is expected here, not laziness. The member's own achievements " +
      "belong in block 41.",
  },
  Duties: {
    block: "29",
    title: "Primary / Collateral / Watchstanding Duties",
    what:
      "The duties the member actually performed during the period — primary billet, " +
      "collateral duties, and watches stood — with an indication of scope such as " +
      "the number of people or the value of equipment involved.",
    format:
      "Written for a board member who has never seen this billet and does not know " +
      "the command's local titles.",
    watch:
      "List what they did, not what the billet description says. Unexplained local " +
      "acronyms cost the member credit for the work.",
  },
  PrimaryDuty: {
    block: "29",
    title: "Primary Duty Abbreviation",
    what: "The short form of the member's primary duty, for the form's narrow field.",
    format: "Up to 14 characters: OPS OFFICER, DIV LCPO, ADMIN LPO.",
  },
  DateCounseled: {
    block: "30",
    title: "Date Counseled",
    what:
      "The date the member's mid-term performance counseling was conducted. " +
      "Counseling is a requirement of the evaluation system, and this block is the " +
      "record that it happened.",
    format: "YYMMMDD.",
    watch:
      "A blank date here on a report with low marks is the first thing a reviewer " +
      "looks for: it suggests the member was never told.",
  },
  Counselor: {
    block: "31",
    title: "Counselor",
    what:
      "The name of the person who conducted the mid-term counseling — often the " +
      "member's immediate supervisor rather than the reporting senior.",
    format: "Last name, first initial, middle initial.",
  },

  /* ---- Block 33-39: performance traits ----
   *
   * Not attached to a field of its own. ReportEditor merges these three strings
   * into each individual trait's help entry, alongside that trait's published
   * 1.0 / 3.0 / 5.0 anchor language from refdata. Grading rules are the same for
   * every trait, and they are most useful next to the buttons being pressed
   * rather than in a section note the writer has already scrolled past. */
  Traits: {
    block: "33–39",
    title: "Performance Traits",
    what:
      "Grade this trait against the published standards below, not against the " +
      "other people in the summary group. 3.0 is the mark for a Sailor who is " +
      "meeting the standard — it is not a weak mark.",
    format:
      "Whole marks only: 1.0 below standards, 2.0 progressing, 3.0 meets " +
      "standards, 4.0 above standards, 5.0 greatly exceeds standards. There are no " +
      "half marks. Use NOB when there was genuinely no opportunity to observe this " +
      "trait during the period.",
    watch:
      "Any mark above or below 3.0 has to be supported by the block 41 comments — a " +
      "5.0 the narrative never mentions is one a board can discount. A 1.0 in any " +
      "trait makes the report adverse, which brings additional requirements " +
      "including the member's opportunity to submit a statement.",
  },

  // ---- Block 40-41: recommendations and comments ----
  RecommendA: {
    block: "40",
    title: "Milestone Recommendation",
    what:
      "The next assignments or milestones you recommend this member for — the " +
      "concrete answer to 'what should the Navy do with this Sailor next'.",
    format: "Up to 20 characters each: DEPT HEAD, XO, CMC, INSTRUCTOR, POST-GRAD.",
    watch:
      "A recommendation here that the block 41 comments never mention reads as " +
      "boilerplate to a board.",
  },
  Comments: {
    block: "41",
    title: "Comments on Performance",
    what:
      "The narrative that justifies the trait marks and the promotion " +
      "recommendation. Written for a selection board that knows nothing about the " +
      "member, the billet, or the command.",
    format:
      "18 lines of 92 characters, counted as the form will print them — the counter " +
      "under this field tracks it. Specific, measurable results carry weight; " +
      "adjectives do not.",
    watch:
      "No classified information. The instruction prohibits certain content in " +
      "comments and requires particular language in some situations — check the " +
      "current list before signing. Any mark above or below 3.0, and any adverse " +
      "report, has to be supported here.",
  },

  // ---- Block 42, 45-47: recommendation, statement, signatures ----
  PromotionRecom: {
    block: "42",
    title: "Promotion Recommendation",
    what:
      "Your recommendation for this member measured against everyone else in the " +
      "summary group: Significant Problems, Progressing, Promotable, Must Promote, " +
      "Early Promote.",
    format:
      "Early Promote and Must Promote are limited by forced distribution — the size " +
      "of the summary group sets how many of each may be awarded. The summary group " +
      "view tracks the running counts for block 43.",
    watch:
      "Significant Problems makes the report adverse, which triggers the member's " +
      "right to submit a statement and additional processing requirements. This is " +
      "the block that most affects the member's selection board outcome.",
  },
  Statement: {
    block: "46",
    title: "Member Statement Intent",
    what:
      "Whether the member intends to submit a statement about this report. The " +
      "member's signature acknowledges that they have seen the report — it does not " +
      "mean they agree with it.",
    watch:
      "On an adverse report the member must be given a copy and the opportunity to " +
      "submit a statement, and this block is part of the record that they were.",
  },
  Rater: {
    block: "45",
    title: "Reporting Senior Signature",
    what:
      "The reporting senior's name as it should print above the signature, and the " +
      "date they signed.",
    format: "Up to 28 characters. Date as YYMMMDD.",
    watch:
      "The signature date cannot fall before the end of the reporting period in " +
      "block 15.",
  },
  MemberSigned: {
    block: "46",
    title: "Member Date Signed",
    what: "The date the member signed acknowledging the report.",
    format: "YYMMMDD.",
    watch:
      "Normally on or after the reporting senior's signature date, since the member " +
      "is acknowledging a completed report.",
  },

  // ---- Block 43: summary group counts (shown in the summary group view) ----
  SummaryCounts: {
    block: "43",
    title: "Summary Group Counts",
    what:
      "The distribution of promotion recommendations across every report in this " +
      "summary group: how many NOB, Significant Problems, Progressing, Promotable, " +
      "Must Promote and Early Promote the reporting senior awarded.",
    format:
      "Calculated from the reports in the group rather than typed. Tools ▸ Auto " +
      "Summary fills the block from the group's current contents.",
    watch:
      "Early Promote and Must Promote are capped as a proportion of the group, so " +
      "these counts are what a board reads to judge how much a Must Promote from " +
      "this reporting senior is worth. Adding or removing a report changes them.",
  },
};

export default BLOCK_HELP;
