'use strict';
// @module features/stances — Stance & consensus maps: on any note, shape or decision, each person signs where they stand
// (agree, disagree, unsure, have an alternative, abstain). The canvas measures agreement per item, how it moved over time,
// and paints a consensus map. Votes (features/brainstorm) say what matters; stances say whether we agree.
// @uses records, derive, permissions, ui/panels, ui/chrome (toolbar)
// STANCE-I-R-{target}-S-{agree|disagree|unsure|alt|abstain}-M-{note}-Z-T-SIG   per person and target the latest wins
const STANCES = {
  agree: { name: 'Agree', mark: '✓', tone: 'good' }, disagree: { name: 'Disagree', mark: '✕', tone: 'bad' },
  unsure: { name: 'Unsure', mark: '?', tone: 'warn' }, alt: { name: 'Have an alternative', mark: '↺', tone: 'acc' }, abstain: { name: 'Abstain', mark: '–', tone: null },
};
registerRecord('STANCE', { parse(r, f){ must(isCid(f.R) && own(STANCES, f.S), 'stance'); r.stance = f.S; r.note = decTxt(f.M || ''); } });
PERM_OF.STANCE = 'comment';

DERIVE_HOOKS.push((D, by) => {
  const cur = c => { let n = 0; while (D.next.has(c) && n++ < 1000) c = D.next.get(c); return c; };
  const stances = new Map(), log = [];
  for (const r of by.STANCE || []){
    if (D.hidden.has(r.cid)) continue;
    const t = cur(r.f.R); if (!stances.has(t)) stances.set(t, new Map());
    stances.get(t).set(personOf(r.author), r);   // z order: a person's latest stance wins
    log.push({ t, who: personOf(r.author), s: r.stance, z: r.z, at: r.t });
  }
  D.stances = stances; D.stanceLog = log;
});
// agreement on one target: counts, shares and a level the map and other features read
function consensus(target){
  const m = S.D.stances?.get(target), c = { agree: 0, disagree: 0, unsure: 0, alt: 0, abstain: 0 };
  if (!m) return { n: 0, c, level: null, mine: null };
  for (const r of m.values()) c[r.stance]++;
  const n = m.size - c.abstain, share = k => n ? c[k] / n : 0;
  const level = !n ? null : share('disagree') >= .3 ? 'split' : share('unsure') + share('alt') >= .4 ? 'uncertain' : share('agree') >= .7 ? 'converged' : 'mixed';
  return { n, all: m.size, c, level, disagree: share('disagree'), agree: share('agree'), mine: m.get(personOf(S.me?.id))?.stance || null, by: m };
}
const LEVEL = { converged: ['Converged', 'good'], mixed: ['Mixed', null], uncertain: ['Uncertain', 'warn'], split: ['Split', 'bad'] };
// how disagreement moved: the share after each stance change on this target
function convergence(target){
  const now = new Map(), out = [];
  for (const e of S.D.stanceLog || []) if (e.t === target){ now.set(e.who, e.s); const v = [...now.values()].filter(s => s !== 'abstain'); out.push({ z: e.z, at: e.at, dis: v.length ? v.filter(s => s === 'disagree').length / v.length : 0 }); }
  return out;
}
// "disagreement 50% → 0%": from its peak (or its start, when it only grew) to now
const trendText = target => { const t = convergence(target); if (t.length < 2) return ''; const pct = x => Math.round(x * 100), peak = Math.max(...t.map(e => e.dis)), now = t.at(-1).dis;
  const from = peak > now ? peak : t[0].dis; return pct(from) === pct(now) ? '' : `disagreement ${pct(from)}% → ${pct(now)}%`; };
