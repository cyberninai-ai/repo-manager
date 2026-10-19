'use strict';
// @module ui/toolbar — The tool model (select, hand, draw, eraser, rectangle, ellipse, line, sticky note, shapes, text,
// comment), the tool dock, contextual hints, tooltips, the menu component, the Share menu and the welcome card.
// @uses interaction (setMode, setPlacing, placing), eraser (erasing), canvases, diagrams, feedback, story, audit

S.shapeTool = null;   // 'rect' | 'ellipse' | 'line' while that tool is active
S.handTool = false;
const TOOLS = {
  select: { name: 'Select', hint: 'Click to select · drag empty space to select an area · double-click for a note' },
  hand: { name: 'Hand', hint: 'Drag to pan · pinch or ⌘-scroll to zoom · hold Space with any tool' },
  pen: { name: 'Draw', hint: 'Drag to draw · start on a shape’s edge to connect it' },
  eraser: { name: 'Eraser', hint: 'Drag across your own elements to erase them · undo brings them back' },
  rect: { name: 'Rectangle', hint: 'Drag to draw a rectangle' },
  ellipse: { name: 'Ellipse', hint: 'Drag to draw an ellipse' },
  line: { name: 'Line', hint: 'Drag from one element to another to connect them · Shift snaps to 45°' },
  note: { name: 'Sticky note', hint: 'Click to place a note, then type · Tab adds a connected note' },
  node: { name: 'Shapes and cards', hint: 'Pick a shape below, click to place it and type · Tab adds a child' },
  text: { name: 'Text', hint: 'Click where the text goes · Enter to finish' },
  comment: { name: 'Comment', hint: 'Click an element or a spot to start a thread' },
};
function currentTool(){
  if (S.handTool) return 'hand';
  if (erasing) return 'eraser';
  if (placing === 'text') return 'text';
  if (placing === 'comment') return 'comment';
  if (placing === 'node') return S.nodeKind === 'sticky' ? 'note' : 'node';
  if (S.shapeTool) return S.shapeTool;
  return S.lassoMode ? 'select' : 'pen';
}
function setTool(t){
  if (!TOOLS[t]) return;
  if (taOpen()) finishText(true);
  S.handTool = false; S.shapeTool = null; erasing = false; placing = null;
  switch (t){
    case 'select': S.lassoMode = true; break;
    case 'hand': S.handTool = true; break;
    case 'pen': S.lassoMode = false; break;
    case 'eraser': S.lassoMode = false; erasing = true; S.sel.clear(); break;
    case 'rect': case 'ellipse': case 'line': S.lassoMode = false; S.shapeTool = t; S.sel.clear(); break;
    case 'note': S.lassoMode = true; S.nodeKind = 'sticky'; placing = 'node'; break;
    case 'node': S.lassoMode = true; if (S.nodeKind === 'sticky') S.nodeKind = 'card'; placing = 'node'; break;
    case 'text': S.lassoMode = true; placing = 'text'; break;
    case 'comment': S.lassoMode = true; placing = 'comment'; break;
  }
  setCursor(); paintTools(); dirty = true;
  say(`${TOOLS[t].name}. ${TOOLS[t].hint}.`);
}
let lastTool = null;
function paintTools(){
  const t = currentTool();
  for (const b of document.querySelectorAll('#tools [data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  if (t !== lastTool){ if (lastTool !== null) showHint(TOOLS[t].hint); lastTool = t; barShown = ''; }
  dirty = true;
}
let hintT = 0;
function showHint(text){
  const h = $('hint'); h.textContent = text; h.classList.add('on');
  clearTimeout(hintT); hintT = setTimeout(() => h.classList.remove('on'), 3800);
}
$('tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
// after a shape is drawn with its tool, hand back to Select with the new shape selected
function afterToolCreate(g, cid){ if (g.viaTool && cid){ setTool('select'); S.sel = new Set([cid]); announceSel(); dirty = true; } }
KEY_HOOKS.push((e, c) => {
  if (c.onCanvas && e.key === 'Escape' && (S.shapeTool || S.handTool)){ e.preventDefault(); setTool('select'); return true; }
  return false;
});

/* tooltips: label plus shortcut, for every icon button; aria-hidden because the button already has the name */
const tipEl = $('tip'); let tipT = 0, tipFor = null;
const TIP_SCOPE = '#tools button, #corner button, #titlebar button, #zoomui button, #insp button, #bar button, #present button, #history button, [data-tip]';
function tipParts(el){
  let label = el.dataset.tip || el.getAttribute('aria-label') || el.textContent.trim(), key = el.dataset.key || '';
  const m = label.match(/^(.*?)\s*\(([^()]+)\)\s*$/); if (m && !key){ label = m[1]; key = m[2]; }
  return { label, key };
}
function showTip(el){
  const { label, key } = tipParts(el); if (!label) return;
  tipEl.innerHTML = `${esc(label)}${key ? `<kbd>${esc(key)}</kbd>` : ''}`; tipEl.hidden = false;
  const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, below = r.top < innerHeight / 2;
  tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  tipEl.style.top = (below ? r.bottom + 8 : r.top - h - 8) + 'px';
}
function hideTip(){ clearTimeout(tipT); tipFor = null; tipEl.hidden = true; }
document.addEventListener('pointerover', e => {
  const el = e.target.closest?.(TIP_SCOPE);
  if (el === tipFor) return; hideTip(); if (!el) return;
  tipFor = el; tipT = setTimeout(() => showTip(el), 420);
});
document.addEventListener('focusin', e => { const el = e.target.closest?.(TIP_SCOPE); hideTip(); if (el && el.matches(':focus-visible')){ tipFor = el; tipT = setTimeout(() => showTip(el), 250); } });
document.addEventListener('pointerdown', hideTip, true);
document.addEventListener('focusout', hideTip);
addEventListener('wheel', hideTip, { passive: true });

/* menu: role=menu, arrow keys, Home/End, Escape returns focus to the button that opened it */
let menuItems = [], menuAnchor = null;
function openMenu(anchor, items){
  const m = $('menu'); menuItems = items; menuAnchor = anchor;
  m.innerHTML = items.map((it, i) => it === '-' ? '<div class="msep" role="separator"></div>'
    : `<button role="menuitem" tabindex="-1" data-i="${i}">${ic(it.icon || 'blank')}<span>${esc(it.label)}</span>${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}</button>`).join('');
  m.hidden = false; anchor.setAttribute('aria-expanded', 'true');
  const r = anchor.getBoundingClientRect();
  m.style.top = (r.bottom + 6) + 'px'; m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
  m.querySelector('[role=menuitem]')?.focus();
}
function closeMenu(back = true){
  const m = $('menu'); if (m.hidden) return;
  m.hidden = true; menuAnchor?.setAttribute('aria-expanded', 'false'); if (back) menuAnchor?.focus();
}
$('menu').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const it = menuItems[+b.dataset.i]; closeMenu(false); it.run(); });
$('menu').addEventListener('keydown', e => {
  e.stopPropagation();
  const items = [...$('menu').querySelectorAll('[role=menuitem]')], i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown'){ e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === 'ArrowUp'){ e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === 'Home'){ e.preventDefault(); items[0].focus(); }
  else if (e.key === 'End'){ e.preventDefault(); items[items.length - 1].focus(); }
  else if (e.key === 'Escape'){ e.preventDefault(); closeMenu(); }
  else if (e.key === 'Tab') closeMenu(false);
});
document.addEventListener('pointerdown', e => { if (!$('menu').hidden && !e.target.closest('#menu') && e.target !== menuAnchor && !menuAnchor?.contains(e.target)) closeMenu(false); }, true);

const shareItems = () => [
  ...(/^https?:/.test(location.href) ? [{ label: 'Copy link to this canvas', icon: 'link', run: () => copy(location.href.split('#')[0] + '#' + canvasId, 'Link copied. Anyone who opens it in this browser joins the canvas.') }] : [{ label: 'Copy canvas id', icon: 'link', run: () => copy(canvasId, 'Canvas id copied') }]),
  { label: 'People and permissions…', icon: 'users', run: openPeople },
  '-',
  { label: 'Export canvas (.flux, signed)', icon: 'download', run: () => exportCanvas(true) },
  { label: 'Export SVG', icon: 'image', run: exportSVG },
  { label: 'Copy SVG', icon: 'copy', run: () => copy(toSVG(), 'SVG copied') },
  '-',
  { label: 'Summary as Markdown', icon: 'doc', key: '⇧S', run: showSummary },
  { label: 'Audit report', icon: 'audit', run: () => openReport(`Audit report — ${canvasTitle()}`, auditReport(), 'audit-report.md') },
  { label: 'Present frames', icon: 'present', key: 'F5', run: present },
  { label: 'History', icon: 'history', key: '⇧H', run: openHistory },
  { label: 'Signed records (ledger)', icon: 'ledger', key: '`', run: () => toggleLedger(true) },
  '-',
  { label: 'Import a .flux file', icon: 'upload', run: () => $('file').click() },
  { label: 'Switch theme', icon: 'moon', run: cycleTheme },
  { label: S.grid ? 'Hide dot grid' : 'Show dot grid', icon: 'grid', run: toggleGrid },
  { label: 'Keyboard shortcuts', icon: 'help', key: '?', run: () => toggleHelp(true) },
];
$('shareBtn').onclick = () => $('menu').hidden ? openMenu($('shareBtn'), shareItems()) : closeMenu();

function toggleGrid(){ S.grid = !S.grid; try { localStorage.setItem('flux:grid', S.grid ? '1' : '0'); } catch {} dirty = true; say(S.grid ? 'Dot grid on' : 'Dot grid off'); }
PALETTE_HOOKS.push(add => {
  add('view', S.grid ? 'Hide dot grid' : 'Show dot grid', toggleGrid);
  for (const [t, T] of Object.entries(TOOLS)) add('tool', T.name, () => setTool(t), { on: currentTool() === t });
});

/* welcome card: quick starts build into this (empty) canvas; it steps aside on the first touch or key */
S.touched = false;
const touchCanvas = e => { if (S.touched || e.target.closest?.('#empty .em-card')) return; S.touched = true; $('empty').hidden = true; };
addEventListener('pointerdown', touchCanvas, true);
addEventListener('keydown', touchCanvas, true);
$('empty').addEventListener('click', async e => {
  const b = e.target.closest('[data-q]'); if (!b) return;
  const t = TEMPLATES.find(x => x.id === b.dataset.q); if (!t) return;
  S.touched = true; $('empty').hidden = true;
  await setTitle(t.name, t.id); await t.build(viewCenter()); S.hist = []; await tick();
  zoomFit(); setTool('select'); toast(`${t.name} ready`);
});
paintTools();
