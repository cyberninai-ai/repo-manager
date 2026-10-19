'use strict';
// @module features/facilitate — Facilitated turn-taking: a facilitator (a signed, transferable role) runs an agenda with time
// boxes, pulls everyone to the next item, keeps a queue of raised hands, gives the floor and names a note-taker per item. The
// meeting has a record of execution (planned against actual time, who spoke, what was decided) and minutes anyone can verify.
// @uses records, derive, permissions (owner), ui/hub (strip), ui/panels, ui/form
// FACIL-I-R-{person}-S-{1 start|0 end}-P-{the role record it hands over from|0}-Z-T-SIG
//   the role is a chain: it starts from the owner's latest appointment (on an open canvas, anyone's latest start), and each
//   handover names the record it continues, so nobody can rewrite who held the role by backdating
// AGENDA-I-R-{nonce}-M-{title~minutes~frame _ …}-P-{role}-Z-T-SIG   NEXT-I-R-{agenda}-J-{item, or the item count when done}-P-{role}-Z-T-SIG
// FLOOR-I-R-{person|0}-P-{role}-Z-T-SIG   SCRIBE-I-R-{person}-J-{item}-P-{role}-Z-T-SIG   (by the facilitator holding that role)
// HAND-I-S-{1 up|0 down}-Z-T-SIG (anyone's)
const roleRef = f => { const p = f.P && f.P !== '0' ? f.P : null; must(!p || isCid(p), 'role'); return p; };
registerRecord('FACIL', { parse(r, f){ must(isKey(f.R), 'facil'); r.who = f.R; r.on = f.S !== '0'; r.prev = roleRef(f); }, inherit: false });
registerRecord('AGENDA', { parse(r, f){ must(f.M, 'agenda'); r.role = roleRef(f); r.items = f.M.split('_').filter(Boolean).map(it => { const [t, m, fr] = it.split('~'); must(!fr || fr === '0' || isCid(fr), 'frame'); return { title: decTxt(t || ''), min: Math.max(1, Math.min(240, +m || 5)), frame: fr && fr !== '0' ? fr : null }; }); must(r.items.length, 'agenda'); }, inherit: false });
registerRecord('NEXT', { parse(r, f){ must(isCid(f.R) && f.J != null, 'next'); r.role = roleRef(f); r.n = Math.max(0, +f.J || 0); }, inherit: false });
registerRecord('FLOOR', { parse(r, f){ r.who = f.R && f.R !== '0' ? f.R : null; must(!r.who || isKey(r.who), 'floor'); r.role = roleRef(f); }, inherit: false });
registerRecord('SCRIBE', { parse(r, f){ must(isKey(f.R), 'scribe'); r.who = f.R; r.n = Math.max(0, +f.J || 0); r.role = roleRef(f); }, inherit: false });
registerRecord('HAND', { parse(r, f){ r.up = f.S !== '0'; }, inherit: false });
Object.assign(PERM_OF, { FACIL: null, AGENDA: null, NEXT: null, FLOOR: null, SCRIBE: null, HAND: 'comment' });

