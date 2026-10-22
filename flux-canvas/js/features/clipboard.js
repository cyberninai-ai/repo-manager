'use strict';
// @module features/clipboard — Copy, cut, paste and duplicate as fresh signed records
// @uses chrome, commands
/* ---------- copy, paste, duplicate ---------- */
// Copies are new records signed by you: same content, effective style and position baked in, links inside the copy re-pointed.
let clip = null, pasteN = 0;
async function copySelection(){
  const rs = [...S.sel].map(c => current(c)).filter(el => el && ELEMENT.has(el.type));
  if (!rs.length) return;
  const text = rs.map(r => r.raw).join('\n');
  clip = { cids: rs.map(r => r.cid), text, internalOnly: false }; pasteN = 0;
  try { await navigator.clipboard.writeText(text); } catch { clip.internalOnly = true; }
  say(`Copied ${rs.length} element${rs.length > 1 ? 's' : ''}.`);
}
async function pasteClip(){
  if (!clip) return;
  const rs = clip.cids.map(c => current(c)).filter(Boolean); if (!rs.length) return;
  let u = null; for (const el of rs){ const b = box(el); if (b) u = u ? norm({ x: Math.min(u.x, b.x), y: Math.min(u.y, b.y) }, { x: Math.max(u.x + u.w, b.x + b.w), y: Math.max(u.y + u.h, b.y + b.h) }) : { ...b }; }
  pasteN++;
  let dx = 24 * pasteN, dy = 24 * pasteN;
  const p = lastPointer, vw = innerWidth / S.view.zoom, vh = innerHeight / S.view.zoom;
  if (p && u && p.x > S.view.x && p.y > S.view.y && p.x < S.view.x + vw && p.y < S.view.y + vh){ dx = Math.round(p.x - (u.x + u.w / 2)); dy = Math.round(p.y - (u.y + u.h / 2)); }
  const made = await duplicateEls(rs, dx, dy);
  if (made.length){ S.sel = new Set(made); dirty = true; say(`Pasted ${made.length} element${made.length > 1 ? 's' : ''}.`); }
}
async function duplicateSelection(){
  const made = await duplicateEls([...S.sel].map(c => S.records.get(c)), 24, 24);
  if (made.length){ S.sel = new Set(made); dirty = true; say(`Duplicated ${made.length} element${made.length > 1 ? 's' : ''}.`); }
}
async function duplicateEls(list, dx, dy){
  const els = [...new Set(list.map(el => el && current(el.cid)).filter(el => el && ELEMENT.has(el.type) && !S.D.hidden.has(el.cid)))]
    .sort((a, b) => (a.type === 'ARROW') - (b.type === 'ARROW') || a.ez - b.ez);
  const map = new Map(), made = [], me = S.me.id, inSel = new Set(els.map(e => e.cid));
  for (const el of els){
    const b = box(el), C = ecol(el), t = Date.now(); let cid = null;
    if (el.type === 'DRAW'){
      cid = await publish(await signed('DRAW', [['I', me], ['R', el.f.R], ['C', C], ['W', Math.round(lw(el))], ['Z', ++S.lamport], ['T', t]]));
      const o = offsetOf(el.cid); if (cid && (o.x + dx || o.y + dy)) await commitMove(cid, o.x + dx, o.y + dy);
    } else if (el.type === 'SHAPE'){
      const R = await cidOf(te.encode([el.k, b.x + dx, b.y + dy, b.w, b.h, t, Math.random()].join('_')));
      cid = await publish(await signed('SHAPE', [['I', me], ['R', R], ['K', el.k], ['X', encInt(Math.round(b.x + dx))], ['Y', encInt(Math.round(b.y + dy))], ['W', Math.round(b.w)], ['H', Math.round(b.h)],
        ['C', C], ['S', Math.round(lw(el))], ['F', el.f.F && el.f.F !== 'none' ? C : 'none'], ['Z', ++S.lamport], ['T', t]]));
    } else if (el.type === 'TEXT'){
      cid = await publish(await signed('TEXT', [['I', me], ['X', encInt(Math.round(b.x + dx))], ['Y', encInt(Math.round(b.y + dy))], ['M', encTxt(el.text)], ['F', el.f.F], ['S', el.fs], ['C', C], ['Z', ++S.lamport], ['T', t]]));
    } else if (el.type === 'IMAGE'){
      cid = await publish(await signed('IMAGE', [['I', me], ['R', el.f.R], ['X', encInt(Math.round(b.x + dx))], ['Y', encInt(Math.round(b.y + dy))], ['W', Math.round(b.w)], ['H', Math.round(b.h)], ['M', encTxt(el.alt || '')], ['Z', ++S.lamport], ['T', t]]));
    } else if (el.type === 'NODE'){
      const o = S.D.off.get(el.cid) || { w: 0, h: 0 }, par = el.parent && current(el.parent);
      const parent = par ? (map.get(par.cid) || (inSel.has(par.cid) ? null : par.cid)) : null;
      cid = await commitNode({ kind: el.ek, x: b.x + dx, y: b.y + dy, W: el.bw + (o.w || 0), H: el.bh + (o.h || 0), label: el.text, color: C, parent });
      S.hist.pop();   // recorded once below for the whole paste
    } else if (el.type === 'ARROW'){
      const A = current(el.f.FROM), Bn = current(el.f.TO), fa = A && map.get(A.cid), tb = Bn && map.get(Bn.cid);
      if (!fa && !tb) continue;   // a copy of a connection between originals would just overlap it
      cid = await publish(await signed('ARROW', [['I', me], ['FROM', fa || A.cid], ['TO', tb || Bn.cid], ['C', C], ['S', Math.round(lw(el))], ['M', encTxt(el.elabel || '')], ['Z', ++S.lamport], ['T', t]]));
    }
    if (cid){ map.set(el.cid, cid); made.push(cid); }
  }
  if (made.length){ S.hist.push({ kind: 'creates', cids: made }); S.redo = []; }
  return made;
}

