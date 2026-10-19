'use strict';
// @module ui/bottom-bar — Floating bar: colour, shape, brush and text size (restyles your selection)
// @uses chrome
/* floating bar: colour, brush size, text size */
const barH = () => { const b = $('bar'); return b && !b.classList.contains('min') ? b.offsetHeight + 12 : 0; };
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
function paintBar(){
  const cols = $('barColors');
  if (!cols.children.length){
    for (const c of Object.keys(COLORS)){
      const b = document.createElement('button'); b.className = 'sw2'; b.dataset.c = c;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', COLOR_NAMES[c] || c); b.title = COLOR_NAMES[c] || c;
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
    for (const [k2, K2] of Object.entries(NODE_KINDS)){
      const b = document.createElement('button'); b.className = 'kd'; b.dataset.k = k2; b.textContent = K2.icon;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', K2.name); b.title = `${K2.name} (click, then click the canvas)`;
      b.onclick = () => pickKind(k2);
      kinds.appendChild(b);
    }
    kinds.addEventListener('keydown', e => {
      const list = [...kinds.children], i = list.indexOf(document.activeElement); if (i < 0) return;
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (d){ e.preventDefault(); e.stopPropagation(); const n = list[(i + d + list.length) % list.length]; n.focus(); n.click(); }
    });
  }
  const selKinds = selOwn(['NODE']).map(n => n.ek), shownKind = selKinds.length ? selKinds[0] : S.nodeKind;
  for (const b of kinds.children){ const on = b.dataset.k === shownKind; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
  const ink = colorOf(S.color);
  for (const b of cols.children){ b.style.background = colorOf(b.dataset.c); const on = b.dataset.c === S.color; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
  const tt = textTargets(), t = tt[0], ts = t ? (t._previewFs || t.fs) : S.textSize;
  const lt = lineTargets(), bw = lt.length ? Math.round(brushOf(lt[0])) : S.width;
  const key = [S.color, S.width, ts, tt.map(x => x.cid).join(), lt.map(x => x.cid + lw(x)).join(), ink].join('|');
  if (key === barShown) return; barShown = key;
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
    if (items.length){ S.hist.push({ kind: 'style', items }); S.redo = []; say(`${items.length} line${items.length > 1 ? 's' : ''} restyled to brush ${w}. Signed.`); }
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
  say(`${items.length} element${items.length === 1 ? '' : 's'} recoloured ${COLOR_NAMES[c] || c}. Signed.`);
}
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
    say(`${tt.length} text${tt.length > 1 ? 's' : ''} resized to ${v}. Signed as ${tt.length > 1 ? 'edits' : 'an edit'}.`);
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
  $('barFold').textContent = min ? '▴' : '▾';
  $('barFold').setAttribute('aria-expanded', String(!min));
  $('barFold').setAttribute('aria-label', min ? 'Show drawing options' : 'Hide drawing options');
  document.documentElement.style.setProperty('--barH', barH() + 'px');
  try { localStorage.setItem('flux:barMin', min ? '1' : '0'); } catch {}
  dirty = true;
}
$('barFold').onclick = () => foldBar(!$('bar').classList.contains('min'));
try { if (localStorage.getItem('flux:barMin') === '1') foldBar(true); } catch {}
addEventListener('resize', () => document.documentElement.style.setProperty('--barH', barH() + 'px'));
try { new ResizeObserver(() => { document.documentElement.style.setProperty('--barH', barH() + 'px'); dirty = true; }).observe($('bar')); } catch {}

