'use strict';
// @module features/moodboard — Moodboards: extract a five-colour palette from an image (swatch nodes), masonry layout,
// moodboard template and example with generated imagery.
// @uses hooks, builders, blobs (decodeImage), diagrams (swatch kind), brainstorm (moveItems)

const hex2 = v => Math.round(v).toString(16).padStart(2, '0');
// k-means on a 64×64 downsample, seeded with far-apart colours; clusters sorted by size.
async function paletteOf(el, k = 5){
  const bytes = S.blobs.get(el.f.R); if (!bytes) return [];
  const src = imageOf(el.f.R) || await decodeImage(typedBlob(bytes));
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data, px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) px.push([d[i], d[i + 1], d[i + 2]]);
  if (!px.length) return [];
  const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const mean = px.reduce((m, p) => [m[0] + p[0] / px.length, m[1] + p[1] / px.length, m[2] + p[2] / px.length], [0, 0, 0]);
  const cent = [px.reduce((best, p) => dist(p, mean) > dist(best, mean) ? p : best, px[0])];
  while (cent.length < k){ let best = px[0], bd = -1; for (const p of px){ const m = Math.min(...cent.map(q => dist(p, q))); if (m > bd){ bd = m; best = p; } } cent.push(best); }
  let groups = [];
  for (let it = 0; it < 10; it++){
    groups = cent.map(() => []);
    for (const p of px){ let bi = 0, bd = Infinity; cent.forEach((q, i) => { const dd = dist(p, q); if (dd < bd){ bd = dd; bi = i; } }); groups[bi].push(p); }
    groups.forEach((gr, i) => { if (gr.length) cent[i] = [0, 1, 2].map(j => gr.reduce((a, p) => a + p[j], 0) / gr.length); });
  }
  return cent.map((q, i) => ({ hex: q.map(hex2).join(''), n: groups[i].length })).filter(x => x.n).sort((a, b) => b.n - a.n).map(x => x.hex);
}
async function extractPalette(el, at = null){
  el = current(el.cid);
  const cols = await paletteOf(el); if (!cols.length){ toast('That image has no readable pixels yet.'); return []; }
  const b = box(el), p = at || { x: b.x, y: b.y + b.h + 20 }, made = [];
  for (const [i, h] of cols.entries()) made.push(await mk('swatch', p.x + i * 118, p.y, '#' + h.toUpperCase(), { color: h }));
  S.hist.push({ kind: 'creates', cids: made }); S.redo = [];
  say(`Palette: ${cols.map(c => '#' + c).join(', ')}. ${made.length} swatches added${at ? '' : ' under the image'}. Signed.`);
  return made;
}
// Masonry: keep sizes, fill the shortest column next, in reading order.
async function masonry(rs){
  const els = arrangeable(rs); if (els.length < 3){ toast('Select three or more images or notes.'); return; }
  const bs = els.map(e => ({ e, b: box(e) })).sort((a, b) => a.b.y - b.b.y || a.b.x - b.b.x);
  const cols = Math.max(2, Math.min(5, Math.round(Math.sqrt(bs.length)))), colW = Math.max(...bs.map(x => x.b.w)), gap = 16;
  const ox = Math.min(...bs.map(x => x.b.x)), oy = Math.min(...bs.map(x => x.b.y)), hgt = new Array(cols).fill(0);
  const items = bs.map(x => { const ci = hgt.indexOf(Math.min(...hgt)); const it = { t: x.e.cid, dx: Math.round(ox + ci * (colW + gap) - x.b.x), dy: Math.round(oy + hgt[ci] - x.b.y) }; hgt[ci] += x.b.h + gap; return it; });
  await moveItems(items, `Masonry layout of ${els.length}`);
}
TOOLBAR_HOOKS.push((rs, one, B) => {
  let h = '';
  if (one && one.type === 'IMAGE') h += B('palette', 'palette', 'Extract colour palette');
  if (rs.filter(r => r.type !== 'ARROW').length >= 3) h += B('masonry', 'masonry', 'Masonry layout');
  return h;
});
TOOLBAR_ACTIONS.palette = rs => extractPalette(rs[0]);
TOOLBAR_ACTIONS.masonry = rs => masonry(rs);
PALETTE_HOOKS.push(add => {
  add('moodboard', 'Extract colour palette from selected image', () => { const el = S.sel.size === 1 && S.records.get([...S.sel][0]); if (el?.type === 'IMAGE') extractPalette(el); else toast('Select one image first.'); });
  add('moodboard', 'Masonry layout of selection', () => masonry([...S.sel].map(c => S.records.get(c))));
});

