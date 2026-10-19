'use strict';
// @module features/diagrams — + handles, node editor, tidy, templates (NODE kinds and drawing live in render/nodes)
// @uses render/nodes, renderer, commands
const soleNode = () => { if (S.sel.size !== 1) return null; const el = current([...S.sel][0]); return el?.type === 'NODE' && visible(el) ? el : null; };

/* "+" handles on a selected node */
const DIRS = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
function growHandles(){
  const n = soleNode(); if (!n || n.locked || G?.kind === 'move' || G?.kind === 'resize' || taNode) return [];
  const b = box(n), d = 18 / S.view.zoom, c = center(b);
  return Object.entries(DIRS).map(([dir, [dx, dy]]) => ({ dir, el: n, x: dx ? (dx > 0 ? b.x + b.w + d : b.x - d) : c.x, y: dy ? (dy > 0 ? b.y + b.h + d : b.y - d) : c.y }));
}
function growAt(w){ return growHandles().find(h => Math.hypot(w.x - h.x, w.y - h.y) < 10 / S.view.zoom) || null; }
function drawGrowHandles(accent){
  const z = S.view.zoom;
  if (G?.kind === 'grow' && G.moved){
    const a = box(G.from), t = G.target && box(G.target), b = t || { x: G.cur.x - 1, y: G.cur.y - 1, w: 2, h: 2 };
    ctx.save(); ctx.setLineDash([6 / z, 5 / z]); drawLink(a, b, true, accent, 2 / Math.max(.5, z) ); ctx.restore();
    if (t) dashedBox(grow(t, 4 / z), accent, z);
    return;
  }
  // the + handles appear when the pointer comes near the selected node, so a plain selection stays clean
  const n = soleNode(), near = n && lastPointer && inside(lastPointer, grow(box(n), 44 / z));
  if (!near) return;
  for (const h of growHandles()){
    ctx.save(); ctx.beginPath(); ctx.arc(h.x, h.y, 8 / z, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill();
    ctx.strokeStyle = TH.paper; ctx.lineWidth = 2 / z; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h.x - 4 / z, h.y); ctx.lineTo(h.x + 4 / z, h.y); ctx.moveTo(h.x, h.y - 4 / z); ctx.lineTo(h.x, h.y + 4 / z); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 / z; ctx.stroke(); ctx.restore();
  }
}

