'use strict';
// @module features/seal — Sealed records: sign something now, keep it unreadable until a set time, then reveal it. The seal
// commits to the exact record (its CID), so nobody, not even its author, can change it after sealing, and nobody but its author
// can read it early. Sealed bids, blind votes and pre-commitments use it directly; silent rounds (features/rounds) build on it.
// @uses records, derive, db (keys), ui/panels, ui/form
// SEAL-I-R-{nonce}-K-{note|bid|stance|commitment}-C-{CID of the sealed record}-B-{AES-GCM ciphertext, base64}-V-{iv}-W-{reveal at, ms}-O-{round|0}-X-Y-Z-T-SIG
// REVEAL-I-R-{seal}-K-{key, base64}-Z-T-SIG     only the sealer's reveal counts, and clients open it only once its time has come
// What it guarantees: the content can't change after sealing (the CID), and others can't read it before the sealer reveals.
// What it can't: force a sealer who goes offline to reveal. The panel shows who still owes a reveal.
const SEAL_KINDS = { note: 'Sealed note', bid: 'Sealed bid', stance: 'Blind stance', commitment: 'Pre-commitment' };
const SEAL_CLOCKS = [];   // (seal) → its reveal time when something else decides it (a silent round's end), or undefined
registerRecord('SEAL', { parse(r, f){ must(f.R && isCid(f.C) && f.B && f.V && own(SEAL_KINDS, f.K) && (!f.O || f.O === '0' || isCid(f.O)), 'seal'); if (f.B.length > 24000) throw Error('too big');
  r.kind = f.K; r.inner = f.C; r.at = Math.max(0, +f.W || 0); r.round = f.O && f.O !== '0' ? f.O : null; r.x = decInt(f.X || '0'); r.y = decInt(f.Y || '0'); } });
registerRecord('REVEAL', { parse(r, f){ must(isCid(f.R) && /^[A-Za-z0-9+/=]{20,64}$/.test(f.K || ''), 'reveal'); } });
Object.assign(PERM_OF, { SEAL: 'comment', REVEAL: null });

const sealKeys = new Map();   // seal CID → raw key, for the seals you made (kept in IndexedDB, or this tab when it can't)
async function keepSealKey(cid, key){ sealKeys.set(cid, key); if (!await dbPut('keys', b64enc(key), 'seal:' + cid)) try { sessionStorage.setItem('flux:seal:' + cid, b64enc(key)); } catch {} }
async function sealKey(cid){
  if (sealKeys.has(cid)) return sealKeys.get(cid);
  const v = await dbGet('keys', 'seal:' + cid) || (() => { try { return sessionStorage.getItem('flux:seal:' + cid); } catch { return null; } })();
  if (v){ const k = b64dec(v); sealKeys.set(cid, k); return k; } return null;
}
const sealTime = s => { for (const f of SEAL_CLOCKS){ const t = f(s); if (t !== undefined) return t; } return s.at; };

DERIVE_HOOKS.push((D, by) => {
  const seals = new Map();
  for (const s of by.SEAL || []) if (!D.hidden.has(s.cid)) seals.set(s.cid, { s, reveal: null });
  for (const r of by.REVEAL || []){ const x = seals.get(r.f.R); if (x && samePerson(r.author, x.s.author) && !x.reveal) x.reveal = r; }
  D.seals = seals;
});
const sealOpen = x => S.records.has(x.s.inner);

