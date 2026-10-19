'use strict';
// @module features/work — Getting work done together: tasks on any note or shape (status, owner, due date), the Work panel
// with progress, and deliveries sealed by the canvas state and approved by the people named on them (a quorum, like a multisig)
// @uses records, derive, permissions, profiles, chrome, toolbar (menus), dialogs (report)
// TASK-I-R-{element}-S-{todo|doing|done|x}-A-{owner key|0}-D-{yyyymmdd|0}-Z-T-SIG   latest per element wins; x = not a task
//   anyone may make something a task; after that only its creator, its owner, the element's author or the canvas owner change it
// DELIVER-I-R-{nonce}-M-{title}-A-{approver_approver…}-Q-{quorum}-H-{root}-X-{frame|0}[-F-{approval flow}][-V-{version blob}]-Z-T-SIG
//   V names a blob listing the CIDs of the exact version (sorted, one per line); H = sha256 of that list. Records signed later,
//   whatever Z they claim, are not part of it. (Older deliveries without V: every record with z below the delivery's.)
// APPROVE-I-R-{delivery}-H-{root as the approver computed it}-S-{1 approve|0 request changes}-M-{note}[-P-{payment terms seen}][-G-{approvals seen}]-Z-T-SIG
//   counts only from approvers named on the delivery, and only when H matches; latest per approver wins. P binds the approval to
//   the payment terms on screen (features/payouts); G lists the approvals it came after (ordered flows, features/flows)
const WORK_SECTIONS = [];   // () → HTML sections other features add to the Work panel (features/taskflow)
const STATUS = { todo: { name: 'To do', icon: '○' }, doing: { name: 'Doing', icon: '◐' }, done: { name: 'Done', icon: '✓' } };
registerRecord('TASK', { parse(r, f){ must(isCid(f.R) && ['todo', 'doing', 'done', 'x'].includes(f.S), 'task'); r.status = f.S; r.owner = f.A && f.A !== '0' ? f.A : null; must(!r.owner || isKey(r.owner), 'task owner'); r.due = /^\d{8}$/.test(f.D || '') ? f.D : null; } });
registerRecord('DELIVER', { parse(r, f){ must(f.R && isRoot(f.H) && f.A, 'deliver'); r.title = decTxt(f.M || ''); r.approvers = keyList(f.A); must(r.approvers.length, 'approvers'); r.quorum = Math.max(1, Math.min(r.approvers.length, decInt(f.Q || '1')));
  r.root = f.H; r.scope = f.X && f.X !== '0' ? f.X : null; r.flow = f.F && f.F !== '0' ? f.F : null; r.version = f.V && f.V !== '0' ? f.V : null; must((!r.scope || isCid(r.scope)) && (!r.flow || isCid(r.flow)) && (!r.version || isCid(r.version)), 'deliver refs'); }, inherit: false, blob: 'V' });
registerRecord('APPROVE', { parse(r, f){ must(isCid(f.R) && isRoot(f.H), 'approve'); r.root = f.H; r.ok = f.S !== '0'; r.note = decTxt(f.M || ''); r.terms = f.P && f.P !== '0' ? f.P : null; r.after = f.G && f.G !== '0' ? cidList(f.G) : []; must(!r.terms || isCid(r.terms), 'terms'); }, inherit: false });
Object.assign(PERM_OF, { TASK: 'comment', DELIVER: 'draw', APPROVE: null });

