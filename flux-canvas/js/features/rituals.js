'use strict';
// @module features/rituals — Ritual contracts: a retro, a planning session or a design review is started as a signed contract
// naming what it must produce (decisions, action items, stances…), how many people must take part, and its time box. It can only
// close as a success when those outputs exist; when the time runs out it closes as incomplete, for everyone to see. A team's
// record of rituals becomes a fact: "our retros closed 9 times out of 12".
// @uses records, derive, ui/hub (strip), ui/panels, ui/form
// RITUAL-I-R-{nonce}-M-{name}-U-{output~count _ …}-Q-{people}-E-{time box, minutes}-Z-T-SIG       starts at its T
// CLOSE-I-R-{ritual}-O-{success|incomplete|aborted}-K-{output CIDs _|0}-M-{note}-Z-T-SIG          the first valid close wins
// What counts as an output is only the record type, made after the ritual started: so every feature's records can be required.
const RITUAL_OUTPUTS = {
  decision: { label: 'decision', types: ['DECISION'] }, task: { label: 'action item', types: ['TASK'], ok: r => r.status !== 'x' },
  stance: { label: 'stance', types: ['STANCE'] }, note: { label: 'note', types: ['NODE', 'TEXT'] }, claim: { label: 'grounded check', types: ['CHECK'] },
  comment: { label: 'comment', types: ['COMMENT'] }, delivery: { label: 'delivery', types: ['DELIVER'] }, vote: { label: 'vote', types: ['REACT'] },
};
const RITUAL_KINDS = {
  retro: { name: 'Retro', need: { note: 3, decision: 1, task: 2 }, people: 2, min: 45, blurb: 'What went well, what didn’t: at least one decision and two action items.' },
  planning: { name: 'Sprint planning', need: { task: 3, decision: 1 }, people: 2, min: 60, blurb: 'Leaves with owned action items and a decision on scope.' },
  review: { name: 'Design review', need: { stance: 3, decision: 1 }, people: 3, min: 30, blurb: 'Everyone takes a stance; it ends with a recorded decision.' },
  kickoff: { name: 'Kickoff', need: { decision: 2, task: 3 }, people: 3, min: 60, blurb: 'Goals decided, first tasks owned.' },
};
registerRecord('RITUAL', { parse(r, f){ if (!f.R || !f.M) throw Error('ritual'); r.name = decTxt(f.M); r.need = Object.fromEntries((f.U || '').split('_').filter(Boolean).map(p => p.split('~')).filter(([k]) => k in RITUAL_OUTPUTS).map(([k, n]) => [k, Math.max(0, Math.min(99, +n || 0))]));
  r.people = Math.max(1, +f.Q || 1); r.min = Math.max(1, Math.min(600, +f.E || 30)); r.ends = r.t + r.min * 6e4; }, inherit: false });
registerRecord('CLOSE', { parse(r, f){ if (!f.R || !['success', 'incomplete', 'aborted'].includes(f.O)) throw Error('close'); r.outcome = f.O; r.outputs = f.K && f.K !== '0' ? f.K.split('_') : []; r.note = decTxt(f.M || ''); }, inherit: false });
Object.assign(PERM_OF, { RITUAL: 'draw', CLOSE: 'comment' });

