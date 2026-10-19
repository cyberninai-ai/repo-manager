'use strict';
// @module ui/bottom-bar — Contextual style bar: shows only what the current tool or selection can use
// (colour, shape kind, stroke and fill, text size and font) and restyles your own selection
// @uses chrome
/* floating bar: colour, brush size, text size */
const barH = () => { const b = $('bar'); return b && !b.hidden && !b.classList.contains('min') ? b.offsetHeight + 12 : 0; };
const COLOR_NAMES = { ink: 'Ink', red: 'Red', orange: 'Orange', green: 'Green', blue: 'Blue', violet: 'Violet', pink: 'Pink' };
// What the bar acts on: your own selected elements (others' are theirs to change); otherwise new ones.
const selOwn = types => [...S.sel].map(c => current(c)).filter(el => el && types.includes(el.type) && el.author === S.me?.id && !S.D.hidden.has(el.cid));
const selOthers = types => [...S.sel].map(c => current(c)).filter(el => el && types.includes(el.type) && el.author !== S.me?.id).length;
const textTargets = () => selOwn(['TEXT']);
const lineTargets = () => selOwn(['DRAW', 'SHAPE', 'ARROW']);
function sizeTarget(){ const t = textTargets(); return t.length ? t[0] : null; }
// brush value <-> element width: strokes use it as is; shape outlines and arrows use half (as when drawn)
const brushOf = el => el.type === 'DRAW' ? lw(el) : lw(el) * 2;
const widthFor = (el, b) => el.type === 'DRAW' ? b : Math.max(1, Math.round(b / 2));
let barShown = '';
// which groups the bar shows: what the active tool makes, or what your selection can be restyled with
const TOOL_GROUPS = { pen: 'color brush', line: 'color brush', rect: 'color brush fill', ellipse: 'color brush fill', text: 'color text', note: 'color', node: 'kind color' };
function barGroups(){
  const t = currentTool(), g = new Set();
  if (taOpen()) return new Set(['color', 'text']);
  if (S.sel.size && (t === 'select' || t === 'pen')){
    const rs = selOwn(['DRAW', 'SHAPE', 'ARROW', 'TEXT', 'NODE']);
    if (rs.length) g.add('color');
    if (rs.some(r => r.type === 'DRAW' || r.type === 'SHAPE' || r.type === 'ARROW')) g.add('brush');
    if (rs.some(r => r.type === 'TEXT')) g.add('text');
    if (rs.some(r => r.type === 'NODE' && r.ek !== 'sticky')) g.add('kind');   // a sticky note is a sticky note: colour only
    if (rs.some(r => r.type === 'NODE' && FILLABLE.has(r.ek))) g.add('nfill');
    return g;
  }
  for (const k of (TOOL_GROUPS[t] || '').split(' ')) if (k) g.add(k);
  if (t === 'node' && FILLABLE.has(S.nodeKind)) g.add('nfill');
  return g;
}
const KIND_SVG = {
  card: '<rect x="3" y="5" width="14" height="10" rx="2"/><path d="M6 9h8M6 12h5"/>', topic: '<rect x="2" y="6" width="16" height="8" rx="4"/>',
  rect: '<rect x="3" y="5" width="14" height="10"/>', ellipse: '<ellipse cx="10" cy="10" rx="7.5" ry="5"/>', diamond: '<path d="M10 3l7 7-7 7-7-7z"/>',
  sticky: '<path d="M4 4h12v8l-4 4H4z"/><path d="M12 16v-4h4"/>', button: '<rect x="3" y="7" width="14" height="6" rx="3"/>',
  input: '<rect x="3" y="7" width="14" height="6" rx="1"/><path d="M6 9v2"/>', image: '<rect x="3" y="4" width="14" height="12" rx="1"/><path d="M3 14l4-4 3 3 2-2 5 4"/>',
  swatch: '<rect x="5" y="3" width="10" height="9" rx="1" fill="currentColor"/><path d="M5 15h10"/>', frame: '<rect x="5" y="2" width="10" height="16" rx="2"/><path d="M8 15h4"/>',
};
// the Shape tool's kinds, most used first (sticky notes have their own tool)
const KIND_ORDER = ['rect', 'ellipse', 'diamond', 'topic', 'card', 'frame', 'button', 'input', 'image', 'swatch'];
const FONT_NAMES = { sans: 'Sans', hand: 'Hand-drawn', mono: 'Monospace' };
function paintBar(){
  const cols = $('barColors');
  if (!cols.children.length){
    for (const c of Object.keys(COLORS)){
      const b = document.createElement('button'); b.className = 'sw2'; b.dataset.c = c;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', COLOR_NAMES[c] || c);
      b.onclick = () => setColor(c);
      cols.appendChild(b);
    }
    // arrow keys move between swatches, as a radio group should
    cols.addEventListener('keydown', e => {
      const list = [...cols.children], i = list.indexOf(document.activeElement); if (i < 0) return;
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (d){ e.preventDefault(); e.stopPropagation(); const n = list[(i + d + list.length) % list.length]; n.focus(); n.click(); }
    });
  }
  const kinds = $('barKinds');
  if (!kinds.children.length){
    for (const k2 of KIND_ORDER){ const K2 = NODE_KINDS[k2];
      const b = document.createElement('button'); b.className = 'kd'; b.dataset.k = k2;
      b.innerHTML = KIND_SVG[k2] ? `<svg viewBox="0 0 20 20" class="ic" aria-hidden="true">${KIND_SVG[k2]}</svg>` : `<span class="gl">${K2.icon}</span>`;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', K2.name[0].toUpperCase() + K2.name.slice(1));
      b.onclick = () => pickKind(k2);
      kinds.appendChild(b);
    }
    kinds.addEventListener('keydown', e => {
      const list = [...kinds.children], i = list.indexOf(document.activeElement); if (i < 0) return;
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (d){ e.preventDefault(); e.stopPropagation(); const n = list[(i + d + list.length) % list.length]; n.focus(); n.click(); }
    });
  }
  const fonts = $('barFonts');
  if (!fonts.children.length){
    for (const f of Object.keys(FONT_NAMES)){
      const b = document.createElement('button'); b.className = 'ft'; b.dataset.f = f; b.textContent = 'Aa'; b.style.fontFamily = FONTS[f];
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', FONT_NAMES[f]); b.onclick = () => setFont(f);
      fonts.appendChild(b);
    }
    fonts.addEventListener('keydown', e => {
      const list = [...fonts.children], i = list.indexOf(document.activeElement); if (i < 0) return;
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (d){ e.preventDefault(); e.stopPropagation(); const n = list[(i + d + list.length) % list.length]; n.focus(); n.click(); }
    });
  }
  const nf = $('barNFill');
  if (!nf.children.length){
    for (const [v, label, svg] of [['none', 'No fill', '<rect x="4" y="4" width="12" height="12" rx="2" fill="none"/>'], ['light', 'Light fill', '<rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor" fill-opacity=".2"/>'], ['solid', 'Solid fill', '<rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor"/>']]){
      const b = document.createElement('button'); b.className = 'kd'; b.dataset.fill = v; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', label);
      b.innerHTML = `<svg viewBox="0 0 20 20" class="ic" aria-hidden="true">${svg}</svg>`; b.onclick = () => setNodeFill(v); nf.appendChild(b);
    }
  }
  const groups = barGroups(), gkey = [...groups].join();
  const selKinds = selOwn(['NODE']).map(n => n.ek), shownKind = selKinds.length ? selKinds[0] : S.nodeKind;
  for (const b of kinds.children){ const on = b.dataset.k === shownKind; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
  const ink = colorOf(S.color);
  // sticky notes show the paper colours they will actually get (ink means the classic yellow)
  const stickies = currentTool() === 'note' || (S.sel.size > 0 && selOwn(['NODE']).length > 0 && selOwn(['NODE']).every(n => n.ek === 'sticky'));
  for (const b of cols.children){
    const c = b.dataset.c; b.style.background = stickies ? (c === 'ink' ? '#ffe066' : mixHex(colorOf(c), '#ffffff', .35)) : colorOf(c);
    b.setAttribute('aria-label', stickies && c === 'ink' ? 'Yellow' : COLOR_NAMES[c] || c);
    const on = c === (stickies && selOwn(['NODE'])[0] ? ecol(selOwn(['NODE'])[0]) : S.color); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
  }
  const tt = textTargets(), t = tt[0], ts = t ? (t._previewFs || t.fs) : S.textSize;
  const lt = lineTargets(), bw = lt.length ? Math.round(brushOf(lt[0])) : S.width;
  const tf = t ? t.f.F : S.font;
  const key = [gkey, currentTool(), S.nodeFill, selOwn(['NODE']).map(n => n.cid + n.efill + n.ek).join(), S.color, S.width, S.fill, tf, ts, tt.map(x => x.cid).join(), lt.map(x => x.cid + lw(x)).join(), ink].join('|');
  if (key === barShown) return; barShown = key;
  const bar = $('bar'), was = bar.hidden;
  bar.hidden = !groups.size;
  $('gNFill').hidden = !groups.has('nfill');
  const fillNow = selOwn(['NODE']).find(n => FILLABLE.has(n.ek))?.efill || (S.sel.size ? 'light' : S.nodeFill);
  for (const b of nf.children){ const on = b.dataset.fill === fillNow; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
  $('gColor').hidden = !groups.has('color'); $('gKind').hidden = !groups.has('kind');
  $('gBrush').hidden = !groups.has('brush'); $('gText').hidden = !groups.has('text'); $('fillBtn').hidden = !groups.has('fill');
  $('fillBtn').setAttribute('aria-pressed', String(!!S.fill));
  for (const b of fonts.children){ const on = b.dataset.f === tf; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
  if (was !== bar.hidden) document.documentElement.style.setProperty('--barH', barH() + 'px');
  $('brush').value = bw; $('brushVal').textContent = bw;
  $('brush').setAttribute('aria-valuetext', `${bw} pixel brush${lt.length ? `, ${lt.length} selected line${lt.length > 1 ? 's' : ''}` : ''}`);
  $('brushTgt').textContent = lt.length ? `${lt.length} selected line${lt.length > 1 ? 's' : ''}` : '';
  const dot = $('brushPre').firstElementChild, dd = Math.min(30, bw); Object.assign(dot.style, { width: dd + 'px', height: dd + 'px', color: ink, background: ink });
  $('tsize').value = ts; $('tsizeVal').textContent = ts;
  $('tsize').setAttribute('aria-valuetext', `${ts} pixel text${tt.length ? `, ${tt.length} selected text${tt.length > 1 ? 's' : ''}` : ''}`);
  Object.assign($('tsizePre').firstElementChild.style, { fontSize: Math.min(30, Math.max(9, ts * 0.3)) + 'px', color: t ? colorOf(ecol(t)) : ink });
  $('tsizeTgt').textContent = tt.length ? `${tt.length > 1 ? tt.length + ' ' : ''}selected text${tt.length > 1 ? 's' : ''}` : '';
}
let brushT = 0, othersWarned = '';
function warnOthers(types, what){
  const n = selOthers(types), key = [...S.sel].join();
  if (n && othersWarned !== key){ othersWarned = key; toast(`${n} ${what} by other authors left as they are. Only their authors can restyle them.`); }
}
// Brush: sets the width for new strokes and restyles your selected lines (live preview, one signed STYLE each once it settles).
function setBrush(w, announce){
  w = Math.max(1, Math.min(80, Math.round(w)));
  S.width = w;
  const lt = lineTargets();
  warnOthers(['DRAW', 'SHAPE', 'ARROW'], 'lines');
  if (!lt.length){ paintBar(); if (announce) say(`Brush ${w}`); return; }
  for (const el of lt){ el._pw = widthFor(el, w); el._bb = null; }
  $('brushVal').textContent = w; dirty = true;
  clearTimeout(brushT);
  brushT = setTimeout(async () => {
    const items = [];
    for (const el of lt){
      const to = el._pw; delete el._pw;
      const from = el.ew ?? (el.type === 'DRAW' ? el.w : el.sw);
      if (to !== from){ items.push({ cid: el.cid, before: { W: from }, after: { W: to } }); await commitStyle(el.cid, { W: to }); }
    }
    dirty = true; barShown = '';
    if (items.length){ S.hist.push({ kind: 'style', items }); S.redo = []; say(`${items.length} line${items.length > 1 ? 's' : ''} set to width ${w}.`); }
  }, 450);
}
// Colour: sets the colour for new work and recolours your selected strokes, shapes, arrows and text.
async function setColor(c){
  S.color = c; barShown = ''; paintBar();
  const els = selOwn(['DRAW', 'SHAPE', 'ARROW', 'TEXT', 'NODE']);
  warnOthers(['DRAW', 'SHAPE', 'ARROW', 'TEXT', 'NODE'], 'elements');
  if (!els.length){ say(`Colour ${COLOR_NAMES[c] || c}`); return; }
  const items = [];
  for (const el of els){ const from = ecol(el); if (from !== c){ items.push({ cid: el.cid, before: { C: from }, after: { C: c } }); await commitStyle(el.cid, { C: c }); } }
  if (items.length){ S.hist.push({ kind: 'style', items }); S.redo = []; }
  say(`${items.length} element${items.length === 1 ? '' : 's'} recoloured ${COLOR_NAMES[c] || c}.`);
}
// Font: for new text, and an edit of your selected texts (each a new signed TEXT, like resizing)
async function setFont(f){
  S.font = f; barShown = '';
  const tt = textTargets(); warnOthers(['TEXT'], 'texts');
  if (!tt.length){ paintBar(); say(`${FONT_NAMES[f]} font for new text`); if (taOpen() && !taOrig) ta.style.fontFamily = FONTS[f]; return; }
  const keep = [...S.sel].filter(c => !tt.some(t => t.cid === current(c)?.cid)), made = [];
  for (const t of tt){ const cur = current(t.cid); if (!cur) continue; if (cur.f.F === f){ made.push(cur.cid); continue; } const b = box(cur); made.push(await commitText({ x: b.x, y: b.y }, cur.text, cur, { F: f }) || cur.cid); }
  S.sel = new Set([...keep, ...made]); dirty = true; barShown = '';
  say(`${tt.length} text${tt.length > 1 ? 's' : ''} set in ${FONT_NAMES[f]}.`);
}
// shape fill: for new shapes, and a signed restyle of your selected shapes (undoable)
async function setNodeFill(v){
  S.nodeFill = v; barShown = '';
  const items = [];
  for (const el of selOwn(['NODE']).filter(n => FILLABLE.has(n.ek))){ const from = el.efill || 'light'; if (from !== v){ items.push({ cid: el.cid, before: { F: from }, after: { F: v } }); await commitStyle(el.cid, { F: v }); } }
  if (items.length){ S.hist.push({ kind: 'style', items }); S.redo = []; }
  paintBar(); say(`${{ none: 'No', light: 'Light', solid: 'Solid' }[v]} fill${items.length ? ` on ${items.length} shape${items.length > 1 ? 's' : ''}` : ' for new shapes'}.`);
}
$('fillBtn').onclick = () => { S.fill = !S.fill; barShown = ''; paintBar(); say(S.fill ? 'New shapes are filled' : 'New shapes are outlines'); };
let tsizeT = 0;
function setTextSize(v, announce){
  v = Math.max(10, Math.min(400, Math.round(v)));
  const tt = textTargets();
  warnOthers(['TEXT'], 'texts');
  if (!tt.length){ S.textSize = v; paintBar(); if (announce) say(`New text size ${v}`); if (taOpen() && !taOrig){ ta.style.fontSize = (v * S.view.zoom) + 'px'; sizeTa(); } return; }
  // live preview while dragging; one signed edit per text once the value settles
  S.textSize = v; $('tsizeVal').textContent = v;
  for (const t of tt){ t._previewFs = v; t._bb = null; }
  dirty = true;
  clearTimeout(tsizeT);
  tsizeT = setTimeout(async () => {
    const keep = [...S.sel].filter(c => !tt.some(t => t.cid === current(c)?.cid)), made = [];
    for (const t of tt){
      const cur = current(t.cid); delete t._previewFs; t._bb = null;
      if (!cur || cur.fs === v){ if (cur) made.push(cur.cid); continue; }
      const b = box(cur), nc = await commitText({ x: b.x, y: b.y }, cur.text, cur, { S: v });
      made.push(nc || cur.cid);
    }
    S.sel = new Set([...keep, ...made]); dirty = true; barShown = '';
    say(`${tt.length} text${tt.length > 1 ? 's' : ''} resized to ${v}.`);
  }, 450);
}
$('brush').addEventListener('input', e => setBrush(+e.target.value, false));
$('brush').addEventListener('change', () => { if (!lineTargets().length) say(`Brush ${S.width}`); });
$('tsize').addEventListener('input', e => setTextSize(+e.target.value, false));
$('tsize').addEventListener('change', e => { if (!sizeTarget()) say(`New text size ${+e.target.value}`); });
for (const id of ['brush', 'tsize']) $(id).addEventListener('keydown', e => e.stopPropagation());   // arrows adjust the slider, not the canvas
$('bar').addEventListener('pointerdown', e => e.stopPropagation());
function foldBar(min){
  $('bar').classList.toggle('min', min);
  $('barFold').innerHTML = ic(min ? 'chev-up' : 'chev-down');
  $('barFold').setAttribute('aria-expanded', String(!min));
  $('barFold').setAttribute('aria-label', min ? 'Show style options' : 'Hide style options');
  document.documentElement.style.setProperty('--barH', barH() + 'px');
  try { localStorage.setItem('flux:barMin', min ? '1' : '0'); } catch {}
  dirty = true;
}
$('barFold').onclick = () => foldBar(!$('bar').classList.contains('min'));
try { if (localStorage.getItem('flux:barMin') === '1') foldBar(true); } catch {}
addEventListener('resize', () => document.documentElement.style.setProperty('--barH', barH() + 'px'));
try { new ResizeObserver(() => { document.documentElement.style.setProperty('--barH', barH() + 'px'); dirty = true; }).observe($('bar')); } catch {}

RENDER_HOOKS.dom.unshift(paintBar);   // first: the selection toolbar places itself clear of the bar
