'use strict';
// @module features/connectors — What a connection means: relation presets (label + colour + dash) and line shape/dash styles
// @uses hooks, arrange (labelArrow), commands (commitStyle)
// STYLE fields: Y = curve | straight | elbow, D = solid | dash | dot (author-only, latest wins)

const RELATIONS = [
  { id: 'supports',    label: 'supports',    C: 'green',  D: 'solid', icon: '＋' },
  { id: 'contradicts', label: 'contradicts', C: 'red',    D: 'dash',  icon: '≠' },
  { id: 'leads',       label: 'leads to',    C: 'ink',    D: 'solid', icon: '→' },
  { id: 'depends',     label: 'depends on',  C: 'blue',   D: 'dot',   icon: '⋯' },
  { id: 'example',     label: 'example of',  C: 'violet', D: 'dash',  icon: 'e.g.' },
  { id: 'question',    label: 'question',    C: 'orange', D: 'dot',   icon: '?' },
];
const SHAPES = ['curve', 'straight', 'elbow'], DASHES = ['solid', 'dash', 'dot'];
const dashOf = (d, w) => d === 'dash' ? [w * 4 + 4, w * 3 + 3] : d === 'dot' ? [0.1, w * 2 + 3] : [];
const svgDash = (d, w) => d === 'dash' ? ` stroke-dasharray="${w * 4 + 4} ${w * 3 + 3}"` : d === 'dot' ? ` stroke-dasharray="0.1 ${w * 2 + 3}"` : '';

let relRow = false;
const ownArrows = rs => rs.filter(r => r.type === 'ARROW' && r.author === S.me.id);
TOOLBAR_HOOKS.push((rs, one, B) => {
  const arrows = ownArrows(rs); if (!arrows.length) return '';
  const a = arrows[0];
  let h = B('rel', '⇄', 'Relation: what this connection means', `aria-pressed="${relRow}"`)
    + B('shape', { curve: '⌒', straight: '／', elbow: '⌐' }[a.eshape || 'curve'], `Line shape: ${a.eshape || 'curve'} (click to change)`)
    + B('dash', { solid: '━', dash: '╍', dot: '┈' }[a.edash || 'solid'], `Line style: ${a.edash || 'solid'} (click to change)`);
  if (relRow) h += '<span class="vs" aria-hidden="true"></span>' + RELATIONS.map(r => B('rel:' + r.id, r.icon, `Mark as “${r.label}”`, `aria-pressed="${a.elabel === r.label}"`)).join('');
  return h;
});
async function styleArrows(rs, change, msg){
  const items = [];
  for (const a of ownArrows(rs)){
    const after = change(a), before = {};
    for (const k of Object.keys(after)) before[k] = { M: a.elabel || '', C: ecol(a), Y: a.eshape || 'curve', D: a.edash || 'solid' }[k];
    items.push({ cid: a.cid, before, after }); await commitStyle(a.cid, after);
  }
  if (items.length){ S.hist.push({ kind: 'style', items }); S.redo = []; say(msg); }
}
TOOLBAR_ACTIONS.rel = () => { relRow = !relRow; };
TOOLBAR_ACTIONS.shape = rs => styleArrows(rs, a => ({ Y: SHAPES[(SHAPES.indexOf(a.eshape || 'curve') + 1) % 3] }), 'Line shape changed. Signed.');
TOOLBAR_ACTIONS.dash = rs => styleArrows(rs, a => ({ D: DASHES[(DASHES.indexOf(a.edash || 'solid') + 1) % 3] }), 'Line style changed. Signed.');
for (const r of RELATIONS) TOOLBAR_ACTIONS['rel:' + r.id] = rs => { relRow = false; return styleArrows(rs, () => ({ M: r.label, C: r.C, D: r.D }), `Marked “${r.label}”. Signed.`); };

PALETTE_HOOKS.push(add => {
  for (const r of RELATIONS) add('connect', `Relation · ${r.label}`, () => styleArrows([...S.sel].map(c => S.records.get(c)).filter(Boolean), () => ({ M: r.label, C: r.C, D: r.D }), `Marked “${r.label}”. Signed.`));
});