// seal a record you signed: encrypt it, publish only the commitment
async function sealRecord(innerRaw, { kind = 'note', at, round = null, x = 0, y = 0 }){
  const key = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
  // padded to 512-byte steps: otherwise the ciphertext's length gives away a blind "agree" from a "disagree", or a bid's digits
  const body = innerRaw + '\n', padded = body + ' '.repeat((512 - body.length % 512) % 512);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, te.encode(padded)));
  const inner = await cidOf(te.encode(innerRaw));
  const raw = await signed('SEAL', [['I', S.me.id], ['R', b32(crypto.getRandomValues(new Uint8Array(8)))], ['K', kind], ['C', inner], ['B', b64enc(ct)], ['V', b64enc(iv)],
    ['W', Math.round(at || 0)], ['O', round || '0'], ['X', encInt(Math.round(x))], ['Y', encInt(Math.round(y))], ['Z', ++S.lamport], ['T', Date.now()]]);
  const cid = await cidOf(te.encode(raw));
  await keepSealKey(cid, key);
  await publish(raw);
  return cid;
}
async function revealSeal(cid){
  const x = S.D.seals.get(cid); if (!x || x.reveal || !samePerson(x.s.author, S.me.id)) return false;
  const key = await sealKey(cid); if (!key) return false;
  await publish(await signed('REVEAL', [['I', S.me.id], ['R', cid], ['K', b64enc(key)], ['Z', ++S.lamport], ['T', Date.now()]]));
  return true;
}
// open revealed seals whose time has come: decrypt, check the plaintext is the committed record, ingest it like any record
const opening = new Set(), badSeals = new Set();   // a seal whose reveal doesn't open to its commitment is tried once
async function openSeals(){
  for (const [cid, x] of S.D.seals || []){
    if (!x.reveal || sealOpen(x) || opening.has(cid) || badSeals.has(cid) || Date.now() < sealTime(x.s)) continue;
    opening.add(cid);
    try {
      const k = await crypto.subtle.importKey('raw', b64dec(x.reveal.f.K), 'AES-GCM', false, ['decrypt']);
      const plain = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64dec(x.s.f.V) }, k, b64dec(x.s.f.B))).split('\n')[0];
      const node = parse(plain);
      if (await cidOf(te.encode(plain)) !== x.s.inner || !samePerson(node.fields.I, x.s.author)){ badSeals.add(cid); continue; }
      await ingest(plain);
    } catch { badSeals.add(cid); } finally { opening.delete(cid); }
  }
}
// your own seals reveal themselves when their time comes, if this browser is open
const revealing = new Set(), keyless = new Set();
async function autoReveal(){
  for (const [cid, x] of S.D.seals || []){
    if (x.reveal || revealing.has(cid) || keyless.has(cid) || !samePerson(x.s.author, S.me?.id) || Date.now() < sealTime(x.s)) continue;
    revealing.add(cid);
    try { if (!await revealSeal(cid) && !await sealKey(cid)) keyless.add(cid); } finally { setTimeout(() => revealing.delete(cid), 3000); }
  }
}
setInterval(() => { if (!S.me || S.histZ != null) return; autoReveal(); openSeals(); }, 1000);
CHANGE_HOOKS.push(() => openSeals());

/* sealed cards on the canvas: your own sealed work where you put it (others' stay out of sight; see features/rounds) */
RENDER_HOOKS.world.push(() => {
  for (const [, x] of S.D.seals || []){
    if (sealOpen(x) || x.s.round && !samePerson(x.s.author, S.me?.id)) continue;
    const z = S.view.zoom, w = 180, h = 64, left = Math.max(0, sealTime(x.s) - Date.now());
    ctx.save(); ctx.globalAlpha = .9; rr(ctx, x.s.x, x.s.y, w, h, 10); ctx.fillStyle = TONE.acc[0]; ctx.fill(); ctx.setLineDash([6 / z, 4 / z]); ctx.lineWidth = 1.5 / z; ctx.strokeStyle = TONE.acc[1]; ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = TONE.acc[1]; ctx.font = `600 13px ${FONTS.sans}`; ctx.textBaseline = 'middle';
    ctx.fillText(`🔒 ${SEAL_KINDS[x.s.kind]}`, x.s.x + 12, x.s.y + 22);
    ctx.font = `500 11px ${FONTS.sans}`; ctx.fillText(`${whoName(x.s.author)} · ${left ? `opens in ${clock(left)}` : x.reveal ? 'opening…' : 'waiting for the reveal'}`, x.s.x + 12, x.s.y + 44);
    ctx.restore();
  }
});

