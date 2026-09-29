/*
 * accdb.js — a minimal Access 2007+ (ACE12) table writer, just enough to fill
 * the NAVFIT98A database's Folders / Reports tables from a blank template.
 *
 * Scope is deliberately narrow — it only handles what the NAVFIT98A schema
 * uses, and throws on anything else rather than writing a file Access would
 * choke on:
 *   - 4K pages, inline (type 0) usage maps covering the whole file
 *   - column types: Boolean, Integer, Long, Date/Time, Numeric, Text, Memo
 *   - at most one index per table, a single Long column (the PrimaryKey),
 *     small enough to live in its one existing leaf/root page
 * Non-empty memo values always go to per-column long-value pages, as Access
 * itself does (ACE keeps a separate owned/free usage map per memo column).
 *
 * Format references: mdbtools' HACKING notes and Jackcess' TableImpl/IndexData.
 */

const PS = 4096;
const PAGE_DATA = 0x01, PAGE_TDEF = 0x02, PAGE_LEAF = 0x04;
const COL = { BOOL: 1, BYTE: 2, INT: 3, LONG: 4, MONEY: 5, FLOAT: 6, DOUBLE: 7, DATE: 8, TEXT: 10, MEMO: 12, NUMERIC: 16 };
const MAX_ROW = 4060;          // largest data row Access will accept on a 4K page
const MAX_LVAL_CHUNK = 4000;   // bytes of memo data per long-value row
// Long-value pages carry this tag where a data page holds its tdef pointer.
const LVAL_OWNER = 0x4c41564c; // "LVAL"
const LEAF_ENTRIES_AT = 0x1e0, LEAF_MASK_AT = 0x1b;

const u16 = (p, o) => p[o] | (p[o + 1] << 8);
const u32 = (p, o) => (p[o] | (p[o + 1] << 8) | (p[o + 2] << 16) | (p[o + 3] << 24)) >>> 0;
function put16(p, o, v) { p[o] = v & 0xff; p[o + 1] = (v >>> 8) & 0xff; }
function put32(p, o, v) { p[o] = v & 0xff; p[o + 1] = (v >>> 8) & 0xff; p[o + 2] = (v >>> 16) & 0xff; p[o + 3] = (v >>> 24) & 0xff; }

