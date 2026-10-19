'use strict';
// @module features/lineage — Lineage forks: forking copies a canvas's work as the original signed records (so every author keeps
// their signature and credit), starts a new canvas you own, and links the two both ways: LINEAGE in the fork names its parent
// and the version it started from; FORKED in the parent lists its descendants, which people can endorse. A template's owner can
// ask for a royalty (INHERIT): payouts on forks then pay it automatically. Forks can pull later changes from their parent.
// Governance (ownership, grants, deliveries, payments, meetings) is never copied: a fork inherits the work and the reasoning,
// not the authority.
// @uses records, features/canvases (createOwnedCanvas), features/payouts (SETTLE_HOOKS), features/stances, ui/panels, ui/form
// INHERIT-I-R-{canvas}-S-{open|closed}-Y-{royalty, basis points}-Z-T-SIG          the canvas owner's terms for forks
// LINEAGE-I-R-{fork}-P-{parent}-H-{parent version}-C-{records copied}-K-{the parent's INHERIT|0}-Z-T-SIG   signed in the fork
// FORKED-I-R-{fork}-H-{parent version}-M-{title}-Z-T-SIG                           signed in the parent
// The parent's INHERIT and OWNER records are copied into the fork: the OWNER record proves who owns the parent (its id commits to
// that key), so only royalty terms that key signed count. LINEAGE counts only from the fork's owner; the first one fixes the parent.
registerRecord('INHERIT', { parse(r, f){ must(isCanvas(f.R) && ['open', 'closed'].includes(f.S), 'inherit'); r.open = f.S === 'open'; r.bp = Math.max(0, Math.min(5000, +f.Y || 0)); } });
registerRecord('LINEAGE', { parse(r, f){ must(isCanvas(f.R) && isCanvas(f.P) && isRoot(f.H), 'lineage'); r.parent = f.P; r.root = f.H; r.n = Math.max(0, +f.C || 0); r.terms = f.K && f.K !== '0' ? f.K : null; must(!r.terms || isCid(r.terms), 'terms'); }, inherit: false });
registerRecord('FORKED', { parse(r, f){ must(isCanvas(f.R) && isRoot(f.H), 'forked'); r.child = f.R; r.root = f.H; r.title = decTxt(f.M || ''); }, inherit: false });
Object.assign(PERM_OF, { INHERIT: null, LINEAGE: null, FORKED: 'comment' });   // INHERIT counts only from the owner (derive below)
// core element records and most feature records travel with a fork; governance doesn't
const NO_INHERIT = new Set(['OWNER', 'GRANT', 'META', 'PROFILE']);
const inheritable = r => !NO_INHERIT.has(r.type) && RECORD_TYPES[r.type]?.inherit !== false;
DERIVE_HOOKS.push((D, by) => {
  const owner = S.P?.owner, lin = owner ? (by.LINEAGE || []).filter(r => r.f.R === canvasId && r.neg === null && !D.hidden.has(r.cid) && samePerson(r.author, owner)) : [];
  const parent = lin[0]?.parent, same = lin.filter(r => r.parent === parent);
  D.lineage = same.at(-1) || null; D.lineageAll = same;
  D.forks = (by.FORKED || []).filter(r => r.neg === null && inView(r));
  D.inherit = owner ? (by.INHERIT || []).filter(r => r.f.R === canvasId && r.neg === null && samePerson(r.author, owner)).at(-1) || null : null;
});
// the parent's owner, proven by its OWNER record (core/permissions checks the id commits to that key on arrival)
const parentOwner = id => [...S.records.values()].find(r => r.type === 'OWNER' && r.f.R === id && r.neg === null)?.author || null;
const parentTerms = () => { const l = S.D.lineage, t = l?.terms && S.records.get(l.terms), o = l && parentOwner(l.parent);
  return t && t.type === 'INHERIT' && t.f.R === l.parent && o && samePerson(t.author, o) ? t : null; };