/* creating and editing nodes: the label editor floats over a live preview; nothing is signed until Enter */
let taNode = null;
function boxesExcept(skip){
  return S.D.els.filter(el => el.type === 'NODE' && visible(el) && !S.D.hidden.has(el.cid) && el.cid !== skip && el.ek !== 'frame').map(box).filter(Boolean);
}
const overlaps = (a, b, pad) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
// Free spot next to a box in a direction, stepping sideways past anything already there.
function placeNear(pb, dir, w, h, skip){
  const [dx, dy] = DIRS[dir], gapX = 70, gapY = 48;
  let x = dx > 0 ? pb.x + pb.w + gapX : dx < 0 ? pb.x - gapX - w : pb.x + pb.w / 2 - w / 2;
  let y = dy > 0 ? pb.y + pb.h + gapY : dy < 0 ? pb.y - gapY - h : pb.y + pb.h / 2 - h / 2;
  const others = boxesExcept(skip);
  const step = dx ? h + 22 : w + 22;
  for (let i = 0; i < 60; i++){
    const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1) * step;
    const cand = dx ? { x, y: y + k, w, h } : { x: x + k, y, w, h };
    if (!others.some(o => overlaps(cand, o, 14))) return cand;
  }
  return { x, y, w, h };
}
function startNode({ kind = S.nodeKind, parent = null, color = null, anchor, orig = null, label = null, size = null, typed = null }){
  if (taOpen()) finishText(true);
  setPlacing(null);
  kind = NODE_KINDS[kind] ? kind : 'card';
  const K = NODE_KINDS[kind];
  taNode = { kind, parent, color: color || (S.color === 'ink' ? 'ink' : S.color), anchor, orig, W: 0, H: 0 };
  if (kind === 'frame' && !orig){ taNode.W = 375; taNode.H = 667; }
  if (size && !orig){ taNode.W = size.W; taNode.H = size.H; }   // dragged out with the Shape tool
  if (orig){ const o = S.D.off.get(orig.cid) || { w: 0, h: 0 }; taNode.W = orig.bw + (o.w || 0); taNode.H = orig.bh + (o.h || 0); editingCid = orig.cid; }
  taAt = null; taOrig = null;
  ta.value = orig ? orig.text : (label ?? K.label);
  ta.setAttribute('aria-label', `${orig ? 'Edit' : 'New'} ${K.name} label. Enter saves, Tab saves and adds a connected child, Control+Enter adds a sibling, Escape cancels`);
  ta.style.display = 'block'; ta.style.whiteSpace = 'pre-wrap'; ta.style.outlineStyle = 'dashed';
  if (typed != null){ ta.value = typed; ta.focus(); ta.setSelectionRange(typed.length, typed.length); placeNodeEditor(); dirty = true; return; }   // typing started it: keep every key
  placeNodeEditor(); dirty = true;
  setTimeout(() => { ta.focus(); ta.select(); }, 0);
  say(`${orig ? 'Editing' : 'New'} ${K.name}${parent ? ` connected to “${current(parent)?.text.slice(0, 40) || ''}”` : ''}. Type the label, Enter to sign.`);
}
function nodeEditBox(){
  const n = taNode, L = nodeLayout(n.kind, ta.value, n.W, n.H, n.orig?.esize), a = n.anchor;
  return { x: Math.round(a.x - a.ax * L.w), y: Math.round(a.y - a.ay * L.h), L };
}
function placeNodeEditor(){
  if (!taNode) return;
  const { x, y, L } = nodeEditBox(), z = S.view.zoom, K = L.K, s = toScreen(x, y);
  const left = K.align === 'left';
  const inner = { x: x + K.pad[0], y: K.top || taNode.kind === 'frame' ? y + (taNode.kind === 'frame' ? 6 : K.pad[1]) : y + L.h / 2 - L.lines.length * L.lh / 2, w: L.w - K.pad[0] * 2 };
  if (taNode.kind === 'diamond' || taNode.kind === 'ellipse'){ inner.x = x + L.w * 0.18; inner.w = L.w * 0.64; }
  const si = toScreen(inner.x, inner.y);
  Object.assign(ta.style, { left: si.x + 'px', top: si.y + 'px', width: Math.max(40, inner.w * z) + 'px', height: (L.lines.length * L.lh * z + 2) + 'px',
    font: `${K.bold ? 600 : 400} ${L.fs * z}px ${FONTS.sans}`, lineHeight: (L.lh * z) + 'px', textAlign: left ? 'left' : 'center',
    color: taNode.kind === 'sticky' ? '#1d1d1f' : taNode.kind === 'button' ? (taNode.color !== 'ink' ? '#fff' : TH.paper) : TH.ink || INK });
  void s;
}
function drawNodeGhost(){
  if (!taNode) return;
  const { x, y, L } = nodeEditBox(), col = taNode.color;
  if (taNode.parent){ const p = current(taNode.parent); if (p) drawLink(box(p), { x, y, w: L.w, h: L.h }, !['topic', 'card', 'sticky'].includes(taNode.kind), col === 'ink' ? TH.muted : colorOf(col), 2); }
  drawNode(taNode.kind, { x, y }, L, colorOf(col), true, col, taNode.orig?.efill ?? S.nodeFill);
}
async function finishNode(commit, then){
  const n = taNode; if (!n) return;
  const label = ta.value.replace(/\s+$/, '') || (FILLABLE.has(n.kind) ? '' : NODE_KINDS[n.kind].label);   // a shape may stay blank
  const { x, y } = nodeEditBox();
  taNode = null; editingCid = null; ta.style.display = 'none'; ta.style.whiteSpace = 'pre'; dirty = true;
  if (document.activeElement === ta) cv.focus({ preventScroll: true });
  if (!commit){ say('Cancelled.'); return; }
  if (n.orig && label === n.orig.text && !then) return;
  let cid = n.orig && label === n.orig.text ? n.orig.cid : await commitNode({ kind: n.kind, x, y, W: n.W, H: n.H, label, color: n.color, parent: n.parent, edits: n.orig?.cid });
  if (!cid) return;
  S.sel = new Set([cid]); if (!S.lassoMode) setMode(true);
  dirty = true; await new Promise(r => setTimeout(r, 0));
  const el = current(cid);
  say(`${NODE_KINDS[n.kind].name} “${label.slice(0, 60)}” ${n.orig ? 'edited' : 'added'}. Alt+arrows add connected nodes, Enter edits.`);
  if (then === 'child') startChild(el, 'right');
  if (then === 'sibling') startSibling(el);
}
async function commitNode({ kind, x, y, W = 0, H = 0, label, color = 'ink', parent = null, edits = null, fill = null }){
  const t = Date.now(), R = await cidOf(te.encode([kind, x, y, t, Math.random()].join('_')));
  const raw = await signed('NODE', [['I', S.me.id], ['R', R], ['K', kind], ['X', encInt(Math.round(x))], ['Y', encInt(Math.round(y))], ['W', Math.max(0, Math.round(W))], ['H', Math.max(0, Math.round(H))],
    ['M', encTxt(label)], ['C', color || 'ink'], ['P', parent || '0'], ...(fill && fill !== 'light' ? [['F', fill]] : []), ...(edits ? [['E', edits]] : []), ['Z', ++S.lamport], ['T', t]]);
  const cid = await publish(raw); recordCreate(cid); return cid;
}
function startChild(p, dir){
  p = current(p.cid);
  const kind = p.ek === 'frame' ? 'card' : p.ek, L = nodeLayout(kind, NODE_KINDS[kind].label), pb = box(p);
  const spot = placeNear(pb, dir, L.w, L.h, p.cid);
  const ax = dir === 'left' ? 1 : dir === 'right' ? 0 : .5, ay = dir === 'up' ? 1 : dir === 'down' ? 0 : .5;
  startNode({ kind, parent: p.cid, color: ecol(p), anchor: { x: spot.x + ax * L.w, y: spot.y + ay * L.h, ax, ay } });
}
function startSibling(n){
  n = current(n.cid);
  const p = n.parent && current(n.parent);
  const nb = box(n), L = nodeLayout(n.ek, NODE_KINDS[n.ek].label);
  // stack below this node, then step past anything in the way
  const others = boxesExcept(null); let y = nb.y + nb.h + 22, guard = 0;
  while (others.some(o => overlaps({ x: nb.x, y, w: L.w, h: L.h }, o, 10)) && guard++ < 60) y += L.h + 22;
  startNode({ kind: n.ek, parent: p ? p.cid : null, color: ecol(n), anchor: { x: nb.x, y, ax: 0, ay: 0 } });
}
function editNode(el){
  el = current(el.cid);
  if (el.author !== S.me.id){ toast('Only its author can edit this. Add a comment instead (M).'); return true; }
  const b = box(el);
  startNode({ kind: el.ek, parent: el.parent, color: ecol(el), orig: el, anchor: { x: b.x, y: b.y, ax: 0, ay: 0 } });
  return true;
}
function editAny(el){ el = el && current(el.cid); if (!el) return false; if (el.locked){ toast('Locked. Unlock it first (⌘⇧L).'); return true; } if (el.type === 'NODE') return editNode(el); if (el.type === 'TEXT') return editText(el); return false; }
function pickKind(k){
  const own = selOwn(['NODE']);
  if (own.length){
    (async () => {
      const items = [];
      for (const n of own) if (n.ek !== k){ items.push({ cid: n.cid, before: { K: n.ek }, after: { K: k } }); await commitStyle(n.cid, { K: k }); }
      if (items.length){ S.hist.push({ kind: 'style', items }); S.redo = []; }
      say(`${items.length} node${items.length === 1 ? '' : 's'} changed to ${NODE_KINDS[k].name}.`);
    })();
    S.nodeKind = k; barShown = ''; return;
  }
  S.nodeKind = k; barShown = ''; paintBar(); setPlacing('node');
}