// progress of a ritual up to record order z: the outputs made since it started, and who took part
function ritualProgress(rit, z = Infinity){
  const recs = [...S.records.values()].filter(r => r.z > rit.z && r.z < z && r.t >= rit.t && !S.D.hidden.has(r.cid) && r.type !== 'CLOSE');
  const got = {}, out = new Set(), who = new Set();
  for (const r of recs) who.add(personOf(r.author));
  for (const [k, n] of Object.entries(rit.need)){ const spec = RITUAL_OUTPUTS[k], hits = recs.filter(r => spec.types.includes(r.type) && (!spec.ok || spec.ok(r))); got[k] = hits.length; hits.slice(0, n).forEach(r => out.add(r.cid)); }
  const met = Object.entries(rit.need).every(([k, n]) => got[k] >= n) && who.size >= rit.people;
  return { got, who, met, outputs: [...out] };
}
DERIVE_HOOKS.push((D, by) => {
  const list = (by.RITUAL || []).filter(r => !D.hidden.has(r.cid)).map(r => ({ r, close: null }));
  const byCid = new Map(list.map(x => [x.r.cid, x]));
  for (const c of by.CLOSE || []){ const x = byCid.get(c.f.R); if (!x || x.close || D.hidden.has(c.cid)) continue; x.close = c; }
  D.rituals = list;
});
// a "success" close only counts if the outputs were really there when it was signed; otherwise it reads as incomplete
const outcomeOf = x => !x.close ? null : x.close.outcome === 'success' && !ritualProgress(x.r, x.close.z).met ? 'incomplete' : x.close.outcome;
const openRitual = () => (S.D.rituals || []).filter(x => !x.close).at(-1) || null;
async function startRitual(kind, { name, need, people: n, min } = {}){
  const k = RITUAL_KINDS[kind] || {}; need ||= k.need; n ||= k.people; min ||= k.min;
  await publish(await signed('RITUAL', [['I', S.me.id], ['R', b32(crypto.getRandomValues(new Uint8Array(6)))], ['M', encTxt(name || k.name || 'Ritual')], ['U', Object.entries(need).map(([o, c]) => `${o}~${c}`).join('_')], ['Q', n], ['E', min], ['Z', ++S.lamport], ['T', Date.now()]]));
}
async function closeRitual(x, outcome, note = ''){
  const p = ritualProgress(x.r);
  await publish(await signed('CLOSE', [['I', S.me.id], ['R', x.r.cid], ['O', outcome], ['K', p.outputs.length ? p.outputs.join('_') : '0'], ['M', encTxt(note)], ['Z', ++S.lamport], ['T', Date.now()]]));
  toast(outcome === 'success' ? `${x.r.name} closed: every required output is there.` : `${x.r.name} closed as ${outcome}. That stays on the record.`);
}
const closingRituals = new Set();
// time box over: the ritual's starter closes it as incomplete; if they are away, any participant does after five minutes
setInterval(() => {
  const x = openRitual(); if (!x || !S.me || S.histZ != null) return;
  const over = Date.now() - x.r.ends, p = ritualProgress(x.r);
  if (over > 0 && (samePerson(x.r.author, S.me.id) || over > 5 * 6e4 && p.who.has(personOf(S.me.id))) && !closingRituals.has(x.r.cid)){ closingRituals.add(x.r.cid); closeRitual(x, p.met ? 'success' : 'incomplete', 'Time box ran out'); }
}, 2000);

const needText = (rit, got) => Object.entries(rit.need).map(([k, n]) => `${Math.min(got?.[k] || 0, n)}/${n} ${RITUAL_OUTPUTS[k].label}${n === 1 ? '' : 's'}`).join(' · ');
STRIP.push(() => {
  const x = openRitual(); if (!x) return '';
  const p = ritualProgress(x.r), left = x.r.ends - Date.now(), done = Object.entries(x.r.need).filter(([k, n]) => p.got[k] >= n).length, total = Object.keys(x.r.need).length;
  return `<span class="sp${left < 0 ? ' over' : ''}">${ic('target')}<b>${esc(x.r.name)}</b><span class="t">${left < 0 ? 'over' : clock(left)}</span><span>${done}/${total} outputs${p.who.size < x.r.people ? ` · ${p.who.size}/${x.r.people} people` : ''}</span>
    <button class="btn" data-strip="ritual">${p.met ? 'Close ✓' : 'Checklist'}</button></span>`;
});
STRIP_ACTIONS.ritual = () => { const x = openRitual(); if (x && ritualProgress(x.r).met) closeRitual(x, 'success'); else openPanel('rituals'); };

