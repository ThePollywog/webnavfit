/*
 * store.js — IndexedDB persistence (ES module port).
 * Same three logical tables (folders/reports/meta) and the same bug-fixed
 * cascade + import behavior as the verified vanilla app.
 */
const DB_NAME = "navfit98a";
const DB_VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("folders"))
        db.createObjectStore("folders", { keyPath: "FolderID", autoIncrement: true });
      if (!db.objectStoreNames.contains("reports")) {
        const rs = db.createObjectStore("reports", { keyPath: "ReportID", autoIncrement: true });
        rs.createIndex("byParent", "Parent", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta"))
        db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbp;
}

function tx(names, mode) {
  return open().then((db) => db.transaction(names, mode));
}
function reqP(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function getFolders() {
  return tx("folders", "readonly").then((t) => reqP(t.objectStore("folders").getAll()));
}
export function putFolder(folder) {
  return tx("folders", "readwrite").then((t) => {
    const store = t.objectStore("folders");
    if (folder.FolderID == null) delete folder.FolderID;
    return reqP(store.put(folder));
  });
}
export function deleteFolder(folderId) {
  // Cascade over the whole sub-tree (folder + descendant folders + their reports).
  return tx(["folders", "reports"], "readwrite").then((t) => {
    const fs = t.objectStore("folders"), rs = t.objectStore("reports");
    return Promise.all([reqP(fs.getAll()), reqP(rs.getAll())]).then(([folders, reports]) => {
      const doomed = {};
      doomed[String(folderId)] = true;
      let changed = true;
      while (changed) {
        changed = false;
        folders.forEach((f) => {
          const id = String(f.FolderID);
          if (!doomed[id] && doomed[String(f.Parent)]) { doomed[id] = true; changed = true; }
        });
      }
      reports.forEach((r) => { if (doomed[String(r.Parent)]) rs.delete(r.ReportID); });
      folders.forEach((f) => { if (doomed[String(f.FolderID)]) fs.delete(f.FolderID); });
      return true;
    });
  });
}

export function getReports(folderId) {
  return tx("reports", "readonly").then((t) => {
    const store = t.objectStore("reports");
    if (folderId == null) return reqP(store.getAll());
    return reqP(store.index("byParent").getAll(String(folderId)));
  });
}
export function getReport(reportId) {
  return tx("reports", "readonly").then((t) => reqP(t.objectStore("reports").get(reportId)));
}
export function putReport(report) {
  return tx("reports", "readwrite").then((t) => {
    const store = t.objectStore("reports");
    if (report.ReportID == null) delete report.ReportID;
    return reqP(store.put(report));
  });
}
export function deleteReport(reportId) {
  return tx("reports", "readwrite").then((t) => reqP(t.objectStore("reports").delete(reportId)));
}

export function getMeta(key) {
  return tx("meta", "readonly")
    .then((t) => reqP(t.objectStore("meta").get(key)))
    .then((r) => (r ? r.value : null));
}
export function setMeta(key, value) {
  return tx("meta", "readwrite").then((t) => reqP(t.objectStore("meta").put({ key, value })));
}

export function exportAll() {
  return Promise.all([getFolders(), getReports(null), getMeta("profile")]).then((r) => ({
    app: "navfit98a-web", version: 1, exportedAt: new Date().toISOString(),
    folders: r[0], reports: r[1], profile: r[2] || null,
  }));
}

export function importAll(data, opts = {}) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(["folders", "reports", "meta"], "readwrite");
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
    const fs = t.objectStore("folders"), rs = t.objectStore("reports");
    if (opts.replace) { fs.clear(); rs.clear(); }

    // All writes must stay inside this transaction (no setTimeout — it would
    // fire after auto-commit). Chain report puts off folder-put success.
    const folders = data.folders || [];
    const reports = data.reports || [];
    const idMap = {};
    let pending = folders.length;

    function writeReports() {
      reports.forEach((r) => {
        const copy = Object.assign({}, r);
        if (!opts.replace) {
          delete copy.ReportID;
          let mapped = idMap[copy.Parent];
          if (mapped == null) mapped = idMap[Number(copy.Parent)];
          if (mapped != null) copy.Parent = String(mapped);
        }
        rs.put(copy);
      });
      if (data.profile) t.objectStore("meta").put({ key: "profile", value: data.profile });
    }

    if (pending === 0) writeReports();
    else folders.forEach((f) => {
      const oldId = f.FolderID;
      const copy = Object.assign({}, f);
      if (opts.replace) copy.FolderID = oldId; else delete copy.FolderID;
      const req = fs.put(copy);
      req.onsuccess = () => { idMap[oldId] = req.result; if (--pending === 0) writeReports(); };
    });
  }));
}

export function wipe() {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(["folders", "reports", "meta"], "readwrite");
    t.objectStore("folders").clear();
    t.objectStore("reports").clear();
    t.objectStore("meta").clear();
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
  }));
}
