'use strict';
// @module features/profiles — Who people are: a signed PROFILE (display name) per key, shown everywhere instead of key fragments
// @uses records, derive, permissions
// PROFILE-I-{key}-M-{name}-Z-T-SIG   only you can name yourself; latest wins. The key stays the identity; the name is a label on it.
registerRecord('PROFILE', { parse(r, f){ r.name = decTxt(f.M || '').replace(/\s+/g, ' ').trim().slice(0, 40); } });
PERM_OF.PROFILE = null;   // anyone may say who they are
DERIVE_HOOKS.push(D => {
  D.profiles = new Map();
  for (const r of S.records.values()) if (r.type === 'PROFILE' && r.neg === null && (!D.profiles.has(r.author) || byZ(D.profiles.get(r.author), r) < 0)) D.profiles.set(r.author, r);
  for (const [id, p] of D.profiles) if (p.name) NAMES.set(id, p.name);
});
const myName = () => store.get('flux:name') || '';
const fingerprint = id => id ? `${id.slice(0, 2) === 'ed' ? 'Ed25519' : 'P-256'} · ${id.slice(2, 6)}…${id.slice(-4)}` : '';
async function setMyName(name){
  name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  store.set('flux:name', name);
  if (name) NAMES.set(S.me.id, name);
  await publishProfile(true);
  paintAuthors(); dirty = true;
}
// your name travels with your work: the first time you add something to a canvas, your PROFILE goes with it
let profiling = false;
async function publishProfile(force = false){
  const name = myName(); if (!name || !S.me || profiling || S.histZ != null) return;
  const cur = S.D.profiles?.get(S.me.id);
  if (cur && cur.name === name) return;
  if (!force && !cur && ![...S.records.values()].some(r => r.author === S.me.id && r.type !== 'PROFILE')) return;
  profiling = true;
  try { await publish(await signed('PROFILE', [['I', S.me.id], ['M', encTxt(name)], ['Z', ++S.lamport], ['T', Date.now()]])); } catch {} finally { profiling = false; }
}
CHANGE_HOOKS.push(() => { if (myName() && S.me && !S.D.profiles?.get(S.me.id)) setTimeout(() => publishProfile(), 0); });
// on load: your own name is known before any record says so
FRAME_HOOKS.push(function nameOnce(){ if (S.me && myName()){ NAMES.set(S.me.id, myName()); FRAME_HOOKS.splice(FRAME_HOOKS.indexOf(nameOnce), 1); } });
PALETTE_HOOKS.push(add => add('identity', 'Change my name…', async () => { const v = await ask('Your name', myName(), 'Shown on your cursor and next to everything you add. Your key stays your identity.'); if (v !== null) setMyName(v); }));