/* tidy: lay a diagram out as a tree, right of the root (and left, for branches already on the left) */
async function tidy(n){
  let root = current(n.cid), guard = 0;
  while (root.parent && current(root.parent) && guard++ < 500) root = current(root.parent);
  const kidsOf = c => (S.D.kids.get(c) || []).map(k => S.records.get(k)).filter(k => k && visible(k) && !S.D.hidden.has(k.cid)).sort((a, b) => box(a).y - box(b).y);
  const H = new Map(), gapY = 22, gapX = 70, seen = new Set();
  const height = c => { if (seen.has(c.cid)) return 0; seen.add(c.cid); const ks = kidsOf(c.cid), own = box(c).h; const sum = ks.reduce((a, k) => a + height(k), 0) + gapY * Math.max(0, ks.length - 1); H.set(c.cid, Math.max(own, sum)); return H.get(c.cid); };
  const target = new Map();
  const place = (c, x, top, side) => {
    const b = box(c), hh = H.get(c.cid) ?? b.h;
    target.set(c.cid, { x: side > 0 ? x : x - b.w, y: top + hh / 2 - b.h / 2 });
    const ks = kidsOf(c.cid); let sum = ks.reduce((a, k) => a + (H.get(k.cid) ?? 0), 0) + gapY * Math.max(0, ks.length - 1);
    let y = top + hh / 2 - sum / 2; const nx = side > 0 ? x + b.w + gapX : x - b.w - gapX;
    for (const k of ks){ place(k, nx, y, side); y += (H.get(k.cid) ?? 0) + gapY; }
  };
  const rb = box(root), rc = center(rb), all = kidsOf(root.cid);
  const left = all.filter(k => center(box(k)).x < rc.x), right = all.filter(k => !left.includes(k));
  seen.add(root.cid);
  for (const side of [[right, 1], [left, -1]]){
    const [ks, sd] = side; if (!ks.length) continue;
    const hs = ks.map(k => height(k)), sum = hs.reduce((a, b) => a + b, 0) + gapY * (ks.length - 1);
    let y = rc.y - sum / 2;
    ks.forEach((k, i) => { place(k, sd > 0 ? rb.x + rb.w + gapX : rb.x - gapX, y, sd); y += hs[i] + gapY; });
  }
  const items = [];
  for (const [cid, t] of target){
    const b = box(S.records.get(cid)), dx = Math.round(t.x - b.x), dy = Math.round(t.y - b.y);
    if (dx || dy) items.push({ t: cid, dx, dy });
  }
  for (const it of items) await commitMove(it.t, it.dx, it.dy);
  if (items.length){ S.hist.push({ kind: 'moves', items }); S.redo = []; }
  say(items.length ? `Tidied ${items.length} node${items.length > 1 ? 's' : ''} around “${root.text.slice(0, 40)}”.` : 'Already tidy.');
}

