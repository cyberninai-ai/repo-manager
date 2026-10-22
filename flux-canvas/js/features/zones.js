'use strict';
// @module features/zones — Zones and suggest mode: whoever owns a frame (its author, or the canvas owner) can make it a zone.
// In a suggest zone, what others add, move or edit inside it shows as a suggestion, ghosted, until the zone's owner accepts or
// declines it; in a locked zone, others' changes there don't count at all. Discussion (comments, stances, claims, tasks) is
// never gated. Co-workers stop overwriting each other's areas without anyone having to ask "who's on this?".
// @uses core derive (RECORD_GATES, S.D.pending), records, render (drawEl), ui/panels
// ZONE-I-R-{frame}-S-{open|suggest|locked}-Z-T-SIG     by the frame's author or the canvas owner; latest per frame wins.
//   The area is the frame itself, wherever it is now: never numbers the signer chose
// ACCEPT-I-R-{record}-S-{1 accept|0 decline}-Z-T-SIG   a zone owner's answer to a suggestion; every zone it lands in must agree
// The canvas owner is never gated; taking back your own work never is; discussion (comments, stances, claims, tasks) never is.
registerRecord('ZONE', { parse(r, f){ must(isCid(f.R) && ['open', 'suggest', 'locked'].includes(f.S), 'zone'); r.mode = f.S; }, inherit: false });
registerRecord('ACCEPT', { parse(r, f){ must(isCid(f.R), 'accept'); r.yes = f.S !== '0'; }, inherit: false });
Object.assign(PERM_OF, { ZONE: 'draw', ACCEPT: null });
const GATED = new Set(['NODE', 'TEXT', 'SHAPE', 'IMAGE', 'DRAW', 'MOVE', 'STYLE', 'ARROW', 'GROUP']);
const ZONE_TARGETED = new Set(['STYLE']);   // records that change the element named by R, where that element is (data cells: features/data)
const isFrameNode = r => r?.type === 'NODE' && r.k === 'frame';
// zones from the permitted records (before derive): the latest valid, unrevoked ZONE per frame, with the frame's current area
function zonesOf(all, P){
  const ok = all.filter(r => permitted(r, P)), revoked = new Set();
  for (const r of ok) if (r.neg !== null){ const t = S.records.get(r.f.R); if (t && t.author === r.author){ if (r.neg) revoked.add(t.cid); else revoked.delete(t.cid); } }
  const live = r => !revoked.has(r.cid);
  const z = new Map();
  for (const r of ok) if (r.type === 'ZONE' && r.neg === null && live(r)){ const fr = S.records.get(r.f.R); if (isFrameNode(fr) && live(fr) && permitted(fr, P) && (samePerson(r.author, fr.author) || P.owner && samePerson(r.author, P.owner))) z.set(r.f.R, r); }
  const out = [];
  for (const r of z.values()){
    if (r.mode === 'open') continue;
    const fr = S.records.get(r.f.R); let x = fr.x, y = fr.y, w = fr.bw || 200, h = fr.bh || 140;
    for (const m of ok) if (m.type === 'MOVE' && m.neg === null && m.f.R === fr.cid && live(m)){ x += m.dx; y += m.dy; w += m.dw; h += m.dh; }
    out.push({ rec: r, cid: r.cid, f: r.f, author: r.author, mode: r.mode, zx: x, zy: y, zw: Math.max(0, w), zh: Math.max(0, h) });
  }
  return out;
}
const inZone = (z, x, y) => x >= z.zx && y >= z.zy && x <= z.zx + z.zw && y <= z.zy + z.zh;
// the points where a record acts: where a new element lands; for a change, where its target was and where a move takes it
function anchorsOf(r){
  const at = t => t && Number.isFinite(t.x) ? [{ x: t.x, y: t.y }] : t?.type === 'DRAW' ? (g => g ? [{ x: g.box.x, y: g.box.y }, { x: g.box.x + g.box.w, y: g.box.y + g.box.h }] : [])(strokeGeom(t.f.R)) : [];
  if (r.type === 'MOVE'){ const t = S.records.get(r.f.R), p = at(t); return [...p, ...p.map(q => ({ x: q.x + r.dx, y: q.y + r.dy }))]; }
  if (ZONE_TARGETED.has(r.type)) return at(S.records.get(r.f.R));
  if ((r.type === 'TEXT' || r.type === 'NODE') && r.edits) return [...at(S.records.get(r.edits)), ...at(r)];
  if (r.type === 'ARROW') return [...at(S.records.get(r.f.FROM)), ...at(S.records.get(r.f.TO))];
  if (r.type === 'GROUP') return (r.members || []).flatMap(c => at(S.records.get(c)));
  return at(r);
}
const anchorOf = r => anchorsOf(r)[0] || null;
const zonesHit = (zones, r) => { const pts = anchorsOf(r); return zones.filter(z => r.cid !== z.f.R && !samePerson(r.author, z.author) && pts.some(p => inZone(z, p.x, p.y))); };
RECORD_GATES.push((all, P) => {
  const zones = zonesOf(all, P); if (!zones.length) return null;
  const answers = new Map(); for (const r of all) if (r.type === 'ACCEPT' && r.neg === null) answers.set(`${r.f.R}|${personOf(r.author)}`, r);   // z order: each owner's latest
  return r => {
    if (r.neg !== null || !GATED.has(r.type) || P.owner && samePerson(r.author, P.owner)) return null;
    const hit = zonesHit(zones, r); if (!hit.length) return null;
    if (hit.some(z => z.mode === 'locked')) return 'deny';
    const said = hit.map(z => answers.get(`${r.cid}|${personOf(z.author)}`));
    if (said.some(a => a && !a.yes)) return 'deny';
    return said.every(a => a?.yes) ? null : 'pending';
  };
});
// computed once per change, not per frame: each frame's zone (latest valid), the active zones, and the suggestions waiting
DERIVE_HOOKS.push(D => {
  const all = [...S.records.values()].sort(byZ), P = S.P || { owner: null }, active = zonesOf(all, P), byFrame = new Map(), sug = [];
  for (const r of all) if (r.type === 'ZONE' && r.neg === null && inView(r)) byFrame.set(r.f.R, r);
  if (active.length) for (const c of D.pending){ const r = S.records.get(c), hit = r && zonesHit(active, r); if (hit?.length) sug.push({ r, z: hit[0], zones: hit }); }
  D.zoneByFrame = byFrame; D.zones = active; D.suggestions = sug.sort((a, b) => a.r.z - b.r.z);
});
const suggestions = () => S.D.suggestions || [];
const answer = async (cid, yes) => publish(await signed('ACCEPT', [['I', S.me.id], ['R', cid], ['S', yes ? '1' : '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
async function setZone(frame, mode){
  const b = box(frame); if (!b) return;
  await publish(await signed('ZONE', [['I', S.me.id], ['R', frame.cid], ['S', mode], ['Z', ++S.lamport], ['T', Date.now()]]));
  toast(mode === 'open' ? 'Zone opened: anyone may change it.' : mode === 'suggest' ? 'Suggest zone: others’ changes wait for you to accept them.' : 'Locked zone: only you change what’s inside.');
}
const zoneOfFrame = cid => S.D.zoneByFrame?.get(cid);
// tell people before they sign something a zone won't take as is
const warnedZones = new Set();
PUBLISH_FILTERS.push(async raw => {
  const t = raw.slice(0, raw.indexOf('-')); if (!GATED.has(t)) return undefined;
  const zones = S.D.zones || []; if (!zones.length) return undefined;
  let r; try { r = toRec(parse(raw), 'pending'); } catch { return undefined; }
  if (S.P?.owner && samePerson(S.P.owner, S.me.id)) return undefined;
  const hit = zonesHit(zones, r), z = hit.find(z => z.mode === 'locked') || hit[0]; if (!z) return undefined;
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
  for (const { r, zones } of suggestions()){
    const a = anchorOf(r); if (!a) continue; const s = toScreen(a.x, a.y);
    const own = zones.some(z => samePerson(z.author, S.me.id)), what = r.type === 'MOVE' ? 'move' : r.type === 'STYLE' ? 'restyle' : r.edits ? 'edit' : r.neg ? 'removal' : 'addition';
    const w = drawBadge(s.x, s.y - 26, `${whoName(r.author)} suggests ${what === 'addition' ? 'an' : 'a'} ${what}${own ? '' : ' · waiting'}`, 'acc', own ? () => openPanel('zones') : null);
    if (own){ drawBadge(s.x + w + 4, s.y - 26, '✓ Accept', 'good', () => answer(r.cid, true)); drawBadge(s.x + w + 76, s.y - 26, '✕', 'bad', () => answer(r.cid, false)); }
  }
  for (const r of S.D.zones || []){ const fr = current(r.f.R), sb = fr && screenBox(fr); if (sb) drawBadge(sb.x + sb.w - 120, sb.y + 6, `${r.mode === 'locked' ? '🔒' : '✎'} ${whoName(r.author)}’s ${r.mode === 'locked' ? 'zone' : 'suggest zone'}`, r.mode === 'locked' ? 'warn' : 'acc'); }
});
const isFrameRec = r => r?.type === 'NODE' && (r.ek || r.k) === 'frame';
TOOLBAR_HOOKS.push((rs, one, B) => isFrameRec(one) && (samePerson(one.author, S.me.id) || samePerson(S.P?.owner, S.me.id)) ? B('zone', 'zone', `Zone: ${zoneOfFrame(one.cid)?.mode || 'open'}…`, 'aria-haspopup="menu"') : '');
TOOLBAR_ACTIONS.zone = (rs, b) => { const f = rs[0], cur = zoneOfFrame(f.cid)?.mode || 'open';
  openMenu(b, [['open', 'Open: anyone changes it'], ['suggest', 'Suggest: others’ changes wait for me'], ['locked', 'Locked: only I change it']].map(([m, l]) => ({ label: l, icon: m === 'locked' ? 'lock' : m === 'suggest' ? 'edit' : 'unlock', on: cur === m, run: () => setZone(f, m) }))); };
registerPanel({
  id: 'zones', title: 'Zones and suggestions', blurb: 'Areas people own: changes others make inside them wait as suggestions, or don’t count when the area is locked.',
  paint(body){
    const sug = suggestions(), mine = sug.filter(s => samePerson(s.z.author, S.me.id)), waiting = sug.filter(s => samePerson(s.r.author, S.me.id));
    const zones = S.D.zones || [];
    const row = ({ r, z }, own) => `<li class="row2"><span class="pill acc">${esc(r.type === 'MOVE' ? 'Move' : r.type === 'STYLE' ? 'Restyle' : r.edits ? 'Edit' : r.neg ? 'Removal' : 'Addition')}</span><span class="grow">${esc(elTitle(r.edits || r.f.R || r.cid))} <small>by ${esc(whoName(r.author))} in ${esc(elTitle(z.f.R))}</small></span>${own ? `<button class="btn" data-yes="${r.cid}">Accept</button><button class="btn" data-no="${r.cid}">Decline</button>` : '<small>waiting</small>'}</li>`;
    body.innerHTML = `${mine.length ? `<h3>For you to answer <span class="n">${mine.length}</span></h3><ul class="plain">${mine.map(s => row(s, true)).join('')}</ul><div class="acts"><button class="btn" data-all>Accept all</button></div>` : ''}
      ${waiting.length ? `<h3>Your suggestions <span class="n">${waiting.length}</span></h3><ul class="plain">${waiting.map(s => row(s, false)).join('')}</ul>` : ''}
      <h3>Zones <span class="n">${zones.length}</span></h3>${zones.length ? `<ul class="plain">${zones.map(z => `<li class="row2"><button class="link grow" data-go="${z.f.R}">${esc(elTitle(z.f.R))}</button><span class="pill ${z.mode === 'locked' ? 'warn' : 'acc'}">${z.mode}</span><small>${esc(whoName(z.author))}</small></li>`).join('')}</ul>` : '<p class="empty">No zones. Select a frame you made and choose “Zone…” to make it yours.</p>'}`;
  },
  async click(e, b){ if (b.dataset.yes) return answer(b.dataset.yes, true); if (b.dataset.no) return answer(b.dataset.no, false); if (b.dataset.go) return goTo(b.dataset.go); if (b.hasAttribute('data-all')) for (const s of suggestions().filter(s => s.zones.some(z => samePerson(z.author, S.me.id)))) await answer(s.r.cid, true); },
});
registerFeature({ id: 'zones',
  needs: () => suggestions().filter(s => s.zones.some(z => samePerson(z.author, S.me.id))).map(s => ({ label: `${whoName(s.r.author)} suggests a change in your zone`, run: () => openPanel('zones') })), name: 'Zones and suggestions', group: 'meet', icon: 'zone', records: ['ZONE', 'ACCEPT'],
  blurb: 'Own an area: others’ changes inside it wait as suggestions, or are locked out',
  status: () => { const n = suggestions().filter(s => s.zones.some(z => samePerson(z.author, S.me?.id))).length; return n ? `${n} to answer` : ''; }, open: () => openPanel('zones') });
