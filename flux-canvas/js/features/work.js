'use strict';
// @module features/work — Getting work done together: tasks on any note or shape (status, owner, due date), the Work panel
// with progress, and deliveries sealed by the canvas state and approved by the people named on them (a quorum, like a multisig)
// @uses records, derive, permissions, profiles, chrome, toolbar (menus), dialogs (report)
// TASK-I-R-{element}-S-{todo|doing|done|x}-A-{owner key|0}-D-{yyyymmdd|0}-Z-T-SIG   latest per element wins; x = not a task
// DELIVER-I-R-{nonce}-M-{title}-A-{approver_approver…}-Q-{quorum}-H-{root}-X-{frame|0}-Z-T-SIG
//   H = sha256 over the sorted CIDs of every record before this one (z below its own): the exact version being delivered
// APPROVE-I-R-{delivery}-H-{root as the approver computed it}-S-{1 approve|0 request changes}-M-{note}-Z-T-SIG
//   counts only from approvers named on the delivery, and only when H matches; latest per approver wins
const STATUS = { todo: { name: 'To do', icon: '○' }, doing: { name: 'Doing', icon: '◐' }, done: { name: 'Done', icon: '✓' } };
registerRecord('TASK', { parse(r, f){ if (!f.R || !['todo', 'doing', 'done', 'x'].includes(f.S)) throw Error('task'); r.status = f.S; r.owner = f.A && f.A !== '0' ? f.A : null; r.due = /^\d{8}$/.test(f.D || '') ? f.D : null; } });
registerRecord('DELIVER', { parse(r, f){ if (!f.R || !f.H || !f.A) throw Error('deliver'); r.title = decTxt(f.M || ''); r.approvers = f.A.split('_').filter(Boolean); r.quorum = Math.max(1, Math.min(r.approvers.length, decInt(f.Q || '1'))); r.root = f.H; r.scope = f.X && f.X !== '0' ? f.X : null; } });
registerRecord('APPROVE', { parse(r, f){ if (!f.R || !f.H) throw Error('approve'); r.root = f.H; r.ok = f.S !== '0'; r.note = decTxt(f.M || ''); } });
Object.assign(PERM_OF, { TASK: 'comment', DELIVER: 'draw', APPROVE: null });

DERIVE_HOOKS.push((D, by) => {
  const tasks = new Map();
  for (const r of by.TASK || []){ if (D.hidden.has(r.cid)) continue; const t = current(r.f.R); if (!t || D.hidden.has(t.cid)) continue; if (r.status === 'x') tasks.delete(t.cid); else tasks.set(t.cid, { status: r.status, owner: r.owner, due: r.due, by: r.author, t: r.t, cid: t.cid }); }
  D.tasks = tasks;
  const deliveries = [];
  for (const d of by.DELIVER || []){
    if (D.hidden.has(d.cid)) continue;
    const votes = new Map();
    for (const a of by.APPROVE || []) if (a.f.R === d.cid && d.approvers.includes(a.author) && !D.hidden.has(a.cid)) votes.set(a.author, a);   // z order: latest wins
    const ok = [...votes.values()].filter(a => a.ok && a.root === d.root), changes = [...votes.values()].filter(a => !a.ok);
    deliveries.push({ d, votes, ok, changes, done: ok.length >= d.quorum, stale: [...votes.values()].filter(a => a.ok && a.root !== d.root) });
  }
  D.deliveries = deliveries;
});

/* the version a delivery seals: every record before it, as CIDs, hashed */
async function rootAt(z){
  const cids = [...S.records.values()].filter(r => r.z < z && r.type !== 'DELIVER' && r.type !== 'APPROVE').map(r => r.cid).sort();
  return b32(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(cids.join('\n')))));
}

