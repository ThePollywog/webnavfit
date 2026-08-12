/**
 * localStorage with a versioned envelope — the same shape SALTDOG uses, so the
 * two sibling apps store UI preferences identically.
 *
 * The version lives INSIDE the envelope, not in the key. Versioning the key
 * (`webnavfit:theme:v2`) orphans the old data where a migration can't reach it;
 * versioning inside means a migration can actually read the old shape.
 *
 * Every access is wrapped: Safari private mode throws on setItem, storage can be
 * full, and a hand-edited value can be malformed JSON. None of those should take
 * down the app — the report database lives in IndexedDB (see lib/store.js) and
 * is unaffected either way.
 */
const NS = "webnavfit";

let warned = false;
function warnOnce(err) {
  if (warned) return;
  warned = true;
  console.warn("[webnavfit] localStorage unavailable; preferences will not persist.", err);
}

export const fullKey = (key) => `${NS}:${key}`;

/**
 * @param {string} key            short key, namespaced internally
 * @param {object} opts
 * @param {number} opts.version   current schema version
 * @param {(v:number,data:any)=>{v:number,data:any}} [opts.migrate]
 * @param {()=>any} opts.fallback fresh value when nothing is stored
 */
export function load(key, { version, migrate, fallback }) {
  try {
    const raw = localStorage.getItem(fullKey(key));
    if (!raw) return fallback();
    const parsed = JSON.parse(raw);
    let v = typeof parsed?.v === "number" ? parsed.v : 0;
    let data = parsed?.data;
    if (data === undefined) return fallback();
    // Step the migration chain one version at a time so each migration only has
    // to know how to get from N to N+1.
    let guard = 0;
    while (v < version) {
      if (!migrate) return fallback();
      const next = migrate(v, data);
      if (!next || typeof next.v !== "number" || next.v <= v) return fallback();
      ({ v, data } = next);
      if (++guard > 32) return fallback();
    }
    return data;
  } catch (err) {
    warnOnce(err);
    return fallback();
  }
}

export function save(key, version, data) {
  try {
    localStorage.setItem(
      fullKey(key),
      JSON.stringify({ v: version, data, updatedAt: new Date().toISOString() }),
    );
    return true;
  } catch (err) {
    warnOnce(err);
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(fullKey(key));
  } catch (err) {
    warnOnce(err);
  }
}