function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export class AccdbFile {
  constructor(bytes) {
    const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (src.length % PS || src[0x14] < 2) throw new Error("Not an Access 2007+ (.accdb) database.");
    this.pages = [];
    for (let o = 0; o < src.length; o += PS) this.pages.push(src.slice(o, o + PS));
    // Page 1, row 0 is the global usage map: a set bit means the page is FREE.
    this.global = this.readMap((1 << 8) | 0);
  }

  toBytes() { return concat(this.pages); }

  // ---------- rows & usage maps ----------

  rowBounds(pg, row) {
    const p = this.pages[pg];
    const start = u16(p, 14 + row * 2) & 0x1fff;
    const end = row === 0 ? PS : u16(p, 14 + (row - 1) * 2) & 0x1fff;
    return [start, end];
  }

  readMap(ptr) {
    const pg = ptr >>> 8, row = ptr & 0xff;
    const [start, end] = this.rowBounds(pg, row);
    const p = this.pages[pg];
    if (p[start] !== 0) throw new Error("Unsupported usage map type " + p[start]);
    return { page: p, first: u32(p, start + 1), bits: start + 5, count: (end - start - 5) * 8 };
  }
  mapHas(m, n) {
    const i = n - m.first;
    return i >= 0 && i < m.count && (m.page[m.bits + (i >> 3)] & (1 << (i & 7))) !== 0;
  }
  mapSet(m, n, on) {
    const i = n - m.first;
    if (i < 0 || i >= m.count) throw new Error("The NAVFIT database is too large to export (page " + n + " is outside its usage map).");
    if (on) m.page[m.bits + (i >> 3)] |= 1 << (i & 7);
    else m.page[m.bits + (i >> 3)] &= ~(1 << (i & 7));
  }
  mapPages(m) {
    const out = [];
    for (let i = 0; i < m.count; i++) if (m.page[m.bits + (i >> 3)] & (1 << (i & 7))) out.push(m.first + i);
    return out;
  }
  mapClear(m) { for (let i = 0; i < m.count; i++) this.mapSet(m, m.first + i, false); }

  allocPage() {
    for (let n = 2; n < this.pages.length; n++) {
      if (this.mapHas(this.global, n)) { this.mapSet(this.global, n, false); this.pages[n].fill(0); return n; }
    }
    const n = this.pages.length;
    this.mapSet(this.global, n, false);
    this.pages.push(new Uint8Array(PS));
    return n;
  }
  freePage(n) {
    this.pages[n].fill(0);
    this.mapSet(this.global, n, true);
  }

  /** Zero every page the global map says is free, so no deleted data lingers. */
  scrubFreePages() {
    for (let n = 2; n < this.pages.length; n++) if (this.mapHas(this.global, n)) this.pages[n].fill(0);
  }

  // ---------- table definitions ----------

  findTable(name) {
    for (let pg = 2; pg < this.pages.length; pg++) {
      if (this.pages[pg][0] !== PAGE_TDEF) continue;
      const t = this.readTdef(pg);
      if (t && t.name === name) return t;
    }
    throw new Error(`Table "${name}" not found in the template database.`);
  }

  readTdef(pg) {
    const parts = [this.pages[pg]];
    for (let nx = u32(this.pages[pg], 4); nx; nx = u32(this.pages[nx], 4)) parts.push(this.pages[nx].subarray(8));
    const t = concat(parts);
    const ncols = u16(t, 45), nidx = u32(t, 47), nridx = u32(t, 51);
    if (ncols > 255 || nridx > 16) return null;
    let q = 63 + nridx * 12;
    const cols = [];
    for (let i = 0; i < ncols; i++, q += 25) {
      cols.push({
        type: t[q], num: u16(t, q + 5), varIdx: u16(t, q + 7),
        fixed: (t[q + 15] & 0x01) !== 0, auto: (t[q + 15] & 0x04) !== 0, compressed: (t[q + 16] & 0x01) !== 0,
        fixedOff: u16(t, q + 21), len: u16(t, q + 23), prec: t[q + 11], scale: t[q + 12],
      });
    }
    for (const c of cols) { const l = u16(t, q); c.name = utf16(t.subarray(q + 2, q + 2 + l)); q += 2 + l; }
    const indexes = [];
    for (let i = 0; i < nridx; i++, q += 52) {
      const keyCols = [];
      for (let k = 0; k < 10; k++) { const cn = u16(t, q + 4 + k * 3); if (cn !== 0xffff) keyCols.push(cn); }
      indexes.push({ keyCols, rootPage: u32(t, q + 38) });
    }
    q += nidx * 28;
    for (let i = 0; i < nidx; i++) q += 2 + u16(t, q);
    const lvalMaps = {};
    while (q + 10 <= t.length && u16(t, q) !== 0xffff) {
      lvalMaps[u16(t, q)] = { owned: u32(t, q + 2), free: u32(t, q + 6) };
      q += 10;
    }
    // Table name isn't stored in the tdef; identify NAVFIT's tables by columns.
    const names = new Set(cols.map((c) => c.name));
    const name = names.has("FolderName") ? "Folders" : names.has("ReportType") ? "Reports"
      : names.has("ProfileName") ? "Summary" : null;
    return {
      name, page: pg, cols, indexes, lvalMaps, nridx,
      owned: u32(t, 55), free: u32(t, 59),
      fixedSize: cols.filter((c) => c.fixed).reduce((m, c) => Math.max(m, c.fixedOff + c.len), 0),
      varCount: u16(t, 43),
    };
  }

  // ---------- writing a table ----------

  /**
   * Replace every row of `tableName` with `rows` (objects keyed by column name).
   * Old data/long-value pages are zeroed and returned to the free pool.
   */
  writeTable(tableName, rows, describe = (r, i) => `record ${i + 1}`) {
    const t = this.findTable(tableName);
    if (t.indexes.length > 1) throw new Error(`${tableName}: multiple indexes are not supported.`);
    const tdefPage = this.pages[t.page];

    // 1. release the old pages
    const owned = this.readMap(t.owned), free = this.readMap(t.free);
    for (const n of this.mapPages(owned)) this.freePage(n);
    this.mapClear(owned); this.mapClear(free);
    const lval = {};
    for (const [cn, ptrs] of Object.entries(t.lvalMaps)) {
      const o = this.readMap(ptrs.owned), f = this.readMap(ptrs.free);
      for (const n of this.mapPages(o)) this.freePage(n);
      this.mapClear(o); this.mapClear(f);
      lval[cn] = { owned: o, free: f, page: -1 };
    }

    // 2. write the rows
    const writer = { t, owned, free, page: -1 };
    const keyCol = t.indexes[0] ? t.cols.find((c) => c.num === t.indexes[0].keyCols[0]) : null;
    if (rows.length && keyCol && (t.indexes[0].keyCols.length !== 1 || keyCol.type !== COL.LONG))
      throw new Error(`${tableName}: only a single Long primary key is supported.`);
    const keys = [];
    let maxAuto = 0;
    for (const [i, r] of rows.entries()) {
      let ptr;
      try {
        ptr = this.addRow(writer, this.encodeRow(t, r, lval), t.page);
      } catch (err) {
        err.message = `${describe(r, i)}: ${err.message}`;
        throw err;
      }
      if (keyCol) keys.push([Number(r[keyCol.name]), ptr]);
      for (const c of t.cols) if (c.auto && r[c.name] != null) maxAuto = Math.max(maxAuto, Number(r[c.name]));
    }

    // 3. primary key index (single leaf page)
    if (keyCol) this.writeLeaf(t.indexes[0].rootPage, t.page, keys);

    // 4. table definition counters
    put32(tdefPage, 16, rows.length);
    if (t.cols.some((c) => c.auto)) put32(tdefPage, 20, maxAuto);
    for (let i = 0; i < t.nridx; i++) put32(tdefPage, 63 + i * 12 + 4, rows.length);
  }

  addRow(w, bytes, owner, flags = 0) {
    if (bytes.length > MAX_ROW) throw new Error("too much text in its short fields to fit one Access record — shorten it and try again.");
    if (w.page < 0 || this.pageFree(w.page) < bytes.length + 2) {
      w.page = this.allocPage();
      const p = this.pages[w.page];
      p[0] = PAGE_DATA; p[1] = 0x01; put32(p, 4, owner);
      put16(p, 2, PS - 14);
      this.mapSet(w.owned, w.page, true);
      this.mapSet(w.free, w.page, true);
    }
    const p = this.pages[w.page];
    const n = u16(p, 12);
    const end = n === 0 ? PS : u16(p, 14 + (n - 1) * 2) & 0x1fff;
    const start = end - bytes.length;
    p.set(bytes, start);
    put16(p, 14 + n * 2, start | flags);
    put16(p, 12, n + 1);
    put16(p, 2, this.pageFree(w.page) - bytes.length - 2);
    return (w.page << 8) | n;
  }
  pageFree(pg) { return u16(this.pages[pg], 2); }

  encodeRow(t, r, lval) {
    const ncols = t.cols.length;
    const mask = new Uint8Array((ncols + 7) >> 3);
    const fixed = new Uint8Array(t.fixedSize);
    const varData = new Array(t.varCount).fill(null);
    for (const c of t.cols) {
      const v = r[c.name];
      if (c.type === COL.BOOL) { if (v) mask[c.num >> 3] |= 1 << (c.num & 7); continue; }
      if (v == null || v === "") continue;
      let bytes;
      switch (c.type) {
        case COL.INT: bytes = new Uint8Array(2); put16(bytes, 0, Number(v) & 0xffff); break;
        case COL.LONG: bytes = new Uint8Array(4); put32(bytes, 0, Number(v) | 0); break;
        case COL.DATE: {
          if (!(v instanceof Date) || isNaN(v)) continue;
          bytes = new Uint8Array(8);
          new DataView(bytes.buffer).setFloat64(0, oleDate(v), true);
          break;
        }
        case COL.NUMERIC: {
          const n = Number(v);
          if (!isFinite(n)) continue;
          const unscaled = Math.round(Math.abs(n) * 10 ** c.scale);
          bytes = new Uint8Array(17);
          bytes[0] = n < 0 ? 0x80 : 0;
          put32(bytes, 13, unscaled);   // 16-byte BE magnitude, each 4-byte word LE
          break;
        }
        case COL.TEXT: bytes = encodeText(String(v).slice(0, c.len >> 1), c.compressed); break;
        case COL.MEMO: bytes = this.encodeMemo(t, c, String(v), lval[c.num]); break;
        default: throw new Error(`Unsupported column type ${c.type} (${c.name}).`);
      }
      mask[c.num >> 3] |= 1 << (c.num & 7);
      if (c.fixed) fixed.set(bytes.subarray(0, c.len), c.fixedOff);
      else varData[c.varIdx] = bytes;
    }
    const head = new Uint8Array(2); put16(head, 0, ncols);
    const chunks = [head, fixed];
    const offsets = [];
    let pos = 2 + fixed.length;
    for (const d of varData) { offsets.push(pos); if (d) { chunks.push(d); pos += d.length; } }
    // trailer, read backwards by Access: [eod][var offsets in reverse][var count][null mask]
    const trailer = new Uint8Array(2 + offsets.length * 2 + 2);
    put16(trailer, 0, pos);
    offsets.forEach((o, i) => put16(trailer, 2 + (offsets.length - 1 - i) * 2, o));
    put16(trailer, trailer.length - 2, offsets.length);
    chunks.push(trailer, mask);
    return concat(chunks);
  }

  encodeMemo(t, c, text, lv) {
    const data = encodeText(text, c.compressed);
    const hdr = new Uint8Array(12);
    if (!lv) throw new Error(`${c.name}: memo column has no long-value usage map.`);
    const w = { owned: lv.owned, free: lv.free, get page() { return lv.page; }, set page(p) { lv.page = p; } };
    if (data.length <= MAX_LVAL_CHUNK) {
      const ptr = this.addRow(w, data, LVAL_OWNER);
      put32(hdr, 0, (data.length | 0x40000000) >>> 0);
      put32(hdr, 4, ptr);
      return hdr;
    }
    // chained: write the tail first so each row can point at its successor
    const chunks = [];
    for (let o = 0; o < data.length; o += MAX_LVAL_CHUNK - 4) chunks.push(data.subarray(o, o + MAX_LVAL_CHUNK - 4));
    let next = 0;
    for (let i = chunks.length - 1; i >= 0; i--) {
      const row = new Uint8Array(4 + chunks[i].length);
      put32(row, 0, next); row.set(chunks[i], 4);
      next = this.addRow(w, row, LVAL_OWNER);
    }
    put32(hdr, 0, data.length);
    put32(hdr, 4, next);
    return hdr;
  }

  writeLeaf(pg, tdefPg, keys) {
    keys.sort((a, b) => a[0] - b[0]);
    const cap = Math.floor((PS - LEAF_ENTRIES_AT) / 9);
    if (keys.length > cap) throw new Error(`Too many records to export (max ${cap} per table).`);
    const p = this.pages[pg];
    p.fill(0);
    p[0] = PAGE_LEAF; p[1] = 0x01; put32(p, 4, tdefPg);
    let pos = 0;
    for (const [id, ptr] of keys) {
      const o = LEAF_ENTRIES_AT + pos;
      p[o] = 0x7f;                                  // "not null, ascending"
      const k = ((id | 0) ^ 0x80000000) >>> 0;      // sign bit flipped, big-endian
      p[o + 1] = k >>> 24; p[o + 2] = (k >>> 16) & 0xff; p[o + 3] = (k >>> 8) & 0xff; p[o + 4] = k & 0xff;
      const page = ptr >>> 8;
      p[o + 5] = (page >>> 16) & 0xff; p[o + 6] = (page >>> 8) & 0xff; p[o + 7] = page & 0xff; p[o + 8] = ptr & 0xff;
      pos += 9;
      p[LEAF_MASK_AT + (pos >> 3)] |= 1 << (pos & 7);  // bit marks each entry's end
    }
    put16(p, 2, PS - LEAF_ENTRIES_AT - pos);
  }
}

function utf16(b) {
  let s = "";
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b[i] | (b[i + 1] << 8));
  return s;
}

// Jet4 "Unicode compression": 0xFF 0xFE marker then one byte per char, valid
// only when every char is in 1..255. Like Access, only used when it actually
// saves space (so 1-2 char values stay plain UTF-16LE).
function encodeText(s, compress) {
  if (compress && s.length > 2 && /^[\u0001-\u00ff]*$/.test(s)) {
    const out = new Uint8Array(2 + s.length);
    out[0] = 0xff; out[1] = 0xfe;
    for (let i = 0; i < s.length; i++) out[2 + i] = s.charCodeAt(i);
    return out;
  }
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) put16(out, i * 2, s.charCodeAt(i));
  return out;
}

// Access stores Date/Time as days since 1899-12-30 (local wall-clock time).
function oleDate(d) {
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}
