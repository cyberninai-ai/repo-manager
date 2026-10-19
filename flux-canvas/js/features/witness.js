'use strict';
// @module features/witness — Peer witnessing: anyone can countersign "I hold exactly this version of the canvas, now". Several
// independent witnesses on the same version give it a timestamp and an existence proof without a blockchain: to deny the
// version existed, every witness would have to have lied. Witnesses on a delivery's version show beside its approvals.
// The witnessed version is recomputable: the same root a delivery uses (every record before the witness, minus deliveries and
// approvals), so each peer checks each witness against its own records.
// @uses features/work (rootAt, deliveries), ui/panels
// WITNESS-I-R-{canvas}-H-{root}-C-{records it covers}-M-{note}-Z-T-SIG
registerRecord('WITNESS', { parse(r, f){ if (!f.R || !f.H) throw Error('witness'); r.root = f.H; r.n = Math.max(0, +f.C || 0); r.note = decTxt(f.M || ''); }, inherit: false });
PERM_OF.WITNESS = null;
const WIT = { auto: false, checked: new Map() };   // witness CID → true / false once recomputed here
try { WIT.auto = localStorage.getItem('flux:autowitness') === 'on'; } catch {}
DERIVE_HOOKS.push((D, by) => {
  const byRoot = new Map();
  for (const w of by.WITNESS || []) if (!D.hidden.has(w.cid) && w.f.R === canvasId){ if (!byRoot.has(w.root)) byRoot.set(w.root, []); const l = byRoot.get(w.root); if (!l.some(o => samePerson(o.author, w.author))) l.push(w); }
  D.witnessed = byRoot;
});
// check each witness once: does its root match the version this browser computes for its place in the order?
async function checkWitnesses(){
  for (const ws of S.D.witnessed?.values() || []) for (const w of ws) if (!WIT.checked.has(w.cid)){ WIT.checked.set(w.cid, null); WIT.checked.set(w.cid, await rootAt(w.z) === w.root); if (panelOpen === 'witness') paintPanel(); }
}
CHANGE_HOOKS.push(() => { checkWitnesses(); });
async function witnessNow(note = '', root = null, z = null){
  z = z ?? S.lamport + 1; root = root || await rootAt(z);
  const n = [...S.records.values()].filter(r => r.z < z && r.type !== 'DELIVER' && r.type !== 'APPROVE').length;
  await publish(await signed('WITNESS', [['I', S.me.id], ['R', canvasId], ['H', root], ['C', n], ['M', encTxt(note)], ['Z', z], ['T', Date.now()]]));
  toast(`Witnessed: ${plural(n, 'record')}, version ${root.slice(0, 8)}.`);
}
// a delivery's version is witnessed by signing its root at the delivery's own place in the order
const witnessDelivery = x => witnessNow(`Delivery: ${x.d.title}`, x.d.root, x.d.z);
const witnessesOf = root => (S.D.witnessed?.get(root) || []).filter(w => WIT.checked.get(w.cid) !== false);
const spread = ws => { if (!ws.length) return ''; const ts = ws.map(w => w.t).sort(), a = new Date(ts[0]), b = new Date(ts.at(-1)); const f = d => d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); return f(a) === f(b) ? f(a) : `${f(a)} – ${f(b)}`; };
DELIVERY_HOOKS.row.push(x => {
  const ws = witnessesOf(x.d.root), me = ws.some(w => samePerson(w.author, S.me.id));
  return `<div class="row2">${ws.length ? `<span class="pill good">${ic('stamp')}Witnessed by ${ws.length}</span><small>${ws.map(w => esc(whoName(w.author))).join(', ')} · ${spread(ws)}</small>` : '<small>No witnesses yet.</small>'}${me ? '' : `<button class="btn" data-witness="${x.d.cid}">Witness this version</button>`}</div>`;
});
DELIVERY_HOOKS.proof.push((x, out) => {
  const ws = witnessesOf(x.d.root); if (!ws.length) return;
  out.push('', '## Witnesses', '', `${ws.length} independent ${ws.length === 1 ? 'person' : 'people'} countersigned this exact version (${spread(ws)}):`, '', ...ws.map(w => `- ${short(w.author)} · ${new Date(w.t).toLocaleString()} · \`${w.raw}\``));
});
document.addEventListener('click', e => { const b = e.target.closest?.('[data-witness]'); if (!b) return; const x = S.D.deliveries.find(v => v.d.cid === b.dataset.witness); if (x) witnessDelivery(x); });
// optional: witness every delivery that completes while you are here (you didn't make or approve it: an outside witness)
const autoDone = new Set();
CHANGE_HOOKS.push(() => {
  if (!WIT.auto || !S.me || S.histZ != null) return;
  for (const x of S.D.deliveries || []) if (x.done && !autoDone.has(x.d.cid) && !witnessesOf(x.d.root).some(w => samePerson(w.author, S.me.id))){ autoDone.add(x.d.cid); witnessDelivery(x); }
});
registerPanel({
  id: 'witness', title: 'Witnesses', blurb: 'Independent countersignatures that a version existed at a time: a timestamp without a chain.',
  paint(body){
    const rows = [...(S.D.witnessed || new Map())].map(([root, ws]) => ({ root, ws, d: S.D.deliveries?.find(x => x.d.root === root) })).sort((a, b) => Math.max(...b.ws.map(w => w.t)) - Math.max(...a.ws.map(w => w.t)));
    body.innerHTML = `<div class="acts"><button class="btn primary" data-now data-autofocus>${ic('stamp')}Witness the canvas as it is now</button></div>
      <label class="muted"><input type="checkbox" data-k="auto"${WIT.auto ? ' checked' : ''}> Witness every delivery that completes while I’m here</label>
      ${rows.length ? `<ul class="plain">${rows.map(({ root, ws, d }) => `<li class="card"><div class="hd"><b>${d ? esc(d.d.title) : `Version ${root.slice(0, 8)}`}</b><span class="pill good">${ws.length} witness${ws.length === 1 ? '' : 'es'}</span></div>
        <small>${ws[0].n} records · ${spread(ws)}</small>${ws.map(w => `<div class="row2">${avatar(w.author)}<span class="grow">${esc(whoName(w.author))}${w.note ? ` <small>· ${esc(w.note)}</small>` : ''}</span><span class="pill ${WIT.checked.get(w.cid) ? 'good' : WIT.checked.get(w.cid) === false ? 'bad' : ''}">${WIT.checked.get(w.cid) ? 'Matches ✓' : WIT.checked.get(w.cid) === false ? 'Doesn’t match' : 'Checking'}</span></div>`).join('')}</li>`).join('')}</ul>`
      : '<p class="empty">Nothing witnessed yet. Ask people outside the work (a client, an auditor) to witness a delivery: their signatures date it.</p>'}`;
  },
  click(e, b){ if (b.hasAttribute('data-now')) witnessNow(); },
  change(e){ if (e.target.dataset.k === 'auto'){ WIT.auto = e.target.checked; try { localStorage.setItem('flux:autowitness', WIT.auto ? 'on' : 'off'); } catch {} } },
});
registerFeature({ id: 'witness', name: 'Peer witnesses', group: 'deliver', icon: 'stamp', records: ['WITNESS'],
  blurb: 'Countersign that a version existed at a time: independent witnesses instead of a chain', open: () => openPanel('witness') });
