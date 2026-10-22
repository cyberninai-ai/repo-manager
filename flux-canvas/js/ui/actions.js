'use strict';
// @module ui/actions — Select all, zoom to fit, theme, verify, export/import, drop, paste
// @uses chrome
/* actions */
function selectAll(){ S.sel = new Set(S.D.els.filter(visible).map(e => e.cid)); dirty = true; }
function zoomFit(){
  let b = null; for (const el of S.D.els) if (visible(el)){ const x = box(el); if (!x) continue; b = b ? norm({ x: Math.min(b.x, x.x), y: Math.min(b.y, x.y) }, { x: Math.max(b.x + b.w, x.x + x.w), y: Math.max(b.y + b.h, x.y + x.h) }) : x; }
  if (!b) return;
  // fit inside the area the chrome leaves free: title, dock and collaborators on top, style bar and zoom below
  const T = 76, Bo = 64 + barH(), L = innerWidth > 640 && innerWidth <= 1100 ? 72 : 32, R = 32;
  const w = Math.max(80, innerWidth - L - R), h = Math.max(80, innerHeight - T - Bo);
  const z = clampZ(Math.min(w / b.w, h / b.h, 2));
  S.view = { zoom: z, x: b.x + b.w / 2 - (L + w / 2) / z, y: b.y + b.h / 2 - (T + h / 2) / z };
}
function cycleTheme(){
  const cur = document.documentElement.dataset.theme || 'system', next = { system: 'light', light: 'dark', dark: 'system' }[cur];
  if (next === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next;
  store.set('flux:theme', next); toast('Theme · ' + next); dirty = true;
}
{ const t = store.get('flux:theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; }
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { dirty = true; });
async function verifyAll(){
  let ok = 0, bad = 0;
  for (const r of S.records.values()){ (await verifyRaw(parse(r.raw)) && await cidOf(te.encode(r.raw)) === r.cid) ? ok++ : bad++; }
  let blobsOk = 0; for (const [c, b] of S.blobs) if (await cidOf(b) === c) blobsOk++;
  toast(`${ok} signatures valid${bad ? `, ${bad} INVALID` : ''} · ${blobsOk}/${S.blobs.size} point blobs match their CIDs`);
}
async function canvasText(filtered){
  const recs = [...S.records.values()].filter(r => !filtered || !S.filter || S.filter.has(r.author)).sort(byZ);
  const v = S.view;
  const raw = await signed('CANVAS', [['I', S.me.id], ['R', canvasId], ['P', recs.map(r => r.raw)],
    ['VIEW', `${encInt(Math.round(v.x))}_${encInt(Math.round(v.y))}_${Math.round(v.zoom * 100)}`], ['T', Date.now()]]);
  return [raw, ...lines(recs).filter(l => l.startsWith('BLOB-'))].join('\n');
}
async function exportCanvas(filtered){
  const text = await canvasText(filtered);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = `canvas-${canvasId}${filtered && S.filter ? '-sub' : ''}.flux`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported (${(text.length / 1024).toFixed(1)} KB)`);
}
async function importAndReport(text){
  const { added, rejected } = await importText(text);
  toast(`Imported ${added} new item${added === 1 ? '' : 's'}` + (rejected ? ` · ${rejected} rejected (bad signature or malformed)` : '') + ' · union-merged');
}
$('file').addEventListener('change', async e => { const f = e.target.files[0]; if (f) await importAndReport(await f.text()); e.target.value = ''; });
addEventListener('dragover', e => e.preventDefault());
$('imgFile').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await insertImage(f); });
addEventListener('drop', async e => {
  e.preventDefault();
  const f = e.dataTransfer.files[0]; if (!f) return;
  if (f.type.startsWith('image/')) await insertImage(f, toWorld(e.clientX, e.clientY));
  else await importAndReport(await f.text());
});
addEventListener('paste', async e => {
  if (taOpen() || document.activeElement === $('palIn')) return;
  const img = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
  if (img){ e.preventDefault(); await insertImage(img); return; }
  const t = e.clipboardData?.getData('text') || '';
  if (clip && t.trim() === clip.text.trim()){ e.preventDefault(); await pasteClip(); return; }   // our own copy: paste fresh copies, not the originals
  if (/^(CANVAS|DRAW|SHAPE|TEXT|ARROW|IMAGE|NODE|GROUP|MOVE|STYLE|COMMENT|RESOLVE|BLOB)-/m.test(t.trim())){ e.preventDefault(); await importAndReport(t); }
  else if (isOutline(t) && S.me){ e.preventDefault(); await mindmapFromOutline(t); }
  else if (t.trim() && S.me){ e.preventDefault(); const c = toWorld(innerWidth / 2, innerHeight / 2); await commitText(c, t.trim().slice(0, 2000)); }
});

