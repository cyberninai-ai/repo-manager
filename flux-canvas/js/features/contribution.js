'use strict';
// @module features/contribution — Contribution proof: who did how much, derived from the signed records themselves instead of
// argued about afterwards. A method (weights per kind of work) is itself a signed record; anyone can propose another and the room
// takes stances on it. For each delivery, its author signs a CREDIT record with everyone's share of the delivered version, which
// anyone can recompute. Payouts (features/payouts) can split by it; across canvases it becomes a portable record of work.
// @uses records, derive, features/stances (on methods), features/work (deliveries), ui/panels, ui/form
// METHOD-I-R-{nonce}-M-{name}-W-{kind~tenths _ …}-Z-T-SIG
// CREDIT-I-R-{delivery}-H-{root}-L-{person~basis points _ …}-K-{method|default}-Z-T-SIG   the delivery's author; must recompute
const WORK_KINDS = {
  create: { label: 'Created (notes, shapes, drawings)', w: 30 }, edit: { label: 'Refined (edits, restyles)', w: 10 }, move: { label: 'Arranged (moves)', w: 2 },
  comment: { label: 'Commented', w: 10 }, stance: { label: 'Took a stance', w: 5 }, vote: { label: 'Voted', w: 2 }, ground: { label: 'Grounded claims (evidence, checks)', w: 20 },
  decide: { label: 'Recorded decisions', w: 20 }, task: { label: 'Finished tasks they owned', w: 30 }, facilitate: { label: 'Facilitated', w: 10 }, approve: { label: 'Approved the delivery', w: 10 },
};
const KIND_OF = { DRAW: 'create', SHAPE: 'create', IMAGE: 'create', ARROW: 'create', MOVE: 'move', STYLE: 'edit', COMMENT: 'comment', STANCE: 'stance', REACT: 'vote',
  EVIDENCE: 'ground', CHECK: 'ground', DECISION: 'decide', AGENDA: 'facilitate', NEXT: 'facilitate', FLOOR: 'facilitate' };
const DEFAULT_METHOD = { cid: 'default', name: 'Default', w: Object.fromEntries(Object.entries(WORK_KINDS).map(([k, v]) => [k, v.w])) };
registerRecord('METHOD', { parse(r, f){ must(f.R && f.W, 'method'); r.name = decTxt(f.M || 'Method'); r.w = { ...Object.fromEntries(Object.keys(WORK_KINDS).map(k => [k, 0])), ...Object.fromEntries(f.W.split('_').map(p => p.split('~')).filter(([k]) => own(WORK_KINDS, k)).map(([k, n]) => [k, Math.max(0, Math.min(1000, +n || 0))])) }; } });
registerRecord('CREDIT', { parse(r, f){ must(isCid(f.R) && isRoot(f.H) && f.L, 'credit'); r.shares = new Map(f.L.split('_').map(p => p.split('~')).map(([k, n]) => { must(isKey(k), 'credit key'); return [k, Math.max(0, Math.min(10000, +n || 0))]; }));
  r.method = f.K || 'default'; must(r.method === 'default' || isCid(r.method), 'method'); r.approvals = f.G && f.G !== '0' ? cidList(f.G) : []; }, inherit: false });
Object.assign(PERM_OF, { METHOD: 'comment', CREDIT: null });

