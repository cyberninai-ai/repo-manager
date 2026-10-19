'use strict';
// @module ui/palette — Command palette (⌘K) and its command list
// @uses everything it lists
/* palette */
const SW = c => `<span class="sw" style="background:${colorOf(c)}"></span>`;
function commands(){
  const L = [];
  const add = (g, t, run, o = {}) => L.push({ g, t, run, ...o });
  runHooks(PALETTE_HOOKS, add);   // feature commands (core/hooks) come first
  for (const c of Object.keys(COLORS)) add('color', c[0].toUpperCase() + c.slice(1), () => setColor(c), { sw: c, on: S.color === c });
  add('color', 'Custom hex…', async () => { const v = await ask('Hex colour', '', 'Six hex digits, e.g. 0b7285'); if (v && /^#?[0-9a-f]{6}$/i.test(v.trim())) S.color = v.trim().replace('#', '').toLowerCase(); else if (v) toast('Not a hex colour.'); });
  for (const [n, w] of [['Fine', 2], ['Medium', 4], ['Bold', 8], ['Marker', 16]]) add('width', `${n} · ${w}`, () => { S.width = w; }, { on: S.width === w });
  for (const [n, s] of [['Small', 16], ['Medium', 24], ['Large', 40], ['Title', 64]]) add('text', `${n} text · ${s}`, () => { S.textSize = s; }, { on: S.textSize === s });
  for (const f of Object.keys(FONTS)) add('text', `Font · ${f}`, () => { S.font = f; }, { on: S.font === f });
  add('shape', 'Fill shapes', () => { S.fill = !S.fill; }, { on: S.fill });
  add('tool', 'Select mode (tap to select, drag to move)', () => setMode(!S.lassoMode), { on: S.lassoMode, k: 'V / P' });
  add('insert', 'Rectangle at centre', () => kbInsert('rect'), { k: 'R' });
  add('insert', 'Circle at centre', () => kbInsert('circle'), { k: 'O' });
  add('insert', 'Text at centre', () => openText(viewCenter()), { k: 'T' });
  add('insert', 'Text tool (click to place)', () => setPlacing('text'));
  add('diagram', 'Diagram tool (click to place)', () => setPlacing('node'), { k: 'N' });
  for (const [k2, K2] of Object.entries(NODE_KINDS)) add('diagram', `Shape · ${K2.name}`, () => pickKind(k2), { on: S.nodeKind === k2 });
  add('diagram', 'Insert mind map', () => insertTemplate('mindmap'));
  add('diagram', 'Insert flowchart', () => insertTemplate('flow'));
  add('diagram', 'Insert wireframe: mobile screen', () => insertTemplate('mobile'));
  add('diagram', 'Insert wireframe: web page', () => insertTemplate('web'));
  add('diagram', 'Tidy diagram (auto layout)', () => { const n = soleNode(); if (n) tidy(n); else toast('Select a node of the diagram to tidy.'); }, { k: 'L' });
  add('share', 'Export SVG', exportSVG);
  add('diagram', 'Mind map from outline…', mindmapFromOutlinePrompt);
  add('edit', 'Copy', copySelection, { k: '⌘C' });
  add('edit', 'Paste', () => pasteClip(), { k: '⌘V' });
  add('edit', 'Duplicate', duplicateSelection, { k: '⌘D' });
  add('edit', 'Bring to front', () => reorder(true), { k: '⌘⇧↑' });
  add('edit', 'Send to back', () => reorder(false), { k: '⌘⇧↓' });
  add('edit', 'Lock / unlock selection', toggleLock, { k: '⌘⇧L' });
  for (const [a2, t2] of [['al-l', 'Align left'], ['al-c', 'Align centres'], ['al-r', 'Align right'], ['al-t', 'Align top'], ['al-m', 'Align middles'], ['al-b', 'Align bottom'], ['dist-h', 'Distribute horizontally'], ['dist-v', 'Distribute vertically']]) add('arrange', t2, () => alignSel(a2));
  add('tool', 'Eraser', () => setErasing(!erasing), { k: 'E', on: erasing });
  add('view', 'Overview map', () => $('zMini').click(), { on: miniOn });
  add('share', 'Copy SVG', async () => copy(toSVG(), 'SVG copied'));
  add('comment', 'Comment on selection / centre', commentOnSelection, { k: 'M' });
  add('comment', 'Comment tool (click to pin)', () => setPlacing('comment'));
  add('comment', 'Comments panel', () => toggleComments(), { on: $('comments').style.display === 'flex' });
  add('comment', 'Comment previews on canvas', () => { $('cmPrev').click(); }, { on: S.cmPrev });
  add('edit', 'Connect two selected elements', connectSel, { k: 'C' });
  add('edit', 'Select next element', () => { cycleSel(1); }, { k: 'Tab' });
  add('edit', 'Undo', undo, { k: '⌘Z' });
  add('edit', 'Redo', redo, { k: '⇧⌘Z' });
  add('edit', 'Select all', selectAll, { k: '⌘A' });
  add('edit', 'Revoke selection (-N-1)', revokeSelection, { k: 'Del' });
  add('edit', 'Group selection', groupSelection, { k: '⌘G' });
  add('edit', 'Ungroup selection', ungroupSelection, { k: '⇧⌘G' });
  add('edit', 'Revoke everything of mine', async () => { const mine = S.D.els.filter(e => e.author === S.me.id && !S.D.hidden.has(e.cid)); for (const e of mine) await setNeg(e.cid, true); if (mine.length) S.hist.push({ kind: 'revoke', cids: mine.map(e => e.cid) }); toast(`Cleared ${mine.length} of your elements; other people's work is untouched.`); });
  add('view', 'Show deleted elements (faded)', () => { S.showHidden = !S.showHidden; derive(); }, { on: S.showHidden });
  add('view', 'Show only my elements', () => { S.filter = new Set([S.me.id]); paintAuthors(); });
  add('view', 'Show all authors', () => { S.filter = null; paintAuthors(); }, { on: !S.filter });
  add('view', 'Reset view', () => { S.view = { x: -innerWidth / 2, y: -innerHeight / 2, zoom: 1 }; });
  add('view', 'Zoom to fit', zoomFit);
  add('view', 'Ledger', () => toggleLedger(), { k: '`', on: S.ledger });
  add('view', 'Theme · system / light / dark', cycleTheme);
  add('proof', 'Verify every signature', verifyAll);
  add('share', S.filter ? 'Export visible sub-canvas (.flux)' : 'Export canvas (.flux)', () => exportCanvas(true));
  add('share', 'Copy canvas pattern', async () => copy(await canvasText(true), 'Signed CANVAS pattern copied'));
  add('insert', 'Insert image…', () => $('imgFile').click(), { k: 'drop / paste' });
  add('share', 'Import .flux file', () => $('file').click());
  const hex = $('palIn').value.match(/\b#?([0-9a-f]{6})\b/i);
  if (hex) add('color', `Use #${hex[1]}`, () => { S.color = hex[1].toLowerCase(); }, { sw: hex[1] });
  if (/^https?:/.test(location.href)) add('share', 'Copy canvas link', () => copy(location.href.split('#')[0] + '#' + canvasId, 'Link copied. Open it in another tab to draw together.'));
  add('share', 'Copy canvas id', () => copy(canvasId, 'Canvas id copied'));
  add('canvas', 'New canvas', () => createOwnedCanvas());
  add('canvas', 'Open canvas by id…', async () => { let v = await ask('Canvas id'); v = (v || '').trim().replace(/^.*#/, ''); if (/^[a-z0-9]{6,32}$/.test(v)) switchCanvas(v); else if (v) toast('Not a canvas id.'); });
  add('identity', 'Copy my public key', () => copy(S.me.id, 'Public key copied'));
  add('identity', 'New identity for this tab', async () => {
    const me = await newTabIdentity();
    S.me = me; S.hist = []; S.redo = []; paintAuthors(); toast(`Now drawing as ${short(me.id)} in this tab (${me.alg === 'ed' ? 'Ed25519' : 'ECDSA P-256'}).`);
  });
  add('help', 'Gestures, keyboard & help', () => toggleHelp(true), { k: '?' });
  return L;
}
let palItems = [], palIdx = 0;
function openPalette(){ $('pal').style.display = 'block'; $('palIn').value = ''; paintPalette(); $('palIn').focus(); }
function closePalette(){ $('pal').style.display = 'none'; cv.focus({ preventScroll: true }); }
function paintPalette(){
  const q = $('palIn').value.toLowerCase().split(/\s+/).filter(Boolean);
  palItems = commands().filter(c => q.every(w => (c.g + ' ' + c.t).toLowerCase().includes(w)));
  palIdx = Math.min(palIdx, Math.max(0, palItems.length - 1));
  $('palList').innerHTML = palItems.map((c, i) => `<li class="${i === palIdx ? 'on' : ''}" data-i="${i}" id="pal-${i}" role="option" aria-selected="${i === palIdx}" aria-checked="${c.on ? 'true' : 'false'}"><span class="chk" aria-hidden="true">${c.on ? '✓' : ''}</span><span class="g">${c.g}</span>${c.sw ? SW(c.sw) : ''}<span>${esc(c.t)}</span>${c.k ? `<span class="k">${c.k}</span>` : ''}</li>`).join('')
    || '<li role="option" aria-disabled="true"><span class="g"></span>No command</li>';
  $('palIn').setAttribute('aria-activedescendant', palItems.length ? 'pal-' + palIdx : '');
  $('palList').querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}
async function runPal(i){ const c = palItems[i]; if (!c) return; closePalette(); await c.run(); barShown = ''; dirty = true; }
$('palIn').addEventListener('input', () => { palIdx = 0; paintPalette(); });
$('palIn').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'ArrowDown'){ e.preventDefault(); palIdx = Math.min(palItems.length - 1, palIdx + 1); paintPalette(); }
  else if (e.key === 'ArrowUp'){ e.preventDefault(); palIdx = Math.max(0, palIdx - 1); paintPalette(); }
  else if (e.key === 'Enter'){ e.preventDefault(); runPal(palIdx); }
  else if (e.key === 'Escape') closePalette();
});
$('palList').addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) runPal(+li.dataset.i); });
$('pal').addEventListener('pointerdown', e => { if (e.target.id === 'pal') closePalette(); });
function toggleHelp(force){ const on = force ?? $('help').style.display !== 'block'; $('help').style.display = on ? 'block' : 'none'; if (on) $('helpClose').focus(); else cv.focus({ preventScroll: true }); }
$('helpClose').onclick = () => toggleHelp(false);
$('askOk').onclick = () => closeAsk($('askTa').hidden ? $('askIn').value : $('askTa').value);
$('askTa').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); closeAsk($('askTa').value); } });
$('askIn').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing){ e.preventDefault(); closeAsk($('askIn').value); } });
$('askNo').onclick = () => closeAsk(null);
$('ask').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeAsk(null); });
$('ask').addEventListener('pointerdown', e => { if (e.target.id === 'ask') closeAsk(null); });
$('addImg').onclick = () => $('imgFile').click();