async function takeStance(targets, stance, note = ''){
  for (const t of targets) await publish(await signed('STANCE', [['I', S.me.id], ['R', t], ['S', stance], ['M', encTxt(note)], ['Z', ++S.lamport], ['T', Date.now()]]));
  say(`${STANCES[stance].name}${targets.length > 1 ? ` on ${targets.length} items` : ''}. Your stance is signed.`);
}
function stanceMenu(targets, anchor, at = null){
  const one = targets.length === 1 ? consensus(targets[0]).mine : null;
  openMenu(anchor, [
    ...Object.entries(STANCES).map(([k, s]) => ({ label: `${s.mark}  ${s.name}`, icon: 'blank', on: one === k, run: () => takeStance(targets, k) })),
    '-', { label: 'Say why…', icon: 'comment', run: async () => { const k = await new Promise(res => openMenu(anchor, Object.entries(STANCES).map(([k, s]) => ({ label: s.name, icon: 'blank', run: () => res(k) })), at)); const note = await ask(`${STANCES[k].name}: why?`, '', 'Your reason is signed with your stance, so the group sees it next to the item.'); if (note !== null) takeStance(targets, k, note.trim()); } },
    ...(targets.length === 1 ? [{ label: 'Blind round on this: everyone’s stance opens at once…', icon: 'lock', run: () => { S.sel = new Set(targets); roundForm(); } }] : []),
    { label: 'Consensus map', icon: 'scale', run: () => openPanel('consensus') },
  ], at);
}
const stanceable = rs => rs.filter(r => r.type !== 'DRAW' && r.type !== 'ARROW');
TOOLBAR_HOOKS.push((rs, one, B) => {
  const els = stanceable(rs); if (!els.length) return '';
  const c = one ? consensus(current(one.cid)?.cid || one.cid) : null;
  return B('stance', 'scale', c?.mine ? `Your stance: ${STANCES[c.mine].name}` : 'Take a stance', `data-primary aria-haspopup="menu"${c?.mine ? ' aria-pressed="true"' : ''}`);
});
TOOLBAR_ACTIONS.stance = (rs, b) => stanceMenu(stanceable(rs).map(r => r.cid), b);

/* on the canvas: a stance summary above each item people took a stance on; the consensus map tints them */
let mapOn = false;
RENDER_HOOKS.screen.push(() => {
  if (!S.D.stances?.size || S.histZ != null && !mapOn) return;
  for (const [t, m] of S.D.stances){
    const el = S.records.get(t); if (!el || S.D.hidden.has(t)) continue;
    const sb = screenBox(el); if (!sb) continue;
    const c = consensus(t); if (!c.all) continue;
    if (mapOn && c.level){
      const [, tone] = LEVEL[c.level]; ctx.save(); ctx.strokeStyle = tone ? TONE[tone][1] : TH.muted; ctx.lineWidth = 3; ctx.globalAlpha = .75; ctx.setLineDash([]);
      rr(ctx, sb.x - 6, sb.y - 6, sb.w + 12, sb.h + 12, 10); ctx.stroke(); ctx.globalAlpha = .08; ctx.fillStyle = tone ? TONE[tone][1] : TH.muted; ctx.fill(); ctx.restore();
    }
    const parts = ['agree', 'disagree', 'unsure', 'alt'].filter(k => c.c[k]).map(k => `${c.c[k]}${STANCES[k].mark}`);
    if (!parts.length) continue;
    const tone = c.level ? LEVEL[c.level][1] : null;
    ctx.font = `600 11px ${FONTS.sans}`; const w = ctx.measureText(parts.join(' ')).width + 14;
    drawBadge(sb.x + sb.w - w, sb.y - 24, parts.join(' '), tone, () => stanceMenu([t], cv, { x: sb.x + sb.w - w, y: sb.y - 2 }));
  }
});

