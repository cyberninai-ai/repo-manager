'use strict';
// @module core/persistence — Local storage of records + blobs (same form as export), .flux import
// @uses records
/* ---------- persistence: the stored form is the export form, one record per line ---------- */
let saveT = 0;
function lines(recs){
  const out = recs.map(r => r.raw);
  const seen = new Set();
  for (const r of recs) if ((r.type === 'DRAW' || r.type === 'IMAGE') && r.neg === null && S.blobs.has(r.f.R) && !seen.has(r.f.R)){ seen.add(r.f.R); out.push('BLOB-R-' + r.f.R + '-B64-' + b64enc(S.blobs.get(r.f.R))); }
  return out;
}
function save(){
  clearTimeout(saveT);
  saveT = setTimeout(() => { if (!store.set('flux:canvas:' + canvasId, lines([...S.records.values()].sort(byZ)).join('\n'))) toast('Local storage is full or blocked; records live in this tab only.'); }, 250);
}
async function importText(text, persist = true){
  const ls = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let added = 0, before = S.rejected;
  for (const l of ls) if (l.startsWith('BLOB-')){
    const m = l.match(/^BLOB-R-([a-z2-7]+)-(B|B64)-([A-Za-z0-9+/=]+)$/);
    if (m) try { await addBlob(m[1], m[2] === 'B' ? b58dec(m[3]) : b64dec(m[3])); } catch {}
  }
  for (const l of ls){
    if (l.startsWith('BLOB-')) continue;
    if (l.startsWith('CANVAS-')){
      let node; try { node = parse(l); } catch { S.rejected++; continue; }
      if (!await verifyRaw(node) || !Array.isArray(node.fields.P)){ S.rejected++; continue; }
      for (const c of node.fields.P){ const had = S.records.size; if (await ingest(c.raw, persist) && S.records.size > had) added++; }
      if (node.fields.VIEW && persist){ const [x, y, z] = node.fields.VIEW.split('_'); try { S.view = { x: decInt(x), y: decInt(y), zoom: decInt(z) / 100 || 1 }; } catch {} }
      continue;
    }
    const had = S.records.size;
    if (await ingest(l, persist) && S.records.size > had) added++;
  }
  return { added, rejected: S.rejected - before };
}

