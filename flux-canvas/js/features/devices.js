'use strict';
// @module features/devices — Linked devices and guardian recovery: one person, several keys. Two devices that sign LINK records
// to each other become one person: their work, names, approvals and grants count together. You name guardians and a threshold
// (say 2 of 3 teammates); if you lose a device, a new key asks to be you and, once enough guardians confirm, it is.
// Keys stay non-extractable: nothing secret is ever copied between devices. This replaces "clearing the browser loses you".
// @uses core hooks (IDENTITY), core rtc (packCode), features/profiles, ui/panels, ui/form
// LINK-I-R-{other key}-S-{1|0}-Z-T-SIG              mutual links join two keys; a one-way link from a new key asks to recover
// GUARD-I-R-{guardian}-S-{1|0}-Q-{threshold}-Z-T-SIG   your guardians and how many must agree (your latest Q)
// RECOVER-I-R-{lost key}-K-{new key}-Z-T-SIG          a guardian confirms the new key is the same person
registerRecord('LINK', { parse(r, f){ if (!f.R) throw Error('link'); r.to = f.R; r.on = f.S !== '0'; }, inherit: false });
registerRecord('GUARD', { parse(r, f){ if (!f.R) throw Error('guard'); r.who = f.R; r.on = f.S !== '0'; r.q = Math.max(1, +f.Q || 1); }, inherit: false });
registerRecord('RECOVER', { parse(r, f){ if (!f.R || !f.K) throw Error('recover'); r.lost = f.R; r.key = f.K; }, inherit: false });
Object.assign(PERM_OF, { LINK: null, GUARD: null, RECOVER: null });
let aliasSig = '';
// runs first among derive hooks: everything after it (approvals, credit, names) sees people, not keys
DERIVE_HOOKS.unshift((D, by) => {
  const links = new Map();   // "a>b" → on, latest per direction
  for (const r of by.LINK || []) if (!D.hidden.has(r.cid)) links.set(`${r.author}>${r.to}`, r.on);
  const parent = new Map(), find = k => { while (parent.has(k) && parent.get(k) !== k) k = parent.get(k); return k; };
  const join = (a, b) => { const x = find(a), y = find(b); if (x !== y){ const [lo, hi] = x < y ? [x, y] : [y, x]; parent.set(hi, lo); parent.set(lo, lo); } };
  for (const [k, on] of links){ const [a, b] = k.split('>'); if (on && links.get(`${b}>${a}`)) join(a, b); }
  // guardians: per person their active guardians and threshold; a recovery joins the new key once enough of them confirm
  const guards = new Map();
  for (const r of by.GUARD || []){ if (D.hidden.has(r.cid)) continue; const g = guards.get(r.author) || { who: new Set(), q: 1 }; if (r.on) g.who.add(r.who); else g.who.delete(r.who); g.q = r.q; guards.set(r.author, g); }
  const rec = new Map(); D.recoveries = [];
  for (const r of by.RECOVER || []){ if (D.hidden.has(r.cid)) continue; const k = `${r.lost}>${r.key}`; if (!rec.has(k)) rec.set(k, new Set()); rec.get(k).add(r.author); }
  for (const [k, by2] of rec){
    const [lost, key] = k.split('>'), g = guards.get(lost), asked = links.get(`${key}>${lost}`);
    const ok = g ? new Set([...by2].filter(a => [...g.who].some(w => find(w) === find(a))).map(a => find(a))).size : 0;   // distinct guardians (any of their devices)
    D.recoveries.push({ lost, key, ok, need: g?.q || Infinity, asked: !!asked, done: !!asked && g && ok >= g.q });
    if (asked && g && ok >= g.q) join(lost, key);
  }
  // pending requests: a one-way link from a key that hasn't been joined (to show the guardians and the other device)
  D.linkAsks = [...links].filter(([k, on]) => { const [a, b] = k.split('>'); return on && !links.get(`${b}>${a}`) && find(a) !== find(b); }).map(([k]) => k.split('>'));
  // a one-way link to someone with guardians is a recovery request, even before any guardian has answered
  for (const [a, b] of D.linkAsks) if (guards.get(b)?.who.size && !D.recoveries.some(r => r.lost === b && r.key === a)) D.recoveries.push({ lost: b, key: a, ok: 0, need: guards.get(b).q, asked: true, done: false });
  D.guards = guards;
  // each person is named after their original key: the one whose first work (not identity records) is earliest
  const first = new Map(), keys = new Set(parent.keys()), ID_TYPES = new Set(['PROFILE', 'LINK', 'GUARD', 'RECOVER']);
  if (keys.size) for (const r of S.records.values()) if (keys.has(r.author) && !ID_TYPES.has(r.type) && (!first.has(r.author) || r.t < first.get(r.author))) first.set(r.author, r.t);
  const groups = new Map(); for (const k of keys){ const g = find(k); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); }
  const alias = new Map();
  for (const ks of groups.values()){ const root = ks.slice().sort((a, b) => (first.get(a) ?? Infinity) - (first.get(b) ?? Infinity) || (a < b ? -1 : 1))[0]; for (const k of ks) alias.set(k, root); }
  IDENTITY.of = k => alias.get(k) || k;
  // one name per person: the latest profile among their keys
  for (const [k, root] of alias){ const n = NAMES.get(k); if (n && !NAMES.has(root)) NAMES.set(root, n); }
  const sig = [...alias].map(p => p.join('=')).sort().join(',');
  if (sig !== aliasSig){ aliasSig = sig; queueMicrotask(changed); }   // permissions were filtered with the old map: once more
});
const myKeys = () => [...new Set([S.me.id, ...[...S.records.values()].filter(r => r.author && samePerson(r.author, S.me.id)).map(r => r.author)])];
const devSign = async (type, pairs) => publish(await signed(type, [['I', S.me.id], ...pairs, ['Z', ++S.lamport], ['T', Date.now()]]));
async function linkCode(){ return packCode({ t: 'link', key: S.me.id, room: canvasId }); }
// the other device pastes the code: it asks to link, the first device confirms
async function useLinkCode(code){
  const o = await unpackCode(code); if (o.t !== 'link' || !o.key) throw Error('not a link code');
  if (o.room && o.room !== canvasId) await switchCanvasTo(o.room);
  await devSign('LINK', [['R', o.key], ['S', '1']]);
  post({ linkAsk: { from: S.me.id, to: o.key } });
  toast('Asked to link. Confirm on your other device.');
}
WIRE_HOOKS.linkAsk = a => { if (a?.to === S.me?.id) toast('Another device asks to be linked to you · Team → Devices and recovery'); };
WIRE_HOOKS.recoverAsk = a => { if (S.D.guards?.get(a?.lost)?.who.has(S.me?.id)) toast(`${short(a.lost)} asks to recover their identity on a new device · Team → Devices and recovery`); };
async function askRecovery(lost){
  await devSign('LINK', [['R', lost], ['S', '1']]);
  post({ recoverAsk: { lost, key: S.me.id } });
  toast(`Asked ${short(lost)}’s guardians to confirm it’s you. Tell them through another channel too.`);
}
registerPanel({
  id: 'devices', title: 'Devices and recovery', blurb: 'One person, several keys: link your devices, and name guardians who can restore you if a device is lost.', sync: true,
  paint(body){
    const me = S.me.id, keys = myKeys(), g = S.D.guards?.get(me), asks = S.D.linkAsks || [], recs = S.D.recoveries || [];
    const toMe = asks.filter(([a, b]) => b === me && !(S.D.recoveries || []).some(r => r.key === a)), forGuard = recs.filter(r => !r.done && S.D.guards?.get(r.lost)?.who.has(me) && r.asked);
    const others = people().filter(id => !samePerson(id, me));
    body.innerHTML = `<div class="card"><b>This person’s keys</b>${keys.map(k => `<div class="row2">${avatar(k)}<span class="grow">${esc(fingerprint(k))}${k === me ? ' <small>(this device)</small>' : ''}</span></div>`).join('')}
        <div class="acts"><button class="btn" data-code data-autofocus>${ic('link')}Link another device…</button><button class="btn" data-have>I have a link code</button></div></div>
      ${toMe.length ? `<div class="card hot"><b>Waiting for you</b>${toMe.map(([a]) => `<div class="row2"><span class="grow">${esc(fingerprint(a))} asks to be linked to you</span><button class="btn primary" data-link="${a}">It’s my device</button></div>`).join('')}</div>` : ''}
      ${forGuard.length ? `<div class="card warn"><b>Recovery requests</b>${forGuard.map(r => `<div class="row2"><span class="grow">${esc(short(r.lost))}: new key ${esc(fingerprint(r.key))} · ${r.ok} of ${r.need} guardians confirmed</span><button class="btn" data-confirm="${r.lost}>${r.key}">I checked: confirm</button></div>`).join('')}<small>Only confirm after you checked with them in person or on a call.</small></div>` : ''}
      <h3>Your guardians ${g?.who.size ? `<span class="n">${g.q} of ${g.who.size} needed</span>` : ''}</h3>
      ${g?.who.size ? `<ul class="plain">${[...g.who].map(k => `<li class="row2">${avatar(k)}<span class="grow">${esc(whoName(k))}</span></li>`).join('')}</ul>` : '<p class="empty">No guardians. If this device is lost, nobody can confirm a new one is you.</p>'}
      <div class="acts"><button class="btn" data-guards${others.length ? '' : ' disabled'}>${ic('shield')}Choose guardians…</button><button class="btn" data-recover${others.length ? '' : ' disabled'}>Lost a device? Recover…</button></div>
      ${recs.filter(r => r.done).map(r => `<small>Recovered: ${esc(short(r.lost))} onto ${esc(fingerprint(r.key))} (${r.ok} guardians)</small>`).join('')}`;
  },
  async click(e, b){
    try {
      if (b.hasAttribute('data-code')){ const c = await linkCode(); await copy(c, 'Link code copied. On your other device: Team → Devices and recovery → I have a link code.'); return; }
      if (b.hasAttribute('data-have')){ const c = await ask('Link code', '', 'Paste the code from your other device.'); if (c) await useLinkCode(c.trim()); return; }
      if (b.dataset.link){ await devSign('LINK', [['R', b.dataset.link], ['S', '1']]); toast('Linked: both devices are you now.'); return; }
      if (b.dataset.confirm){ const [lost, key] = b.dataset.confirm.split('>'); await devSign('RECOVER', [['R', lost], ['K', key]]); toast('Confirmed.'); return; }
      if (b.hasAttribute('data-guards')){
        const g = S.D.guards?.get(S.me.id), others = people().filter(id => !samePerson(id, S.me.id));
        const v = await formDialog('Guardians', [{ id: 'who', label: 'People who can confirm a new device is you', type: 'people', value: [...(g?.who || [])], options: others }, { id: 'q', label: 'How many must confirm', type: 'number', value: g?.q || Math.min(2, others.length), min: 1 }],
          { ok: 'Sign', why: 'Pick people who know you and can check it’s really you. More than one makes it hard for anyone to take your identity.' });
        if (!v) return; const q = Math.max(1, Math.min(v.who.length || 1, v.q || 1));
        for (const k of new Set([...(g?.who || []), ...v.who])) await devSign('GUARD', [['R', k], ['S', v.who.includes(k) ? '1' : '0'], ['Q', q]]);
        return;
      }
      if (b.hasAttribute('data-recover')){
        const lost = await new Promise(res => openMenu(b, people().filter(id => id !== S.me.id && S.D.guards?.has(id)).map(id => ({ label: `I was ${short(id)}`, icon: 'users', run: () => res(id) })).concat([{ label: 'Cancel', icon: 'x', run: () => res(null) }])));
        if (lost) await askRecovery(lost);
      }
    } catch (err){ toast(/code/.test(err.message) ? 'That isn’t a link code.' : err.message); }
  },
});
registerFeature({ id: 'devices', name: 'Devices and recovery', group: 'network', icon: 'key', records: ['LINK', 'GUARD', 'RECOVER'],
  blurb: 'Link your devices as one person; guardians restore you if one is lost',
  status: () => { const n = (S.D.linkAsks || []).filter(([, b]) => b === S.me?.id).length + (S.D.recoveries || []).filter(r => !r.done && S.D.guards?.get(r.lost)?.who.has(S.me?.id)).length; return n ? `${n} waiting` : S.D.guards?.get(S.me?.id)?.who.size ? '' : 'no guardians'; },
  open: () => openPanel('devices') });