registerPanel({
  id: 'rituals', title: 'Rituals', blurb: 'Retros, plannings and reviews as contracts: they close as a success only when what they must produce exists.',
  paint(body){
    const x = openRitual(), all = (S.D.rituals || []).slice().reverse(), closed = all.filter(y => y.close);
    const okN = closed.filter(y => outcomeOf(y) === 'success').length;
    const cur = x ? (() => { const p = ritualProgress(x.r), left = x.r.ends - Date.now();
      return `<div class="card hot"><div class="hd"><b>${esc(x.r.name)}</b><span class="pill ${left < 0 ? 'bad' : 'acc'}">${left < 0 ? 'Over time' : clock(left) + ' left'}</span></div>
        <ul class="plain">${Object.entries(x.r.need).map(([k, n]) => `<li class="row2"><span class="pill ${p.got[k] >= n ? 'good' : ''}">${p.got[k] >= n ? '✓' : '○'} ${Math.min(p.got[k], n)}/${n}</span>${RITUAL_OUTPUTS[k].label}${n === 1 ? '' : 's'}</li>`).join('')}
          <li class="row2"><span class="pill ${p.who.size >= x.r.people ? 'good' : ''}">${p.who.size >= x.r.people ? '✓' : '○'} ${p.who.size}/${x.r.people}</span>people taking part</li></ul>
        <div class="acts">${p.met ? '<button class="btn primary" data-close="success" data-autofocus>Close as a success</button>' : ''}<button class="btn" data-close="incomplete">Close incomplete</button><button class="btn danger" data-close="aborted">Abort</button></div></div>`; })()
      : `<div class="acts">${Object.entries(RITUAL_KINDS).map(([k, r]) => `<button class="btn" data-start="${k}">${ic('target')}${esc(r.name)}</button>`).join('')}<button class="btn" data-start="custom">Custom…</button></div>`;
    body.innerHTML = `${cur}
      ${closed.length ? `<h3>Record <span class="n">${okN} of ${closed.length} closed as a success</span></h3><ul class="plain">${closed.map(y => { const o = outcomeOf(y);
        return `<li class="row2"><span class="pill ${o === 'success' ? 'good' : o === 'aborted' ? '' : 'bad'}">${o}</span><span class="grow">${esc(y.r.name)} · ${when(y.r.t)}</span><small>${needText(y.r, ritualProgress(y.r, y.close.z).got)}</small></li>`; }).join('')}</ul>` : ''}`;
  },
  async click(e, b){
    const x = openRitual();
    if (b.dataset.close && x) return closeRitual(x, b.dataset.close);
    if (b.dataset.start === 'custom'){
      const v = await formDialog('A custom ritual', [{ id: 'name', label: 'Name', type: 'text', value: 'Weekly review' },
        ...Object.entries(RITUAL_OUTPUTS).map(([k, o]) => ({ id: k, label: `${o.label[0].toUpperCase() + o.label.slice(1)}s required`, type: 'number', value: k === 'decision' ? 1 : 0, min: 0, max: 99 })),
        { id: 'people', label: 'People who must take part', type: 'number', value: 2, min: 1 }, { id: 'min', label: 'Time box, minutes', type: 'number', value: 30, min: 1 }], { ok: 'Start the ritual' });
      if (v) await startRitual('custom', { name: v.name, need: Object.fromEntries(Object.keys(RITUAL_OUTPUTS).filter(k => v[k] > 0).map(k => [k, v[k]])), people: v.people, min: v.min });
      return;
    }
    if (b.dataset.start){ await startRitual(b.dataset.start); toast(`${RITUAL_KINDS[b.dataset.start].name} started: ${RITUAL_KINDS[b.dataset.start].blurb}`); }
  },
});
setInterval(() => { if (panelOpen === 'rituals') paintPanel(); }, 1000);
registerFeature({ id: 'rituals', name: 'Ritual contracts', group: 'meet', icon: 'target', records: ['RITUAL', 'CLOSE'],
  blurb: 'Retros, plannings and reviews that only close when their outputs exist',
  status: () => { const x = openRitual(); if (x) return needText(x.r, ritualProgress(x.r).got).split(' · ')[0]; const c = (S.D.rituals || []).filter(y => y.close); return c.length ? `${c.filter(y => outcomeOf(y) === 'success').length}/${c.length} closed` : ''; },
  open: () => openPanel('rituals') });
FLOW_CONDITIONS.ritual = { label: 'The latest ritual closed as a success', test: () => { const c = (S.D.rituals || []).filter(y => y.close).at(-1); return !c ? 'no ritual closed yet' : outcomeOf(c) === 'success' || `${c.r.name} closed ${outcomeOf(c)}`; } };
