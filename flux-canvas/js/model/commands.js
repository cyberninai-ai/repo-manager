'use strict';
// @module model/commands — Gestures → signed records (commit*), images, revoke, undo/redo, groups
// @uses renderer
/* =====================================================================
   Commit: gestures → signed records
   ===================================================================== */
function ghost(g){ S.ghosts.push(g); dirty = true; return () => { S.ghosts = S.ghosts.filter(x => x !== g); dirty = true; }; }
function recordCreate(cid){ if (cid){ S.hist.push({ kind: 'create', cid }); S.redo = []; } }
async function commitStroke(pts, t0, color = S.color, width = S.width){
  const simplified = rdp(pts, 0.6 / S.view.zoom);
  const done = ghost({ pts: simplified, color, width });
  try {
    const bytes = encodePoints(simplified), R = await cidOf(bytes);
    const raw = await signed('DRAW', [['I', S.me.id], ['R', R], ['C', color], ['W', width], ['Z', ++S.lamport], ['T', t0]]);
    recordCreate(await publish(raw, { [R]: bytes }));
  } finally { done(); }
}
async function commitShape(kind, a, b){
  const n = norm(a, b), x = Math.round(n.x), y = Math.round(n.y), w = Math.round(n.w), h = Math.round(n.h), t = Date.now();
  if (w < 3 && h < 3) return;
  const R = await cidOf(te.encode([kind, x, y, w, h, t].join('_')));
  const raw = await signed('SHAPE', [['I', S.me.id], ['R', R], ['K', kind], ['X', encInt(x)], ['Y', encInt(y)], ['W', w], ['H', h],
    ['C', S.color], ['S', Math.max(1, Math.round(S.width / 2))], ['F', S.fill ? S.color : 'none'], ['Z', ++S.lamport], ['T', t]]);
  const cid = await publish(raw); recordCreate(cid); return cid;
}
async function commitArrow(from, to, label = ''){
  const raw = await signed('ARROW', [['I', S.me.id], ['FROM', from.cid], ['TO', to.cid], ['C', S.color], ['S', Math.max(1, Math.round(S.width / 2))],
    ['M', encTxt(label)], ['Z', ++S.lamport], ['T', Date.now()]]);
  const cid = await publish(raw); recordCreate(cid); return cid;
}
async function commitText(w, text, orig = null, style = null){
  // an edit is a new signed TEXT that names the version it replaces; it keeps that version's style and current position
  const st = { ...(orig ? { F: orig.f.F, S: orig.fs, C: ecol(orig) } : { F: S.font, S: S.textSize, C: S.color }), ...(style || {}) };
  const raw = await signed('TEXT', [['I', S.me.id], ['X', encInt(Math.round(w.x))], ['Y', encInt(Math.round(w.y))], ['M', encTxt(text)],
    ['F', st.F], ['S', st.S], ['C', st.C], ...(orig ? [['E', orig.cid]] : []), ['Z', ++S.lamport], ['T', Date.now()]]);
  const cid = await publish(raw); recordCreate(cid);
  if (orig && cid){ S.sel = new Set([cid]); dirty = true; say('Text updated.'); }
  return cid;
}
async function commitComment({ on = null, x, y, text, re = null }){
  const raw = await signed('COMMENT', [['I', S.me.id], ['ON', on || '0'], ['X', encInt(Math.round(x))], ['Y', encInt(Math.round(y))],
    ['M', encTxt(text)], ['RE', re || '0'], ['Z', ++S.lamport], ['T', Date.now()]]);
  const cid = await publish(raw); recordCreate(cid); return cid;
}
async function commitStyle(cid, { W = null, C = null, K = null, O = null, L = null, M = null, Y = null, D = null }){
  const pairs = [['I', S.me.id], ['R', cid]];
  if (K) pairs.push(['K', K]);
  if (O != null) pairs.push(['O', encInt(Math.round(O))]);
  if (L != null) pairs.push(['L', L ? '1' : '0']);
  if (M != null) pairs.push(['M', encTxt(M)]);
  if (Y) pairs.push(['Y', Y]);
  if (D) pairs.push(['D', D]);
  if (W != null) pairs.push(['W', Math.max(1, Math.round(W))]);
  if (C) pairs.push(['C', C]);
  return publish(await signed('STYLE', [...pairs, ['Z', ++S.lamport], ['T', Date.now()]]));
}
async function commitResolve(root, state){
  return publish(await signed('RESOLVE', [['I', S.me.id], ['R', root], ['S', state ? '1' : '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
}
async function commitMove(target, dx, dy, dw = 0, dh = 0){
  const size = dw || dh ? [['DW', encInt(dw)], ['DH', encInt(dh)]] : [];
  return publish(await signed('MOVE', [['I', S.me.id], ['R', target], ['DX', encInt(dx)], ['DY', encInt(dy)], ...size, ['Z', ++S.lamport], ['T', Date.now()]]));
}
async function setNeg(cid, on){
  const r = S.records.get(cid);
  if (!r || r.author !== S.me.id || r.neg !== null) return false;
  if (S.D.hidden.has(cid) === on) return false;
  await publish(await signed(r.type, [['I', S.me.id], ['R', cid], ['N', on ? '1' : '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
  return true;
}
function moveTargets(){
  const t = new Set();
  for (const c of S.sel){ const el = S.records.get(c); if (el && el.type !== 'ARROW' && !el.locked) t.add(S.D.groupOf.get(c) || c); }
  for (const c of [...t]) if (S.records.get(c)?.type === 'NODE') for (const d of descendants(c)) if (!S.D.groupOf.has(d) && !S.records.get(d)?.locked) t.add(d);   // a node carries its branch
  return t;
}
async function undo(){
  runHooks(ACTION_HOOKS);
  const h = S.hist.pop(); if (!h){ toast('Nothing of yours to undo.'); return; }
  if (h.kind === 'create') await setNeg(h.cid, true);
  else if (h.kind === 'revoke') for (const c of h.cids) await setNeg(c, false);
  else if (h.kind === 'move') for (const t of h.targets) await commitMove(t, -h.dx, -h.dy, -(h.dw || 0), -(h.dh || 0));
  else if (h.kind === 'style') for (const it of h.items) await commitStyle(it.cid, it.before);
  else if (h.kind === 'moves') for (const it of h.items) await commitMove(it.t, -it.dx, -it.dy);
  else if (h.kind === 'creates') for (const c of h.cids) await setNeg(c, true);
  else if (h.kind === 'fn') await h.undo();   // features record their own inverse
  S.redo.push(h);
}
async function redo(){
  const h = S.redo.pop(); if (!h) return;
  if (h.kind === 'create') await setNeg(h.cid, false);
  else if (h.kind === 'revoke') for (const c of h.cids) await setNeg(c, true);
  else if (h.kind === 'move') for (const t of h.targets) await commitMove(t, h.dx, h.dy, h.dw || 0, h.dh || 0);
  else if (h.kind === 'style') for (const it of h.items) await commitStyle(it.cid, it.after);
  else if (h.kind === 'moves') for (const it of h.items) await commitMove(it.t, it.dx, it.dy);
  else if (h.kind === 'creates') for (const c of h.cids) await setNeg(c, false);
  else if (h.kind === 'fn') await h.redo();
  S.hist.push(h);
}
async function revokeSelection(){
  runHooks(ACTION_HOOKS);
  if (!S.sel.size){ toast('Select something first (ctrl-drag to lasso).'); return; }
  const locked = [...S.sel].filter(c => S.records.get(c)?.locked).length;
  if (locked) toast(`${locked} locked element${locked > 1 ? 's' : ''} kept. Unlock first (⌘⇧L).`);
  const mine = [...S.sel].filter(c => S.records.get(c)?.author === S.me.id && !S.D.hidden.has(c) && !S.records.get(c)?.locked);
  const others = S.sel.size - mine.length;
  for (const c of mine) await setNeg(c, true);
  if (mine.length){ S.hist.push({ kind: 'revoke', cids: mine }); S.redo = []; }
  S.sel.clear(); dirty = true;
  toast(`Deleted ${mine.length}` + (others ? ` · ${others} made by others stay (only they can delete them)` : '') + ' · ⌘Z undoes');
}
async function groupSelection(){
  const kids = [...S.sel].map(c => S.records.get(c)).filter(r => r && r.type !== 'ARROW' && !S.D.hidden.has(r.cid));
  if (kids.length < 2){ toast('Select two or more elements to group.'); return; }
  kids.sort(byZ);
  // an element belongs to one group: retire the groups being absorbed (yours only)
  for (const g of new Set(kids.map(k => S.D.groupOf.get(k.cid)).filter(Boolean))) await setNeg(g, true);
  const K = kids.map(k => k.cid).join('_'), R = await cidOf(te.encode(K));
  const raw = await signed('GROUP', [['I', S.me.id], ['R', R], ['K', K], ['Z', ++S.lamport], ['T', Date.now()]]);   // members by CID, not copies (audit D2)
  recordCreate(await publish(raw));
  toast(`Grouped ${kids.length} elements.`);
}
async function ungroupSelection(){
  const gs = new Set([...S.sel].map(c => S.D.groupOf.get(c)).filter(Boolean));
  if (!gs.size){ toast('Nothing grouped in the selection.'); return; }
  let n = 0; for (const g of gs) if (await setNeg(g, true)){ n++; S.hist.push({ kind: 'revoke', cids: [g] }); }
  toast(n ? `Ungrouped ${n}.` : 'Those groups belong to other authors.');
}
function expandSel(){
  const D = S.D;
  for (const c of [...S.sel]){ const g = D.groupOf.get(c); if (g) for (const m of S.records.get(g).members) if (S.records.has(m) && visible(S.records.get(m))) S.sel.add(m); }
}