DERIVE_HOOKS.push((D, by) => {
  const owner = S.P?.owner, live = r => r.neg === null && !D.hidden.has(r.cid);
  const facils = (by.FACIL || []).filter(live);
  // the role chain
  const roots = facils.filter(r => owner ? samePerson(r.author, owner) : !r.prev);
  const chain = []; let head = roots.at(-1) || null;
  // a holder who signs two handovers: the one the successor already acted under stands; otherwise the earliest
  const used = new Set([...facils.map(r => r.prev), ...['AGENDA', 'NEXT', 'FLOOR', 'SCRIBE'].flatMap(t => by[t] || []).map(r => r.role)].filter(Boolean));
  while (head && chain.length < 500){ chain.push(head); const h = head, next = h.on ? facils.filter(r => r.prev === h.cid && samePerson(r.author, h.who)) : [];
    head = next.find(r => used.has(r.cid)) || next[0] || null; }
  const cur = chain.at(-1), tenure = new Map(chain.map((r, i) => [r.cid, { who: r.who, until: chain[i + 1]?.z ?? Infinity, on: r.on }]));
  // meeting records count only under a role in the chain, signed by its holder, within its tenure
  const acts = ['AGENDA', 'NEXT', 'FLOOR', 'SCRIBE'].flatMap(t => by[t] || []).filter(live).filter(r => { const t = r.role && tenure.get(r.role); return t && t.on && samePerson(r.author, t.who) && r.z < t.until; });
  const recs = [...acts, ...(by.HAND || []).filter(live)].sort(byZ);
  const m = { fac: cur?.on ? cur.who : null, role: cur?.on ? cur.cid : null, roles: chain, agenda: null, at: null, started: 0, floor: null, scribes: new Map(), hands: new Map(), log: [] };
  for (const r of recs){
    if (r.type === 'HAND'){ const p = personOf(r.author); if (r.up) m.hands.set(p, r.z); else m.hands.delete(p); }   // the queue goes by order of raised hands
    else if (r.type === 'AGENDA'){ m.agenda = r; m.at = null; m.log = []; m.scribes = new Map(); }
    else if (r.type === 'NEXT' && m.agenda && r.f.R === m.agenda.cid){
      const last = m.log.at(-1); if (last && !last.end) last.end = r.t;
      m.at = Math.min(r.n, m.agenda.items.length); m.started = r.t; m.floor = null;
      if (m.at < m.agenda.items.length) m.log.push({ i: m.at, start: r.t, end: null, z: r.z, floors: [] });
    }
    else if (r.type === 'FLOOR'){ m.floor = r.who; if (r.who){ m.hands.delete(personOf(r.who)); m.log.at(-1)?.floors.push(r.who); } }
    else if (r.type === 'SCRIBE') m.scribes.set(r.n, r.who);
  }
  m.queue = [...m.hands].sort((a, b) => a[1] - b[1]).map(([p]) => p);
  m.done = !!m.agenda && m.at === m.agenda.items.length;
  D.meet = m;
});
const meet = () => S.D.meet || { queue: [], log: [] };
const amFac = () => !!meet().fac && samePerson(meet().fac, S.me?.id);
const canFacilitate = () => !S.P?.owner || samePerson(S.P.owner, S.me?.id) || amFac();
const item = () => { const m = meet(); return m.agenda && m.at != null && m.at < m.agenda.items.length ? m.agenda.items[m.at] : null; };
const meetSign = async (type, pairs) => publish(await signed(type, [['I', S.me.id], ...pairs, ['Z', ++S.lamport], ['T', Date.now()]]));
const facilitate = who => meetSign('FACIL', [['R', who], ['S', '1'], ['P', amFac() ? meet().role : '0']]);   // a handover names the role it continues
const act = (type, pairs) => meetSign(type, [...pairs, ['P', meet().role || '0']]);
const raiseHand = up => meetSign('HAND', [['S', up ? '1' : '0']]);
const giveFloor = who => act('FLOOR', [['R', who || '0']]);
async function nextItem(n = null){ const m = meet(); if (!m.agenda) return; await act('NEXT', [['R', m.agenda.cid], ['J', n ?? (m.at == null ? 0 : m.at + 1)]]); }
async function setAgenda(items){ await act('AGENDA', [['R', b32(crypto.getRandomValues(new Uint8Array(6)))], ['M', items.map(i => `${encTxt(i.title)}~${i.min}~${i.frame || '0'}`).join('_')]]); }
async function agendaForm(){
  const frames = S.D.els.filter(e => e.ek === 'frame' && !S.D.hidden.has(e.cid));
  const cur = meet().agenda?.items || frames.map(f => ({ title: f.text || 'Item', min: 10 }));
  const v = await formDialog('Agenda', [
    { id: 'items', label: 'One item per line: title, then minutes after a bar', type: 'textarea', value: cur.map(i => `${i.title} | ${i.min}`).join('\n') || 'Check-in | 5\nMain topic | 20\nDecisions and owners | 10' },
    { id: 'info', type: 'info', label: frames.length ? 'Items named like a frame on the canvas take everyone to that frame when they start.' : 'Tip: put each item in a frame with the same name, and everyone is taken there when it starts.' },
  ], { ok: 'Sign the agenda', why: 'The agenda is a signed record: the meeting has an order, time boxes, and a record of how it went.' });
  if (!v) return;
  const items = v.items.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [t, m] = l.split('|').map(s => s.trim()); const fr = frames.find(f => (f.text || '').trim().toLowerCase() === t.toLowerCase()); return { title: t.slice(0, 80), min: Math.max(1, Math.min(240, +m || 10)), frame: fr?.cid || null }; });
  if (items.length) await setAgenda(items);
}

