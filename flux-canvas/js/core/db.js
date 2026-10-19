'use strict';
// @module core/db — IndexedDB: signing keys as non-extractable CryptoKeys, an append-only record log and blobs per canvas, the canvas list
// @uses state
// Where IndexedDB is unavailable (sandboxed frames with an opaque origin), DB.ok is false and callers fall back to localStorage.
const DB = { ok: false, db: null };
const MAX_BLOB = 2 * 1024 * 1024;   // audit S5: one blob can't fill local storage or a peer's memory
const idbReq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = t => new Promise((res, rej) => { t.oncomplete = () => res(true); t.onerror = t.onabort = () => rej(t.error); });
const dbReady = (async () => {
  try {
    const r = indexedDB.open('flux', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('keys');
      d.createObjectStore('records', { keyPath: ['canvas', 'cid'] }).createIndex('canvas', 'canvas');
      d.createObjectStore('blobs', { keyPath: ['canvas', 'cid'] }).createIndex('canvas', 'canvas');
      d.createObjectStore('canvases', { keyPath: 'id' });
    };
    DB.db = await Promise.race([idbReq(r), new Promise((_, rej) => setTimeout(() => rej(Error('idb timeout')), 3000))]);
    DB.ok = true;
  } catch { DB.ok = false; }
  return DB.ok;
})();
async function dbGet(store, key){
  if (!await dbReady) return undefined;
  try { return await idbReq(DB.db.transaction(store).objectStore(store).get(key)); } catch { return undefined; }
}
async function dbPut(store, value, key){
  if (!await dbReady) return false;
  try { const t = DB.db.transaction(store, 'readwrite'), s = t.objectStore(store); key === undefined ? s.put(value) : s.put(value, key); return await txDone(t); } catch { return false; }
}
async function dbAll(store, canvas){
  if (!await dbReady) return [];
  try { const s = DB.db.transaction(store).objectStore(store); return await idbReq(canvas === undefined ? s.getAll() : s.index('canvas').getAll(canvas)); } catch { return []; }
}
// delete records (and their blobs) by CID; used by compaction
async function dbDeleteRecords(canvas, cids, blobCids = []){
  if (!await dbReady || !cids.length && !blobCids.length) return false;
  try {
    const t = DB.db.transaction(['records', 'blobs'], 'readwrite');
    for (const c of cids) t.objectStore('records').delete([canvas, c]);
    for (const c of blobCids) t.objectStore('blobs').delete([canvas, c]);
    return await txDone(t);
  } catch { return false; }
}
async function dbDeleteCanvas(canvas){
  if (!await dbReady) return false;
  try {
    const t = DB.db.transaction(['records', 'blobs', 'canvases'], 'readwrite');
    for (const st of ['records', 'blobs']){
      const ix = t.objectStore(st).index('canvas');
      ix.openKeyCursor(IDBKeyRange.only(canvas)).onsuccess = e => { const cur = e.target.result; if (cur){ t.objectStore(st).delete(cur.primaryKey); cur.continue(); } };
    }
    t.objectStore('canvases').delete(canvas);
    return await txDone(t);
  } catch { return false; }
}
