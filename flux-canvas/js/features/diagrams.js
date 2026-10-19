'use strict';
// @module features/diagrams — NODE kinds, auto-size, connectors, + handles, node editor, tidy, templates
// @uses renderer, commands
/* diagrams: cards, mind maps, flowcharts and wireframes as NODE records */
// NODE-I-{author}-R-{nonce}-K-{kind}-X-Y-W-H-M-{label}-C-{colour}-P-{parent|0}[-E-{edited}]-Z-T-SIG
// W/H are a minimum size (0 = fit the label). P draws a connector from the parent automatically.
const NODE_KINDS = {
  card:    { name: 'card',              icon: '▭', label: 'Card',      font: 15, pad: [14, 12], wrap: 240, min: [120, 44], align: 'left' },
  topic:   { name: 'topic',             icon: '⬭', label: 'Idea',      font: 15, pad: [18, 9],  wrap: 220, min: [70, 36],  bold: true },
  rect:    { name: 'process',           icon: '□', label: 'Step',      font: 14, pad: [16, 12], wrap: 180, min: [110, 48] },
  ellipse: { name: 'start or end',      icon: '◯', label: 'Start',     font: 14, pad: [26, 14], wrap: 160, min: [110, 50] },
  diamond: { name: 'decision',          icon: '◇', label: 'Decision?', font: 14, pad: [0, 0],   wrap: 130, min: [130, 84] },
  sticky:  { name: 'sticky note',       icon: '▨', label: 'Note',      font: 15, pad: [14, 14], wrap: 170, min: [150, 130], align: 'left', top: true },
  button:  { name: 'button',            icon: '⏵', label: 'Button',    font: 14, pad: [20, 9],  wrap: 220, min: [96, 38],  bold: true },
  input:   { name: 'input field',       icon: '⎁', label: 'Email',     font: 14, pad: [12, 10], wrap: 260, min: [240, 40], align: 'left' },
  image:   { name: 'image placeholder', icon: '⊠', label: 'Image',     font: 13, pad: [10, 10], wrap: 200, min: [200, 130] },
  swatch:  { name: 'colour swatch',     icon: '◼', label: 'Colour',    font: 12, pad: [8, 8],   wrap: 110, min: [108, 128], bold: true },
  frame:   { name: 'screen frame',      icon: '▯', label: 'Screen',    font: 13, pad: [12, 8],  wrap: 300, min: [220, 200], align: 'left', top: true, bold: true },
};
S.nodeKind = 'card';
function wrapLines(text, maxW){
  const out = [];
  for (const para of String(text).split('\n')){
    const words = para.split(/(\s+)/); let line = '';
    for (const w of words){
      const t = line + w;
      if (line && mctx.measureText(t.trimEnd()).width > maxW && w.trim()){ out.push(line.trimEnd()); line = w.trimStart(); }
      else line = t;
      while (mctx.measureText(line).width > maxW * 1.6 && line.length > 8){   // break very long words
        let i = line.length; while (i > 1 && mctx.measureText(line.slice(0, i)).width > maxW) i--;
        out.push(line.slice(0, i)); line = line.slice(i);
      }
    }
    out.push(line.trimEnd());
  }
  return out.length ? out : [''];
}
const layoutCache = new Map();
function nodeLayout(kind, text, minW = 0, minH = 0){
  const K = NODE_KINDS[kind] || NODE_KINDS.card;
  const key = [kind, text, minW, minH].join('\u0000');
  if (layoutCache.has(key)) return layoutCache.get(key);
  const font = `${K.bold ? 600 : 400} ${K.font}px ${FONTS.sans}`;
  mctx.font = font;
  const wrap = Math.max(K.wrap, minW - K.pad[0] * 2);
  const lines = wrapLines(text || ' ', wrap), lh = Math.round(K.font * 1.35);
  const tw = Math.max(1, ...lines.map(l => mctx.measureText(l).width)), th = lines.length * lh;
  let w = tw + K.pad[0] * 2, h = th + K.pad[1] * 2;
  if (kind === 'diamond'){ w = tw * 1.7 + 44; h = th * 1.9 + 40; }
  if (kind === 'ellipse'){ w = tw * 1.2 + K.pad[0] * 2; h = th * 1.25 + K.pad[1] * 2; }
  if (kind === 'frame') h = 0;
  const L = { w: Math.ceil(Math.max(w, K.min[0], minW)), h: Math.ceil(Math.max(h, K.min[1], minH)), lines, font, lh, K };
  if (layoutCache.size > 3000) layoutCache.clear();
  layoutCache.set(key, L);
  return L;
}
function nodeBox(el){
  const o = S.D.off.get(el.cid);
  let mw = el.bw + (o ? o.w : 0), mh = el.bh + (o ? o.h : 0);
  if (G && G.kind === 'resize' && G.target === el.cid){ mw = G.w0 + G.dw; mh = G.h0 + G.dh; }
  return nodeLayout(el.ek || el.k, el.text, mw, mh);
}
let TH = {};
function readTheme(){
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  TH = { ink: INK, panel: v('--panel'), line: v('--line'), muted: v('--muted'), paper: v('--paper'), accent: v('--cyan'), dot: v('--dot') };
}
function rr(c, x, y, w, h, r){ r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
// colour blending in JS: canvas and SVG consumers can't be relied on to understand color-mix()
function rgbOf(c){
  c = String(c || '').trim(); let m;
  if ((m = c.match(/^#([0-9a-f]{3})$/i))) return [...m[1]].map(h => parseInt(h + h, 16));
  if ((m = c.match(/^#([0-9a-f]{6})/i))) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  if ((m = c.match(/rgba?\(([^)]+)\)/))) return m[1].split(/[\s,\/]+/).slice(0, 3).map(Number);
  return [128, 128, 128];
}
function mixHex(a, b, t){ const A = rgbOf(a), B = rgbOf(b); return '#' + A.map((v, i) => Math.max(0, Math.min(255, Math.round(v * t + B[i] * (1 - t)))).toString(16).padStart(2, '0')).join(''); }
const tint = (col, a) => mixHex(col, TH.panel || '#ffffff', a);
// Draw a node of a kind at p with layout L. Colour 'ink' keeps nodes neutral; any other colour accents them.
function drawNode(kind, p, L, col, noText, colName){
  const { x, y } = p, w = L.w, h = L.h, K = L.K, accent = colName && colName !== 'ink' ? col : null;
  ctx.save(); ctx.setLineDash([]); ctx.lineWidth = 1.5;
  let textCol = TH.ink;
  switch (kind){
    case 'card':
      ctx.shadowColor = 'rgba(0,0,0,.12)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
      rr(ctx, x, y, w, h, 10); ctx.fillStyle = TH.panel; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.strokeStyle = accent || TH.line; ctx.stroke();
      if (accent){ ctx.save(); rr(ctx, x, y, w, h, 10); ctx.clip(); ctx.fillStyle = accent; ctx.fillRect(x, y, 5, h); ctx.restore(); }
      break;
    case 'topic':
      rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = tint(accent || TH.accent, .16); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = accent || TH.accent; ctx.stroke(); break;
    case 'rect': rr(ctx, x, y, w, h, 6); ctx.fillStyle = tint(accent || TH.ink, .07); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = accent || TH.ink; ctx.stroke(); break;
    case 'ellipse': ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fillStyle = tint(accent || TH.ink, .07); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = accent || TH.ink; ctx.stroke(); break;
    case 'diamond': ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath();
      ctx.fillStyle = tint(accent || TH.ink, .07); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = accent || TH.ink; ctx.stroke(); break;
    case 'sticky':
      ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
      ctx.fillStyle = accent ? mixHex(accent, '#ffffff', .35) : '#ffe066'; ctx.fillRect(x, y, w, h); ctx.shadowColor = 'transparent';
      textCol = '#1d1d1f'; break;
    case 'button': rr(ctx, x, y, w, h, 8); ctx.fillStyle = accent || TH.ink; ctx.fill(); textCol = accent ? '#fff' : TH.paper; break;
    case 'input':
      rr(ctx, x, y, w, h, 6); ctx.fillStyle = TH.panel; ctx.fill(); ctx.strokeStyle = accent || TH.line; ctx.lineWidth = 1.5; ctx.stroke(); textCol = TH.muted; break;
    case 'image':
      ctx.fillStyle = tint(TH.line, .5); ctx.fillRect(x, y, w, h); ctx.strokeStyle = accent || TH.muted; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, w, h);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.globalAlpha *= .5; ctx.stroke(); ctx.globalAlpha /= .5;
      textCol = TH.muted; break;
    case 'swatch':   // moodboards: a colour chip with its name or hex underneath
      ctx.shadowColor = 'rgba(0,0,0,.12)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
      rr(ctx, x, y, w, h, 10); ctx.fillStyle = TH.panel; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.strokeStyle = TH.line; ctx.lineWidth = 1; ctx.stroke();
      rr(ctx, x + 6, y + 6, w - 12, h - 40, 7); ctx.fillStyle = col; ctx.fill(); break;
    case 'frame':
      rr(ctx, x, y, w, h, 18); ctx.lineWidth = 2; ctx.strokeStyle = accent || TH.ink; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + 30); ctx.lineTo(x + w, y + 30); ctx.lineWidth = 1; ctx.strokeStyle = TH.line; ctx.stroke(); textCol = TH.muted; break;
  }
  if (!noText){
    ctx.font = L.font; ctx.fillStyle = textCol; ctx.textBaseline = 'middle';
    const left = K.align === 'left', th = L.lines.length * L.lh;
    let ty = K.top ? y + K.pad[1] + L.lh / 2 : y + h / 2 - th / 2 + L.lh / 2;
    if (kind === 'frame') ty = y + 15;
    if (kind === 'swatch') ty = y + h - 17;
    ctx.textAlign = left ? 'left' : 'center';
    const tx = left ? x + K.pad[0] + (kind === 'card' && accent ? 4 : 0) : x + w / 2;
    for (const l of L.lines){ ctx.fillText(l, tx, ty); ty += L.lh; }
    if (kind === 'input'){ ctx.fillStyle = TH.muted; ctx.globalAlpha *= .6; }
  }
  ctx.restore();
}
// Connector between two boxes: a smooth curve leaving the facing sides.
function linkGeom(a, b){
  const ca = center(a), cb = center(b), dx = cb.x - ca.x, dy = cb.y - ca.y;
  let p0, p1, c0, c1;
  if (Math.abs(dx) * (a.h + b.h) >= Math.abs(dy) * (a.w + b.w) * 0.55){
    const s = Math.sign(dx) || 1; p0 = { x: s > 0 ? a.x + a.w : a.x, y: ca.y }; p1 = { x: s > 0 ? b.x : b.x + b.w, y: cb.y };
    const k = Math.max(24, Math.abs(p1.x - p0.x) / 2); c0 = { x: p0.x + s * k, y: p0.y }; c1 = { x: p1.x - s * k, y: p1.y };
  } else {
    const s = Math.sign(dy) || 1; p0 = { x: ca.x, y: s > 0 ? a.y + a.h : a.y }; p1 = { x: cb.x, y: s > 0 ? b.y : b.y + b.h };
    const k = Math.max(24, Math.abs(p1.y - p0.y) / 2); c0 = { x: p0.x, y: p0.y + s * k }; c1 = { x: p1.x, y: p1.y - s * k };
  }
  return { p0, c0, c1, p1 };
}
// Connector geometry between two boxes: curve (bezier between facing sides), straight (centre to centre, clipped) or elbow.
// Returns { bez } or { pts }, plus mid (label anchor) and from → to (arrowhead direction).
function connGeom(a, b, shape = 'curve'){
  const g = linkGeom(a, b), hz = g.c0.y === g.p0.y;
  if (shape === 'straight'){ const p = edgePoint(a, center(b), 6), q = edgePoint(b, center(a), 6); return { pts: [p, q], mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, from: p, to: q }; }
  if (shape === 'elbow'){
    const m = hz ? (g.p0.x + g.p1.x) / 2 : (g.p0.y + g.p1.y) / 2;
    const pts = hz ? [g.p0, { x: m, y: g.p0.y }, { x: m, y: g.p1.y }, g.p1] : [g.p0, { x: g.p0.x, y: m }, { x: g.p1.x, y: m }, g.p1];
    return { pts, mid: { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 }, from: pts[2], to: g.p1 };
  }
  return { bez: g, mid: { x: (g.p0.x + 3 * g.c0.x + 3 * g.c1.x + g.p1.x) / 8, y: (g.p0.y + 3 * g.c0.y + 3 * g.c1.y + g.p1.y) / 8 }, from: g.c1, to: g.p1 };
}
function strokeConn(c, col, width, dash, head){
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.setLineDash(dash && dash !== 'solid' ? dashOf(dash, width) : []);
  ctx.beginPath();
  if (c.bez){ const g = c.bez; ctx.moveTo(g.p0.x, g.p0.y); ctx.bezierCurveTo(g.c0.x, g.c0.y, g.c1.x, g.c1.y, g.p1.x, g.p1.y); }
  else c.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.stroke(); ctx.setLineDash([]);
  if (head) drawArrowHead(c.from, c.to, 7 + width * 2);
  ctx.restore();
}
function drawLink(a, b, head, col, width){ strokeConn(connGeom(a, b, 'curve'), col, width, 'solid', head); }
function drawTreeLinks(){
  for (const el of S.D.els){
    if (el.type !== 'NODE' || !el.parent || !visible(el)) continue;
    const p = current(el.parent); if (!p || p === el || !visible(p)) continue;
    const kind = el.ek, head = !['topic', 'card', 'sticky'].includes(kind);
    const hid = S.D.hidden.has(el.cid);
    ctx.save(); if (hid) ctx.globalAlpha = .18;
    drawLink(box(p), box(el), head, ecol(el) === 'ink' ? TH.muted : colorOf(ecol(el)), 2);
    ctx.restore();
  }
}
function descendants(cid){
  const out = [], seen = new Set([cid]), q = [cid];
  while (q.length){ for (const k of S.D.kids.get(q.shift()) || []){ if (seen.has(k)) continue; seen.add(k); const el = S.records.get(k); if (el && !S.D.hidden.has(k)){ out.push(k); q.push(k); } } }
  return out;
}
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
function startNode({ kind = S.nodeKind, parent = null, color = null, anchor, orig = null, label = null }){
  if (taOpen()) finishText(true);
  setPlacing(null);
  kind = NODE_KINDS[kind] ? kind : 'card';
  const K = NODE_KINDS[kind];
  taNode = { kind, parent, color: color || (S.color === 'ink' ? 'ink' : S.color), anchor, orig, W: 0, H: 0 };
  if (kind === 'frame' && !orig){ taNode.W = 375; taNode.H = 667; }
  if (orig){ const o = S.D.off.get(orig.cid) || { w: 0, h: 0 }; taNode.W = orig.bw + (o.w || 0); taNode.H = orig.bh + (o.h || 0); editingCid = orig.cid; }
  taAt = null; taOrig = null;
  ta.value = orig ? orig.text : (label ?? K.label);
  ta.setAttribute('aria-label', `${orig ? 'Edit' : 'New'} ${K.name} label. Enter saves, Tab saves and adds a connected child, Control+Enter adds a sibling, Escape cancels`);
  ta.style.display = 'block'; ta.style.whiteSpace = 'pre-wrap'; ta.style.outlineStyle = 'dashed';
  placeNodeEditor(); dirty = true;
  setTimeout(() => { ta.focus(); ta.select(); }, 0);
  say(`${orig ? 'Editing' : 'New'} ${K.name}${parent ? ` connected to “${current(parent)?.text.slice(0, 40) || ''}”` : ''}. Type the label, Enter to sign.`);
}
function nodeEditBox(){
  const n = taNode, L = nodeLayout(n.kind, ta.value, n.W, n.H), a = n.anchor;
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
    font: `${K.bold ? 600 : 400} ${K.font * z}px ${FONTS.sans}`, lineHeight: (L.lh * z) + 'px', textAlign: left ? 'left' : 'center',
    color: taNode.kind === 'sticky' ? '#1d1d1f' : taNode.kind === 'button' ? (taNode.color !== 'ink' ? '#fff' : TH.paper) : TH.ink || INK });
  void s;
}
function drawNodeGhost(){
  if (!taNode) return;
  const { x, y, L } = nodeEditBox(), col = taNode.color;
  if (taNode.parent){ const p = current(taNode.parent); if (p) drawLink(box(p), { x, y, w: L.w, h: L.h }, !['topic', 'card', 'sticky'].includes(taNode.kind), col === 'ink' ? TH.muted : colorOf(col), 2); }
  drawNode(taNode.kind, { x, y }, L, colorOf(col), true, col);
}
async function finishNode(commit, then){
  const n = taNode; if (!n) return;
  const label = ta.value.replace(/\s+$/, '') || NODE_KINDS[n.kind].label;
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
  say(`${NODE_KINDS[n.kind].name} “${label.slice(0, 60)}” ${n.orig ? 'edited' : 'added'}. Signed. Alt+arrows add connected nodes, Enter edits.`);
  if (then === 'child') startChild(el, 'right');
  if (then === 'sibling') startSibling(el);
}
async function commitNode({ kind, x, y, W = 0, H = 0, label, color = 'ink', parent = null, edits = null }){
  const t = Date.now(), R = await cidOf(te.encode([kind, x, y, t, Math.random()].join('_')));
  const raw = await signed('NODE', [['I', S.me.id], ['R', R], ['K', kind], ['X', encInt(Math.round(x))], ['Y', encInt(Math.round(y))], ['W', Math.max(0, Math.round(W))], ['H', Math.max(0, Math.round(H))],
    ['M', encTxt(label)], ['C', color || 'ink'], ['P', parent || '0'], ...(edits ? [['E', edits]] : []), ['Z', ++S.lamport], ['T', t]]);
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
      say(`${items.length} node${items.length === 1 ? '' : 's'} changed to ${NODE_KINDS[k].name}. Signed.`);
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
  say(items.length ? `Tidied ${items.length} node${items.length > 1 ? 's' : ''} around “${root.text.slice(0, 40)}”. Signed.` : 'Already tidy.');
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
  toast(`${{ mindmap: 'Mind map', flow: 'Flowchart', mobile: 'Mobile wireframe', web: 'Web wireframe' }[kind]} added · ${made.length} signed nodes`);
}

