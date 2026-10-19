'use strict';
// @module features/export-svg — Vector export of the visible canvas
// @uses diagrams
/* SVG export: the visible canvas as vector markup */
const xe = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function toSVG(){
  readTheme();
  const els = S.D.els.filter(el => visible(el) && !S.D.hidden.has(el.cid));
  let bx = null;
  for (const el of els){ const b = box(el); if (!b) continue; bx = bx ? norm({ x: Math.min(bx.x, b.x), y: Math.min(bx.y, b.y) }, { x: Math.max(bx.x + bx.w, b.x + b.w), y: Math.max(bx.y + bx.h, b.y + b.h) }) : { ...b }; }
  if (!bx) bx = { x: 0, y: 0, w: 100, h: 100 };
  bx = grow(bx, 40);
  const o = [], n = v => Math.round(v * 10) / 10;
  const curve = (g, col, w, head) => {
    o.push(`<path d="M${n(g.p0.x)} ${n(g.p0.y)} C${n(g.c0.x)} ${n(g.c0.y)} ${n(g.c1.x)} ${n(g.c1.y)} ${n(g.p1.x)} ${n(g.p1.y)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`);
    if (head) o.push(headSVG(g.c1, g.p1, 7 + w * 2, col, w));
  };
  const headSVG = (a, b, size, col, w) => { const ang = Math.atan2(b.y - a.y, b.x - a.x); const p = s => `${n(b.x - size * Math.cos(ang + s))},${n(b.y - size * Math.sin(ang + s))}`; return `<polyline points="${p(-0.45)} ${n(b.x)},${n(b.y)} ${p(0.45)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`; };
  const mix = (col, a) => tint(col, a);
  // tree connectors first
  for (const el of els) if (el.type === 'NODE' && el.parent){ const p = current(el.parent); if (p && visible(p)) curve(linkGeom(box(p), box(el)), ecol(el) === 'ink' ? TH.muted : colorOf(ecol(el)), 2, !['topic', 'card', 'sticky'].includes(el.ek)); }
  for (const el of els){
    const col = colorOf(ecol(el));
    if (el.type === 'DRAW'){
      const g = strokeGeom(el.f.R); if (!g) continue; const of = offsetOf(el.cid), P = g.pts.map(p => ({ x: p.x + of.x, y: p.y + of.y }));
      let d = `M${n(P[0].x)} ${n(P[0].y)}`;
      if (P.length === 1) d += ` L${n(P[0].x + .01)} ${n(P[0].y)}`;
      for (let i = 1; i < P.length - 1; i++) d += ` Q${n(P[i].x)} ${n(P[i].y)} ${n((P[i].x + P[i + 1].x) / 2)} ${n((P[i].y + P[i + 1].y) / 2)}`;
      if (P.length > 1) d += ` L${n(P[P.length - 1].x)} ${n(P[P.length - 1].y)}`;
      o.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${lw(el)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else if (el.type === 'SHAPE'){
      const b = box(el), fill = el.f.F && el.f.F !== 'none' ? `fill="${col}" fill-opacity=".16"` : 'fill="none"';
      o.push(el.k === 'circle' ? `<ellipse cx="${n(b.x + b.w / 2)}" cy="${n(b.y + b.h / 2)}" rx="${n(b.w / 2)}" ry="${n(b.h / 2)}" ${fill} stroke="${col}" stroke-width="${lw(el)}"/>`
        : `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" ${fill} stroke="${col}" stroke-width="${lw(el)}"/>`);
    } else if (el.type === 'TEXT'){
      const b = box(el), fs = el.fs;
      o.push(`<text font-family="${xe(FONTS[el.f.F] || FONTS.sans)}" font-size="${fs}" fill="${col}" dominant-baseline="hanging">${el.text.split('\n').map((l, i) => `<tspan x="${n(b.x)}" y="${n(b.y + i * fs * 1.25 + fs * .1)}">${xe(l)}</tspan>`).join('')}</text>`);
    } else if (el.type === 'IMAGE'){
      const b = box(el), bytes = S.blobs.get(el.f.R); if (!bytes) continue;
      o.push(`<image x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" preserveAspectRatio="none" href="data:${sniffImage(bytes) || 'image/png'};base64,${b64enc(bytes)}"><title>${xe(el.alt || '')}</title></image>`);
    } else if (el.type === 'ARROW'){
      const A = current(el.f.FROM), B = current(el.f.TO);
      if (A?.type === 'NODE' && B?.type === 'NODE') curve(linkGeom(box(A), box(B)), col, lw(el), true);
      if (el.elabel){ const q = A?.type === 'NODE' && B?.type === 'NODE' ? linkGeom(box(A), box(B)) : null, g2 = arrowGeom(el);
        const m = q ? { x: (q.p0.x + 3 * q.c0.x + 3 * q.c1.x + q.p1.x) / 8, y: (q.p0.y + 3 * q.c0.y + 3 * q.c1.y + q.p1.y) / 8 } : g2 ? { x: (g2.a.x + g2.b.x) / 2, y: (g2.a.y + g2.b.y) / 2 } : null;
        if (m) o.push(`<text x="${n(m.x)}" y="${n(m.y)}" font-family="${xe(FONTS.sans)}" font-size="13" font-weight="500" fill="${TH.ink}" text-anchor="middle" dominant-baseline="central" paint-order="stroke" stroke="${TH.paper}" stroke-width="5">${xe(el.elabel)}</text>`); }
      else { const g = arrowGeom(el); if (!g) continue; o.push(`<line x1="${n(g.a.x)}" y1="${n(g.a.y)}" x2="${n(g.b.x)}" y2="${n(g.b.y)}" stroke="${col}" stroke-width="${lw(el)}" stroke-linecap="round"/>`, headSVG(g.a, g.b, 8 + lw(el) * 2, col, lw(el))); }
    } else if (el.type === 'NODE'){
      const b = box(el), L = nodeBox(el), K = L.K, ac = ecol(el) !== 'ink' ? col : null, k = el.ek;
      const fillN = { card: TH.panel, topic: mix(ac || TH.accent, .16), rect: mix(ac || TH.ink, .07), ellipse: mix(ac || TH.ink, .07), diamond: mix(ac || TH.ink, .07),
        sticky: ac ? mixHex(ac, '#ffffff', .35) : '#ffe066', button: ac || TH.ink, input: TH.panel, image: mix(TH.line, .5), frame: 'none' }[k];
      const strokeN = { card: ac || TH.line, topic: ac || TH.accent, rect: ac || TH.ink, ellipse: ac || TH.ink, diamond: ac || TH.ink, sticky: 'none', button: 'none', input: ac || TH.line, image: ac || TH.muted, frame: ac || TH.ink }[k];
      const sw = ['topic', 'rect', 'ellipse', 'diamond', 'frame'].includes(k) ? 2 : 1.5, attrs = `fill="${fillN}" stroke="${strokeN}" stroke-width="${sw}"`;
      if (k === 'ellipse') o.push(`<ellipse cx="${n(b.x + b.w / 2)}" cy="${n(b.y + b.h / 2)}" rx="${n(b.w / 2)}" ry="${n(b.h / 2)}" ${attrs}/>`);
      else if (k === 'diamond') o.push(`<polygon points="${n(b.x + b.w / 2)},${n(b.y)} ${n(b.x + b.w)},${n(b.y + b.h / 2)} ${n(b.x + b.w / 2)},${n(b.y + b.h)} ${n(b.x)},${n(b.y + b.h / 2)}" ${attrs}/>`);
      else {
        const rad = { card: 10, topic: b.h / 2, rect: 6, button: 8, input: 6, frame: 18 }[k] || 0;
        o.push(`<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(rad)}" ${attrs}/>`);
        if (k === 'card' && ac) o.push(`<rect x="${n(b.x)}" y="${n(b.y + 6)}" width="4" height="${n(b.h - 12)}" fill="${ac}"/>`);
        if (k === 'image') o.push(`<path d="M${n(b.x)} ${n(b.y)} L${n(b.x + b.w)} ${n(b.y + b.h)} M${n(b.x + b.w)} ${n(b.y)} L${n(b.x)} ${n(b.y + b.h)}" stroke="${TH.muted}" stroke-opacity=".5"/>`);
        if (k === 'frame') o.push(`<line x1="${n(b.x)}" y1="${n(b.y + 30)}" x2="${n(b.x + b.w)}" y2="${n(b.y + 30)}" stroke="${TH.line}"/>`);
      }
      const tcol = k === 'sticky' ? '#1d1d1f' : k === 'button' ? (ac ? '#fff' : TH.paper) : ['input', 'image', 'frame'].includes(k) ? TH.muted : TH.ink;
      const left = K.align === 'left', th = L.lines.length * L.lh;
      let ty = K.top ? b.y + K.pad[1] + L.lh / 2 : b.y + b.h / 2 - th / 2 + L.lh / 2; if (k === 'frame') ty = b.y + 15;
      const tx = left ? b.x + K.pad[0] + (k === 'card' && ac ? 4 : 0) : b.x + b.w / 2;
      o.push(`<text font-family="${xe(FONTS.sans)}" font-size="${K.font}" font-weight="${K.bold ? 600 : 400}" fill="${tcol}" text-anchor="${left ? 'start' : 'middle'}" dominant-baseline="central">${L.lines.map((l, i) => `<tspan x="${n(tx)}" y="${n(ty + i * L.lh)}">${xe(l)}</tspan>`).join('')}</text>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(bx.x)} ${n(bx.y)} ${n(bx.w)} ${n(bx.h)}" width="${Math.round(bx.w)}" height="${Math.round(bx.h)}">\n<title>Flux Canvas ${xe(canvasId)}</title>\n<rect x="${n(bx.x)}" y="${n(bx.y)}" width="${n(bx.w)}" height="${n(bx.h)}" fill="${TH.paper}"/>\n${o.join('\n')}\n</svg>`;
}
function exportSVG(){
  const svg = toSVG(), a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); a.download = `canvas-${canvasId}.svg`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`SVG exported · ${(svg.length / 1024).toFixed(1)} KB · if no download started, use “Copy SVG”`);
}
$('nodeBtn').onclick = () => setPlacing(placing === 'node' ? null : 'node');

