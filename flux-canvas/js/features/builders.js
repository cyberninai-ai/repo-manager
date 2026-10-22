'use strict';
// @module features/builders — Helpers for templates and examples: nodes, connections, frames, groups, comments, votes and
// generated illustrations, created as ordinary signed records but kept out of the undo history.
// @uses diagrams (commitNode), commands (commitArrow, groupSelection, commitComment)

const tick = () => new Promise(r => setTimeout(r, 0));   // let derive() catch up
async function mk(kind, x, y, label, o = {}){
  const cid = await commitNode({ kind, x, y, label, color: o.color || 'ink', parent: o.parent || null, W: o.W || 0, H: o.H || 0 });
  S.hist.pop(); return cid;
}
async function link(a, b, label = ''){ const cid = await commitArrow(S.records.get(a), S.records.get(b), label); S.hist.pop(); return cid; }
async function groupAll(cids){ await tick(); S.sel = new Set(cids.filter(Boolean)); await groupSelection(); S.hist.pop(); S.sel.clear(); }
async function noteOn(cid, text, re = null){ await tick(); const el = S.records.get(cid), b = box(el); const c = await commitComment({ on: cid, x: b.w - 6, y: 4, text, re }); S.hist.pop(); return c; }
async function replyTo(root, text){ const t = S.records.get(root); const c = await commitComment({ on: t.on, x: t.x, y: t.y, text, re: root }); S.hist.pop(); return c; }
// several authors at once: run fn as each author in turn
async function by(author, fn){ return asAuthor(author, fn); }
const center0 = () => viewCenter();

/* generated illustrations: small JPEG scenes so examples have real images (and real palettes) */
const SCENES = {
  dusk(g, w, h, p){ const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, p[0]); gr.addColorStop(.6, p[1]); gr.addColorStop(1, p[2]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = p[3]; g.beginPath(); g.arc(w * .68, h * .55, h * .14, 0, Math.PI * 2); g.fill();
    [[.62, p[4]], [.72, p[5]], [.84, p[6]]].forEach(([y0, c], i) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * y0);
      for (let x = 0; x <= w; x += w / 8) g.quadraticCurveTo(x + w / 16, h * (y0 - .08 + (i % 2) * .05), x + w / 8, h * (y0 + ((x / w * 7 + i) % 2 ? .02 : -.03))); g.lineTo(w, h); g.fill(); }); },
  sea(g, w, h, p){ const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, p[0]); gr.addColorStop(.45, p[1]); gr.addColorStop(.46, p[2]); gr.addColorStop(1, p[3]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = p[4]; g.lineWidth = 3; for (let y = h * .55; y < h; y += h * .07){ g.beginPath(); for (let x = 0; x <= w; x += 12) g.lineTo(x, y + Math.sin(x / 22 + y) * 4); g.globalAlpha = .55; g.stroke(); } g.globalAlpha = 1; },
  dunes(g, w, h, p){ g.fillStyle = p[0]; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++){ g.fillStyle = p[1 + i]; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * (.45 + i * .14)); g.bezierCurveTo(w * .3, h * (.3 + i * .14), w * .6, h * (.65 + i * .1), w, h * (.4 + i * .15)); g.lineTo(w, h); g.fill(); } },
  circles(g, w, h, p){ g.fillStyle = p[0]; g.fillRect(0, 0, w, h);
    [[.3, .4, .32], [.62, .55, .38], [.45, .75, .22], [.8, .25, .18]].forEach(([x, y, r], i) => { g.globalAlpha = .85; g.fillStyle = p[1 + i % (p.length - 1)]; g.beginPath(); g.arc(w * x, h * y, h * r, 0, Math.PI * 2); g.fill(); }); g.globalAlpha = 1; },
  room(g, w, h, p){ g.fillStyle = p[0]; g.fillRect(0, 0, w, h); g.fillStyle = p[1]; g.fillRect(0, h * .72, w, h * .28);
    g.fillStyle = p[2]; g.fillRect(w * .1, h * .18, w * .28, h * .34); g.fillStyle = p[3]; g.fillRect(w * .55, h * .42, w * .36, h * .3); g.fillStyle = p[4]; g.fillRect(w * .58, h * .3, w * .1, h * .12);
    g.fillStyle = p[5]; g.beginPath(); g.arc(w * .24, h * .35, h * .07, 0, Math.PI * 2); g.fill(); },
  people(g, w, h, p){ g.fillStyle = p[0]; g.fillRect(0, 0, w, h);
    [[.3, p[1]], [.5, p[2]], [.7, p[3]]].forEach(([x, c]) => { g.fillStyle = c; g.beginPath(); g.arc(w * x, h * .38, h * .11, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(w * x, h * .82, h * .17, h * .26, 0, Math.PI, 0); g.fill(); });
    g.fillStyle = p[4]; g.fillRect(w * .15, h * .7, w * .7, h * .06); },
};
async function sceneBytes(kind, palette, w = 480, h = 320){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  SCENES[kind](c.getContext('2d'), w, h, palette);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .86));
  return new Uint8Array(await blob.arrayBuffer());
}
// Place image bytes as an IMAGE record (the blob travels with it), without the alt-text dialog.
async function placeImage(bytes, x, y, w, h, alt){
  const R = await cidOf(bytes);
  const raw = await signed('IMAGE', [['I', S.me.id], ['R', R], ['X', encInt(Math.round(x))], ['Y', encInt(Math.round(y))], ['W', Math.round(w)], ['H', Math.round(h)], ['M', encTxt(alt)], ['Z', ++S.lamport], ['T', Date.now()]]);
  return publish(raw, { [R]: bytes });
}
async function scene(kind, palette, x, y, w, h, alt){ return placeImage(await sceneBytes(kind, palette, Math.round(w * 1.5), Math.round(h * 1.5)), x, y, w, h, alt); }
