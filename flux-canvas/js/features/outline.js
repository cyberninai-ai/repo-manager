'use strict';
// @module features/outline — Indented outline → mind map
// @uses diagrams
/* ---------- outline → mind map ---------- */
const BULLET = /^\s*(?:[-*•+–]|\d+[.)]|\[[ x]\])\s+/;
function isOutline(t){
  const ls = String(t).split(/\r?\n/).filter(l => l.trim());
  return ls.length >= 2 && ls.length <= 400 && ls.some(l => /^[ \t]+\S/.test(l) || BULLET.test(l));
}
async function mindmapFromOutline(t){
  const lines = String(t).split(/\r?\n/).filter(l => l.trim()).map(l => {
    const ind = l.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
    return { ind, text: l.replace(BULLET, '').trim() || '…' };
  });
  const roots = [], stack = [];
  for (const ln of lines){
    while (stack.length && stack.at(-1).ind >= ln.ind) stack.pop();
    ln.kids = []; ln.parent = stack.at(-1) || null;
    (ln.parent ? ln.parent.kids : roots).push(ln); stack.push(ln);
  }
  // one top line with the rest nested under it is the centre; otherwise the topmost lines share a new centre
  const palette = ['blue', 'green', 'orange', 'violet', 'pink', 'red'];
  const c = viewCenter(), made = [];
  const make = async (ln, parent, color, depth) => {
    const cid = await commitNode({ kind: 'topic', x: c.x, y: c.y + made.length * 2, label: ln.text, parent, color }); S.hist.pop(); made.push(cid);   // staggered so tidy keeps the outline's order
    let i = 0; for (const k of ln.kids) await make(k, cid, depth === 0 ? palette[i++ % palette.length] : color, depth + 1);
    return cid;
  };
  const top = roots.length === 1 ? roots[0] : { text: 'Outline', kids: roots };
  const root = await make(top, null, 'violet', 0);
  S.hist.push({ kind: 'creates', cids: made }); S.redo = [];
  await new Promise(r => setTimeout(r, 0));
  // spread the first-level branches over both sides, then tidy
  const firsts = (S.D.kids.get(root) || []).map(k => S.records.get(k)).sort((a, b) => a.y - b.y);
  const half = Math.ceil(firsts.length / 2), rb = box(S.records.get(root));
  for (const [i, k] of firsts.entries()) if (i >= half && firsts.length > 3) await commitMove(k.cid, -(rb.w + 260), 0);
  await new Promise(r => setTimeout(r, 0));
  await tidy(S.records.get(root)); S.hist.pop();   // layout belongs to the creation
  S.sel = new Set([root]); if (!S.lassoMode) setMode(true); dirty = true;
  toast(`Mind map from outline · ${made.length} signed nodes`);
}
async function mindmapFromOutlinePrompt(){
  const v = await ask('Mind map from outline', 'Launch plan\n  Goals\n    Ship v1\n    Learn fast\n  Audience\n  Risks\n    Timeline\n  Next steps', 'One idea per line; indent with spaces or tabs to nest. Bullets (-, *, 1.) are fine.', null, true);
  if (v && v.trim()) await mindmapFromOutline(v);
}