/* tasks */
const dueText = d => d ? new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6)).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
const overdue = t => t.due && t.status !== 'done' && t.due < new Date().toISOString().slice(0, 10).replace(/-/g, '');
async function setTask(els, change){
  const items = [];
  for (const el of els){
    const cur = S.D.tasks.get(el.cid), next = { status: cur?.status || 'todo', owner: cur?.owner || null, due: cur?.due || null, ...change };
    items.push({ cid: el.cid, before: cur ? { ...cur } : null, after: next });
    await commitTask(el.cid, next);
  }
  if (items.length){ S.hist.push({ kind: 'fn', undo: async () => { for (const it of items) await commitTask(it.cid, it.before || { status: 'x' }); }, redo: async () => { for (const it of items) await commitTask(it.cid, it.after); } }); S.redo = []; }
  return items.length;
}
async function commitTask(cid, { status, owner = null, due = null }){
  return publish(await signed('TASK', [['I', S.me.id], ['R', cid], ['S', status], ['A', owner || '0'], ['D', due || '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
}
const taskable = rs => rs.filter(r => r.type !== 'ARROW' && r.type !== 'DRAW');
const people = () => { const ids = new Set([S.me.id, ...peers.keys()]); for (const r of S.records.values()) if (r.author) ids.add(r.author); return [...ids]; };
function taskMenu(rs, anchor){
  const els = taskable(rs), one = els.length === 1 ? S.D.tasks.get(els[0].cid) : null;
  const items = Object.entries(STATUS).map(([k, s]) => ({ label: s.name, icon: k === 'done' ? 'check' : 'blank', on: one?.status === k, run: () => setTask(els, { status: k }).then(n => say(`${n > 1 ? n + ' tasks' : 'Task'}: ${s.name}.`)) }));
  items.push('-', ...people().map(id => ({ label: `Assign to ${id === S.me.id ? 'me' : short(id)}`, icon: 'users', on: one?.owner === id, run: () => setTask(els, { owner: id }).then(() => say(`Assigned to ${id === S.me.id ? 'you' : short(id)}.`)) })));
  if (one?.owner) items.push({ label: 'Unassign', icon: 'x', run: () => setTask(els, { owner: null }) });
  items.push('-', { label: one?.due ? `Due ${dueText(one.due)} · change…` : 'Set a due date…', icon: 'history', run: async () => {
    const v = await ask('Due date', one?.due ? `${one.due.slice(0, 4)}-${one.due.slice(4, 6)}-${one.due.slice(6)}` : new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), 'Year-month-day, e.g. 2026-11-02. Leave empty for no due date.');
    if (v === null) return; const d = v.trim() ? v.trim().replace(/-/g, '') : null;
    if (d && !/^\d{8}$/.test(d)){ toast('Use year-month-day, e.g. 2026-11-02.'); return; } setTask(els, { due: d });
  } });
  if (one) items.push({ label: 'Not a task', icon: 'x', run: () => { for (const el of els) commitTask(el.cid, { status: 'x' }); } });
  openMenu(anchor, items);
}
TOOLBAR_HOOKS.push((rs, one, B) => {
  const els = taskable(rs); if (!els.length) return '';
  const t = one && S.D.tasks.get(one.cid);
  return B('task', 'check', t ? `Task: ${STATUS[t.status].name}${t.owner ? ` · ${short(t.owner)}` : ''}` : 'Make it a task', `data-primary aria-haspopup="menu"${t ? ` aria-pressed="${t.status === 'done'}"` : ''}`);
});
TOOLBAR_ACTIONS.task = (rs, b) => { const els = taskable(rs); if (els.every(el => S.D.tasks.has(el.cid))) taskMenu(rs, b); else setTask(els.filter(el => !S.D.tasks.has(el.cid)), { status: 'todo' }).then(n => { say(`${n > 1 ? n + ' tasks' : 'Task'} added. Assign it from the same button.`); }); };
KEY_HOOKS.push((e, c) => {   // K: make the selection a task, or move it to the next status
  if (!c.onCanvas || c.mod || e.altKey || c.k !== 'k' || !S.sel.size) return false;
  const els = taskable([...S.sel].map(x => S.records.get(x)).filter(Boolean)); if (!els.length) return false;
  e.preventDefault(); const t = S.D.tasks.get(els[0].cid), next = !t ? 'todo' : t.status === 'todo' ? 'doing' : t.status === 'doing' ? 'done' : 'todo';
  setTask(els, { status: next }).then(() => say(`${STATUS[next].name}.`)); return true;
});

/* task chips under the element's right edge: status (click to advance), owner, due date */
let taskChips = [];
RENDER_HOOKS.screen.push(() => {
  taskChips = [];
  if (!S.D.tasks?.size) return;
  ctx.font = `600 11px ${FONTS.sans}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (const [cid, t] of S.D.tasks){
    const el = S.records.get(cid); if (!el || !visible(el)) continue;
    const b = box(el); if (!b) continue;
    const s = toScreen(b.x + b.w, b.y + b.h); if (s.x < -50 || s.y < -30 || s.x > innerWidth + 300 || s.y > innerHeight + 30) continue;
    const label = `${STATUS[t.status].icon} ${STATUS[t.status].name}${t.due ? ' · ' + dueText(t.due) : ''}`, w = ctx.measureText(label).width + 16, ow = t.owner ? 22 : 0;
    let x = s.x - w - ow, y = s.y + 5;
    const done = t.status === 'done', late = overdue(t);
    rr(ctx, x, y, w, 20, 10); ctx.fillStyle = done ? TH.ink : late ? '#fde2e1' : TH.panel; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = done ? TH.ink : late ? '#d1242f' : TH.line; ctx.stroke();
    ctx.fillStyle = done ? TH.paper : late ? '#a3151f' : TH.ink; ctx.fillText(label, x + 8, y + 10.5);
    taskChips.push({ x, y, w, h: 20, cid });
    if (t.owner){ ctx.beginPath(); ctx.arc(x + w + 12, y + 10, 10, 0, Math.PI * 2); ctx.fillStyle = `hsl(${authorHue(t.owner)} 55% 30%)`; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `700 9px ${FONTS.sans}`; ctx.textAlign = 'center'; ctx.fillText(initials(t.owner).toUpperCase(), x + w + 12, y + 10.5); ctx.textAlign = 'left'; ctx.font = `600 11px ${FONTS.sans}`; }
    if (done){ ctx.save(); ctx.globalAlpha = .9; const tl = toScreen(b.x, b.y); ctx.fillStyle = '#18794e'; ctx.beginPath(); ctx.arc(tl.x, tl.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tl.x - 4, tl.y); ctx.lineTo(tl.x - 1, tl.y + 3); ctx.lineTo(tl.x + 4, tl.y - 3); ctx.stroke(); ctx.restore(); }
  }
});
POINTER_HOOKS.push(e => {
  const c = taskChips.find(c => e.clientX >= c.x && e.clientX <= c.x + c.w && e.clientY >= c.y && e.clientY <= c.y + c.h); if (!c) return false;
  const t = S.D.tasks.get(c.cid), next = t.status === 'todo' ? 'doing' : t.status === 'doing' ? 'done' : 'todo';
  setTask([S.records.get(c.cid)], { status: next }).then(() => say(`${STATUS[next].name}.`)); return true;
});

/* the Work panel: progress, what is whose, what is late, and deliveries waiting on people */
const WK = { on: false, mine: false };
function paintWork(){
  const n = [...(S.D.tasks?.values() || [])], open = n.filter(t => t.status !== 'done' && t.owner === S.me?.id).length;
  const waiting = (S.D.deliveries || []).filter(x => !x.done && x.d.approvers.includes(S.me?.id) && !x.votes.has(S.me?.id)).length;
  const badge = $('workN'); if (badge) badge.textContent = open + waiting || '';
  if (!WK.on) return;
  const list = n.filter(t => !WK.mine || t.owner === S.me.id), done = list.filter(t => t.status === 'done').length;
  const title = t => { const el = S.records.get(t.cid); return el ? ((el.text || el.alt || KIND(el)).replace(/\s+/g, ' ').slice(0, 80) || 'Untitled') : 'Untitled'; };
  const row = t => `<li><button class="wk-row" data-c="${t.cid}"><span class="wk-st st-${t.status}">${STATUS[t.status].icon}</span><span class="wk-t">${esc(title(t))}</span>
    ${t.due ? `<span class="wk-due${overdue(t) ? ' late' : ''}">${esc(dueText(t.due))}</span>` : ''}${t.owner ? `<span class="av" style="background:hsl(${authorHue(t.owner)} 55% 30%)" title="">${esc(initials(t.owner))}</span>` : '<span class="av none" aria-label="unassigned">?</span>'}</button></li>`;
  const groups = Object.entries(STATUS).map(([k, s]) => { const g = list.filter(t => t.status === k); return g.length ? `<h3>${s.name} <span class="n">${g.length}</span></h3><ul class="wk-list">${g.map(row).join('')}</ul>` : ''; }).join('');
  const dl = (S.D.deliveries || []).map(x => {
    const mine = x.d.approvers.includes(S.me.id), myVote = x.votes.get(S.me.id);
    const state = x.done ? '<span class="ok">Delivered ✓</span>' : x.changes.length ? '<span class="bad">Changes requested</span>' : `Waiting · ${x.ok.length} of ${x.d.quorum}`;
    return `<li class="wk-dl"><div class="wk-dh"><b>${esc(x.d.title || 'Delivery')}</b><span>${state}</span></div>
      <div class="wk-ap">${x.d.approvers.map(id => { const v = x.votes.get(id); return `<span class="chip ${v ? (v.ok && v.root === x.d.root ? 'yes' : v.ok ? '' : 'no') : ''}">${esc(id === S.me.id ? 'You' : short(id))} ${v ? (v.ok ? (v.root === x.d.root ? '✓' : '≠') : '✕') : '…'}</span>`; }).join('')}</div>
      ${x.changes.map(a => a.note ? `<p class="wk-note">${esc(short(a.author))}: ${esc(a.note)}</p>` : '').join('')}
      <div class="se-acts">${mine && !x.done ? `<button class="btn primary" data-ap="${x.d.cid}">${myVote?.ok ? 'Approved' : 'Approve'}</button><button class="btn" data-ch="${x.d.cid}">Request changes</button>` : ''}
      <button class="btn" data-proof="${x.d.cid}">${x.done ? 'Download proof' : 'View proof so far'}</button></div></li>`;
  }).join('');
  $('workBody').innerHTML = `<div class="wk-prog"><div><b>${done} of ${list.length}</b> done${WK.mine ? ' · yours' : ''}</div><i style="width:${list.length ? Math.round(done / list.length * 100) : 0}%"></i></div>
    <div class="opts"><label><input type="checkbox" id="wkMine"${WK.mine ? ' checked' : ''}> Only mine</label></div>
    ${groups || '<p class="se-empty">No tasks yet. Select a note or shape and press K (or the ✓ button) to make it a task.</p>'}
    <h3>Deliveries</h3>${dl ? `<ul class="wk-list">${dl}</ul>` : '<p class="se-empty">When the work is ready, deliver it: the people you name approve this exact version, and everyone gets a proof.</p>'}
    <button class="btn" id="wkDeliver">${ic('check')}Deliver this work…</button>`;
}
function toggleWork(force){
  WK.on = force ?? !WK.on;
  if (WK.on){ if (S.ledger) toggleLedger(false); if ($('comments').style.display === 'flex') toggleComments(false); if (ST.on) toggleStructure(false); }
  $('work').style.display = WK.on ? 'flex' : 'none'; $('workBtn').setAttribute('aria-expanded', String(WK.on));
  paintWork(); if (WK.on) $('workClose').focus(); else cv.focus({ preventScroll: true });
}
$('workBtn').onclick = () => toggleWork();
$('workClose').onclick = () => toggleWork(false);
$('work').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') toggleWork(false); });
$('work').addEventListener('change', e => { if (e.target.id === 'wkMine'){ WK.mine = e.target.checked; paintWork(); } });
$('work').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.c){ const el = S.records.get(b.dataset.c); if (el){ S.sel = new Set([el.cid]); ensureVisible(el); announceSel(); dirty = true; } return; }
  if (b.id === 'wkDeliver') return openDeliver();
  if (b.dataset.ap) return approve(b.dataset.ap, true);
  if (b.dataset.ch){ const note = await ask('What needs to change?', '', 'Your note goes with your signed answer, so everyone sees it.', null, true); if (note !== null) approve(b.dataset.ch, false, note); return; }
  if (b.dataset.proof) return showProof(b.dataset.proof);
});

/* deliveries */
async function openDeliver(){
  const title = await ask('What are you delivering?', canvasTitle(), 'People you name approve this exact version of the canvas. Everything added later is not part of it.');
  if (title === null) return;
  const others = people().filter(id => id !== S.me.id);
  const picks = others.length ? await new Promise(res => openMenu($('workBtn'), [
    { label: `Everyone (${others.length + 1})`, icon: 'users', run: () => res([S.me.id, ...others]) },
    { label: 'Everyone else, not me', icon: 'users', run: () => res(others) },
    ...others.map(id => ({ label: `Only ${short(id)}`, icon: 'users', run: () => res([id]) })),
    { label: 'Just me', icon: 'users', run: () => res([S.me.id]) },
  ])) : [S.me.id];
  const z = S.lamport + 1, root = await rootAt(z), scope = S.sel.size === 1 && S.records.get([...S.sel][0])?.ek === 'frame' ? [...S.sel][0] : '0';
  await publish(await signed('DELIVER', [['I', S.me.id], ['R', b32(crypto.getRandomValues(new Uint8Array(8)))], ['M', encTxt(title.trim() || 'Delivery')], ['A', picks.join('_')], ['Q', picks.length], ['H', root], ['X', scope], ['Z', z], ['T', Date.now()]]));
  post({ ask: { to: picks, title: title.trim() } });
  toWork(); toast(`Sent for approval to ${picks.map(id => id === S.me.id ? 'you' : short(id)).join(', ')}`);
}
function toWork(){ if (!WK.on) toggleWork(true); else paintWork(); }
async function approve(cid, ok, note = ''){
  const d = S.records.get(cid); if (!d) return;
  const root = await rootAt(d.z);
  if (ok && root !== d.root){ toast('You don’t have this exact version yet. Syncing first…'); sendHello(false); return; }
  await publish(await signed('APPROVE', [['I', S.me.id], ['R', cid], ['H', root], ['S', ok ? '1' : '0'], ['M', encTxt(note)], ['Z', ++S.lamport], ['T', Date.now()]]));
  toast(ok ? 'Approved. Your signature is on this version.' : 'Changes requested.');
}
WIRE_HOOKS.ask = a => { if (a?.to?.includes(S.me?.id)) toast(`You’ve been asked to approve “${a.title}” · open Work`); };

/* the proof: who made the delivered version, who approved it, and the signed records anyone can verify */
function showProof(cid){
  const x = S.D.deliveries.find(v => v.d.cid === cid); if (!x) return;
  const recs = [...S.records.values()].filter(r => r.z < x.d.z && r.type !== 'DELIVER' && r.type !== 'APPROVE');
  const by = new Map(); for (const r of recs) by.set(r.author, (by.get(r.author) || 0) + 1);
  const out = [`# ${x.d.title || 'Delivery'}`, '', `- **Status:** ${x.done ? `Delivered — ${x.ok.length} of ${x.d.quorum} approvals on this exact version` : `Waiting — ${x.ok.length} of ${x.d.quorum} approvals`}`,
    `- **Canvas:** ${canvasTitle()} (\`${canvasId}\`)`, `- **Version (state root):** \`${x.d.root}\` — the SHA-256 of the ${recs.length} record CIDs it contains`,
    `- **Requested by:** ${short(x.d.author)} · ${new Date(x.d.t).toLocaleString()}`, '', '## Contributors', '',
    ...[...by].sort((a, b) => b[1] - a[1]).map(([id, n]) => `- ${short(id)} — ${n} signed change${n > 1 ? 's' : ''} · key \`${id}\``), '', '## Approvals', '',
    ...x.d.approvers.map(id => { const v = x.votes.get(id); return `- ${short(id)}: ${v ? (v.ok ? (v.root === x.d.root ? `approved ${new Date(v.t).toLocaleString()}` : 'approved a different version (not counted)') : `requested changes${v.note ? ` — “${v.note}”` : ''}`) : 'not yet'}`; }),
    '', '## Verify', '', 'Each line below is a signed record. Import them with the canvas file (More → Open a .flux file) and every signature is checked; recompute the state root from the record CIDs to confirm the version.', '', '```',
    x.d.raw, ...[...x.votes.values()].map(v => v.raw), '```'];
  openReport(`Proof — ${x.d.title || 'Delivery'}`, out.join('\n'), `proof-${(x.d.title || 'delivery').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`);
}
CHANGE_HOOKS.push(paintWork);
PALETTE_HOOKS.push(add => { add('work', 'Work: tasks and deliveries', () => toggleWork(true)); add('work', 'Deliver this work…', openDeliver); add('work', 'Make the selection a task', () => setTask(taskable([...S.sel].map(c => S.records.get(c)).filter(Boolean)), { status: 'todo' }), { k: 'K' }); });