/* following the facilitator: a new item pulls everyone's view to its frame; time up dims the canvas */
const MEET = { seen: null, stay: false, warned: null };
CHANGE_HOOKS.push(() => {
  const m = meet(), key = m.agenda ? `${m.agenda.cid}:${m.at}` : null;
  if (key === MEET.seen) return; const first = MEET.seen === null; MEET.seen = key;
  if (first || !m.agenda || m.at == null || Date.now() - m.started > 15000) return;
  if (m.done){ toast('Meeting complete. The minutes are in Team → Meeting.'); return; }
  const it = item(); toast(`Now: ${it.title} · ${it.min} min${m.scribes.get(m.at) ? ` · notes: ${whoName(m.scribes.get(m.at))}` : ''}`);
  if (it.frame && !MEET.stay){ const f = current(it.frame); if (f){ ensureVisible(f); dirty = true; } }
});
setInterval(() => {
  const it = item(); if (!it) return; const over = Date.now() - meet().started - it.min * 6e4, key = `${meet().agenda.cid}:${meet().at}`;
  if (over > 0 && MEET.warned !== key){ MEET.warned = key; toast(`Time is up for “${it.title}”.`); document.body.classList.add('dim'); setTimeout(() => document.body.classList.remove('dim'), 4000); }
}, 1000);

STRIP.push(() => {
  const m = meet(); if (!m.agenda || m.done && Date.now() - m.started > 60000) return '';
  const it = item(), mine = m.hands.has(personOf(S.me?.id)), fac = amFac();
  if (!it) return fac && !m.done ? `<span class="sp">${ic('present')}<b>Agenda ready</b><span>${plural(m.agenda.items.length, 'item')}</span><button class="btn" data-strip="next">Start</button></span>` : m.done ? `<span class="sp">${ic('check')}<b>Meeting complete</b></span>` : '';
  const left = m.started + it.min * 6e4 - Date.now();
  return `<span class="sp${left < 0 ? ' over' : ''}">${ic('present')}<b>${m.at + 1}/${m.agenda.items.length} ${esc(it.title.slice(0, 32))}</b><span class="t">${left < 0 ? 'over ' + clock(-left) : clock(left)}</span>
    ${m.floor ? `<span>Floor: ${esc(whoName(m.floor))}</span>` : ''}${m.queue.length ? `<span>✋ ${m.queue.length}</span>` : ''}
    <button class="btn" data-strip="hand" aria-pressed="${mine}">${mine ? 'Lower hand' : '✋ Raise hand'}</button>
    ${fac ? `${m.queue.length ? `<button class="btn" data-strip="floor">Floor to ${esc(whoName(m.queue[0]))}</button>` : ''}<button class="btn" data-strip="next">Next ▸</button>` : ''}</span>`;
});
STRIP_ACTIONS.hand = () => raiseHand(!meet().hands.has(personOf(S.me.id)));
STRIP_ACTIONS.floor = () => { const q = meet().queue[0]; if (q) giveFloor(q); };
STRIP_ACTIONS.next = () => nextItem();

