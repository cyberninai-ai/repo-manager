'use strict';
// @module core/persistence — The canvas on disk: an append-only record log in IndexedDB (localStorage in sandboxes), .flux import
// @uses records, db
/* ---------- persistence: each record is stored once, as signed; blobs beside it. The export form is the same lines. ---------- */
let saveT = 0;
const pendingSave = new Set();
// the blob a record names: points and images in R; feature records name theirs with registerRecord(…, { blob: field })
const blobOf = r => r.neg !== null ? null : r.type === 'DRAW' || r.type === 'IMAGE' ? r.f.R : RECORD_TYPES[r.type]?.blob ? r.f[RECORD_TYPES[r.type].blob] || null : null;
function lines(recs){
  const out = recs.map(r => r.raw);
  const seen = new Set();
  for (const r of recs){ const b = blobOf(r); if (b && S.blobs.has(b) && !seen.has(b)){ seen.add(b); out.push('BLOB-R-' + b + '-B64-' + b64enc(S.blobs.get(b))); } }
  return out;
}
// queue one record (or, with no argument, every record) for the next write
function save(cid){
  if (cid) pendingSave.add(cid); else for (const c of S.records.keys()) pendingSave.add(c);
  clearTimeout(saveT); saveT = setTimeout(flushSave, 120);
}
function canvasSummary(){
  let last = 0; for (const r of S.records.values()) if (r.t > last) last = r.t;
  return { id: canvasId, title: S.D.meta?.title || '', n: S.records.size, last };
}
async function flushSave(){
  clearTimeout(saveT);
  const cids = [...pendingSave]; pendingSave.clear();
  if (!cids.length) return;
  if (!await dbReady){   // no IndexedDB: the whole canvas as one string, as before
    if (!store.set('flux:canvas:' + canvasId, lines([...S.records.values()].sort(byZ)).join('\n'))) toast('This browser won’t let the canvas save; your work lasts only while this tab is open.');
    return;
  }
  try {
    const t = DB.db.transaction(['records', 'blobs', 'canvases'], 'readwrite'), rs = t.objectStore('records'), bs = t.objectStore('blobs');
    for (const c of cids){
      const r = S.records.get(c); if (!r) continue;
      rs.put({ canvas: canvasId, cid: c, raw: r.raw, z: r.z });
      const b = blobOf(r); if (b && S.blobs.has(b)) bs.put({ canvas: canvasId, cid: b, bytes: S.blobs.get(b) });
    }
    t.objectStore('canvases').put(canvasSummary());
    await txDone(t);
  } catch { toast('Storage is full or blocked; new work lasts only while this tab is open.'); }
}
// Load a canvas: from IndexedDB, else migrate it from localStorage (older versions), else the localStorage fallback.
function loadCanvas(id){ return bulk(() => loadLines(id)); }
async function loadLines(id){
  const legacyKey = 'flux:canvas:' + id;
  if (await dbReady){
    const recs = await dbAll('records', id);
    if (recs.length){
      for (const b of await dbAll('blobs', id)) try { await addBlob(b.cid, b.bytes); } catch {}
      recs.sort((a, b) => a.z - b.z);
      for (const r of recs) await ingest(r.raw, false);
      return recs.length;
    }
    const legacy = store.get(legacyKey);
    if (!legacy) return 0;
    await importText(legacy, false);
    save(); await flushSave();
    if ((await dbAll('records', id)).length) try { localStorage.removeItem(legacyKey); } catch {}
    return S.records.size;
  }
  const saved = store.get(legacyKey);
  if (saved) await importText(saved, false);
  return saved ? S.records.size : 0;
}
function importText(text, persist = true){ return bulk(() => importLines(text, persist)); }
async function importLines(text, persist){
  const ls = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let added = 0, before = S.rejected;
  for (const l of ls) if (l.startsWith('BLOB-')){
    const m = l.match(/^BLOB-R-([a-z2-7]+)-(B|B64)-([A-Za-z0-9+/=]+)$/);
    if (m) try { await addBlob(m[1], m[2] === 'B' ? b58dec(m[3]) : b64dec(m[3])); } catch {}
  }
  for (const l of ls){
    if (l.startsWith('BLOB-')) continue;
    if (l.startsWith('CANVAS-')){
      let node; try { node = parse(l); } catch { reject('malformed'); continue; }
      if (!await verifyRaw(node) || !Array.isArray(node.fields.P)){ reject('bad signature'); continue; }
      for (const c of node.fields.P){ const had = S.records.size; if (await ingest(c.raw, persist) && S.records.size > had) added++; }
      if (node.fields.VIEW && persist){ const [x, y, z] = node.fields.VIEW.split('_'); try { S.view = { x: decInt(x), y: decInt(y), zoom: decInt(z) / 100 || 1 }; } catch {} }
      continue;
    }
    const had = S.records.size;
    if (await ingest(l, persist) && S.records.size > had) added++;
  }
  return { added, rejected: S.rejected - before };
}