/* templates */
async function insertTemplate(kind){
  const c = viewCenter(), made = [];
  const node = async (k, x, y, label, parent = null, extra = {}) => { const cid = await commitNode({ kind: k, x, y, label, parent, color: extra.color || 'ink', W: extra.W || 0, H: extra.H || 0 }); made.push(cid); return cid; };
  if (kind === 'mindmap'){
    const L = nodeLayout('topic', 'Central idea'), root = await node('topic', c.x - L.w / 2, c.y - L.h / 2, 'Central idea', null, { color: 'violet' });
    const kids = [['Goals', 'blue', 1, -110], ['Audience', 'green', 1, 0], ['Risks', 'red', 1, 110], ['Questions', 'orange', -1, -60], ['Next steps', 'pink', -1, 60]];
    for (const [t, col, side, dy] of kids){
      const l = nodeLayout('topic', t), x = side > 0 ? c.x + L.w / 2 + 90 : c.x - L.w / 2 - 90 - l.w;
      const k = await node('topic', x, c.y + dy - l.h / 2, t, root, { color: col });
      if (t === 'Goals') for (const [i, g] of ['Ship v1', 'Learn fast'].entries()){ const gl = nodeLayout('topic', g); await node('topic', x + l.w + 70, c.y + dy - 60 + i * 50 - gl.h / 2, g, k, { color: col }); }
    }
  } else if (kind === 'flow'){
    const col = c.x, put = async (k, y, label, parent) => { const l = nodeLayout(k, label); return node(k, col - l.w / 2, y, label, parent); };
    const a = await put('ellipse', c.y - 260, 'Start'), b = await put('rect', c.y - 160, 'Collect input', a), d = await put('diamond', c.y - 50, 'Valid?', b);
    const ly = nodeLayout('rect', 'Save'), yes = await node('rect', col - 230 - ly.w / 2, c.y + 110, 'Save', d), no = await node('rect', col + 230 - ly.w / 2, c.y + 110, 'Show error', d);
    const e = await put('ellipse', c.y + 230, 'End', yes);
    await commitArrow(current(no), current(b)); void e;
  } else if (kind === 'mobile' || kind === 'web'){
    const mob = kind === 'mobile', W = mob ? 375 : 960, H = mob ? 667 : 600, x0 = c.x - W / 2, y0 = c.y - H / 2;
    await node('frame', x0, y0, mob ? 'Sign in · mobile' : 'Landing page · web', null, { W, H });
    if (mob){
      await node('image', x0 + 107, y0 + 70, 'Logo', null, { W: 160, H: 110 });
      await node('card', x0 + 24, y0 + 200, 'Welcome back! Sign in to continue.', null, { W: 327 });
      await node('input', x0 + 24, y0 + 280, 'Email', null, { W: 327 });
      await node('input', x0 + 24, y0 + 334, 'Password', null, { W: 327 });
      await node('button', x0 + 24, y0 + 400, 'Sign in', null, { W: 327, color: 'blue' });
      await node('button', x0 + 24, y0 + 452, 'Create account', null, { W: 327 });
    } else {
      await node('rect', x0 + 20, y0 + 44, 'Logo · Product · Pricing · Docs', null, { W: 920, H: 50 });
      await node('card', x0 + 40, y0 + 130, 'Headline that says what it does\nOne sentence of supporting copy.', null, { W: 420, H: 150 });
      await node('button', x0 + 40, y0 + 300, 'Get started', null, { color: 'blue' });
      await node('image', x0 + 500, y0 + 120, 'Hero image', null, { W: 420, H: 260 });
      for (let i = 0; i < 3; i++) await node('card', x0 + 40 + i * 300, y0 + 420, ['Fast', 'Signed', 'Portable'][i] + '\nShort feature description.', null, { W: 280, H: 120 });
    }
    S.sel = new Set(made.map(m => current(m)?.cid).filter(Boolean)); await groupSelection();
  }
  S.sel = new Set(made.slice(0, 1)); if (!S.lassoMode) setMode(true); dirty = true;
  toast(`${{ mindmap: 'Mind map', flow: 'Flowchart', mobile: 'Mobile wireframe', web: 'Web wireframe' }[kind]} added`);
}