TEMPLATES.push({ id: 'moodboard', name: 'Moodboard', icon: '▥', blurb: 'Image slots, a palette, keywords and type. Drop images in, extract palettes.', build: async c => {
  const f = await mk('frame', c.x - 520, c.y - 340, 'Moodboard', { W: 1040, H: 680 });
  const ids = [f];
  for (const [x, y, w, h, t] of [[20, 50, 300, 200, 'Drop an image'], [340, 50, 220, 300, 'Texture'], [580, 50, 300, 180, 'Place'], [20, 270, 300, 160, 'People']]) ids.push(await mk('image', c.x - 520 + x, c.y - 340 + y, t, { W: w, H: h }));
  for (const [i, h] of ['1d3557', '457b9d', 'a8dadc', 'f1faee', 'e63946'].entries()) ids.push(await mk('swatch', c.x - 180 + i * 118, c.y + 40, '#' + h.toUpperCase(), { color: h }));
  ids.push(await mk('sticky', c.x - 500, c.y + 120, 'Keywords: calm · precise · warm', { color: 'orange' }));
  ids.push(await mk('card', c.x + 320, c.y - 280, 'Type: a humanist sans for UI, a mono for data', { W: 180 }));
  await groupAll(ids);
} });
EXAMPLES.push({ id: 'brand', title: 'Brand refresh — moodboard', icon: '▥', blurb: 'Generated imagery, palettes extracted from it, keywords, reactions and a decision note.', build: async ([ana, ben, chen]) => {
  const c = center0(), x0 = c.x - 560, y0 = c.y - 380;
  await by(ana, () => mk('frame', x0 - 30, y0 - 60, 'Brand refresh · “calm technology”', { W: 1180, H: 940 }));
  const imgs = [];
  await by(ana, async () => {
    imgs.push(await scene('dusk', ['#283c63', '#928a97', '#f88f01', '#fbe8d3', '#3d5a80', '#293241', '#1b263b'], x0, y0, 330, 220, 'Dusk over layered hills'));
    imgs.push(await scene('sea', ['#a8dadc', '#e6f4f1', '#457b9d', '#1d3557', '#f1faee'], x0 + 350, y0, 240, 300, 'Quiet sea at noon'));
  });
  await by(ben, async () => {
    imgs.push(await scene('dunes', ['#fbe3c4', '#f2c48d', '#e09f5c', '#c97b3d', '#8c4f24'], x0 + 610, y0, 330, 200, 'Warm dunes'));
    imgs.push(await scene('circles', ['#f4f1de', '#e07a5f', '#3d405b', '#81b29a', '#f2cc8f'], x0, y0 + 320, 330, 240, 'Soft overlapping shapes'));
  });
  await by(chen, async () => imgs.push(await scene('room', ['#eae4d9', '#b8a990', '#88a0a8', '#5f4b3c', '#2d3a3a', '#e8b04f'], x0 + 350, y0 + 320, 330, 240, 'Calm studio interior')));
  await tick();
  await by(ana, async () => { await extractPalette(S.records.get(imgs[0]), { x: x0, y: y0 + 590 }); S.hist = []; });
  await by(ben, async () => { await extractPalette(S.records.get(imgs[2]), { x: x0, y: y0 + 730 }); S.hist = []; });
  await by(chen, async () => {
    await mk('sticky', x0 + 700, y0 + 320, 'Keywords: calm · precise · warm · human', { color: 'orange' });
    await mk('sticky', x0 + 880, y0 + 320, 'Avoid: neon, gradients on text, stock handshakes', { color: 'pink' });
  });
  await tick();
  await by(ben, async () => { await setReact(imgs[0], 'love', true); await setReact(imgs[1], 'love', true); });
  await by(chen, async () => { await setReact(imgs[0], 'love', true); await setReact(imgs[3], 'q', true); });
  const t = await by(ana, () => noteOn(imgs[0], 'Proposal: lead with the dusk palette for the site, sea for product UI.'));
  await by(ben, () => replyTo(t, 'Agree. The orange works as our single accent.'));
} });
