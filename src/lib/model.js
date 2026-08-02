/*
 * model.js — report/folder record definitions (ES module port).
 * Mirrors the NAVFIT98A Access schema; unchanged semantics from the vanilla app.
 */

// Which trait column each report type places in blocks 33..39, in order.
export const TRAIT_ORDER = {
  FITREP: ["PROF", "EO", "MIL", "TEAM", "MIS", "LEAD", "TAC"],
  EVAL:   ["PROF", "QUAL", "EO", "MIL", "PA", "TEAM", "LEAD"],
  CHIEF:  ["LEAD", "TAC", "PROF", "MIS", "EO", "TEAM", "MIL"],
};

export const TRAIT_COLUMNS = ["PROF", "QUAL", "EO", "MIL", "PA", "TEAM", "LEAD", "MIS", "TAC"];

export const REPORT_TYPES = {
  FITREP: { key: "FITREP", label: "Fitness Report", form: "NAVPERS 1610/2", grades: "W2-O6" },
  EVAL:   { key: "EVAL",   label: "Evaluation",     form: "NAVPERS 1616/26", grades: "E1-E6" },
  CHIEF:  { key: "CHIEF",  label: "Chief Evaluation", form: "NAVPERS 1616/27", grades: "E7-E9" },
};

export const OCCASIONS = ["Periodic", "DetInd", "Frocking", "Special"];
export const REPORT_KINDS = ["Regular", "Concurrent", "OpsCdr"];
export const DUTY_STATUS = ["Active", "TAR", "Inactive", "ATADSW"];

export function traitsFor(type) {
  return TRAIT_ORDER[type] || TRAIT_ORDER.FITREP;
}

export function newReport(type, parentFolderId) {
  return {
    ReportID: null,
    Parent: parentFolderId != null ? String(parentFolderId) : "",
    ReportType: type,
    LastName: "", FirstName: "", MI: "", Suffix: "", FullName: "",
    Rate: "", Desig: "", SSN: "",
    Active: false, TAR: false, Inactive: false, ATADSW: false,
    UIC: "", ShipStation: "", PromotionStatus: "", DateReported: "",
    Periodic: false, DetInd: false, Frocking: false, Special: false,
    FromDate: "", ToDate: "",
    NOB: false, Regular: false, Concurrent: false, OpsCdr: false,
    PhysicalReadiness: "", PhysicalReadiness2: "", BilletSubcat: "",
    ReportingSenior: "", RSLastName: "", RSFI: "", RSMI: "",
    RSGrade: "", RSDesig: "", RSTitle: "", RSUIC: "", RSSSN: "",
    Achievements: "", Duties: "", PrimaryDuty: "",
    DateCounseled: "", CounselerLN: "", CounselerFI: "", CounselerMI: "",
    PROF: 0, QUAL: 0, EO: 0, MIL: 0, PA: 0, TEAM: 0, LEAD: 0, MIS: 0, TAC: 0,
    PROFDN1: "", PROFDN2: "", PROFDN3: "",
    EODN1: "", EODN2: "", EODN3: "",
    MILDN1: "", MILDN2: "", MILDN3: "",
    RecommendA: "", RecommendB: "",
    CommentsPitch: "", Comments: "", Qualifications: "",
    PromotionRecom: 0,
    SummarySP: "", SummaryProg: "", SummaryProm: "", SummaryMP: "", SummaryEP: "",
    RetentionYes: false, RetentionNo: false,
    RSAddress: "", RSAddress1: "", RSAddress2: "", RSCity: "", RSState: "",
    RSZipCd: "", RSPhone: "", RSDSN: "",
    Rater: "", RaterDate: "", SeniorRater: "", SeniorRaterDate: "",
    StatementYes: false, StatementNo: false,
    RRSLastName: "", RRSFI: "", RRSMI: "", RRSGrade: "", RRSCommand: "", RRSUIC: "",
    RSCA: null, SummaryRank: null, IsValidated: false,
    UserComments: "",
  };
}

export function newFolder(parentId, name) {
  return {
    FolderID: null,
    Parent: parentId != null ? parentId : 0,
    FolderName: name || "New Summary Group",
    Rate: "", Desig: "", SSN: "",
    ReportingSenior: "", RSGrade: "", RSDesig: "", RSTitle: "", RSUIC: "", RSSSN: "",
    UIC: "", ShipStation: "",
  };
}
