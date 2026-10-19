'use strict';
// @module render/geometry — Colours, fonts, element boxes, offsets, visibility, hit geometry helpers
// @uses derive
/* =====================================================================
   Geometry
   ===================================================================== */
const COLORS = { ink: null, red: '#e03131', orange: '#e8590c', green: '#2f9e44', blue: '#1c7ed6', violet: '#7048e8', pink: '#d6336c' };
const FONTS = { sans: 'system-ui,-apple-system,"Segoe UI",sans-serif', hand: '"Segoe Print","Bradley Hand","Comic Sans MS",cursive', mono: 'ui-monospace,"SF Mono",Menlo,Consolas,monospace' };
let INK = '#14181f';
const colorOf = c => c === 'ink' || !c ? INK : COLORS[c] || (/^[0-9a-fA-F]{6}$/.test(c) ? '#' + c : INK);
function authorHue(id){ let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h % 360; }
const authorColor = id => `hsl(${authorHue(id)} 62% 48%)`;
const short = id => id ? (NAMES.get(id) || id.slice(2, 8)) : '?';

function pathOf(pts){
  const p = new Path2D();
  p.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1){ p.lineTo(pts[0].x + 0.01, pts[0].y); return p; }
  for (let i = 1; i < pts.length - 1; i++) p.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  p.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  return p;
}
function geomOf(pts){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts){ if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { pts, path: pathOf(pts), box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}
const mctx = document.createElement('canvas').getContext('2d');
// effective line width and colour: the record's own, a STYLE override, or a live slider preview
const lw = el => el._pw ?? el.ew ?? (el.type === 'DRAW' ? el.w : el.sw);
const ecol = el => el.ec ?? el.f.C;
function baseBox(el){
  switch (el.type){
    case 'DRAW': { const g = strokeGeom(el.f.R); if (!g) return null; const lwv = lw(el), h = lwv / 2; return { x: g.box.x - h, y: g.box.y - h, w: g.box.w + lwv, h: g.box.h + lwv }; }
    case 'SHAPE': return { x: el.x, y: el.y, w: el.bw, h: el.bh };
    case 'IMAGE': { const s = sizeOf(el); return { x: el.x, y: el.y, w: s.w, h: s.h }; }
    case 'NODE': { const L = nodeBox(el); return { x: el.x, y: el.y, w: L.w, h: L.h }; }
    case 'TEXT': {
      if (!el._bb){
        mctx.font = `${el._previewFs || el.fs}px ${FONTS[el.f.F] || FONTS.sans}`;
        const ls = el.text.split('\n');
        el._bb = { x: el.x, y: el.y, w: Math.max(4, ...ls.map(l => mctx.measureText(l).width)), h: ls.length * (el._previewFs || el.fs) * 1.25 };
      }
      return el._bb;
    }
  }
  return null;
}
function sizeOf(el){
  const o = S.D.off.get(el.cid);
  let w = el.bw + (o ? o.w : 0), h = el.bh + (o ? o.h : 0);
  if (G && G.kind === 'resize' && G.target === el.cid){ w += G.dw; h += G.dh; }
  return { w: Math.max(8, w), h: Math.max(8, h) };
}
function offsetOf(cid){
  const D = S.D, a = D.off.get(cid), g = D.groupOf.get(cid), b = g && D.off.get(g);
  let x = (a ? a.x : 0) + (b ? b.x : 0), y = (a ? a.y : 0) + (b ? b.y : 0);
  if (G && G.kind === 'move' && G.targets.has(g || cid)){ x += G.dx; y += G.dy; }
  return { x, y };
}
function box(el){
  if (el.type === 'ARROW'){ const a = arrowGeom(el); if (!a) return null; return norm(a.a, a.b, 6); }
  const b = baseBox(el); if (!b) return null;
  const o = offsetOf(el.cid); return { x: b.x + o.x, y: b.y + o.y, w: b.w, h: b.h };
}
function norm(a, b, pad = 0){ return { x: Math.min(a.x, b.x) - pad, y: Math.min(a.y, b.y) - pad, w: Math.abs(a.x - b.x) + 2 * pad, h: Math.abs(a.y - b.y) + 2 * pad }; }
const grow = (b, d) => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });
const inside = (p, b) => p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h;
const center = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
function edgePoint(b, toward, pad){
  const c = center(b), dx = toward.x - c.x, dy = toward.y - c.y;
  const hw = b.w / 2 + pad, hh = b.h / 2 + pad;
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity, 1);
  return { x: c.x + dx * t, y: c.y + dy * t };
}
function passes(el){ return !S.filter || S.filter.has(el.author); }
// follow text edits to the current version, so arrows and comments stay attached when text is edited
function current(cid){ let c = cid, n = 0; while (S.D.next.has(c) && n++ < 1000) c = S.D.next.get(c); return S.records.get(c); }
function visible(el){
  if (!el || el.neg !== null || !ELEMENT.has(el.type)) return false;
  if (S.D.superseded.has(el.cid) || el.cid === editingCid) return false;
  if (S.D.hidden.has(el.cid) && !S.showHidden) return false;
  if (!passes(el)) return false;
  if (el.type === 'ARROW'){
    const a = current(el.f.FROM), b = current(el.f.TO);
    return !!(a && b && a.type !== 'ARROW' && b.type !== 'ARROW' && visible(a) && visible(b));   // negatives propagate to connectors
  }
  return true;
}
function arrowGeom(el){
  const A = current(el.f.FROM), B = current(el.f.TO);
  if (!A || !B || A.type === 'ARROW' || B.type === 'ARROW') return null;
  const ba = box(A), bb = box(B); if (!ba || !bb) return null;
  return { a: edgePoint(ba, center(bb), 6), b: edgePoint(bb, center(ba), 6) };
}
function distToSeg(p, a, b){
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function pointInPoly(p, poly){
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

// stroke geometry from its point blob, decoded once
function strokeGeom(cid){
  if (!S.geom.has(cid)){
    const b = S.blobs.get(cid); if (!b) return null;
    try { S.geom.set(cid, geomOf(decodePoints(b))); } catch { S.geom.set(cid, null); }
  }
  return S.geom.get(cid);
}
