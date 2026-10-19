'use strict';
// @module features/since — What changed since…: your last visit, a delivery, a decision, or an hour ago. The canvas outlines
// what was added, edited, moved, removed or discussed, and the panel walks you through it change by change, by person.
// Replay (features/replay) plays the session; this reviews its result in place, so you catch up without watching.
// @uses records, derive, ui/panels (badges), features/work (deliveries), features/decisions
const SN = { on: false, base: 'visit', ref: null, i: -1, visit: null };
const seenKey = () => 'flux:seen:' + canvasId;
// your last visit: read when the canvas opens, then kept up to date while you are on it
function loadVisit(){ try { SN.visit = JSON.parse(localStorage.getItem(seenKey()) || 'null'); } catch { SN.visit = null; } }
function markSeen(){ if (!S.records.size || S.histZ != null) return; try { localStorage.setItem(seenKey(), JSON.stringify({ z: S.lamport, t: Date.now(), id: canvasId })); } catch {} }
let visitFor = null;
CHANGE_HOOKS.push(() => { if (visitFor !== canvasId){ visitFor = canvasId; loadVisit(); if (SN.visit && [...S.records.values()].some(r => r.z > SN.visit.z && !samePerson(r.author, S.me?.id) && r.type !== 'PROFILE')) setTimeout(() => toast('Changed since your last visit · Team → What changed'), 1200); } });
setInterval(() => { if (visitFor === canvasId && !SN.on) markSeen(); }, 30000);
addEventListener('pagehide', () => { if (!SN.on) markSeen(); });
function baseline(){
  if (SN.base === 'visit') return SN.visit ? { z: SN.visit.z, label: `your last visit (${when(SN.visit.t)})` } : { z: Infinity, label: 'your last visit (first visit: nothing to compare)' };
  if (SN.base === 'hour') return { t: Date.now() - 36e5, label: 'an hour ago' };
  if (SN.base === 'day') return { t: Date.now() - 864e5, label: 'yesterday' };
  const r = S.records.get(SN.ref); return r ? { z: r.z, label: r.type === 'DELIVER' ? `the delivery “${r.title}”` : `the decision “${r.text.slice(0, 40)}”` } : { z: Infinity, label: '…' };
}
const KIND_COL = { added: 'good', edited: 'acc', moved: 'warn', removed: 'bad', discussed: 'ink' };
const KIND_NAME = { added: 'Added', edited: 'Edited', moved: 'Moved', removed: 'Removed', discussed: 'Discussed' };
const ON_TYPES = new Set(['COMMENT', 'STANCE', 'REACT', 'CLAIM', 'EVIDENCE', 'CHECK', 'TASK']);
// changes since the baseline, one entry per element: its strongest kind of change, who changed it, when
function changesSince(){
  const b = baseline(), after = r => b.t != null ? r.t > b.t : r.z > b.z, out = new Map();
  const touch = (cid, kind, r) => { if (!cid) return; const c = kind === 'removed' ? cid : current(cid)?.cid || cid; const o = out.get(c) || { cid: c, kinds: new Set(), who: new Set(), t: 0 }; o.kinds.add(kind); o.who.add(personOf(r.author)); o.t = Math.max(o.t, r.t); out.set(c, o); };
  for (const r of S.records.values()){
    if (!after(r) || r.type === 'PROFILE') continue;
    if (r.neg !== null){ if (r.neg) touch(r.f.R, 'removed', r); }
    else if ((r.type === 'TEXT' || r.type === 'NODE') && r.edits) touch(r.edits, 'edited', r);
    else if (ELEMENT.has(r.type)) touch(r.cid, 'added', r);
    else if (r.type === 'MOVE') touch(r.f.R, 'moved', r);
    else if (r.type === 'STYLE') touch(r.f.R, 'edited', r);
    else if (r.type === 'COMMENT') touch(r.on, 'discussed', r);
    else if (ON_TYPES.has(r.type)) touch(r.f.R, 'discussed', r);
    else if (r.type === 'DECISION') touch(r.on, 'discussed', r);
  }
  for (const o of out.values()) o.kind = ['removed', 'added', 'edited', 'moved', 'discussed'].find(k => o.kinds.has(k));
  return [...out.values()].filter(o => S.records.has(o.cid)).sort((a, b) => b.t - a.t);
}
RENDER_HOOKS.screen.push(() => {
  if (!SN.on) return;
  for (const o of changesSince()){
    const el = S.records.get(o.cid), b = el && box(el); if (!b) continue;
    const a = toScreen(b.x, b.y), c = toScreen(b.x + b.w, b.y + b.h); if (c.x < -50 || a.x > innerWidth + 50 || c.y < -50 || a.y > innerHeight + 50) continue;
    ctx.save(); ctx.strokeStyle = TONE[KIND_COL[o.kind]][1]; ctx.lineWidth = 2.5; ctx.setLineDash(o.kind === 'removed' ? [6, 4] : []); rr(ctx, a.x - 5, a.y - 5, c.x - a.x + 10, c.y - a.y + 10, 8); ctx.stroke(); ctx.restore();
    drawBadge(a.x - 5, c.y + 8, `${KIND_NAME[o.kind]} · ${[...o.who].map(whoName).join(', ')}`, KIND_COL[o.kind], () => { SN.i = changesSince().findIndex(x => x.cid === o.cid); paintPanel(); });
  }
});
function stepChange(d){ const l = changesSince(); if (!l.length) return; SN.i = (SN.i + d + l.length) % l.length; const el = S.records.get(l[SN.i].cid); if (el && box(el)){ ensureVisible(el); if (!S.D.hidden.has(el.cid)){ S.sel = new Set([el.cid]); announceSel(); } dirty = true; } say(`${SN.i + 1} of ${l.length}: ${KIND_NAME[l[SN.i].kind]} ${elTitle(l[SN.i].cid)}`); paintPanel(); }
registerPanel({
  id: 'since', title: 'What changed', blurb: 'Everything added, edited, moved, removed or discussed since a moment you choose, outlined on the canvas.',
  onOpen(){ SN.on = true; SN.i = -1; dirty = true; }, onClose(){ SN.on = false; dirty = true; },
  paint(body){
    const l = changesSince(), b = baseline(), by = new Map(); for (const o of l) for (const w of o.who) by.set(w, (by.get(w) || 0) + 1);
    const refs = [...(S.D.deliveries || []).map(x => [x.d.cid, `Delivery: ${x.d.title}`]), ...(S.D.decisions || []).map(x => [x.d.cid, `Decision: ${x.d.text.slice(0, 40)}`])];
    body.innerHTML = `<div class="row2"><label class="sr" for="snBase">Since</label><select id="snBase" data-k="base" class="grow">${[['visit', 'Since my last visit'], ['hour', 'In the last hour'], ['day', 'In the last day'], ...refs.map(([c, n]) => ['ref:' + c, `Since ${n}`])].map(([k, n]) => `<option value="${k}"${(SN.base === 'ref' ? 'ref:' + SN.ref : SN.base) === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <p>Since ${esc(b.label)}: <b>${plural(l.length, 'item')}</b> changed${by.size ? ` by ${[...by].map(([w, n]) => `${esc(whoName(w))} (${n})`).join(', ')}` : ''}.</p>
      <div class="row2">${Object.keys(KIND_NAME).map(k => { const n = l.filter(o => o.kind === k).length; return n ? `<span class="pill ${KIND_COL[k] === 'ink' ? '' : KIND_COL[k]}">${n} ${KIND_NAME[k].toLowerCase()}</span>` : ''; }).join('')}</div>
      ${l.length ? `<div class="acts"><button class="btn" data-step="-1" aria-label="Previous change">‹ Previous</button><button class="btn primary" data-step="1" data-autofocus>Next change ›</button><button class="btn" data-seen>Mark all as seen</button></div>
      <ul class="plain">${l.slice(0, 80).map((o, i) => `<li class="row2${i === SN.i ? ' card hot' : ''}"><span class="pill ${KIND_COL[o.kind] === 'ink' ? '' : KIND_COL[o.kind]}">${KIND_NAME[o.kind]}</span><button class="link grow" data-i="${i}">${esc(elTitle(o.cid))}</button><small>${[...o.who].map(whoName).join(', ')} · ${when(o.t)}</small></li>`).join('')}</ul>` : '<p class="empty">Nothing changed since then.</p>'}`;
  },
  click(e, b){
    if (b.dataset.step) return stepChange(+b.dataset.step);
    if (b.dataset.i){ SN.i = +b.dataset.i - 1; return stepChange(1); }
    if (b.hasAttribute('data-seen')){ markSeen(); loadVisit(); SN.base = 'visit'; paintPanel(); dirty = true; say('Marked as seen.'); }
  },
  change(e){ if (e.target.id === 'snBase'){ const v = e.target.value; if (v.startsWith('ref:')){ SN.base = 'ref'; SN.ref = v.slice(4); } else SN.base = v; SN.i = -1; paintPanel(); dirty = true; } },
});
registerFeature({ id: 'since', name: 'What changed', group: 'remember', icon: 'diff', records: [],
  blurb: 'Catch up in place: what was added, edited, moved, removed or discussed since your last visit or a delivery',
  status: () => { if (!SN.visit) return ''; const n = [...S.records.values()].filter(r => r.z > SN.visit.z && r.type !== 'PROFILE' && !samePerson(r.author, S.me?.id)).length; return n ? `${n} new since your visit` : ''; },
  open: () => openPanel('since') });