/* the Consensus panel: where the room agrees, where it is split, and who hasn't said */
registerPanel({
  id: 'consensus', title: 'Consensus', blurb: 'Where people agree, where they are split, and how it is moving. Stances are signed, so this is measured, not claimed.',
  paint(body){
    const rows = [...(S.D.stances || new Map()).keys()].filter(t => S.records.has(t) && !S.D.hidden.has(t)).map(t => ({ t, c: consensus(t) })).filter(x => x.c.n);
    const by = l => rows.filter(x => x.c.level === l);
    const here = new Set([S.me.id, ...peers.keys()].map(personOf));
    const card = ({ t, c }) => {
      const tr = trendText(t), silent = [...here].filter(p => !c.by.has(p));
      return `<li class="card${c.level === 'split' ? ' bad' : c.level === 'uncertain' ? ' warn' : ''}"><div class="hd"><button class="link" data-go="${t}">${esc(elTitle(t))}</button><span class="pill ${LEVEL[c.level][1] || ''}">${LEVEL[c.level][0]}</span></div>
        <div class="bar" role="img" aria-label="${c.c.agree} agree, ${c.c.disagree} disagree, ${c.c.unsure} unsure, ${c.c.alt} with an alternative">${['agree', 'alt', 'unsure', 'disagree'].map(k => c.c[k] ? `<i style="width:${c.c[k] / c.n * 100}%;background:${STANCES[k].tone ? TONE[STANCES[k].tone][1] : TH.muted}"></i>` : '').join('')}</div>
        <div class="row2"><small>${['agree', 'disagree', 'unsure', 'alt'].filter(k => c.c[k]).map(k => `${c.c[k]} ${STANCES[k].name.toLowerCase()}`).join(' · ')}${tr ? ' · ' + tr : ''}${silent.length ? ` · not yet: ${silent.map(whoName).join(', ')}` : ''}</small></div>
        ${[...c.by.values()].filter(r => r.note).map(r => `<small>${esc(whoName(r.author))} (${STANCES[r.stance].name.toLowerCase()}): ${esc(r.note)}</small>`).join('')}
        <div class="acts">${Object.entries(STANCES).map(([k, s]) => `<button class="btn" data-st="${k}" data-t="${t}" aria-pressed="${c.mine === k}" aria-label="${s.name}">${s.mark}</button>`).join('')}</div></li>`;
    };
    const conv = by('converged').length, total = rows.length;
    body.innerHTML = `<div class="row2"><button class="btn" data-map aria-pressed="${mapOn}">${ic('scale')}${mapOn ? 'Hide' : 'Show'} the map on the canvas</button></div>
      ${total ? `<p><b>${conv} of ${total}</b> items converged · ${by('split').length} split · ${by('uncertain').length} uncertain</p>` : '<p class="empty">No stances yet. Select a note or decision and use the stance button (scales) to say where you stand.</p>'}
      ${by('split').length ? `<h3>Split <span class="n">${by('split').length}</span></h3><ul class="plain">${by('split').map(card).join('')}</ul>` : ''}
      ${by('uncertain').length ? `<h3>Uncertain <span class="n">${by('uncertain').length}</span></h3><ul class="plain">${by('uncertain').map(card).join('')}</ul>` : ''}
      ${by('mixed').length ? `<h3>Mixed <span class="n">${by('mixed').length}</span></h3><ul class="plain">${by('mixed').map(card).join('')}</ul>` : ''}
      ${conv ? `<h3>Converged <span class="n">${conv}</span></h3><ul class="plain">${by('converged').map(card).join('')}</ul>` : ''}`;
  },
  click(e, b){
    if (b.dataset.go) return goTo(b.dataset.go);
    if (b.hasAttribute('data-map')){ mapOn = !mapOn; dirty = true; paintPanel(); return; }
    if (b.dataset.st) takeStance([b.dataset.t], b.dataset.st);
  },
});
registerFeature({ id: 'consensus',
  needs: () => (S.D.decisions || []).filter(x => x.status === 'active' && !consensus(x.d.cid).by?.has(personOf(S.me.id))).slice(0, 5).map(x => ({ label: `Where do you stand: ${x.d.text.slice(0, 34)}`, run: () => { DEC.focus = x.d.cid; openPanel('decisions'); } })), name: 'Consensus map', group: 'decide', icon: 'scale', records: ['STANCE'],
  blurb: 'Signed stances on any item: see where the room agrees, is split or unsure, and how it is converging',
  status: () => { const n = [...(S.D.stances?.keys() || [])].filter(t => consensus(t).level === 'split').length; return n ? `${n} split` : ''; },
  open: () => openPanel('consensus') });
FLOW_CONDITIONS.consensus = { label: 'No split items (under 30% disagreement everywhere)', test: () => { const n = [...(S.D.stances?.keys() || [])].filter(t => S.records.has(t) && !S.D.hidden.has(t) && consensus(t).level === 'split').length; return n ? `${n} item${n > 1 ? 's are' : ' is'} split` : true; } };