// a fork's payouts pay the template's owner its royalty first
SETTLE_HOOKS.push(() => { const t = parentTerms(); return t && t.bp ? [{ to: t.author, bp: t.bp, why: 'royalty' }] : []; });
const fullRoot = async () => b32(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode([...S.records.keys()].sort().join('\n')))));
async function forkCanvas(){
  if (S.D.inherit && !S.D.inherit.open && !samePerson(S.P?.owner, S.me.id)){ toast('The owner has closed this canvas to forks.'); return null; }
  const parent = canvasId, title = canvasTitle(), root = await fullRoot(), terms = S.D.inherit;
  // the work as everyone sees it (nothing permissions refused or still waiting as a suggestion), plus the proof of ownership
  const recs = [...S.records.values()].filter(r => inheritable(r) && !S.D.denied.has(r.cid) && !S.D.pending?.has(r.cid) || r.type === 'OWNER' && r.f.R === parent).sort(byZ), blobs = new Map();
  for (const r of recs){ const b = blobOf(r); if (b && S.blobs.has(b)) blobs.set(b, S.blobs.get(b)); }
  const { nonce, id } = await ownedCanvasId();
  try { await publish(await signed('FORKED', [['I', S.me.id], ['R', id], ['H', root], ['M', encTxt(title)], ['Z', ++S.lamport], ['T', Date.now()]])); } catch {}   // the parent may not let you comment: the fork still links back
  await flushSave(); await switchCanvas(id); await claimCanvas(nonce);
  for (const [c, b] of blobs) await addBlob(c, b);
  await bulk(async () => { for (const r of recs) await ingest(r.raw); });
  await publish(await signed('LINEAGE', [['I', S.me.id], ['R', id], ['P', parent], ['H', root], ['C', recs.length], ['K', terms?.cid || '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
  await setTitle(`${title} (fork)`);
  toast(`Forked: ${plural(recs.length, 'record')} copied with their original signatures. This canvas is yours.`);
  return id;
}
// pull: the parent's inheritable records this fork doesn't have yet (from this browser's copy of the parent, or a peer's)
async function parentNews(){
  const l = S.D.lineage; if (!l) return [];
  const have = new Set(S.records.keys()), rows = await dbAll('records', l.parent), out = [];
  for (const row of rows){ const raw = row.raw || row.r || row; if (typeof raw !== 'string') continue; let node; try { node = parse(raw); } catch { continue; } if (NO_INHERIT.has(node.action) || RECORD_TYPES[node.action]?.inherit === false) continue; const c = row.cid || await cidOf(te.encode(raw)); if (!have.has(c)) out.push(raw); }
  return out;
}
async function pullParent(){
  const news = await parentNews(); if (!news.length){ toast('Nothing new in the parent (from what this browser has of it).'); return; }
  if (!await formDialog('Pull from the parent', [{ id: 'i', type: 'info', label: `Copy ${plural(news.length, 'record')} from canvas ${S.D.lineage.parent} into this one? Everyone on this canvas will see them.` }], { ok: 'Pull' })) return;
  for (const b of await dbAll('blobs', S.D.lineage.parent)) if (!S.blobs.has(b.cid)) try { await addBlob(b.cid, b.bytes); } catch {}
  await bulk(async () => { for (const raw of news) await ingest(raw); });
  const l = S.D.lineage, rows = await dbAll('records', l.parent);
  const root = b32(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(rows.map(r => r.cid).filter(Boolean).sort().join('\n')))));
  await publish(await signed('LINEAGE', [['I', S.me.id], ['R', canvasId], ['P', l.parent], ['H', root], ['C', l.n + news.length], ['K', l.terms || '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
  toast(`Pulled ${plural(news.length, 'change')} from the parent.`);
}
async function termsForm(){
  const t = S.D.inherit;
  const v = await formDialog('Terms for forks', [{ id: 'open', label: 'Forks', type: 'select', value: t && !t.open ? 'closed' : 'open', options: [['open', 'Anyone may fork this canvas'], ['closed', 'Ask people not to fork it']] },
    { id: 'roy', label: 'Royalty on payouts made on forks (%)', type: 'number', value: (t?.bp || 0) / 100, min: 0, max: 50 }],
    { ok: 'Sign the terms', why: 'Forks carry this signed record. When a fork releases a payment, the royalty is paid to you first.' });
  if (!v) return;
  await publish(await signed('INHERIT', [['I', S.me.id], ['R', canvasId], ['S', v.open], ['Y', Math.round((v.roy || 0) * 100)], ['Z', ++S.lamport], ['T', Date.now()]]));
}
let newsN = null;
registerPanel({
  id: 'lineage', title: 'Lineage', blurb: 'Where this canvas came from, what grew out of it, and the terms for forking it.',
  onOpen(){ newsN = null; parentNews().then(n => { newsN = n.length; paintPanel(); }); },
  paint(body){
    const l = S.D.lineage, t = parentTerms(), forks = S.D.forks || [], mine = S.D.inherit, owner = !S.P?.owner || samePerson(S.P.owner, S.me.id);
    body.innerHTML = `${l ? `<div class="card"><div class="hd"><b>Forked from</b><span class="pill acc">${plural(l.n, 'record')}</span></div>
        <div class="row2"><button class="link" data-open="${esc(l.parent)}">${esc(l.parent)}</button><small>at version ${esc(l.root.slice(0, 8))} · ${when(l.t)} by ${esc(whoName(l.author))}</small></div>
        ${t ? `<small>${t.bp ? `Royalty: ${pct(t.bp)} of payouts here goes to ${esc(whoName(t.author))}, the template’s owner` : 'No royalty'}${t.open ? '' : ' · the owner asked not to fork it'}</small>` : ''}
        <div class="acts"><button class="btn" data-pull${newsN ? '' : ' disabled'}>${newsN == null ? 'Checking the parent…' : newsN ? `Pull ${plural(newsN, 'new change')}` : 'Up to date with the parent'}</button></div></div>` : ''}
      <h3>Forks of this canvas <span class="n">${forks.length}</span></h3>
      ${forks.length ? `<ul class="plain">${forks.map(f => { const c = consensus(f.cid); return `<li class="card"><div class="hd"><button class="link" data-open="${esc(f.child)}">${esc(f.title || f.child)}</button><small>${esc(whoName(f.author))} · ${when(f.t)}</small></div>
        <div class="acts"><button class="btn" data-st="agree" data-t="${f.cid}" aria-pressed="${c.mine === 'agree'}">Endorse ${c.c.agree || ''}</button></div></li>`; }).sort().join('')}</ul>` : '<p class="empty">No forks yet.</p>'}
      ${owner ? `<div class="card"><b>Terms for forks</b><small>${mine ? `${mine.open ? 'Open to forks' : 'Closed to forks'} · royalty ${pct(mine.bp)}` : 'Open to forks, no royalty.'}</small><div class="acts"><button class="btn" data-terms>Set the terms…</button></div></div>` : ''}
      <div class="acts"><button class="btn primary" data-fork data-autofocus>${ic('fork')}Fork this canvas</button></div>`;
  },
  click(e, b){
    if (b.hasAttribute('data-fork')) return forkCanvas();
    if (b.hasAttribute('data-pull')) return pullParent();
    if (b.hasAttribute('data-terms')) return termsForm();
    if (b.dataset.open){ closePanel(false); return switchCanvas(b.dataset.open); }
    if (b.dataset.st) return takeStance([b.dataset.t], b.dataset.st);
  },
});
registerFeature({ id: 'lineage', name: 'Lineage forks', group: 'remember', icon: 'fork', records: ['INHERIT', 'LINEAGE', 'FORKED'],
  blurb: 'Fork with the original signatures; forks link back, pull updates, and pay template royalties',
  status: () => S.D.lineage ? 'a fork' : (S.D.forks?.length ? `${S.D.forks.length} forks` : ''), open: () => openPanel('lineage') });