// the method in use: the owner's latest; on an open canvas, the proposal the most people agree with; else the default
function methodInUse(){
  const ms = [...S.records.values()].filter(r => r.type === 'METHOD' && r.neg === null && inView(r)).sort(byZ);
  const owner = S.P?.owner;
  if (owner){ const m = ms.filter(r => samePerson(r.author, owner)).at(-1); if (m) return m; }
  let best = null, n = 0; for (const m of ms){ const a = consensus(m.cid).c.agree; if (a > n || a === n && a > 0){ best = m; n = a; } }
  return best || DEFAULT_METHOD;
}
const methodRec = c => c === 'default' ? DEFAULT_METHOD : (r => r && r.type === 'METHOD' && r.neg === null ? r : null)(S.records.get(c));
// each person's work in a set of records, weighted by a method; returns person → { pts, by: { kind: count } }.
// Only records that count in the view; a finished task credits its owner only if the task's own rules let that TASK count.
function workIn(recs, method, approvers = []){
  const out = new Map(), add = (who, kind) => { if (!who || !method.w[kind]) return; const p = personOf(who), o = out.get(p) || { pts: 0, by: {} }; o.pts += method.w[kind]; o.by[kind] = (o.by[kind] || 0) + 1; out.set(p, o); };
  const done = new Map(), made = new Map(), owners = new Map();
  for (const r of recs.filter(r => r.neg === null && inView(r)).sort(byZ)){
    if (r.type === 'TEXT' || r.type === 'NODE') add(r.author, r.edits ? 'edit' : 'create');
    else if (r.type === 'TASK'){
      const el = S.records.get(r.f.R), maker = made.get(r.f.R), cur = owners.get(r.f.R);
      if (maker && ![maker, cur, el?.author, S.P?.owner].some(k => k && samePerson(k, r.author))) continue;
      if (!maker) made.set(r.f.R, r.author);
      owners.set(r.f.R, r.owner); if (r.status === 'done' && r.owner) done.set(r.f.R, r.owner); else done.delete(r.f.R);
    }
    else if (own(KIND_OF, r.type)) add(r.author, KIND_OF[r.type]);
  }
  for (const who of done.values()) add(who, 'task');
  for (const who of new Set(approvers.map(personOf))) add(who, 'approve');
  return out;
}
// shares in basis points (sum 10000), largest remainder so they always add up
function toShares(work){
  const total = [...work.values()].reduce((a, o) => a + o.pts, 0); if (!total) return new Map();
  const raw = [...work].map(([k, o]) => [k, o.pts / total * 10000]), floor = raw.map(([k, v]) => [k, Math.floor(v)]);
  let left = 10000 - floor.reduce((a, [, v]) => a + v, 0);
  const order = raw.map(([k, v], i) => [i, v - Math.floor(v)]).sort((a, b) => b[1] - a[1] || (raw[a[0]][0] < raw[b[0]][0] ? -1 : 1));
  for (const [i] of order){ if (left <= 0) break; floor[i][1]++; left--; }
  return new Map(floor.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
}
// a delivery's shares over its exact version (features/work), with its approvers credited for approving
const sharesFor = (x, method, approvals) => toShares(workIn(versionRecs(x.d), method, approvals.map(a => a.author)));
// a delivery's shares: the signed CREDIT if there is a valid one, else computed now
function contributionShares(x){ const c = creditOf(x); return c ? c.shares : sharesFor(x, methodInUse(), x.ok); }
const creditOf = x => S.D.credits?.get(x.d.cid) || null;
const sameShares = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
// a CREDIT counts only if it recomputes, on every derive: its author made the delivery, its method is a method, its approvals
// are this delivery's valid approvals, and those give exactly its shares. Judged after the deliveries (DERIVE_FINAL)
DERIVE_FINAL.push(D => {
  const credits = new Map();
  for (const r of S.records.values()){
    if (r.type !== 'CREDIT' || r.neg !== null || !inView(r)) continue;
    try {
      const x = D.deliveries?.find(v => v.d.cid === r.f.R), m = methodRec(r.method);
      if (!x || !m || r.f.H !== x.d.root || !samePerson(r.author, x.d.author)) continue;
      const apps = r.approvals.map(c => x.ok.find(a => a.cid === c)); if (apps.some(a => !a)) continue;
      if (sameShares(r.shares, sharesFor(x, m, apps)) && (!credits.has(x.d.cid) || byZ(credits.get(x.d.cid), r) < 0)) credits.set(x.d.cid, r);
    } catch {}
  }
  D.credits = credits;
});
async function signCredit(x){
  const m = methodInUse(), shares = sharesFor(x, m, x.ok);
  if (!shares.size){ toast('No work in this version to credit yet.'); return; }
  await publish(await signed('CREDIT', [['I', S.me.id], ['R', x.d.cid], ['H', x.d.root], ['L', [...shares].map(([k, v]) => `${k}~${v}`).join('_')], ['K', m.cid], ['G', x.ok.map(a => a.cid).join('_') || '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
  toast('Contribution record signed. Anyone can recompute it from the records.');
}
const pct = bp => `${(bp / 100).toFixed(bp % 100 ? 1 : 0)}%`;
DELIVERY_HOOKS.row.push(x => { const sh = contributionShares(x); if (!sh.size) return ''; const c = creditOf(x);
  return `<div class="wk-ap">${[...sh].slice(0, 5).map(([k, v]) => `<span class="chip">${esc(whoName(k))} ${pct(v)}</span>`).join('')}${c ? '<span class="chip yes">Credit signed ✓</span>' : samePerson(x.d.author, S.me.id) && x.done ? `<button class="btn" data-credit="${x.d.cid}">Sign credit</button>` : ''}</div>`; });
DELIVERY_HOOKS.proof.push((x, out) => {
  const sh = contributionShares(x), c = creditOf(x), m = c ? (c.method === 'default' ? DEFAULT_METHOD : S.records.get(c.method)) : methodInUse(); if (!sh.size) return;
  out.push('', '## Contribution', '', `- **Method:** ${m?.name || 'Default'}${m?.cid && m.cid !== 'default' ? ` (\`${m.cid}\`)` : ''} · ${c ? `signed as \`${c.cid}\`` : 'computed, not yet signed'}`,
    ...[...sh].map(([k, v]) => `- ${short(k)}: ${pct(v)}`));
});
document.addEventListener('click', e => { const b = e.target.closest?.('[data-credit]'); if (!b) return; const x = S.D.deliveries.find(v => v.d.cid === b.dataset.credit); if (x) signCredit(x); });

async function methodForm(){
  const cur = methodInUse();
  const v = await formDialog('Propose a method', [{ id: 'name', label: 'Name', type: 'text', value: 'Our weights' },
    ...Object.entries(WORK_KINDS).map(([k, o]) => ({ id: k, label: `${o.label} (points)`, type: 'number', value: cur.w[k] / 10, min: 0, max: 100 }))],
    { ok: 'Propose and sign', why: S.P?.owner && !samePerson(S.P.owner, S.me.id) ? 'The canvas owner’s method applies; yours is a proposal people can take stances on.' : 'The method most people agree with applies (stances on it count).' });
  if (!v) return;
  await publish(await signed('METHOD', [['I', S.me.id], ['R', b32(crypto.getRandomValues(new Uint8Array(6)))], ['M', encTxt(v.name || 'Method')], ['W', Object.keys(WORK_KINDS).map(k => `${k}~${Math.round((v[k] || 0) * 10)}`).join('_')], ['Z', ++S.lamport], ['T', Date.now()]]));
}
registerPanel({
  id: 'contribution', title: 'Contribution', blurb: 'Who did how much, from the signed records. The method is a record too: propose another and the room decides.',
  paint(body){
    const m = methodInUse(), work = workIn([...S.records.values()], m), now = toShares(work), props = [...S.records.values()].filter(r => r.type === 'METHOD' && !S.D.hidden.has(r.cid)).sort(byZ);
    const bars = sh => `<ul class="plain">${[...sh].map(([k, v]) => `<li class="row2">${avatar(k)}<span class="grow">${esc(whoName(k))}<small> · ${Object.entries(work.get(k)?.by || {}).map(([kk, n]) => `${n} ${kk}`).join(', ')}</small></span><b>${pct(v)}</b></li><li><div class="bar"><i style="width:${v / 100}%;background:hsl(${authorHue(k)} 55% 40%)"></i></div></li>`).join('')}</ul>`;
    body.innerHTML = `<div class="card"><div class="hd"><b>Method: ${esc(m.name)}</b>${m.cid === 'default' ? '<span class="pill">Default</span>' : `<span class="pill acc">by ${esc(whoName(m.author))}</span>`}</div>
        <small>${Object.entries(m.w).filter(([, w]) => w).map(([k, w]) => `${WORK_KINDS[k].label.split(' (')[0].toLowerCase()} ${w / 10}`).join(' · ')}</small>
        <div class="acts"><button class="btn" data-method>${ic('edit')}Propose a method…</button></div></div>
      <h3>This canvas so far</h3>${now.size ? bars(now) : '<p class="empty">No work yet.</p>'}
      ${props.length ? `<h3>Proposed methods <span class="n">${props.length}</span></h3><ul class="plain">${props.map(p => { const c = consensus(p.cid); return `<li class="card${p.cid === m.cid ? ' hot' : ''}"><div class="hd"><b>${esc(p.name)}</b><small>${esc(whoName(p.author))}</small></div><small>${Object.entries(p.w).filter(([, w]) => w).map(([k, w]) => `${k} ${w / 10}`).join(' · ')}</small>
        <div class="acts">${Object.entries(STANCES).slice(0, 3).map(([k, s]) => `<button class="btn" data-st="${k}" data-t="${p.cid}" aria-pressed="${c.mine === k}" aria-label="${s.name}">${s.mark} ${c.c[k] || ''}</button>`).join('')}</div></li>`; }).join('')}</ul>` : ''}
      ${(S.D.deliveries || []).length ? `<h3>Per delivery</h3>${S.D.deliveries.map(x => `<div class="card"><div class="hd"><b>${esc(x.d.title)}</b>${creditOf(x) ? '<span class="pill good">Signed</span>' : ''}</div>${bars(contributionShares(x))}</div>`).join('')}` : ''}`;
  },
  click(e, b){ if (b.hasAttribute('data-method')) return methodForm(); if (b.dataset.st) return takeStance([b.dataset.t], b.dataset.st); },
});
registerFeature({ id: 'contribution', name: 'Contribution proof', group: 'deliver', icon: 'users', records: ['METHOD', 'CREDIT'],
  blurb: 'Shares of the work derived from the signed records, by a method the team agrees on', open: () => openPanel('contribution') });
