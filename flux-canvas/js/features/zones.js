'use strict';
// @module features/zones — Zones and suggest mode: whoever owns a frame (its author, or the canvas owner) can make it a zone.
// In a suggest zone, what others add, move or edit inside it shows as a suggestion, ghosted, until the zone's owner accepts or
// declines it; in a locked zone, others' changes there don't count at all. Discussion (comments, stances, claims, tasks) is
// never gated. Co-workers stop overwriting each other's areas without anyone having to ask "who's on this?".
// @uses core derive (RECORD_GATES, S.D.pending), records, render (drawEl), ui/panels
// ZONE-I-R-{frame}-S-{open|suggest|locked}-X-Y-W-H-Z-T-SIG     the frame's area when it was zoned; latest per frame wins
// ACCEPT-I-R-{record}-S-{1 accept|0 decline}-Z-T-SIG           the zone owner's answer to a suggestion
registerRecord('ZONE', { parse(r, f){ if (!f.R || !['open', 'suggest', 'locked'].includes(f.S)) throw Error('zone'); r.mode = f.S; r.zx = decInt(f.X || '0'); r.zy = decInt(f.Y || '0'); r.zw = Math.max(0, +f.W || 0); r.zh = Math.max(0, +f.H || 0); }, inherit: false });
registerRecord('ACCEPT', { parse(r, f){ if (!f.R) throw Error('accept'); r.yes = f.S !== '0'; }, inherit: false });
Object.assign(PERM_OF, { ZONE: 'draw', ACCEPT: null });
const GATED = new Set(['NODE', 'TEXT', 'SHAPE', 'IMAGE', 'MOVE', 'STYLE', 'ARROW', 'GROUP']);
// zones from the full record set (before derive): the latest valid ZONE per frame
function zonesOf(all, P){
  const z = new Map();
  for (const r of all) if (r.type === 'ZONE' && r.neg === null){ const fr = S.records.get(r.f.R); if (fr && (samePerson(r.author, fr.author) || P.owner && samePerson(r.author, P.owner))) z.set(r.f.R, r); }
  return [...z.values()].filter(r => r.mode !== 'open');
}
const inZone = (z, x, y) => x >= z.zx && y >= z.zy && x <= z.zx + z.zw && y <= z.zy + z.zh;
// where a record acts: a new element where it was placed; a change where its target was placed
function anchorOf(r){
  if (r.type === 'MOVE' || r.type === 'STYLE' || r.neg !== null){ const t = S.records.get(r.f.R); return t && Number.isFinite(t.x) ? t : null; }
  if ((r.type === 'TEXT' || r.type === 'NODE') && r.edits){ const t = S.records.get(r.edits); return t && Number.isFinite(t.x) ? t : r; }
  if (r.type === 'ARROW'){ const a = S.records.get(r.f.FROM); return a && Number.isFinite(a.x) ? a : null; }
  if (r.type === 'GROUP'){ const a = S.records.get(r.members?.[0]); return a && Number.isFinite(a.x) ? a : null; }
  return Number.isFinite(r.x) ? r : null;
}
RECORD_GATES.push((all, P) => {
  const zones = zonesOf(all, P); if (!zones.length) return null;
  const answers = new Map(); for (const r of all) if (r.type === 'ACCEPT') answers.set(r.f.R, r);   // z order: the latest answer
  return r => {
    if (!GATED.has(r.type) && r.neg === null) return null;
    if (r.f.R && zones.some(z => z.f.R === r.f.R) && r.type !== 'MOVE') return null;   // the frame's own record
    const a = anchorOf(r); if (!a) return null;
    for (const z of zones){
      if (samePerson(r.author, z.author) || !inZone(z, a.x, a.y) || r.cid === z.f.R) continue;
      if (z.mode === 'locked') return 'deny';
      const ans = answers.get(r.cid); if (ans && samePerson(ans.author, z.author)) return ans.yes ? null : 'deny';
      return 'pending';
    }
    return null;
  };
});
// the suggestions waiting, with the zone each sits in
function suggestions(){
  const out = [], P = S.P || { owner: null }, zones = zonesOf([...S.records.values()].sort(byZ), P);
  for (const c of S.D.pending || []){ const r = S.records.get(c); if (!r) continue; const a = anchorOf(r), z = a && zones.find(z => inZone(z, a.x, a.y)); if (z) out.push({ r, z }); }
  return out.sort((a, b) => a.r.z - b.r.z);
}
const answer = async (cid, yes) => publish(await signed('ACCEPT', [['I', S.me.id], ['R', cid], ['S', yes ? '1' : '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
async function setZone(frame, mode){
  const b = box(frame); if (!b) return;
  await publish(await signed('ZONE', [['I', S.me.id], ['R', frame.cid], ['S', mode], ['X', encInt(Math.round(b.x))], ['Y', encInt(Math.round(b.y))], ['W', Math.round(b.w)], ['H', Math.round(b.h)], ['Z', ++S.lamport], ['T', Date.now()]]));
  toast(mode === 'open' ? 'Zone opened: anyone may change it.' : mode === 'suggest' ? 'Suggest zone: others’ changes wait for you to accept them.' : 'Locked zone: only you change what’s inside.');
}
const zoneOfFrame = cid => [...S.records.values()].filter(r => r.type === 'ZONE' && r.f.R === cid).sort(byZ).at(-1);
// tell people before they sign something a zone won't take as is
const warnedZones = new Set();
PUBLISH_FILTERS.push(async raw => {
  const t = raw.slice(0, raw.indexOf('-')); if (!GATED.has(t)) return undefined;
  const zones = zonesOf([...S.records.values()].sort(byZ), S.P || { owner: null }); if (!zones.length) return undefined;
  let r; try { r = toRec(parse(raw), 'pending'); } catch { return undefined; }
  const a = anchorOf(r), z = a && zones.find(z => inZone(z, a.x, a.y) && !samePerson(z.author, S.me.id)); if (!z) return undefined;
  if (z.mode === 'locked'){ toast(`${whoName(z.author)} has locked this area. Comment or take a stance instead.`); return null; }
  if (!warnedZones.has(z.cid)){ warnedZones.add(z.cid); toast(`This is ${whoName(z.author)}’s area: your change is a suggestion until they accept it.`); }
  return undefined;
});
// suggestions drawn ghosted where they would land, with the suggester's name; the zone's owner answers from the badge
RENDER_HOOKS.world.push(() => {
  for (const { r } of suggestions()){
    if (!ELEMENT.has(r.type)) continue;
    const el = Object.assign(Object.create(r), { ew: r.type === 'DRAW' ? r.w : r.sw, ec: r.f.C, ek: r.k || 'card', ez: r.z, elabel: '', efill: r.fill || null, esize: null, eshape: null, edash: null });
    ctx.save(); ctx.globalAlpha = .45; try { drawEl(el); } catch {} ctx.restore();
  }
});
RENDER_HOOKS.screen.push(() => {
  for (const { r, z } of suggestions()){
    const a = anchorOf(r); if (!a) continue; const s = toScreen(a.x, a.y);
    const own = samePerson(z.author, S.me.id), what = r.type === 'MOVE' ? 'move' : r.type === 'STYLE' ? 'restyle' : r.edits ? 'edit' : r.neg ? 'removal' : 'addition';
    const w = drawBadge(s.x, s.y - 26, `${whoName(r.author)} suggests ${what === 'addition' ? 'an' : 'a'} ${what}${own ? '' : ' · waiting'}`, 'acc', own ? () => openPanel('zones') : null);
    if (own){ drawBadge(s.x + w + 4, s.y - 26, '✓ Accept', 'good', () => answer(r.cid, true)); drawBadge(s.x + w + 76, s.y - 26, '✕', 'bad', () => answer(r.cid, false)); }
  }
  for (const r of S.records.values()) if (r.type === 'ZONE' && r.mode !== 'open' && zoneOfFrame(r.f.R) === r){ const fr = current(r.f.R), sb = fr && screenBox(fr); if (sb) drawBadge(sb.x + sb.w - 120, sb.y + 6, `${r.mode === 'locked' ? '🔒' : '✎'} ${whoName(r.author)}’s ${r.mode === 'locked' ? 'zone' : 'suggest zone'}`, r.mode === 'locked' ? 'warn' : 'acc'); }
});
const isFrameRec = r => r?.type === 'NODE' && (r.ek || r.k) === 'frame';
TOOLBAR_HOOKS.push((rs, one, B) => isFrameRec(one) && (samePerson(one.author, S.me.id) || samePerson(S.P?.owner, S.me.id)) ? B('zone', 'zone', `Zone: ${zoneOfFrame(one.cid)?.mode || 'open'}…`, 'aria-haspopup="menu"') : '');
TOOLBAR_ACTIONS.zone = (rs, b) => { const f = rs[0], cur = zoneOfFrame(f.cid)?.mode || 'open';
  openMenu(b, [['open', 'Open: anyone changes it'], ['suggest', 'Suggest: others’ changes wait for me'], ['locked', 'Locked: only I change it']].map(([m, l]) => ({ label: l, icon: m === 'locked' ? 'lock' : m === 'suggest' ? 'edit' : 'unlock', on: cur === m, run: () => setZone(f, m) }))); };
registerPanel({
  id: 'zones', title: 'Zones and suggestions', blurb: 'Areas people own: changes others make inside them wait as suggestions, or don’t count when the area is locked.',
  paint(body){
    const sug = suggestions(), mine = sug.filter(s => samePerson(s.z.author, S.me.id)), waiting = sug.filter(s => samePerson(s.r.author, S.me.id));
    const zones = [...S.records.values()].filter(r => r.type === 'ZONE' && zoneOfFrame(r.f.R) === r && r.mode !== 'open');
    const row = ({ r, z }, own) => `<li class="row2"><span class="pill acc">${esc(r.type === 'MOVE' ? 'Move' : r.type === 'STYLE' ? 'Restyle' : r.edits ? 'Edit' : r.neg ? 'Removal' : 'Addition')}</span><span class="grow">${esc(elTitle(r.edits || r.f.R || r.cid))} <small>by ${esc(whoName(r.author))} in ${esc(elTitle(z.f.R))}</small></span>${own ? `<button class="btn" data-yes="${r.cid}">Accept</button><button class="btn" data-no="${r.cid}">Decline</button>` : '<small>waiting</small>'}</li>`;
    body.innerHTML = `${mine.length ? `<h3>For you to answer <span class="n">${mine.length}</span></h3><ul class="plain">${mine.map(s => row(s, true)).join('')}</ul><div class="acts"><button class="btn" data-all>Accept all</button></div>` : ''}
      ${waiting.length ? `<h3>Your suggestions <span class="n">${waiting.length}</span></h3><ul class="plain">${waiting.map(s => row(s, false)).join('')}</ul>` : ''}
      <h3>Zones <span class="n">${zones.length}</span></h3>${zones.length ? `<ul class="plain">${zones.map(z => `<li class="row2"><button class="link grow" data-go="${z.f.R}">${esc(elTitle(z.f.R))}</button><span class="pill ${z.mode === 'locked' ? 'warn' : 'acc'}">${z.mode}</span><small>${esc(whoName(z.author))}</small></li>`).join('')}</ul>` : '<p class="empty">No zones. Select a frame you made and choose “Zone…” to make it yours.</p>'}`;
  },
  async click(e, b){ if (b.dataset.yes) return answer(b.dataset.yes, true); if (b.dataset.no) return answer(b.dataset.no, false); if (b.dataset.go) return goTo(b.dataset.go); if (b.hasAttribute('data-all')) for (const s of suggestions().filter(s => samePerson(s.z.author, S.me.id))) await answer(s.r.cid, true); },
});
registerFeature({ id: 'zones', name: 'Zones and suggestions', group: 'meet', icon: 'zone', records: ['ZONE', 'ACCEPT'],
  blurb: 'Own an area: others’ changes inside it wait as suggestions, or are locked out',
  status: () => { const n = suggestions().filter(s => samePerson(s.z.author, S.me?.id)).length; return n ? `${n} to answer` : ''; }, open: () => openPanel('zones') });
