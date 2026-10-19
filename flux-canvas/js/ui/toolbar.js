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
  node: { name: 'Shape', hint: 'Drag to draw a shape, or click and type · pick the kind below' },
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
function setTool(t, quiet = false){
  if (!TOOLS[t]) return;
  if (taOpen()) finishText(true);
  S.handTool = false; S.shapeTool = null; erasing = false; placing = null;
  if (t !== 'select' && t !== 'hand' && S.sel.size){ S.sel.clear(); announceSel(); }   // a creation tool's colour, kind and fill are for what you make next
  switch (t){
    case 'select': S.lassoMode = true; break;
    case 'hand': S.handTool = true; break;
    case 'pen': S.lassoMode = false; break;
    case 'eraser': S.lassoMode = false; erasing = true; S.sel.clear(); break;
    case 'rect': case 'ellipse': case 'line': S.lassoMode = false; S.shapeTool = t; S.sel.clear(); break;
    case 'note': S.lassoMode = true; S.nodeKind = 'sticky'; placing = 'node'; break;
    case 'node': S.lassoMode = true; if (S.nodeKind === 'sticky') S.nodeKind = 'rect'; placing = 'node'; break;
    case 'text': S.lassoMode = true; placing = 'text'; break;
    case 'comment': S.lassoMode = true; placing = 'comment'; break;
  }
  setCursor(); paintTools(); dirty = true;
  say(`${TOOLS[t].name}. ${TOOLS[t].hint}.`);
  if (!quiet && t !== 'select' && (hintSeen[t] || 0) < 2){ showHint(TOOLS[t].hint); hintSeen[t] = (hintSeen[t] || 0) + 1; try { localStorage.setItem('flux:hints', JSON.stringify(hintSeen)); } catch {} }
}
let lastTool = null;
// a tool's hint shows the first two times you pick it, then never again; never when the app switches tools for you
const hintSeen = (() => { try { return JSON.parse(localStorage.getItem('flux:hints') || '{}'); } catch { return {}; } })();
function paintTools(){
  const t = currentTool();
  for (const b of document.querySelectorAll('#tools [data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  if (t !== lastTool){
    lastTool = t; barShown = '';
  }
  dirty = true;
}
let hintT = 0;
function showHint(text){
  const h = $('hint'); h.textContent = text; h.classList.add('on');
  clearTimeout(hintT); hintT = setTimeout(() => h.classList.remove('on'), 2600);
}
$('tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
// after a shape is drawn with its tool, hand back to Select with the new shape selected
function afterToolCreate(g, cid){ if (g.viaTool && cid){ setTool('select', true); S.sel = new Set([cid]); announceSel(); dirty = true; } }
KEY_HOOKS.push((e, c) => {
  if (c.onCanvas && e.key === 'Escape' && (S.shapeTool || S.handTool)){ e.preventDefault(); setTool('select', true); return true; }
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
function openMenu(anchor, items, at = null){
  const m = $('menu'); menuItems = items; menuAnchor = anchor;
  m.innerHTML = items.map((it, i) => it === '-' ? '<div class="msep" role="separator"></div>' : it.head ? `<div class="mhead" role="presentation">${esc(it.head)}</div>`
    : `<button role="${it.on !== undefined ? 'menuitemcheckbox' : 'menuitem'}" tabindex="-1" data-i="${i}"${it.on !== undefined ? ` aria-checked="${!!it.on}"` : ''}>${it.sw ? `<i class="msw" style="background:${it.sw}"></i>` : ic(it.icon || 'blank')}<span>${esc(it.label)}</span>${it.on ? ic('check', 'mchk') : ''}${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}</button>`).join('');
  m.hidden = false; if (!at) anchor.setAttribute('aria-expanded', 'true');
  if (at){   // a context menu opens at the pointer, flipped to stay on screen
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, at.x)) + 'px';
    m.style.top = Math.max(8, at.y + m.offsetHeight > innerHeight - 8 ? at.y - m.offsetHeight : at.y) + 'px';
  } else {
    const r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + 'px'; m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
  }
  m.querySelector('[role^=menuitem]')?.focus();
}
function closeMenu(back = true){
  const m = $('menu'); if (m.hidden) return;
  m.hidden = true; if (menuAnchor !== cv) menuAnchor?.setAttribute('aria-expanded', 'false'); if (back) menuAnchor?.focus({ preventScroll: true });
}
$('menu').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const it = menuItems[+b.dataset.i]; closeMenu(false); it.run(); });
$('menu').addEventListener('keydown', e => {
  e.stopPropagation();
  const items = [...$('menu').querySelectorAll('[role^=menuitem]')], i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown'){ e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === 'ArrowUp'){ e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === 'Home'){ e.preventDefault(); items[0].focus(); }
  else if (e.key === 'End'){ e.preventDefault(); items[items.length - 1].focus(); }
  else if (e.key === 'Escape'){ e.preventDefault(); closeMenu(); }
  else if (e.key === 'Tab') closeMenu(false);
});
document.addEventListener('pointerdown', e => { if (!$('menu').hidden && !e.target.closest('#menu') && (menuAnchor === cv || (e.target !== menuAnchor && !menuAnchor?.contains(e.target)))) closeMenu(false); }, true);

