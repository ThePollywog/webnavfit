/*
 * useAppStore.js — a small reactive application store (no Pinia needed).
 *
 * Holds the folder tree, the reports of the selected folder, and current
 * selection; wraps the IndexedDB layer (lib/store.js) so components stay
 * declarative. A single shared instance is exported.
 */
import { reactive, computed } from "vue";
import * as db from "../lib/store.js";
import * as Calc from "../lib/calc.js";
import { newFolder, newReport } from "../lib/model.js";

const state = reactive({
  folders: [],
  reports: [],
  selectedFolderId: null,
  selectedReportId: null,
  loading: false,
  toast: { show: false, text: "" },
});

async function refreshFolders() {
  state.folders = await db.getFolders();
}
async function refreshReports() {
  if (state.selectedFolderId == null) { state.reports = []; return; }
  state.reports = await db.getReports(state.selectedFolderId);
}

async function init() {
  state.loading = true;
  await refreshFolders();
  // seed a first-run group so the tree isn't empty
  if (state.folders.length === 0) {
    await db.putFolder(newFolder(0, "Summary Group 1"));
    await refreshFolders();
  }
  if (state.selectedFolderId == null && state.folders.length)
    state.selectedFolderId = state.folders[0].FolderID;
  await refreshReports();
  state.loading = false;
}

function toast(text) {
  state.toast = { show: true, text };
}

async function selectFolder(id) {
  state.selectedFolderId = id;
  state.selectedReportId = null;
  await refreshReports();
}

async function addFolder(name, parentId = 0) {
  const f = newFolder(parentId, name || "New Summary Group");
  const id = await db.putFolder(f);
  await refreshFolders();
  await selectFolder(id);
  return id;
}
async function renameFolder(id, name) {
  const f = state.folders.find((x) => x.FolderID === id);
  if (!f) return;
  f.FolderName = name;
  await db.putFolder({ ...f });
  await refreshFolders();
}
async function deleteFolder(id) {
  await db.deleteFolder(id);
  if (state.selectedFolderId === id) state.selectedFolderId = null;
  await refreshFolders();
  if (state.selectedFolderId == null && state.folders.length)
    state.selectedFolderId = state.folders[0].FolderID;
  await refreshReports();
}

async function newReportInGroup(type) {
  if (state.selectedFolderId == null) { toast("Select a summary group first."); return null; }
  const rep = newReport(type, state.selectedFolderId);
  rep.IsValidated = Calc.validate(rep).ok;
  const id = await db.putReport(rep);
  rep.ReportID = id;
  await refreshReports();
  return rep;
}
// Every write re-derives IsValidated, so the Validated column can never drift
// from the report's actual contents. (Previously the flag kept its `false`
// default forever because only the unused validateReport() ever set it.)
async function saveReport(report) {
  const rec = { ...report };
  rec.IsValidated = Calc.validate(rec).ok;
  await db.putReport(rec);
  await refreshReports();
}
async function deleteReport(id) {
  await db.deleteReport(id);
  if (state.selectedReportId === id) state.selectedReportId = null;
  await refreshReports();
}

async function autoSummary() {
  const s = Calc.promotionSummary(state.reports);
  for (const r of state.reports) {
    r.SummarySP = String(s.SP); r.SummaryProg = String(s.Prog);
    r.SummaryProm = String(s.Prom); r.SummaryMP = String(s.MP); r.SummaryEP = String(s.EP);
    await db.putReport({ ...r });
  }
  await refreshReports();
  toast("Summary counts written to all reports in the group.");
}

const selectedFolder = computed(() =>
  state.folders.find((f) => f.FolderID === state.selectedFolderId) || null);
const summaryGroupAverage = computed(() => Calc.summaryGroupAverage(state.reports));
const rsca = computed(() => Calc.rsca(state.reports));
const promotionSummary = computed(() => Calc.promotionSummary(state.reports));

export function useAppStore() {
  return {
    state,
    selectedFolder, summaryGroupAverage, rsca, promotionSummary,
    init, toast, selectFolder,
    addFolder, renameFolder, deleteFolder,
    newReportInGroup, saveReport, deleteReport,
    autoSummary,
    exportAll: db.exportAll, importAll: db.importAll, wipe: db.wipe,
  };
}
