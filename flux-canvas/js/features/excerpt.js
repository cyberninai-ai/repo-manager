'use strict';
// @module features/excerpt — Proof-carrying excerpts: share one part of a delivered canvas (a frame, a few notes) with the proof
// that it belongs to the version that was approved, without sending the rest. The excerpt carries its records, the delivery and
// its approvals, and the list of record IDs (hashes only) the version contains. The recipient checks every signature, recomputes
// the version's root from the IDs, and confirms each excerpt record is in it. Nothing outside the excerpt is revealed but its hash.
// @uses features/work (deliveries, rootAt), core identity (verifyRaw), ui/panels, ui/form
// The excerpt file: { flux: 'excerpt', v: 1, canvas, title, delivery, approvals: [raw], ids: [CID…], records: [raw], blobs: { cid: base64 } }
function versionRecords(x){ return [...S.records.values()].filter(r => r.z < x.d.z && r.type !== 'DELIVER' && r.type !== 'APPROVE'); }
// what to include for the chosen elements: the elements and every change in the version that targets them (moves, styles, edits)
function excerptOf(x, cids){
  const inV = versionRecords(x), want = new Set(cids), out = new Map();
  for (const c of cids){ const el = S.records.get(c); if (el?.ek === 'frame' || el?.type === 'NODE' && el.k === 'frame'){ const fb = box(el); for (const e of S.D.els) if (e.cid !== c && !S.D.hidden.has(e.cid)){ const b = box(e); if (b && fb && b.x >= fb.x && b.y >= fb.y && b.x + b.w <= fb.x + fb.w && b.y + b.h <= fb.y + fb.h) want.add(e.cid); } } }
  for (const c of [...want]){ let n = c, k = 0; while (S.D.next.has(n) && k++ < 1000){ n = S.D.next.get(n); want.add(n); } }
  for (const r of inV) if (want.has(r.cid) || r.f.R && want.has(r.f.R) || r.type === 'ARROW' && want.has(r.f.FROM) && want.has(r.f.TO)) out.set(r.cid, r);
  return [...out.values()].sort(byZ);
}
function makeExcerpt(x, cids){
  const recs = excerptOf(x, cids), blobs = {};
  for (const r of recs){ const b = blobOf(r); if (b && S.blobs.has(b)) blobs[b] = b64enc(S.blobs.get(b)); }
  return { flux: 'excerpt', v: 1, canvas: canvasId, title: canvasTitle(), delivery: x.d.raw, approvals: x.ok.map(a => a.raw), ids: versionRecords(x).map(r => r.cid).sort(), records: recs.map(r => r.raw), blobs };
}
async function shareExcerpt(x){
  const cids = [...S.sel].filter(c => S.records.has(c));
  if (!cids.length){ toast('Select what to share first (a frame or some notes), then share the excerpt.'); return; }
  const ex = makeExcerpt(x, cids);
  downloadJSON(`excerpt-${(x.d.title || 'delivery').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, JSON.stringify(ex));
  toast(`Excerpt: ${plural(ex.records.length, 'record')} of ${ex.ids.length}, with the proof. Only their hashes reveal the rest.`);
  return ex;
}
// verify an excerpt file: signatures, the version root, membership, approvals
async function verifyExcerpt(ex){
  const res = { ok: false, lines: [], records: 0, approvals: 0, quorum: 0, approvers: [] };
  const fail = m => { res.lines.push('✕ ' + m); return res; };
  if (!ex || ex.flux !== 'excerpt' || !Array.isArray(ex.ids) || !Array.isArray(ex.records)) return fail('Not a Flux excerpt.');
  const check = async raw => { try { const n = parse(raw); return await verifyRaw(n) ? { n, cid: await cidOf(te.encode(raw)) } : null; } catch { return null; } };
  const d = await check(ex.delivery); if (!d || d.n.action !== 'DELIVER') return fail('The delivery record is missing or its signature doesn’t verify.');
  const root = b32(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode([...ex.ids].sort().join('\n')))));
  if (root !== d.n.fields.H) return fail('The record IDs don’t add up to the delivered version.');
  res.lines.push(`✓ The ${ex.ids.length} record IDs recompute to the delivered version ${root.slice(0, 10)}…`);
  const ids = new Set(ex.ids), approvers = (d.n.fields.A || '').split('_'), quorum = +d.n.fields.Q || 1, seen = new Set();
  for (const raw of ex.approvals || []){ const a = await check(raw); if (a && a.n.action === 'APPROVE' && a.n.fields.R === d.cid && a.n.fields.H === root && a.n.fields.S !== '0' && approvers.includes(a.n.fields.I)) seen.add(a.n.fields.I); }
  res.approvals = seen.size; res.quorum = quorum; res.approvers = [...seen];
  res.lines.push(`${seen.size >= quorum ? '✓' : '✕'} ${seen.size} of ${quorum} required approvals are signed on exactly this version`);
  for (const raw of ex.records){ const r = await check(raw); if (!r) return fail('A record’s signature doesn’t verify.'); if (!ids.has(r.cid)) return fail('A record isn’t part of the delivered version.'); res.records++; }
  for (const [c, b] of Object.entries(ex.blobs || {})) if (await cidOf(b64dec(b)) !== c) return fail('An attached image or drawing doesn’t match its ID.');
  res.lines.push(`✓ All ${res.records} records in the excerpt are signed and part of that version`, `• ${ex.ids.length - res.records} other records stay private: only their hashes are shared`);
  res.ok = seen.size >= quorum; res.title = decTxt(d.n.fields.M || ''); return res;
}
async function openExcerptFile(){
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => { const f = inp.files[0]; if (!f) return; let ex; try { ex = JSON.parse(await f.text()); } catch { toast('That file isn’t an excerpt.'); return; } showVerdict(ex); };
  inp.click();
}
let lastExcerpt = null;
async function showVerdict(ex){
  const v = await verifyExcerpt(ex); lastExcerpt = v.ok ? ex : null;
  openReport(v.ok ? `Verified excerpt — ${v.title}` : 'Excerpt does not verify', [`# ${v.ok ? 'Verified' : 'Not verified'}: ${v.title || 'excerpt'}`, '', ...v.lines, '', v.ok ? `Approved by: ${v.approvers.map(k => NAMES.get(k) || k.slice(0, 10)).join(', ')}` : ''].join('\n'), 'excerpt-verification.md');
  return v;
}
// open a verified excerpt as its own canvas, to look at it (its records are the originals, so they verify there too)
async function openExcerptCanvas(ex){
  await switchCanvas(b32(crypto.getRandomValues(new Uint8Array(8))));
  for (const [c, b] of Object.entries(ex.blobs || {})) await addBlob(c, b64dec(b));
  await bulk(async () => { for (const raw of ex.records) await ingest(raw); });
  toast(`Opened the excerpt: ${plural(ex.records.length, 'record')}, read as the originals.`);
}
DELIVERY_HOOKS.row.push(x => x.done ? `<div class="acts"><button class="btn" data-excerpt="${x.d.cid}">${ic('excerpt')}Share an excerpt with proof…</button></div>` : '');
document.addEventListener('click', e => { const b = e.target.closest?.('[data-excerpt]'); if (!b) return; const x = S.D.deliveries.find(v => v.d.cid === b.dataset.excerpt); if (x) shareExcerpt(x); });
registerPanel({
  id: 'excerpt', title: 'Excerpts with proof', blurb: 'Share part of an approved delivery, with proof it belongs to the approved version, and nothing else.',
  paint(body){
    const done = (S.D.deliveries || []).filter(x => x.done);
    body.innerHTML = `<p>Select a frame or some notes, then share them from an approved delivery. The recipient sees only that part, and can check it was approved.</p>
      ${done.length ? `<ul class="plain">${done.map(x => `<li class="card"><div class="hd"><b>${esc(x.d.title)}</b><span class="pill good">Approved</span></div><div class="acts"><button class="btn" data-excerpt="${x.d.cid}">${ic('excerpt')}Share the selection…</button></div></li>`).join('')}</ul>` : '<p class="empty">No approved delivery yet.</p>'}
      <h3>Received one?</h3><div class="acts"><button class="btn" data-verify data-autofocus>${ic('shield')}Verify an excerpt file…</button>${lastExcerpt ? '<button class="btn" data-open>Open the verified excerpt</button>' : ''}</div>`;
  },
  click(e, b){ if (b.hasAttribute('data-verify')) openExcerptFile(); if (b.hasAttribute('data-open') && lastExcerpt) openExcerptCanvas(lastExcerpt); },
});
registerFeature({ id: 'excerpt', name: 'Excerpts with proof', group: 'deliver', icon: 'excerpt', records: [],
  blurb: 'Share part of an approved delivery with proof it belongs to it, revealing nothing else', open: () => openPanel('excerpt') });
