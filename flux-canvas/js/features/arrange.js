'use strict';
// @module features/arrange — Layer order, lock, connector labels, align, distribute, snapping
// @uses chrome, commands
/* ---------- arrange: layer order, lock, align, distribute, snapping ---------- */
async function reorder(front){
  const own = selOwn(['DRAW', 'SHAPE', 'TEXT', 'ARROW', 'IMAGE', 'NODE']);
  warnOthers(['DRAW', 'SHAPE', 'TEXT', 'ARROW', 'IMAGE', 'NODE'], 'elements');
  if (!own.length) return;
  const zs = S.D.els.filter(visible).map(e => e.ez); let edge = front ? Math.max(...zs) : Math.min(...zs);
  const items = [];
  for (const el of own.sort((a, b) => front ? a.ez - b.ez : b.ez - a.ez)){ edge += front ? 1 : -1; items.push({ cid: el.cid, before: { O: el.ez }, after: { O: edge } }); await commitStyle(el.cid, { O: edge }); }
  S.hist.push({ kind: 'style', items }); S.redo = [];
  say(`${own.length} element${own.length > 1 ? 's' : ''} ${front ? 'brought to front' : 'sent to back'}.`);
}
async function toggleLock(){
  const own = [...S.sel].map(c => current(c)).filter(el => el && ELEMENT.has(el.type) && el.author === S.me.id);
  if (!own.length){ toast('Only your own elements can be locked.'); return; }
  const lock = !own.every(el => el.locked), items = [];
  for (const el of own){ items.push({ cid: el.cid, before: { L: el.locked }, after: { L: lock } }); await commitStyle(el.cid, { L: lock }); }
  S.hist.push({ kind: 'style', items }); S.redo = [];
  say(`${own.length} element${own.length > 1 ? 's' : ''} ${lock ? 'locked: they stay put and can be drawn over' : 'unlocked'}.`);
}
async function labelArrow(el){
  const v = await ask('Connector label', el.elabel || '', 'Shown on the line. Leave empty to remove it.');
  if (v === null) return;
  await commitStyle(el.cid, { M: v.trim() }); S.hist.push({ kind: 'style', items: [{ cid: el.cid, before: { M: el.elabel || '' }, after: { M: v.trim() } }] }); S.redo = [];
  say(v.trim() ? `Connector labelled “${v.trim()}”.` : 'Label removed.');
}
async function alignSel(mode){
  const els = [...S.sel].map(c => current(c)).filter(el => el && el.type !== 'ARROW' && !el.locked);
  if (els.length < 2) return;
  const bs = els.map(el => ({ el, b: box(el) })).filter(x => x.b);
  const u = { x: Math.min(...bs.map(x => x.b.x)), y: Math.min(...bs.map(x => x.b.y)), r: Math.max(...bs.map(x => x.b.x + x.b.w)), d: Math.max(...bs.map(x => x.b.y + x.b.h)) };
  const items = [];
  if (mode.startsWith('al-')){
    for (const { el, b } of bs){
      let dx = 0, dy = 0;
      if (mode === 'al-l') dx = u.x - b.x; if (mode === 'al-r') dx = u.r - (b.x + b.w); if (mode === 'al-c') dx = (u.x + u.r) / 2 - (b.x + b.w / 2);
      if (mode === 'al-t') dy = u.y - b.y; if (mode === 'al-b') dy = u.d - (b.y + b.h); if (mode === 'al-m') dy = (u.y + u.d) / 2 - (b.y + b.h / 2);
      dx = Math.round(dx); dy = Math.round(dy); if (dx || dy) items.push({ t: el.cid, dx, dy });
    }
  } else {
    const hz = mode === 'dist-h', sorted = bs.sort((a, b) => hz ? a.b.x - b.b.x : a.b.y - b.b.y);
    const span = hz ? sorted.at(-1).b.x + sorted.at(-1).b.w - sorted[0].b.x : sorted.at(-1).b.y + sorted.at(-1).b.h - sorted[0].b.y;
    const sizes = sorted.reduce((a, x) => a + (hz ? x.b.w : x.b.h), 0), gap = (span - sizes) / (sorted.length - 1);
    let pos = hz ? sorted[0].b.x : sorted[0].b.y;
    for (const { el, b } of sorted){ const d = Math.round(pos - (hz ? b.x : b.y)); if (d) items.push({ t: el.cid, dx: hz ? d : 0, dy: hz ? 0 : d }); pos += (hz ? b.w : b.h) + gap; }
  }
  for (const it of items) await commitMove(it.t, it.dx, it.dy);
  if (items.length){ S.hist.push({ kind: 'moves', items }); S.redo = []; }
  say(items.length ? `${items.length} element${items.length > 1 ? 's' : ''} ${mode.startsWith('al') ? 'aligned' : 'distributed'}.` : 'Already in place.');
}
function startMoveG(w, dup){
  const targets = moveTargets(), base = selBox();
  const skip = new Set([...S.sel, ...targets]);
  const vp = { x: S.view.x, y: S.view.y, w: innerWidth / S.view.zoom, h: innerHeight / S.view.zoom };
  const cands = S.D.els.filter(el => visible(el) && el.type !== 'ARROW' && !skip.has(el.cid) && !S.D.hidden.has(el.cid)).map(box).filter(b => b && overlaps(b, vp, 0));
  return { kind: 'move', start: w, dx: 0, dy: 0, targets, dup, base, cands };
}
// Snap the dragged selection's edges and centre to nearby elements, and remember the guides to draw.
function snapMove(free){
  G.guides = null; if (free || !G.base || !G.cands.length) return;
  const tol = 6 / S.view.zoom, b = G.base, xs = [b.x, b.x + b.w / 2, b.x + b.w], ys = [b.y, b.y + b.h / 2, b.y + b.h];
  let bx = null, by = null;
  for (const c of G.cands){
    for (const cx of [c.x, c.x + c.w / 2, c.x + c.w]) for (const mx of xs){ const d = cx - (mx + G.dx); if (Math.abs(d) < tol && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, x: cx, c }; }
    for (const cy of [c.y, c.y + c.h / 2, c.y + c.h]) for (const my of ys){ const d = cy - (my + G.dy); if (Math.abs(d) < tol && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, y: cy, c }; }
  }
  const guides = [];
  if (bx){ G.dx = Math.round(G.dx + bx.d); guides.push({ x: bx.x, a: Math.min(bx.c.y, b.y + G.dy) - 10, b: Math.max(bx.c.y + bx.c.h, b.y + G.dy + b.h) + 10 }); }
  if (by){ G.dy = Math.round(G.dy + by.d); guides.push({ y: by.y, a: Math.min(by.c.x, b.x + G.dx) - 10, b: Math.max(by.c.x + by.c.w, b.x + G.dx + b.w) + 10 }); }
  G.guides = guides;
}