const shareItems = () => [
  ...(/^https?:/.test(location.href) ? [{ label: 'Copy link to this canvas', icon: 'link', run: () => copy(location.href.split('#')[0] + '#' + canvasId, 'Link copied. Anyone who opens it in this browser joins the canvas.') }] : [{ label: 'Copy canvas id', icon: 'link', run: () => copy(canvasId, 'Canvas id copied') }]),
  { label: 'Live session and invites…', icon: 'wifi', run: () => toggleSession(true) },
  { label: 'People and permissions…', icon: 'users', run: openPeople },
  NET.state === 'off' ? { label: 'Go live over a relay…', icon: 'wifi', run: askRelay } : { label: 'Disconnect from the relay', icon: 'wifi', run: () => { netClose(true); toast('Offline. Your work stays here and syncs again when you go live.'); } },
  '-',
  { label: 'Download canvas file (.flux)', icon: 'download', run: () => exportCanvas(true) },
  { label: 'Export SVG', icon: 'image', run: exportSVG },
  { label: 'Copy SVG', icon: 'copy', run: () => copy(toSVG(), 'SVG copied') },
];
// everything that isn't sharing: views, reports, files, settings
const moreMenuItems = () => [
  { label: 'Search and commands', icon: 'search', key: '⌘K', run: openPalette },
  { label: 'Outline of the canvas', icon: 'list', key: '⇧O', run: () => toggleStructure(true) },
  { label: 'Present frames', icon: 'present', key: 'F5', run: present },
  { label: 'History', icon: 'history', key: '⇧H', run: openHistory },
  '-',
  { label: 'Summary as Markdown', icon: 'doc', key: '⇧S', run: showSummary },
  { label: 'Audit report', icon: 'audit', run: () => openReport(`Audit report — ${canvasTitle()}`, auditReport(), 'audit-report.md') },
  { label: 'Activity log', icon: 'ledger', key: '`', run: () => toggleLedger(true) },
  '-',
  { label: 'Open a .flux file…', icon: 'upload', run: () => $('file').click() },
  { label: 'Switch theme', icon: 'moon', run: cycleTheme },
  { label: S.grid ? 'Hide dot grid' : 'Show dot grid', icon: 'grid', run: toggleGrid },
  { label: 'Keyboard shortcuts', icon: 'help', key: '?', run: () => toggleHelp(true) },
];
async function askRelay(){
  const v = await ask('Relay address', relayDefault() || 'ws://localhost:8787', 'Everyone who opens this canvas through the same relay sees changes live. Start one with: npm run relay. The relay passes work along but can’t change it.');
  if (v){ netConnect(v); toast('Connecting… share the canvas link so others join the same canvas.'); }
}
$('moreBtn').onclick = () => $('menu').hidden ? openMenu($('moreBtn'), moreMenuItems()) : closeMenu();
$('shareBtn').onclick = () => $('menu').hidden ? openMenu($('shareBtn'), shareItems()) : closeMenu();

function toggleGrid(){ S.grid = !S.grid; try { localStorage.setItem('flux:grid', S.grid ? '1' : '0'); } catch {} dirty = true; say(S.grid ? 'Dot grid on' : 'Dot grid off'); }
PALETTE_HOOKS.push(add => {
  add('view', S.grid ? 'Hide dot grid' : 'Show dot grid', toggleGrid);
  for (const [t, T] of Object.entries(TOOLS)) add('tool', T.name, () => setTool(t), { on: currentTool() === t });
});