/* sealing something by hand: a note or a bid, opened at a set time */
async function newSealed(kind = 'note'){
  const v = await formDialog(kind === 'bid' ? 'Seal a bid' : 'Seal a note', [
    { id: 'kind', label: 'What is it', type: 'select', value: kind, options: Object.entries(SEAL_KINDS).filter(([k]) => k !== 'stance') },
    { id: 'text', label: kind === 'bid' ? 'Your bid (amount and terms)' : 'What you are sealing', type: 'textarea', value: '' },
    { id: 'at', label: 'Opens at', type: 'datetime', value: localDT(Date.now() + 15 * 6e4), hint: 'Nobody can read it before then. You can’t change it after you seal it.' },
  ], { ok: 'Seal and sign', why: 'Everyone sees that you sealed something, and when it opens. Only you can open it, and only from that time.' });
  if (!v || !v.text.trim()) return;
  const at = new Date(v.at).getTime() || Date.now() + 15 * 6e4, c = { x: S.view.x + innerWidth / 2 / S.view.zoom - 90, y: S.view.y + innerHeight / 2 / S.view.zoom - 32 };
  const inner = await signed('NODE', [['I', S.me.id], ['R', b32(crypto.getRandomValues(new Uint8Array(8)))], ['K', 'card'], ['X', encInt(Math.round(c.x))], ['Y', encInt(Math.round(c.y))], ['W', 0], ['H', 0], ['M', encTxt(`${SEAL_KINDS[v.kind]}: ${v.text.trim()}`)], ['C', 'violet'], ['P', '0'], ['Z', ++S.lamport], ['T', Date.now()]]);
  await sealRecord(inner, { kind: v.kind, at, x: c.x, y: c.y });
  toast(`Sealed until ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. It opens on its own if this browser is open then.`);
}
registerPanel({
  id: 'sealed', title: 'Sealed', blurb: 'Bids, blind votes and commitments that nobody can read or change until they open.', sync: true,
  paint(body){
    const all = [...(S.D.seals?.values() || [])].sort((a, b) => sealTime(a.s) - sealTime(b.s));
    const row = x => { const t = sealTime(x.s), open = sealOpen(x), mine = samePerson(x.s.author, S.me.id), el = open && S.records.get(x.s.inner);
      return `<li class="card${open ? '' : ' hot'}"><div class="hd"><b>${esc(SEAL_KINDS[x.s.kind])} · ${esc(whoName(x.s.author))}</b><span class="pill ${open ? 'good' : badSeals.has(x.s.cid) ? 'bad' : 'acc'}">${open ? 'Opened ✓' : badSeals.has(x.s.cid) ? 'Doesn’t match its seal' : Date.now() < t ? `Opens in ${clock(t - Date.now())}` : x.reveal ? 'Opening…' : 'Waiting for reveal'}</span></div>
        ${open ? `<p>${esc(el?.text || KIND(el))}</p><small>Matches the commitment it was sealed with (${x.s.inner.slice(-10)}).</small>` : `<small>Sealed ${when(x.s.t)} · commitment ${x.s.inner.slice(-10)}</small>`}
        ${!open && mine && Date.now() >= t && !x.reveal ? '<div class="acts"><button class="btn primary" data-rv="' + x.s.cid + '">Reveal now</button></div>' : ''}${open ? `<div class="acts"><button class="btn" data-go="${x.s.inner}">Show</button></div>` : ''}</li>`; };
    body.innerHTML = `<div class="acts"><button class="btn" data-new="note" data-autofocus>${ic('lock')}Seal a note…</button><button class="btn" data-new="bid">${ic('coin')}Seal a bid…</button></div>
      ${all.length ? `<ul class="plain">${all.map(row).join('')}</ul>` : '<p class="empty">Nothing sealed. Use it for sealed bids, blind votes, or a decision you commit to now and reveal later, so nobody can say it was made up afterwards.</p>'}
      <p class="muted">Only the person who sealed something can open it. If they are offline when it is due, it opens when they come back.</p>`;
  },
  click(e, b){ if (b.dataset.new) return newSealed(b.dataset.new); if (b.dataset.rv) return revealSeal(b.dataset.rv); if (b.dataset.go) return goTo(b.dataset.go); },
});
setInterval(() => { if (panelOpen === 'sealed') paintPanel(); }, 1000);
registerFeature({ id: 'sealed', name: 'Sealed bids and commitments', group: 'decide', icon: 'lock', records: ['SEAL', 'REVEAL'],
  blurb: 'Seal a bid, vote or commitment now; nobody can read or change it until it opens',
  status: () => { const n = [...(S.D.seals?.values() || [])].filter(x => !sealOpen(x)).length; return n ? `${n} sealed` : ''; },
  open: () => openPanel('sealed') });
