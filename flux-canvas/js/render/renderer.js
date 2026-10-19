'use strict';
// @module render/renderer — Viewport, drawEl() per record type, frame render loop
// @uses geometry
/* =====================================================================
   Viewport + render
   ===================================================================== */
const cv = document.getElementById('c'), mainCtx = cv.getContext('2d');
let ctx = mainCtx;   // swapped briefly to draw thumbnails with the same renderer
let dirty = true, dpr = 1;
function resize(){ dpr = Math.min(3, devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; dirty = true; }
addEventListener('resize', resize);
const toWorld = (sx, sy) => ({ x: sx / S.view.zoom + S.view.x, y: sy / S.view.zoom + S.view.y });
const toScreen = (wx, wy) => ({ x: (wx - S.view.x) * S.view.zoom, y: (wy - S.view.y) * S.view.zoom });

function drawArrowHead(a, b, size){
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - size * Math.cos(ang - 0.45), b.y - size * Math.sin(ang - 0.45));
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - size * Math.cos(ang + 0.45), b.y - size * Math.sin(ang + 0.45));
  ctx.stroke();
}
function drawEl(el){
  ctx.save();
  if (S.D.hidden.has(el.cid)){ ctx.globalAlpha = 0.18; ctx.setLineDash([6, 6]); }
  if (G?.kind === 'erase' && G.hit.has(el.cid)) ctx.globalAlpha = 0.2;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const col = colorOf(ecol(el));
  ctx.strokeStyle = col; ctx.fillStyle = col;
  if (el.type === 'ARROW'){
    const g = arrowGeom(el); if (!g){ ctx.restore(); return; }
    ctx.lineWidth = lw(el);
    const A = current(el.f.FROM), B = current(el.f.TO);
    if (A?.type === 'NODE' && B?.type === 'NODE'){   // diagram connectors curve
      drawLink(box(A), box(B), true, col, lw(el));
      if (el.elabel){ const q = linkGeom(box(A), box(B)); drawEdgeLabel(el.elabel, { x: (q.p0.x + 3 * q.c0.x + 3 * q.c1.x + q.p1.x) / 8, y: (q.p0.y + 3 * q.c0.y + 3 * q.c1.y + q.p1.y) / 8 }, col); }
      ctx.restore(); return;
    }
    ctx.beginPath(); ctx.moveTo(g.a.x, g.a.y); ctx.lineTo(g.b.x, g.b.y); ctx.stroke();
    drawArrowHead(g.a, g.b, 8 + lw(el) * 2);
    if (el.elabel) drawEdgeLabel(el.elabel, { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 }, col);
    ctx.restore(); return;
  }
  const o = offsetOf(el.cid); ctx.translate(o.x, o.y);
  if (el.type === 'DRAW'){
    const g = strokeGeom(el.f.R);
    if (g){ ctx.lineWidth = lw(el); ctx.stroke(g.path); }
  } else if (el.type === 'IMAGE'){
    const s = sizeOf(el), bmp = imageOf(el.f.R);
    if (bmp) ctx.drawImage(bmp, el.x, el.y, s.w, s.h);
    else { ctx.save(); ctx.globalAlpha *= .35; ctx.lineWidth = 1 / S.view.zoom; ctx.setLineDash([6 / S.view.zoom, 6 / S.view.zoom]); ctx.strokeRect(el.x, el.y, s.w, s.h);
      ctx.font = `${12 / S.view.zoom}px ${FONTS.mono}`; ctx.textBaseline = 'top'; ctx.fillText(!S.blobs.has(el.f.R) ? 'image blob missing' : S.imgs.get(el.f.R) === 'error' ? 'this browser cannot decode this image' : 'loading image…', el.x + 6 / S.view.zoom, el.y + 6 / S.view.zoom); ctx.restore(); }
  } else if (el.type === 'SHAPE'){
    ctx.lineWidth = lw(el); ctx.beginPath();
    if (el.k === 'circle') ctx.ellipse(el.x + el.bw / 2, el.y + el.bh / 2, Math.abs(el.bw / 2), Math.abs(el.bh / 2), 0, 0, Math.PI * 2);
    else if (el.k === 'line'){ ctx.moveTo(el.x, el.y); ctx.lineTo(el.x + el.bw, el.y + el.bh); }
    else ctx.rect(el.x, el.y, el.bw, el.bh);
    if (el.f.F && el.f.F !== 'none'){ ctx.save(); ctx.globalAlpha *= 0.16; ctx.fillStyle = colorOf(el.ec && el.ec !== el.f.C ? el.ec : el.f.F); ctx.fill(); ctx.restore(); }
    ctx.stroke();
  } else if (el.type === 'NODE'){
    drawNode(el.ek, { x: el.x, y: el.y }, nodeBox(el), colorOf(ecol(el)), false, ecol(el));
  } else if (el.type === 'TEXT'){
    const fs = el._previewFs || el.fs;
    ctx.font = `${fs}px ${FONTS[el.f.F] || FONTS.sans}`; ctx.textBaseline = 'top';
    el.text.split('\n').forEach((l, i) => ctx.fillText(l, el.x, el.y + i * fs * 1.25 + fs * 0.1));
  }
  ctx.restore();
}
function drawEdgeLabel(text, m, col){
  ctx.save(); ctx.setLineDash([]); ctx.font = `500 13px ${FONTS.sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 12;
  rr(ctx, m.x - w / 2, m.y - 10, w, 20, 10); ctx.fillStyle = TH.paper || '#fff'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = col; ctx.globalAlpha *= .9; ctx.stroke();
  ctx.globalAlpha = 1; ctx.fillStyle = TH.ink || INK; ctx.fillText(text, m.x, m.y + .5); ctx.restore();
}
function dashedBox(b, color, z){
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1 / z; ctx.setLineDash([4 / z, 4 / z]);
  ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.restore();
}
function selBox(){
  let b = null;
  for (const c of S.sel){
    const el = S.records.get(c); if (!el) continue; const x = box(el); if (!x) continue;
    if (!b) b = { ...x }; else { const r = Math.max(b.x + b.w, x.x + x.w), d = Math.max(b.y + b.h, x.y + x.h); b.x = Math.min(b.x, x.x); b.y = Math.min(b.y, x.y); b.w = r - b.x; b.h = d - b.y; }
  }
  return b;
}
function render(){
  dirty = false;
  INK = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || INK;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim();
  const z = S.view.zoom;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, -S.view.x * z * dpr, -S.view.y * z * dpr);
  const vp = { x: S.view.x, y: S.view.y, w: innerWidth / z, h: innerHeight / z };
  readTheme(); drawTreeLinks();
  for (const el of S.D.els){
    if (!visible(el)) continue;
    const b = box(el);
    if (b && (b.x > vp.x + vp.w || b.y > vp.y + vp.h || b.x + b.w < vp.x || b.y + b.h < vp.y)) continue;
    drawEl(el);
  }
  // ghosts: committed gestures awaiting their signature
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const g of S.ghosts) if (g.pts){ ctx.strokeStyle = colorOf(g.color); ctx.lineWidth = g.width; ctx.stroke(pathOf(g.pts)); }
  if (G){
    ctx.strokeStyle = colorOf(S.color); ctx.lineWidth = S.width;
    if ((G.kind === 'stroke' || G.kind === 'arrow') && G.pts.length){
      if (G.kind === 'arrow'){
        const sb = box(G.from);
        if (sb){ dashedBox(grow(sb, 4 / z), accent, z); const tgt = G.target && box(G.target); if (tgt) dashedBox(grow(tgt, 4 / z), accent, z);
          const a = edgePoint(sb, tgt ? center(tgt) : G.cur, 6), b = tgt ? edgePoint(tgt, center(sb), 6) : G.cur;
          ctx.lineWidth = Math.max(2, S.width / 2); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); drawArrowHead(a, b, 8 + ctx.lineWidth * 2); }
      } else ctx.stroke(pathOf(G.pts));
    } else if (G.kind === 'rect' || G.kind === 'circle'){
      const b = norm(G.a, G.b); ctx.beginPath();
      if (G.kind === 'circle') ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); else ctx.rect(b.x, b.y, b.w, b.h);
      if (S.fill){ ctx.save(); ctx.globalAlpha = .16; ctx.fillStyle = colorOf(S.color); ctx.fill(); ctx.restore(); }
      ctx.stroke();
    } else if (G.kind === 'lasso' && G.pts.length > 1){
      ctx.save(); ctx.strokeStyle = accent; ctx.lineWidth = 1.2 / z; ctx.setLineDash([5 / z, 4 / z]);
      ctx.beginPath(); G.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = .06; ctx.fillStyle = accent; ctx.fill(); ctx.restore();
    }
  }
  ctx.restore();
  drawNodeGhost(); drawGrowHandles(accent);
  if (G?.kind === 'erase' && G.pts.length > 1){ ctx.save(); ctx.strokeStyle = TH.muted; ctx.globalAlpha = .35; ctx.lineWidth = 14 / z; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); G.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); ctx.restore(); }
  if (G?.kind === 'move' && G.guides) for (const gd of G.guides){ ctx.save(); ctx.strokeStyle = '#e64980'; ctx.lineWidth = 1 / z; ctx.setLineDash([4 / z, 3 / z]); ctx.beginPath();
    if (gd.x != null){ ctx.moveTo(gd.x, gd.a); ctx.lineTo(gd.x, gd.b); } else { ctx.moveTo(gd.a, gd.y); ctx.lineTo(gd.b, gd.y); } ctx.stroke(); ctx.restore(); }
  // hover: connectable edge
  if (!G && hoverEdge){ const b = box(hoverEdge); if (b) dashedBox(grow(b, 4 / z), accent, z); }
  // selection
  if (S.sel.size){
    for (const c of S.sel){ const el = S.records.get(c); const b = el && box(el); if (b) dashedBox(grow(b, 3 / z), accent, z); }
    for (const c of S.sel){ const el = S.records.get(c), b = el?.locked && box(el); if (b){ ctx.save(); ctx.font = `${12 / z}px ${FONTS.sans}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('🔒', b.x + b.w, b.y - 4 / z); ctx.restore(); } }
    const sb = selBox();
    if (sb && S.sel.size > 1){ ctx.save(); ctx.strokeStyle = accent; ctx.lineWidth = 1.5 / z; ctx.strokeRect(sb.x - 8 / z, sb.y - 8 / z, sb.w + 16 / z, sb.h + 16 / z); ctx.restore(); }
    const h = S.lassoMode && resizeHandle();
    if (h){ ctx.save(); ctx.fillStyle = accent; ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(); ctx.lineWidth = 2 / z;
      ctx.beginPath(); ctx.rect(h.x - 6 / z, h.y - 6 / z, 12 / z, 12 / z); ctx.fill(); ctx.stroke(); ctx.restore(); }
  }
  drawPins();
  drawPeers();
  paintMini();
  paintPreviews();
  paintBar();
  paintInspector();
}
function loop(){ if (dirty) render(); paintAuthTick(); requestAnimationFrame(loop); }