DERIVE_HOOKS.push((D, by) => {
  const tasks = new Map(), made = new Map();   // element → who made it a task first
  for (const r of by.TASK || []){
    if (D.hidden.has(r.cid)) continue; const t = current(r.f.R); if (!t || D.hidden.has(t.cid)) continue;
    const cur = tasks.get(t.cid), maker = made.get(t.cid);
    if (cur || maker){ const may = [maker, cur?.owner, t.author, S.P?.owner].some(k => k && samePerson(k, r.author)); if (!may) continue; }   // a stranger can't tick off someone's task
    else made.set(t.cid, r.author);
    if (r.status === 'x') tasks.delete(t.cid); else tasks.set(t.cid, { status: r.status, owner: r.owner, due: r.due, by: r.author, t: r.t, cid: t.cid });
  }
  D.tasks = tasks;
  const deliveries = [];
  for (const d of by.DELIVER || []){
    if (D.hidden.has(d.cid)) continue;
    const votes = new Map();
    // an approver's linked devices (features/devices) sign for them; z order: latest wins
    for (const a of by.APPROVE || []){ const who = a.f.R === d.cid && !D.hidden.has(a.cid) && d.approvers.find(id => samePerson(id, a.author)); if (who) votes.set(who, a); }
    const ok = [...votes.values()].filter(a => a.ok && a.root === d.root), changes = [...votes.values()].filter(a => !a.ok);
    const x = { d, votes, ok, changes, done: ok.length >= d.quorum, stale: [...votes.values()].filter(a => a.ok && a.root !== d.root), label: '', blockers: [] };
    deliveries.push(x);
  }
  D.deliveries = deliveries;
});
// judged last, once every feature's view (claims, stances, decisions, rituals…) exists; a rule that fails to evaluate fails closed
DERIVE_FINAL.push((D, by) => {
  for (const x of D.deliveries || []) for (const h of DELIVERY_HOOKS.evaluate){ try { h(x, D, by); } catch (err){ x.done = false; x.blockers.push('A rule of this delivery could not be checked'); console.warn(err); } }
});
/* the exact version a delivery covers: the CIDs in its version blob (or, for older deliveries, every record before it) */
const versionCache = new Map();
function versionOf(d){
  if (d.version && S.blobs.has(d.version)){ if (!versionCache.has(d.version)) versionCache.set(d.version, new Set(new TextDecoder().decode(S.blobs.get(d.version)).split('\n').filter(Boolean))); return versionCache.get(d.version); }
  return null;
}
// the records of that version this browser holds (missing ones are simply absent)
function versionRecs(d){ const v = versionOf(d); return v ? [...v].map(c => S.records.get(c)).filter(Boolean) : [...S.records.values()].filter(r => r.z < d.z && r.type !== 'DELIVER' && r.type !== 'APPROVE'); }
async function versionCheck(d){   // → { root, missing }: what this browser computes for the delivered version
  const v = versionOf(d);
  if (!v) return { root: await rootAt(d.z), missing: 0 };
  const list = [...v].sort(), bytes = te.encode(list.join('\n'));
  return { root: b32(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))), missing: list.filter(c => !S.records.has(c)).length };
}

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
  const myTurn = x => !x.done && x.d.approvers.some(id => samePerson(id, S.me?.id)) && ![...x.votes.keys()].some(id => samePerson(id, S.me?.id));
  const waiting = (S.D.deliveries || []).filter(myTurn).length;
  const badge = $('workN'); if (badge) badge.textContent = open + waiting || '';
  if (!WK.on) return;
  const list = n.filter(t => !WK.mine || t.owner === S.me.id), done = list.filter(t => t.status === 'done').length;
  const title = t => { const el = S.records.get(t.cid); return el ? ((el.text || el.alt || KIND(el)).replace(/\s+/g, ' ').slice(0, 80) || 'Untitled') : 'Untitled'; };
  const row = t => `<li><button class="wk-row" data-c="${t.cid}"><span class="wk-st st-${t.status}">${STATUS[t.status].icon}</span><span class="wk-t">${esc(title(t))}</span>
    ${t.due ? `<span class="wk-due${overdue(t) ? ' late' : ''}">${esc(dueText(t.due))}</span>` : ''}${t.owner ? `<span class="av" style="background:hsl(${authorHue(t.owner)} 55% 30%)" title="">${esc(initials(t.owner))}</span>` : '<span class="av none" aria-label="unassigned">?</span>'}</button></li>`;
  const groups = Object.entries(STATUS).map(([k, s]) => { const g = list.filter(t => t.status === k); return g.length ? `<h3>${s.name} <span class="n">${g.length}</span></h3><ul class="wk-list">${g.map(row).join('')}</ul>` : ''; }).join('');
  const dl = (S.D.deliveries || []).map(x => {
    const mine = x.d.approvers.some(id => samePerson(id, S.me.id)), myVote = [...x.votes].find(([id]) => samePerson(id, S.me.id))?.[1];
    const state = x.done ? '<span class="ok">Delivered ✓</span>' : x.changes.length ? '<span class="bad">Changes requested</span>' : esc(x.label || `Waiting · ${x.ok.length} of ${x.d.quorum}`);
    const extra = DELIVERY_HOOKS.row.map(h => { try { return h(x) || ''; } catch { return ''; } }).join('');
    return `<li class="wk-dl"><div class="wk-dh"><b>${esc(x.d.title || 'Delivery')}</b><span>${state}</span></div>
      <div class="wk-ap">${x.d.approvers.map(id => { const v = x.votes.get(id); return `<span class="chip ${v ? (v.ok && v.root === x.d.root ? 'yes' : v.ok ? '' : 'no') : ''}">${esc(id === S.me.id ? 'You' : short(id))} ${v ? (v.ok ? (v.root === x.d.root ? '✓' : '≠') : '✕') : '…'}</span>`; }).join('')}</div>
      ${x.changes.map(a => a.note ? `<p class="wk-note">${esc(short(a.author))}: ${esc(a.note)}</p>` : '').join('')}
      ${x.blockers.length ? `<ul class="wk-block">${x.blockers.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}${extra}
      <div class="se-acts">${mine && !x.done ? `<button class="btn primary" data-ap="${x.d.cid}">${myVote?.ok ? 'Approved' : 'Approve'}</button><button class="btn" data-ch="${x.d.cid}">Request changes</button>` : ''}
      <button class="btn" data-proof="${x.d.cid}">${x.done ? 'Download proof' : 'View proof so far'}</button></div></li>`;
  }).join('');
  $('workBody').innerHTML = `<div class="wk-prog"><div><b>${done} of ${list.length}</b> done${WK.mine ? ' · yours' : ''}</div><i style="width:${list.length ? Math.round(done / list.length * 100) : 0}%"></i></div>
    <div class="opts"><label><input type="checkbox" id="wkMine"${WK.mine ? ' checked' : ''}> Only mine</label></div>
    ${WORK_SECTIONS.map(f => { try { return f() || ''; } catch { return ''; } }).join('')}
    ${groups || '<p class="se-empty">No tasks yet. Select a note or shape and press K (or the ✓ button) to make it a task.</p>'}
    <h3>Deliveries</h3>${dl ? `<ul class="wk-list">${dl}</ul>` : '<p class="se-empty">When the work is ready, deliver it: the people you name approve this exact version, and everyone gets a proof.</p>'}
    <button class="btn" id="wkDeliver">${ic('check')}Deliver this work…</button>`;
}
function toggleWork(force){
  WK.on = force ?? !WK.on;
  if (WK.on){ closePanel(false); if (S.ledger) toggleLedger(false); if ($('comments').style.display === 'flex') toggleComments(false); if (ST.on) toggleStructure(false); }
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
// the Deliver dialog: what, who approves and how many, plus whatever features add (an approval flow, payment terms), so the
// approvers see the terms before they sign: an approval covers the terms that were on it
async function openDeliver(){
  const others = people().filter(id => id !== S.me.id), ext = DELIVERY_HOOKS.compose;
  const v = await formDialog('Deliver this work', [
    { id: 'title', label: 'What are you delivering?', type: 'text', value: canvasTitle() },
    { id: 'who', label: 'Who approves it', type: 'people', value: others.length ? others : [S.me.id], options: [S.me.id, ...others], hint: 'They approve this exact version of the canvas. Work added later isn’t part of it.' },
    { id: 'q', label: 'Approvals needed', type: 'number', value: Math.max(1, others.length || 1), min: 1 },
    ...ext.flatMap(h => { try { return h.fields() || []; } catch { return []; } }),
  ], { ok: 'Send for approval', why: 'Everyone named gets a request; when enough of them sign, the work is delivered and everyone gets a proof.' });
  if (!v) return;
  let plan = { title: v.title.trim() || 'Delivery', approvers: v.who.length ? v.who : [S.me.id], quorum: 0, flow: null };
  plan.quorum = Math.max(1, Math.min(plan.approvers.length, v.q || plan.approvers.length));
  for (const h of ext) if (h.apply) try { plan = h.apply(v, plan) || plan; } catch {}
  plan.scope = S.sel.size === 1 && S.records.get([...S.sel][0])?.ek === 'frame' ? [...S.sel][0] : '0';
  const cid = await deliver(plan);
  for (const h of ext) if (h.after) try { await h.after(v, cid); } catch (err){ console.warn(err); }
  post({ ask: { to: plan.approvers, title: plan.title } });
  toWork(); toast(`Sent for approval to ${plan.approvers.map(id => id === S.me.id ? 'you' : short(id)).join(', ')}`);
  return cid;
}
// sign a delivery of the canvas as it is now: the version list goes with it as a blob, its hash is the root
async function deliver({ title, approvers, quorum = approvers.length, flow = null, scope = '0', nonce = null }){
  const z = S.lamport + 1, list = [...S.records.values()].filter(r => r.z < z && r.type !== 'DELIVER' && r.type !== 'APPROVE').map(r => r.cid).sort();
  const bytes = te.encode(list.join('\n')), vb = await cidOf(bytes), root = b32(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  return publish(await signed('DELIVER', [['I', S.me.id], ['R', nonce || b32(crypto.getRandomValues(new Uint8Array(8)))], ['M', encTxt(title)], ['A', approvers.join('_')], ['Q', quorum], ['H', root], ['X', scope || '0'],
    ...(flow ? [['F', flow]] : []), ['V', vb], ['Z', z], ['T', Date.now()]]), { [vb]: bytes });
}
function toWork(){ if (!WK.on) toggleWork(true); else paintWork(); }
async function approve(cid, ok, note = ''){
  const d = S.records.get(cid); if (!d) return;
  if (d.version && !S.blobs.has(d.version)){ toast('The version list hasn’t arrived yet. Syncing first…'); sendHello(false); return; }
  const { root, missing } = await versionCheck(d);
  if (ok && (root !== d.root || missing)){ toast(missing ? `You’re missing ${plural(missing, 'record')} of this version. Syncing first…` : 'This version doesn’t match what you have. Syncing first…'); sendHello(false); return; }
  const x = S.D.deliveries.find(v => v.d.cid === cid), terms = S.D.pays?.get(cid)?.cid;
  await publish(await signed('APPROVE', [['I', S.me.id], ['R', cid], ['H', root], ['S', ok ? '1' : '0'], ['M', encTxt(note)], ...(terms ? [['P', terms]] : []),
    ...(x?.ok.length ? [['G', x.ok.map(a => a.cid).join('_')]] : []), ['Z', ++S.lamport], ['T', Date.now()]]));
  toast(ok ? 'Approved. Your signature is on this version.' : 'Changes requested.');
}
WIRE_HOOKS.ask = a => { if (a?.to?.includes(S.me?.id)) toast(`You’ve been asked to approve “${a.title}” · open Work`); };

/* the proof: who made the delivered version, who approved it, and the signed records anyone can verify */
function showProof(cid){
  const x = S.D.deliveries.find(v => v.d.cid === cid); if (!x) return;
  const recs = versionRecs(x.d);
  const by = new Map(); for (const r of recs) by.set(personOf(r.author), (by.get(personOf(r.author)) || 0) + 1);
  const out = [`# ${x.d.title || 'Delivery'}`, '', `- **Status:** ${x.done ? `Delivered — ${x.ok.length} of ${x.d.quorum} approvals on this exact version` : `Waiting — ${x.ok.length} of ${x.d.quorum} approvals`}`,
    `- **Canvas:** ${canvasTitle()} (\`${canvasId}\`)`, `- **Version (state root):** \`${x.d.root}\` — the SHA-256 of the ${recs.length} record CIDs it contains`,
    `- **Requested by:** ${short(x.d.author)} · ${new Date(x.d.t).toLocaleString()}`, '', '## Contributors', '',
    ...[...by].sort((a, b) => b[1] - a[1]).map(([id, n]) => `- ${short(id)} — ${n} signed change${n > 1 ? 's' : ''} · key \`${id}\``), '', '## Approvals', '',
    ...x.d.approvers.map(id => { const v = x.votes.get(id); return `- ${short(id)}: ${v ? (v.ok ? (v.root === x.d.root ? `approved ${new Date(v.t).toLocaleString()}` : 'approved a different version (not counted)') : `requested changes${v.note ? ` — “${v.note}”` : ''}`) : 'not yet'}`; }),
    ...DELIVERY_HOOKS.proof.flatMap(h => { const extra = []; try { h(x, extra); } catch {} return extra; }),
    '', '## Verify', '', 'Each line below is a signed record. Import them with the canvas file (More → Open a .flux file) and every signature is checked; recompute the state root from the record CIDs to confirm the version.', '', '```',
    x.d.raw, ...[...x.votes.values()].map(v => v.raw), '```'];
  openReport(`Proof — ${x.d.title || 'Delivery'}`, out.join('\n'), `proof-${(x.d.title || 'delivery').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`);
}
CHANGE_HOOKS.push(paintWork);
PALETTE_HOOKS.push(add => { add('work', 'Work: tasks and deliveries', () => toggleWork(true)); add('work', 'Deliver this work…', openDeliver); add('work', 'Make the selection a task', () => setTask(taskable([...S.sel].map(c => S.records.get(c)).filter(Boolean)), { status: 'todo' }), { k: 'K' }); });
// in the Team hub too: tasks and deliveries, and the approvals waiting on you
registerFeature({ id: 'work', name: 'Tasks and deliveries', group: 'deliver', icon: 'check', records: ['TASK', 'DELIVER', 'APPROVE'],
  blurb: 'Tasks with owners and due dates; deliveries approved on an exact version',
  needs: () => (S.D.deliveries || []).filter(x => !x.done && x.d.approvers.some(id => samePerson(id, S.me?.id)) && ![...x.votes.keys()].some(id => samePerson(id, S.me?.id))).map(x => ({ label: `Approve “${x.d.title}”`, run: () => toggleWork(true) })),
  open: () => toggleWork(true) });
