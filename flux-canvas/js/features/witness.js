'use strict';
// @module features/witness — Peer witnessing: anyone can countersign "I hold exactly this version of the canvas, now". Several
// independent witnesses on the same version give it a timestamp and an existence proof without a blockchain: to deny the
// version existed, every witness would have to have lied. Witnesses on a delivery's version show beside its approvals.
// The witnessed version is recomputable: the same root a delivery uses (every record before the witness, minus deliveries and
// approvals), so each peer checks each witness against its own records.
// @uses features/work (rootAt, deliveries), ui/panels
// WITNESS-I-R-{canvas}-H-{root}-C-{records it covers}-M-{note}[-D-{delivery}]-Z-T-SIG
//   with D: the delivery's exact version (features/work), checked against its version list; without: every record before it
registerRecord('WITNESS', { parse(r, f){ must(isCanvas(f.R) && isRoot(f.H), 'witness'); r.root = f.H; r.n = Math.max(0, +f.C || 0); r.note = decTxt(f.M || ''); r.of = f.D && f.D !== '0' ? f.D : null; must(!r.of || isCid(r.of), 'witness delivery'); }, inherit: false });
PERM_OF.WITNESS = null;
const WIT = { auto: false, checked: new Map() };   // "witness CID:records held" → true / false, recomputed when the record set changes
try { WIT.auto = localStorage.getItem('flux:autowitness') === 'on'; } catch {}
DERIVE_HOOKS.push((D, by) => {
  const byRoot = new Map();
  for (const w of by.WITNESS || []) if (w.neg === null && !D.hidden.has(w.cid) && w.f.R === canvasId){ if (!byRoot.has(w.root)) byRoot.set(w.root, []); byRoot.get(w.root).push(w); }
  D.witnessed = byRoot;
});
const witKey = w => `${w.cid}:${S.records.size}`;
async function checkWitness(w){
  if (w.of){ const d = S.records.get(w.of); if (!d || d.type !== 'DELIVER' || d.root !== w.root) return false; const v = await versionCheck(d); return v.root === w.root && !v.missing; }
  return await rootAt(w.z) === w.root;
}
async function checkWitnesses(){
  if (WIT.checked.size > 5000) WIT.checked.clear();
  for (const ws of S.D.witnessed?.values() || []) for (const w of ws){ const k = witKey(w); if (WIT.checked.has(k)) continue; WIT.checked.set(k, null); WIT.checked.set(k, await checkWitness(w)); if (panelOpen === 'witness') paintPanel(); }
}
CHANGE_HOOKS.push(() => { checkWitnesses(); });
const witOk = w => WIT.checked.get(witKey(w));
async function witnessNow(note = '', root = null, z = null, of = null){
  z = z ?? S.lamport + 1; root = root || await rootAt(z);
  const n = of ? versionRecs(S.records.get(of)).length : [...S.records.values()].filter(r => r.z < z && r.type !== 'DELIVER' && r.type !== 'APPROVE').length;
  await publish(await signed('WITNESS', [['I', S.me.id], ['R', canvasId], ['H', root], ['C', n], ['M', encTxt(note)], ...(of ? [['D', of]] : []), ['Z', z], ['T', Date.now()]]));
  toast(`Witnessed: ${plural(n, 'record')}, version ${root.slice(0, 8)}.`);
}
// a delivery's version is witnessed only after this browser checked it holds exactly that version
async function witnessDelivery(x){
  const v = await versionCheck(x.d);
  if (v.root !== x.d.root || v.missing){ toast('You don’t hold this exact version yet, so you can’t witness it. Syncing…'); sendHello(false); return false; }
  await witnessNow(`Delivery: ${x.d.title}`, x.d.root, null, x.d.cid); return true;
}
// one per person, and only witnesses this browser has checked and found matching
const witnessesOf = root => { const seen = new Set(); return (S.D.witnessed?.get(root) || []).filter(w => witOk(w) === true && !seen.has(personOf(w.author)) && seen.add(personOf(w.author))); };
const spread = ws => { if (!ws.length) return ''; const ts = ws.map(w => w.t).sort(), a = new Date(ts[0]), b = new Date(ts.at(-1)); const f = d => d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); return f(a) === f(b) ? f(a) : `${f(a)} – ${f(b)}`; };
DELIVERY_HOOKS.row.push(x => {
  const ws = witnessesOf(x.d.root), me = (S.D.witnessed?.get(x.d.root) || []).some(w => samePerson(w.author, S.me.id));
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
        <small>${ws[0].n} records · ${spread(ws)}</small>${ws.map(w => `<div class="row2">${avatar(w.author)}<span class="grow">${esc(whoName(w.author))}${w.note ? ` <small>· ${esc(w.note)}</small>` : ''}</span><span class="pill ${witOk(w) ? 'good' : witOk(w) === false ? 'bad' : ''}">${witOk(w) ? 'Matches ✓' : witOk(w) === false ? 'Doesn’t match' : 'Checking'}</span></div>`).join('')}</li>`).join('')}</ul>`
      : '<p class="empty">Nothing witnessed yet. Ask people outside the work (a client, an auditor) to witness a delivery: their signatures date it.</p>'}`;
  },
  click(e, b){ if (b.hasAttribute('data-now')) witnessNow(); },
  change(e){ if (e.target.dataset.k === 'auto'){ WIT.auto = e.target.checked; try { localStorage.setItem('flux:autowitness', WIT.auto ? 'on' : 'off'); } catch {} } },
});
registerFeature({ id: 'witness', name: 'Peer witnesses', group: 'deliver', icon: 'stamp', records: ['WITNESS'],
  blurb: 'Countersign that a version existed at a time: independent witnesses instead of a chain', open: () => openPanel('witness') });
