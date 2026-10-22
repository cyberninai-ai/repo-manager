'use strict';
// @module render/nodes — NODE kinds, label layout and auto-size, drawing a node, connector geometry and strokes
// @uses render/geometry
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
  frame:   { name: 'frame',             icon: '▯', label: 'Screen',    font: 13, pad: [12, 8],  wrap: 300, min: [220, 200], align: 'left', top: true, bold: true },
};
// a kind may lay itself out and draw itself (features/data: tables, charts…): layout(text) → { w, h, …parsed } and
// draw(box, L, { el, accent, col }); its parse comes from the label alone, so the layout cache stays valid. fit(el, L) → { w, h }
// grows the box with data that lives outside the label
S.nodeKind = 'rect';   // the Shape tool starts with a rectangle
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
function nodeLayout(kind, text, minW = 0, minH = 0, size = 'm'){
  const K = NODE_KINDS[kind] || NODE_KINDS.card, fs = Math.round(K.font * (TEXT_SIZES[size] || 1));
  const key = [kind, text, minW, minH, fs].join('\u0000');
  if (layoutCache.has(key)) return layoutCache.get(key);
  const font = `${K.bold ? 600 : 400} ${fs}px ${FONTS.sans}`;
  if (K.layout){
    let d; try { d = K.layout(String(text || '')); } catch { d = { w: K.min[0], h: K.min[1] }; }
    const L = { w: Math.ceil(Math.max(d.w, K.min[0], minW)), h: Math.ceil(Math.max(d.h, K.min[1], minH)), lines: [], font, lh: Math.round(fs * 1.35), K, fs, d };
    if (layoutCache.size > 3000) layoutCache.clear();
    layoutCache.set(key, L); return L;
  }
  mctx.font = font;
  const wrap = Math.max(K.wrap, minW - K.pad[0] * 2);
  const lines = wrapLines(text || ' ', wrap * fs / K.font), lh = Math.round(fs * 1.35);
  const tw = Math.max(1, ...lines.map(l => mctx.measureText(l).width)), th = lines.length * lh;
  let w = tw + K.pad[0] * 2, h = th + K.pad[1] * 2;
  if (kind === 'diamond'){ w = tw * 1.7 + 44; h = th * 1.9 + 40; }
  if (kind === 'ellipse'){ w = tw * 1.2 + K.pad[0] * 2; h = th * 1.25 + K.pad[1] * 2; }
  if (kind === 'frame') h = 0;
  const L = { w: Math.ceil(Math.max(w, K.min[0], minW)), h: Math.ceil(Math.max(h, K.min[1], minH)), lines, font, lh, K, fs };
  if (layoutCache.size > 3000) layoutCache.clear();
  layoutCache.set(key, L);
  return L;
}
function nodeBox(el){
  const o = S.D.off.get(el.cid);
  let mw = el.bw + (o ? o.w : 0), mh = el.bh + (o ? o.h : 0);
  if (G && G.kind === 'resize' && G.target === el.cid){ mw = G.nb.w; mh = G.nb.h; }
  const L = nodeLayout(el.ek || el.k, el.text, mw, mh, el.esize);
  const f = L.K.fit?.(el, L);   // live data can make a node bigger than its label alone (rows others added)
  return f && (f.w > L.w || f.h > L.h) ? { ...L, w: Math.max(L.w, f.w), h: Math.max(L.h, f.h) } : L;
}
let TH = {};
function readTheme(){
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  TH = { ink: INK, panel: v('--panel'), panel2: v('--panel2'), line: v('--line'), line2: v('--line2'), muted: v('--muted'), faint: v('--faint'), paper: v('--paper'), accent: v('--cyan'), dot: v('--dot'),
    green: v('--green'), red: v('--red'), amber: v('--amber'), accentWeak: v('--accent-weak') };
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
function drawNode(kind, p, L, col, noText, colName, fill = null, el = null){
  const { x, y } = p, w = L.w, h = L.h, K = L.K, accent = colName && colName !== 'ink' ? col : null;
  ctx.save(); ctx.setLineDash([]); ctx.lineWidth = 1.5;
  if (K.draw){ try { K.draw({ x, y, w, h }, L, { el, accent, col }); } catch (err){ console.warn('node draw failed', err); } ctx.restore(); return; }
  let textCol = TH.ink;
  // shapes: no fill, a light tint (the default) or solid colour with text that stays readable on it
  const paint = (c, a) => { if (fill === 'none') return; ctx.fillStyle = fill === 'solid' ? c : tint(c, a); ctx.fill(); if (fill === 'solid') textCol = readableOn(c); };
  switch (kind){
    case 'card':
      ctx.shadowColor = 'rgba(0,0,0,.12)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
      rr(ctx, x, y, w, h, 10); ctx.fillStyle = TH.panel; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.strokeStyle = accent || TH.line; ctx.stroke();
      if (accent){ ctx.save(); rr(ctx, x, y, w, h, 10); ctx.clip(); ctx.fillStyle = accent; ctx.fillRect(x, y, 5, h); ctx.restore(); }
      break;
    case 'topic':
      rr(ctx, x, y, w, h, h / 2); paint(accent || TH.accent, .16); ctx.lineWidth = 2; ctx.strokeStyle = accent || TH.accent; ctx.stroke(); break;
    case 'rect': rr(ctx, x, y, w, h, 6); paint(accent || TH.ink, .07); ctx.lineWidth = 2; ctx.strokeStyle = accent || TH.ink; ctx.stroke(); break;
    case 'ellipse': ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); paint(accent || TH.ink, .07); ctx.lineWidth = 2; ctx.strokeStyle = accent || TH.ink; ctx.stroke(); break;
    case 'diamond': ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath();
      paint(accent || TH.ink, .07); ctx.lineWidth = 2; ctx.strokeStyle = accent || TH.ink; ctx.stroke(); break;
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
// line dash patterns for connector styles, on the canvas and in SVG
const dashOf = (d, w) => d === 'dash' ? [w * 4 + 4, w * 3 + 3] : d === 'dot' ? [0.1, w * 2 + 3] : [];
const svgDash = (d, w) => d === 'dash' ? ` stroke-dasharray="${w * 4 + 4} ${w * 3 + 3}"` : d === 'dot' ? ` stroke-dasharray="0.1 ${w * 2 + 3}"` : '';
// text colour that stays readable on a solid fill
const readableOn = c => { const [r, g, b] = rgbOf(c); return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1d1d1f' : '#ffffff'; };
// shape kinds that take a fill choice, and the size a shape gets from a single click
const FILLABLE = new Set(['rect', 'ellipse', 'diamond', 'topic']);
const SHAPE_SIZE = { rect: [160, 100], ellipse: [160, 110], diamond: [150, 120] };   // these appear at once; ideas and cards open their label first
// text size inside shapes and notes (STYLE S): small, medium (the kind's own size), large, extra large
const TEXT_SIZES = { s: 0.85, m: 1, l: 1.4, xl: 2 };