/* the Meeting panel: role, agenda, queue, note-takers, the record of execution, minutes */
registerPanel({
  id: 'meeting', title: 'Meeting', blurb: 'A facilitator, an agenda with time boxes, a queue for the floor, and a record of how the meeting went.', sync: true,
  paint(body){
    const m = meet(), fac = amFac(), here = [...new Set([S.me.id, ...peers.keys()])];
    const items = m.agenda?.items || [];
    const done = new Map(m.log.map(l => [l.i, l]));
    body.innerHTML = `<div class="card${fac ? ' hot' : ''}"><div class="hd"><b>Facilitator: ${m.fac ? esc(whoName(m.fac)) : 'nobody yet'}</b>${m.roles.length > 1 ? `<small>${plural(m.roles.length, 'handover')}</small>` : ''}</div>
        <div class="acts">${canFacilitate() && !fac ? '<button class="btn primary" data-fac="me" data-autofocus>Facilitate</button>' : ''}${canFacilitate() ? here.filter(id => !samePerson(id, m.fac)).filter(id => id !== S.me.id).map(id => `<button class="btn" data-fac="${id}">Hand to ${esc(short(id))}</button>`).join('') : ''}${fac ? '<button class="btn" data-fac="end">Stop facilitating</button>' : ''}</div></div>
      <h3>Agenda</h3>${items.length ? `<table><tr><th>#</th><th>Item</th><th>Planned</th><th>Actual</th><th>Notes</th></tr>${items.map((it, i) => { const l = done.get(i), act = l ? Math.round(((l.end || Date.now()) - l.start) / 6e4) : null;
        return `<tr${m.at === i ? ' style="font-weight:600"' : ''}><td>${i + 1}</td><td>${it.frame ? `<button class="link" data-go="${it.frame}">${esc(it.title)}</button>` : esc(it.title)}</td><td>${it.min} min</td><td>${act == null ? '–' : `<span class="${act > it.min ? 'pill warn' : ''}">${act} min</span>`}</td>
          <td>${m.scribes.get(i) ? esc(whoName(m.scribes.get(i))) : fac ? `<select data-k="sc${i}" data-scribe="${i}" aria-label="Note-taker for ${esc(it.title)}"><option value="">Pick…</option>${here.map(id => `<option value="${esc(id)}">${esc(whoName(id))}</option>`).join('')}</select>` : '–'}</td></tr>`; }).join('')}</table>`
        : '<p class="empty">No agenda yet.</p>'}
      ${fac ? `<div class="acts"><button class="btn" data-agenda>${ic('list')}${items.length ? 'Change the agenda…' : 'Write the agenda…'}</button>${items.length && !m.done ? `<button class="btn primary" data-next>${m.at == null ? 'Start the meeting' : m.at + 1 < items.length ? 'Next item' : 'Finish the meeting'}</button>` : ''}<label class="muted"><input type="checkbox" data-k="stay"${MEET.stay ? ' checked' : ''}> Don’t move my view</label></div>` : `<label class="muted"><input type="checkbox" data-k="stay"${MEET.stay ? ' checked' : ''}> Don’t move my view when the item changes</label>`}
      <h3>Queue for the floor <span class="n">${m.queue.length}</span></h3>
      ${m.queue.length ? `<ul class="plain">${m.queue.map((p, i) => `<li class="row2">${avatar(p)}<span class="grow">${i + 1}. ${esc(whoName(p))}</span>${fac ? `<button class="btn" data-floor="${p}">Give the floor</button>` : ''}</li>`).join('')}</ul>` : '<p class="empty">Nobody waiting.</p>'}
      <div class="acts"><button class="btn" data-hand>${m.hands.has(personOf(S.me.id)) ? 'Lower my hand' : '✋ Raise my hand'}</button>${m.floor ? `<span class="pill acc">Floor: ${esc(whoName(m.floor))}</span>${fac ? '<button class="btn" data-floor="">Close the floor</button>' : ''}` : ''}</div>
      ${m.log.length ? `<div class="acts"><button class="btn" data-minutes>${ic('doc')}Minutes</button></div>` : ''}`;
  },
  click(e, b){
    if (b.dataset.go) return goTo(b.dataset.go);
    if (b.dataset.fac === 'me') return facilitate(S.me.id);
    if (b.dataset.fac === 'end') return meetSign('FACIL', [['R', S.me.id], ['S', '0'], ['P', meet().role || '0']]);
    if (b.dataset.fac) return facilitate(b.dataset.fac);
    if (b.hasAttribute('data-agenda')) return agendaForm();
    if (b.hasAttribute('data-next')) return nextItem();
    if (b.hasAttribute('data-hand')) return STRIP_ACTIONS.hand();
    if (b.dataset.floor !== undefined) return giveFloor(b.dataset.floor || null);
    if (b.hasAttribute('data-minutes')) return openReport(`Minutes — ${canvasTitle()}`, minutes(), 'minutes.md');
  },
  change(e){ const t = e.target; if (t.dataset.k === 'stay') MEET.stay = t.checked; if (t.dataset.scribe && t.value) act('SCRIBE', [['R', t.value], ['J', +t.dataset.scribe]]); },
});
// minutes: per item what happened in its time slot, from the signed records themselves
function minutes(){
  const m = meet(), items = m.agenda?.items || [], out = [`# Minutes — ${canvasTitle()}`, '', `- **Facilitator:** ${m.fac ? short(m.fac) : '—'}`, `- **Agenda:** ${plural(items.length, 'item')}, ${items.reduce((a, i) => a + i.min, 0)} min planned`, ''];
  for (const l of m.log){
    const it = items[l.i], end = l.end || Date.now(), recs = [...S.records.values()].filter(r => r.t >= l.start && r.t < end);
    const of = t => recs.filter(r => r.type === t);
    out.push(`## ${l.i + 1}. ${it.title}`, '', `- ${new Date(l.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, ${Math.round((end - l.start) / 6e4)} of ${it.min} min${m.scribes.get(l.i) ? ` · notes by ${short(m.scribes.get(l.i))}` : ''}`,
      ...(l.floors.length ? [`- Spoke: ${[...new Set(l.floors.map(short))].join(', ')}`] : []),
      ...of('DECISION').map(d => `- **Decided:** ${d.text} (${short(d.author)})`),
      ...of('TASK').filter(t => t.status !== 'x').map(t => `- **Action:** ${elTitle(t.f.R)}${t.owner ? ` → ${short(t.owner)}` : ''}`),
      `- ${plural(of('NODE').length + of('TEXT').length, 'note')}, ${plural(of('COMMENT').length, 'comment')}, ${plural(of('STANCE').length, 'stance')}`, '');
  }
  return out.join('\n');
}
registerFeature({ id: 'meeting',
  needs: () => { const it = item(); return it && amFac() && Date.now() > meet().started + it.min * 6e4 ? [{ label: `Time is up for “${it.title}”: move on`, run: () => openPanel('meeting') }] : []; }, name: 'Facilitated meeting', group: 'meet', icon: 'present', records: ['FACIL', 'AGENDA', 'NEXT', 'FLOOR', 'SCRIBE', 'HAND'],
  blurb: 'A facilitator, an agenda with time boxes, a queue for the floor, note-takers, minutes',
  status: () => { const it = item(); return it ? `${meet().at + 1}/${meet().agenda.items.length} ${it.title.slice(0, 18)}` : ''; },
  open: () => openPanel('meeting') });
PALETTE_HOOKS.push(add => { add('team', 'Raise or lower my hand', () => STRIP_ACTIONS.hand()); add('team', 'Next agenda item', () => amFac() ? nextItem() : toast('Only the facilitator moves the agenda.')); });