// the tree's connectors are content: drawn under the elements; the grow handles and placement ghost are drawn above
RENDER_HOOKS.under.push(drawTreeLinks);
RENDER_HOOKS.world.push(() => { drawNodeGhost(); drawGrowHandles(TH.accent); });
// a NODE's kind can be restyled to any name; unknown kinds read as their original kind, then as a card
DERIVE_HOOKS.push(D => { for (const el of D.els) if (el.type === 'NODE' && !NODE_KINDS[el.ek]) el.ek = NODE_KINDS[el.k] ? el.k : 'card'; });

// a shape you just made is blank: start typing and the text goes into it (no double-click needed)
KEY_HOOKS.unshift((e, c) => {
  if (!c.onCanvas || c.mod || e.altKey || e.key.length !== 1 || S.sel.size !== 1) return false;
  const el = current([...S.sel][0]); if (!el || el.type !== 'NODE' || el.text || el.author !== S.me?.id) return false;
  e.preventDefault(); const b = box(el); startNode({ kind: el.ek, parent: el.parent, color: ecol(el), orig: el, anchor: { x: b.x, y: b.y, ax: 0, ay: 0 }, typed: e.key }); return true;
});
// the Shape tool: drag out a shape (or click for a standard one); it appears at once, selected, blank and ready to type into
async function placeShape(kind, r){
  const cid = await commitNode({ kind, x: r.x, y: r.y, W: r.w, H: r.h, label: '', color: S.color === 'ink' ? 'ink' : S.color, fill: S.nodeFill });
  if (!cid) return;
  setTool('select', true); S.sel = new Set([cid]); dirty = true;
  say(`${NODE_KINDS[kind].name} added and selected. Type to add text, drag a handle to resize.`);
}