/* context menu: right-click (or the Menu key / Shift+F10 on the canvas) offers what fits the element under it */
function canvasMenu(at, w){
  const hit = w && hitTest(w);
  if (hit && !S.sel.has(hit.cid)){ S.sel = new Set([hit.cid]); expandSel(); announceSel(); dirty = true; }
  else if (w && !hit && S.sel.size && !inside(w, grow(selBox() || { x: 0, y: 0, w: 0, h: 0 }, 8 / S.view.zoom))){ S.sel.clear(); dirty = true; }   // empty paper
  const rs = [...S.sel].map(c => S.records.get(c)).filter(Boolean), one = rs.length === 1 ? rs[0] : null, mine = rs.filter(r => r.author === S.me?.id);
  const items = [];
  if (rs.length){
    if (one && mine.length && (one.type === 'TEXT' || one.type === 'NODE')) items.push({ label: 'Edit', icon: 'edit', key: '↵', run: () => editAny(one) });
    items.push({ label: 'Comment', icon: 'comment', key: 'M', run: commentOnSelection });
    items.push({ label: 'Duplicate', icon: 'copy', key: '⌘D', run: duplicateSelection }, { label: 'Copy', icon: 'copy', key: '⌘C', run: copySelection }, '-');
    items.push({ label: 'Bring to front', icon: 'front', key: '⌘⇧↑', run: () => reorder(true) }, { label: 'Send to back', icon: 'back', key: '⌘⇧↓', run: () => reorder(false) });
    items.push({ label: rs.every(r => r.locked) ? 'Unlock' : 'Lock', icon: rs.every(r => r.locked) ? 'unlock' : 'lock', key: '⌘⇧L', run: toggleLock });
    if (rs.length > 1) items.push({ label: 'Group', icon: 'group', key: '⌘G', run: groupSelection });
    if (rs.some(r => S.D.groupOf.has(r.cid))) items.push({ label: 'Ungroup', icon: 'ungroup', key: '⌘⇧G', run: ungroupSelection });
    if (mine.length) items.push('-', { label: mine.length < rs.length ? `Delete yours (${mine.length})` : 'Delete', icon: 'trash', key: '⌫', run: revokeSelection });
  } else {
    const p = w || viewCenter();
    if (clip) items.push({ label: 'Paste', icon: 'copy', key: '⌘V', run: pasteClip });
    items.push({ label: 'Sticky note here', icon: 'sticky', run: () => startNode({ kind: 'sticky', anchor: { x: p.x, y: p.y, ax: .5, ay: .5 } }) });
    items.push({ label: 'Text here', icon: 'type', key: 'T', run: () => openText(p) }, '-');
    items.push({ label: 'Select all', icon: 'cursor', key: '⌘A', run: () => { selectAll(); announceSel(); } }, { label: 'Zoom to fit', icon: 'fit', key: '0', run: () => { zoomFit(); dirty = true; } });
    items.push({ label: 'Outline of the canvas', icon: 'list', key: '⇧O', run: () => toggleStructure(true) });
  }
  openMenu(cv, items, at);
}
KEY_HOOKS.push((e, c) => {
  if (c.onCanvas && (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))){
    e.preventDefault(); const b = S.sel.size && selBox(), s = b ? toScreen(b.x + b.w / 2, b.y + b.h / 2) : { x: innerWidth / 2, y: innerHeight / 2 };
    canvasMenu(s, null); return true;
  }
  return false;
});

/* welcome card: quick starts build into this (empty) canvas; it steps aside on the first touch or key */
S.touched = false;
$('emName').value = store.get('flux:name') || '';
$('emName').addEventListener('change', e => setMyName(e.target.value));
$('emName').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });
const touchCanvas = e => { if (S.touched || e.target.closest?.('#empty .em-card')) return; S.touched = true; $('empty').hidden = true; };
addEventListener('pointerdown', touchCanvas, true);
addEventListener('keydown', touchCanvas, true);
$('empty').addEventListener('click', async e => {
  const b = e.target.closest('[data-q]'); if (!b) return;
  const t = TEMPLATES.find(x => x.id === b.dataset.q); if (!t) return;
  S.touched = true; $('empty').hidden = true;
  await setTitle(t.name, t.id); await t.build(viewCenter()); S.hist = []; await tick();
  zoomFit(); setTool('select', true); toast(`${t.name} ready`);
});
paintTools();
// ?tool=pen (or any tool name) opens the canvas with that tool, e.g. for a drawing kiosk
{ const t = new URLSearchParams(location.search).get('tool'); if (t && TOOLS[t] && t !== 'select'){ S.lassoMode = t !== 'pen'; if (t === 'pen') paintTools(); else setTool(t); } }
