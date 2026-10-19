'use strict';
// @module features/attention — Structural presence: not only where people's cursors are, but what they are doing: editing an
// item and for how long, reading the same note for minutes, idle, or looking at a decision without taking a stance. The Room
// panel shows the room at a glance (who may be stuck, where attention gathers); the canvas marks items several people are on.
// Attention travels with live presence and is never signed or stored: a permanent log of where everyone looked would bloat the
// record and turn presence into surveillance. Anyone can stop sharing it.
// @uses features/presence (PRESENCE_FIELDS, peers), features/decisions, features/stances, ui/panels
const ATT = { share: true, hov: null, since: 0, input: Date.now() };
try { ATT.share = localStorage.getItem('flux:attention') !== 'off'; } catch {}
for (const t of ['pointermove', 'keydown', 'wheel', 'pointerdown']) addEventListener(t, () => { ATT.input = Date.now(); }, { passive: true, capture: true });
FRAME_HOOKS.push(() => { const h = hoverCid || (S.sel.size === 1 ? [...S.sel][0] : null); if (h !== ATT.hov){ ATT.hov = h; ATT.since = Date.now(); } });
PRESENCE_FIELDS.push(() => ATT.share ? { att: { on: ATT.hov, for: ATT.hov ? Date.now() - ATT.since : 0, idle: Date.now() - ATT.input } } : { att: { off: 1 } });

// what a person is doing, from their presence and the records they signed lately
const lastSigned = new Map();   // person → time of their latest record
CHANGE_HOOKS.push(() => { for (const r of S.records.values()) if (r.t > (lastSigned.get(personOf(r.author)) || 0)) lastSigned.set(personOf(r.author), r.t); });
const editSince = new Map();
function modeOf(id, p){
  const a = p.att || {}, age = Date.now() - p.t;
  if (p.edit){ const k = id + p.edit; if (!editSince.has(k)) editSince.set(k, Date.now()); return { mode: 'editing', on: p.edit, for: Date.now() - editSince.get(k) }; }
  if (a.off) return { mode: 'private' };
  if ((a.idle || 0) + age > 2 * 6e4) return { mode: 'idle', for: (a.idle || 0) + age };
  if (a.on && a.for > 10000){
    const quiet = Date.now() - (lastSigned.get(personOf(id)) || 0) > 3 * 6e4;
    const dec = S.D.decisions?.find(x => x.d.cid === a.on || x.d.on === a.on);
    if (dec && !consensus(dec.d.cid).by?.has(personOf(id)) && a.for > 5000) return { mode: 'silent', on: a.on, for: a.for, dec };
    return { mode: a.for > 9e4 && quiet ? 'stuck' : 'reading', on: a.on, for: a.for };
  }
  return { mode: 'active', on: a.on || p.sel?.[0] || null };
}
const MODE = { editing: ['Editing', 'acc'], reading: ['Reading', null], stuck: ['Maybe stuck', 'warn'], idle: ['Idle', null], active: ['Active', 'good'], silent: ['No stance yet', 'warn'], private: ['Not sharing', null] };
const dur = ms => ms < 6e4 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 6e4)} min`;
// where attention gathers: items several people are on right now (hover, selection, editing)
function hotSpots(){
  const n = new Map();
  for (const [id, p] of peers){ const on = new Set([p.edit, p.att?.on, ...(p.sel || [])].filter(Boolean)); for (const c of on) n.set(c, (n.get(c) || new Set()).add(id)); }
  if (ATT.hov) n.set(ATT.hov, (n.get(ATT.hov) || new Set()).add(S.me.id));
  return [...n].filter(([c, s]) => s.size >= 2 && S.records.has(c)).sort((a, b) => b[1].size - a[1].size);
}
RENDER_HOOKS.screen.push(() => {
  for (const [c, who] of hotSpots()){ const sb = screenBox(current(c)); if (!sb) continue; drawBadge(sb.x + sb.w / 2 - 34, sb.y + sb.h + 30, `👁 ${who.size} here`, 'acc', () => openPanel('room')); }
});
registerPanel({
  id: 'room', title: 'Room', blurb: 'What everyone is doing right now, who may be stuck, and where attention gathers. Live only: none of this is signed or kept.', sync: true,
  paint(body){
    const rows = [...peers].map(([id, p]) => ({ id, p, m: modeOf(id, p) }));
    const hot = hotSpots(), stuck = rows.filter(r => r.m.mode === 'stuck'), silent = rows.filter(r => r.m.mode === 'silent');
    body.innerHTML = `${hot.length ? `<div class="card hot"><b>Attention gathers on</b>${hot.slice(0, 3).map(([c, s]) => `<div class="row2"><button class="link grow" data-go="${c}">${esc(elTitle(c))}</button><span class="pill acc">${s.size} people</span></div>`).join('')}</div>` : ''}
      ${stuck.length ? `<div class="card warn"><b>Maybe stuck</b>${stuck.map(r => `<small>${esc(whoName(r.id))} has been on “${esc(elTitle(r.m.on))}” for ${dur(r.m.for)} without adding anything.</small>`).join('')}</div>` : ''}
      ${silent.length ? `<div class="card warn"><b>Looked, no stance</b>${silent.map(r => `<small>${esc(whoName(r.id))} is reading the decision “${esc(r.m.dec.d.text.slice(0, 60))}” and hasn’t said where they stand.</small>`).join('')}</div>` : ''}
      <h3>People <span class="n">${rows.length + 1}</span></h3>
      <ul class="plain">${rows.length ? rows.map(({ id, p, m }) => `<li class="row2">${avatar(id)}<span class="grow"><b>${esc(whoName(id))}</b> <small>${m.on ? `${MODE[m.mode][0].toLowerCase()} “${esc(elTitle(m.on).slice(0, 40))}”` : MODE[m.mode][0].toLowerCase()}${m.for ? ` · ${dur(m.for)}` : ''}${p.via === 'mesh' ? ' · via ' + esc(short(p.through)) : ''}</small></span><span class="pill ${MODE[m.mode][1] || ''}">${MODE[m.mode][0]}</span>${m.on ? `<button class="btn" data-go="${m.on}">Show</button>` : ''}</li>`).join('') : '<li class="empty">Nobody else is here. Invite people from the Live button.</li>'}</ul>
      <label class="muted"><input type="checkbox" data-k="share"${ATT.share ? ' checked' : ''}> Share what I’m looking at and for how long (live only, never stored; your selection and edits stay visible)</label>`;
  },
  click(e, b){ if (b.dataset.go) goTo(b.dataset.go); },
  change(e){ if (e.target.dataset.k === 'share'){ ATT.share = e.target.checked; try { localStorage.setItem('flux:attention', ATT.share ? 'on' : 'off'); } catch {} sendPresence(false, true); } },
});
setInterval(() => { if (panelOpen === 'room') paintPanel(); }, 2000);
registerFeature({ id: 'room', name: 'Room: who is doing what', group: 'meet', icon: 'eye', records: [],
  blurb: 'Structural presence: editing, reading, idle, maybe stuck, and where attention gathers',
  status: () => { const s = [...peers].filter(([id, p]) => modeOf(id, p).mode === 'stuck').length; return s ? `${s} maybe stuck` : peers.size ? `${peers.size + 1} here` : ''; },
  open: () => openPanel('room') });
