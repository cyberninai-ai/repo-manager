'use strict';
// @module interaction/selection — Gesture state G, hit testing, modes, keyboard moves, inserts, connect
// @uses commands
/* =====================================================================
   Pointer gestures
   ===================================================================== */
let spaceDown = false, lastTap = null;
const pointers = new Map();
function edgeHit(sx, sy){
  const w = toWorld(sx, sy), band = 8 / S.view.zoom, els = S.D.els;
  for (const i of idxNear(w, band)){
    const el = els[i];
    if (el.type === 'ARROW' || el.type === 'IMAGE' || el.locked || !visible(el) || S.D.hidden.has(el.cid)) continue;
    const b = box(el); if (!b) continue;
    const big = b.w > 4 * band && b.h > 4 * band;
    if (el.type === 'DRAW' && !big) continue;
    if (!inside(w, grow(b, band))) continue;
    if (big && inside(w, grow(b, -band))) continue;
    return el;
  }
  return null;
}
/* spatial index (audit P1): a uniform grid of element indices, rebuilt lazily after each derive. Hit tests look only at the
   cells around the pointer instead of every element; very large elements (frames, long arrows) live in an always-checked list. */
const CELL = 400;
let spx = null;
function spatialIndex(){
  if (spx && spx.D === S.D) return spx;
  const map = new Map(), wide = [], els = S.D.els;
  for (let i = 0; i < els.length; i++){
    const b = box(els[i]); if (!b){ wide.push(i); continue; }
    const x0 = Math.floor(b.x / CELL), x1 = Math.floor((b.x + b.w) / CELL), y0 = Math.floor(b.y / CELL), y1 = Math.floor((b.y + b.h) / CELL);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 16){ wide.push(i); continue; }
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++){ const k = cx + ',' + cy; let a = map.get(k); if (!a) map.set(k, a = []); a.push(i); }
  }
  return spx = { D: S.D, map, wide };
}
// element indices near w (padding in world units), topmost first
function nearIdx(w, pad){
  const s = spatialIndex(), out = new Set(s.wide);
  for (let cx = Math.floor((w.x - pad) / CELL); cx <= Math.floor((w.x + pad) / CELL); cx++)
    for (let cy = Math.floor((w.y - pad) / CELL); cy <= Math.floor((w.y + pad) / CELL); cy++) for (const i of s.map.get(cx + ',' + cy) || []) out.add(i);
  return [...out].sort((a, b) => b - a);
}
// while elements are being dragged or resized their boxes move away from the index: fall back to a full scan
const scanAll = () => G && (G.kind === 'move' || G.kind === 'resize') || S.D.els.length < 200;
const idxNear = (w, pad) => scanAll() ? [...S.D.els.keys()].reverse() : nearIdx(w, pad);
function elementAt(w, except){
  const pad = 6 / S.view.zoom, els = S.D.els;
  for (const i of idxNear(w, pad)){
    const el = els[i];
    if (el === except || el.type === 'ARROW' || !visible(el) || S.D.hidden.has(el.cid)) continue;
    const b = box(el); if (b && inside(w, grow(b, pad))) return el;
  }
  return null;
}
// Precise hit test: strokes and arrows by distance to their path, shapes by outline (or body when filled), text and images by box.
function hitTest(w, tolPx = 6){
  const tol = tolPx / S.view.zoom, els = S.D.els;
  for (const i of idxNear(w, tol + 40 / S.view.zoom)){
    const el = els[i];
    if (!visible(el) || el.locked) continue;
    const b = box(el); if (!b || !inside(w, grow(b, tol))) continue;
    if (el.type === 'DRAW'){
      const g = strokeGeom(el.f.R); if (!g) continue;
      const o = offsetOf(el.cid), p = { x: w.x - o.x, y: w.y - o.y }, pts = g.pts, lim = lw(el) / 2 + tol;
      if (pts.length === 1 ? Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < lim : pts.some((q, j) => j && distToSeg(p, pts[j - 1], q) < lim)) return el;
    } else if (el.type === 'ARROW'){
      const a = arrowGeom(el); if (a && distToSeg(w, a.a, a.b) < lw(el) / 2 + tol) return el;
    } else if (el.type === 'NODE' && el.ek === 'frame'){
      if (!inside(w, grow(b, -(10 / S.view.zoom))) || w.y < b.y + 30) return el;
    } else if (el.type === 'SHAPE' && (!el.f.F || el.f.F === 'none')){
      if (el.k === 'circle'){
        const c = center(b), rx = b.w / 2, ry = b.h / 2, d = Math.hypot((w.x - c.x) / (rx || 1), (w.y - c.y) / (ry || 1));
        if (Math.abs(d - 1) * Math.min(rx, ry) < lw(el) / 2 + tol) return el;
      } else if (!inside(w, grow(b, -(lw(el) / 2 + tol)))) return el;
    } else return el;
  }
  return null;
}
function setMode(select){
  S.lassoMode = select; S.shapeTool = null; S.handTool = false;
  setCursor(); paintTools();
  say(select ? 'Select mode. Tap an element to select it, drag to move it, drag on empty space to lasso.' : 'Pen mode. Drag to draw.');
}
function ensureVisible(el){
  const b = box(el); if (!b) return;
  const vw = innerWidth / S.view.zoom, vh = innerHeight / S.view.zoom;
  if (b.x < S.view.x || b.y < S.view.y || b.x + b.w > S.view.x + vw || b.y + b.h > S.view.y + vh){ const c = center(b); S.view.x = c.x - vw / 2; S.view.y = c.y - vh / 2; }
}
function cycleSel(dir){
  commitKb();
  const els = S.D.els.filter(el => visible(el) && !S.D.hidden.has(el.cid));
  if (!els.length){ say('The canvas is empty.'); return false; }
  const cur = S.sel.size === 1 ? els.findIndex(e => S.sel.has(e.cid)) : -1;
  const i = cur < 0 ? (dir > 0 ? 0 : els.length - 1) : cur + dir;
  if (i < 0 || i >= els.length){ S.sel.clear(); dirty = true; return false; }
  S.sel = new Set([els[i].cid]); ensureVisible(els[i]); dirty = true;
  say(`${describe(els[i])}, ${i + 1} of ${els.length}. Arrow keys move, Delete removes.`);
  return true;
}
// Arrow-key moves preview live and settle into one signed MOVE per target after a short pause.
let kbT = 0;
function kbMove(dx, dy, targets = null){
  if (G && !G.keyboard) return;
  if (!G){ G = { kind: 'move', keyboard: true, targets: targets || moveTargets(), pin: !!targets, dx: 0, dy: 0 }; }
  if (!G.targets.size){ G = null; say('Arrows follow their endpoints; move what they connect.'); return; }
  G.dx += dx; G.dy += dy; dirty = true;
  clearTimeout(kbT); kbT = setTimeout(commitKb, 450);
}
ACTION_HOOKS.push(() => commitKb());
function commitKb(){
  clearTimeout(kbT);
  const g = G; if (!g || !g.keyboard) return;
  G = null; dirty = true;
  if (!g.dx && !g.dy) return;
  (async () => { for (const t of g.targets) await commitMove(t, g.dx, g.dy); S.hist.push({ kind: 'move', targets: [...g.targets], dx: g.dx, dy: g.dy }); S.redo = []; })();
  const n = g.targets.size, parts = [];
  if (g.dx) parts.push(`${Math.abs(g.dx)} ${g.dx < 0 ? 'left' : 'right'}`);
  if (g.dy) parts.push(`${Math.abs(g.dy)} ${g.dy < 0 ? 'up' : 'down'}`);
  say(`Moved ${g.pin ? 'the comment pin' : `${n} element${n > 1 ? 's' : ''}`} ${parts.join(' and ')}.`);
}
// A box scaled by s about its centre: both ends move by the same whole number of units, so the centre never drifts.
function scaleCentred(b, s){ const dw = 2 * Math.round(b.w * (s - 1) / 2), dh = 2 * Math.round(b.h * (s - 1) / 2); return { x: b.x - dw / 2, y: b.y - dh / 2, w: b.w + dw, h: b.h + dh }; }
// the smallest scale of b an element allows: a node keeps room for its label (and live data), anything else 16 units
function minScale(el, b){
  if (el.type !== 'NODE') return 16 / Math.min(b.w, b.h);
  const L = nodeLayout(el.ek, el.text, 0, 0, el.esize), f = L.K.fit?.(el, L);
  return Math.max(Math.max(L.w, f?.w || 0) / b.w, Math.max(L.h, f?.h || 0) / b.h);
}
// the MOVE that turns box b into nb: position and size (a node's W/H is a minimum on top of its own, so it counts from that)
function resizeDelta(el, b, nb){
  const o = S.D.off.get(el.cid) || { w: 0, h: 0 }, own = el.type === 'NODE';
  return { dx: Math.round(nb.x - b.x), dy: Math.round(nb.y - b.y),
    dw: nb.w === b.w ? 0 : Math.round(nb.w - (own ? el.bw + (o.w || 0) : b.w)), dh: nb.h === b.h ? 0 : Math.round(nb.h - (own ? el.bh + (o.h || 0) : b.h)) };
}
// + / − scale the selected element by 10% about its centre, keeping its proportions. Steps count from the size the run of key
// presses started at, so + then − comes back to exactly that box; presses queue, so held keys never race each other.
let KS = null, kbChain = Promise.resolve();
const near = (a, b) => a && b && ['x', 'y', 'w', 'h'].every(k => Math.abs(a[k] - b[k]) <= 1);
function kbResize(f){
  if (!resizeHandle()) return Promise.resolve(false);
  kbChain = kbChain.then(() => kbScale(f > 1 ? 1 : -1)).catch(err => console.warn(err));
  return kbChain.then(() => true);
}
async function kbScale(step){
  const h = resizeHandle(); if (!h) return;
  const el = h.el, b = box(el); if (!b) return;
  if (!KS || KS.cid !== el.cid || !near(KS.last, b)) KS = { cid: el.cid, b0: { ...b }, k: 0, last: { ...b } };
  const lo = minScale(el, KS.b0), kMin = Math.ceil(Math.log(lo) / Math.log(1.1) - 1e-9), hi = Math.floor(Math.log(20000 / Math.max(KS.b0.w, KS.b0.h)) / Math.log(1.1));
  let k = Math.min(hi, KS.k + step);
  if (k < kMin) k = kMin - 1;   // one notch below the last 10% step lands exactly on the smallest size
  if (k === KS.k){ say(step < 0 ? 'Already as small as its content allows.' : 'Already as large as it can be.'); return; }
  const nb = scaleCentred(KS.b0, k < kMin ? lo : 1.1 ** k), d = resizeDelta(el, b, nb);
  KS.k = k; KS.last = { ...nb };
  if (!d.dx && !d.dy && !d.dw && !d.dh) return;
  await commitMove(el.cid, d.dx, d.dy, d.dw, d.dh); S.hist.push({ kind: 'move', targets: [el.cid], ...d }); S.redo = [];
  await new Promise(r => setTimeout(r, 0));   // let derive() place it before the next press reads its box
  say(`Scaled to ${Math.round(nb.w)} by ${Math.round(nb.h)}, from the centre.`);
}
const viewCenter = () => toWorld(innerWidth / 2, innerHeight / 2);
async function kbInsert(kind){
  const c = viewCenter(); let cid;
  if (kind === 'rect') cid = await commitShape('rect', { x: c.x - 80, y: c.y - 50 }, { x: c.x + 80, y: c.y + 50 });
  if (kind === 'circle') cid = await commitShape('circle', { x: c.x - 60, y: c.y - 60 }, { x: c.x + 60, y: c.y + 60 });
  if (cid){ S.sel = new Set([cid]); dirty = true; say(`${kind === 'rect' ? 'Rectangle' : 'Circle'} added and selected. Arrow keys move it.`); }
}
async function connectSel(){
  const els = [...S.sel].map(c => S.records.get(c)).filter(el => el && el.type !== 'ARROW');
  if (els.length !== 2){ toast('Select exactly two elements to connect (first → second).'); return; }
  const cid = await commitArrow(els[0], els[1]);
  if (cid) say(`Connected ${describe(els[0])} to ${describe(els[1])}.`);
}
