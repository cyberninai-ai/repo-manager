'use strict';
// @module features/data/core — Data nodes: NODE kinds that hold structured data (tables, checklists, metrics, charts,
// formulas, links, code, dates) and the signed records that change that data one value at a time, so two people
// editing different cells, ticking different items or logging a reading never overwrite each other.
// @uses render/nodes, renderer, commands, diagrams, ui/form, ui/panels, ui/hub, zones
//
// A data node is an ordinary NODE: its label is the data in a readable form (a markdown table, a list, "unit: $k"),
// so search, history, forks, deliveries and exports keep working. Its author changes the structure by signing a new
// version (E). Everyone else with "draw" changes values through four records that name the node's first version (R):
// CELL-I-R-{root}-A-{row}-B-{column}-M-{value}-Z-T-SIG     a table cell; latest Z wins per row and column
// TICK-I-R-{root}-A-{item}-S-{1|0}-Z-T-SIG                a checklist item done or not; latest Z wins per item
// READING-I-R-{root}-V-{number}-M-{note}-Z-T-SIG          a metric's new value; the history is every reading in Z order
// ROW-I-R-{root}-M-{values, tab separated}-Z-T-SIG        a row appended to a table, or an item to a checklist
// Rows and items are named by their first cell or text (a second "Team" is "Team#2"), not by position, so a record
// keeps meaning the same thing when the author adds, removes or reorders rows. While a node is locked, values signed
// after the lock take no part.
const DATA_KINDS = {};    // kind → spec, see registerDataKind
const DATA = { cells: new Map(), ticks: new Map(), readings: new Map(), rows: new Map(), memo: new Map(), titles: new Map() };
const txtOk = (s, max) => typeof s === 'string' && s.length <= max;
const DATA_NUM = /^-?\d{1,15}(\.\d{1,9})?$/;
registerRecord('CELL', { parse(r, f){ must(isCid(f.R), 'cell'); r.row = decTxt(f.A || ''); r.col = decTxt(f.B || ''); r.val = decTxt(f.M || ''); must(r.row && txtOk(r.row, 200) && txtOk(r.col, 200) && txtOk(r.val, 2000), 'cell'); },
  say: (r, t) => `set ${r.col} of “${r.row.slice(0, 30)}” to “${r.val.slice(0, 40)}”` });
registerRecord('TICK', { parse(r, f){ must(isCid(f.R) && (f.S === '1' || f.S === '0'), 'tick'); r.item = decTxt(f.A || ''); r.done = f.S === '1'; must(r.item && txtOk(r.item, 400), 'tick'); },
  say: r => `${r.done ? 'ticked' : 'unticked'} “${r.item.slice(0, 40)}”` });
registerRecord('READING', { parse(r, f){ must(isCid(f.R), 'reading'); const v = decTxt(f.V || ''); must(DATA_NUM.test(v), 'reading'); r.value = +v; r.note = decTxt(f.M || ''); must(txtOk(r.note, 400), 'reading'); },
  say: r => `logged ${fmtNum(r.value)}${r.note ? ` (${r.note.slice(0, 30)})` : ''}` });
registerRecord('ROW', { parse(r, f){ must(isCid(f.R), 'row'); r.vals = decTxt(f.M || '').split('\t').map(v => v.slice(0, 2000)).slice(0, 40); must(r.vals[0] && txtOk(r.vals[0], 400), 'row'); },
  say: r => `added “${r.vals[0].slice(0, 40)}”` });
for (const t of ['CELL', 'TICK', 'READING', 'ROW']){ GATED.add(t); ZONE_TARGETED.add(t); }   // in someone's zone they wait for the owner, like any edit

// the first version of a node: the records above name it, so they survive the author's edits
function dataRoot(el){ let r = el, n = 0; while (r?.edits && n++ < 1000){ const p = S.records.get(r.edits); if (!p || p.type !== 'NODE' || p.author !== r.author) break; r = p; } return r?.cid; }
// "Team", "Team", "Pro" → "Team", "Team#2", "Pro": a row or item name that stays the same when others move around it
function keyed(names){ const seen = new Map(); return names.map(n => { const k = String(n).trim().toLowerCase(), c = (seen.get(k) || 0) + 1; seen.set(k, c); return c > 1 ? `${n}#${c}` : String(n); }); }

DERIVE_HOOKS.push((D, by) => {
  DATA.memo.clear();
  const lockZ = new Map();   // a locked node: the Z of the STYLE that locked it, by its author
  for (const r of S.records.values()) if (r.type === 'STYLE' && r.sl === true && r.neg === null){ const t = S.records.get(r.f.R); if (t?.type === 'NODE' && t.author === r.author) lockZ.set(t.cid, Math.max(lockZ.get(t.cid) || 0, r.z)); }
  const roots = new Map();   // root → current version
  for (const el of D.els) if (el.type === 'NODE' && DATA_KINDS[el.ek] && !D.superseded.has(el.cid)) roots.set(dataRoot(el), el);
  const late = r => { if (D.hidden.has(r.cid)) return true; const el = roots.get(r.f.R); return !!el && el.locked && r.z > (lockZ.get(el.cid) ?? Infinity); };
  const put = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  DATA.cells = new Map(); DATA.ticks = new Map(); DATA.readings = new Map(); DATA.rows = new Map();
  for (const r of by.CELL || []) if (!late(r)){ const m = DATA.cells.get(r.f.R) || new Map(); m.set(r.row + '\u0000' + r.col.toLowerCase(), r); DATA.cells.set(r.f.R, m); }   // z order: latest wins
  for (const r of by.TICK || []) if (!late(r)){ const m = DATA.ticks.get(r.f.R) || new Map(); m.set(r.item.toLowerCase(), r); DATA.ticks.set(r.f.R, m); }
  for (const r of by.READING || []) if (!late(r)) put(DATA.readings, r.f.R, r);
  for (const r of by.ROW || []) if (!late(r)) put(DATA.rows, r.f.R, r);
  // data nodes by title, for formulas: [Revenue], [Pricing.Price]
  DATA.titles = new Map();
  for (const el of roots.values()) if (!D.hidden.has(el.cid)){ const t = dataTitle(el).toLowerCase(); if (t && !DATA.titles.has(t)) DATA.titles.set(t, el); }
});
// per derive: a node's merged data is computed once, however often it is drawn or hit-tested
const dataMemo = (el, tag, f) => { const k = el.cid + tag; if (!DATA.memo.has(k)) DATA.memo.set(k, f()); return DATA.memo.get(k); };
const dataTitle = el => (DATA_KINDS[el.ek]?.title?.(el.text) ?? el.text.split('\n')[0]).trim().slice(0, 80);
// a number as people write it: 1,200 · $49 · 12.5% · −3
function dataNum(v){ const s = String(v ?? '').trim().replace(/[,\s]/g, '').replace(/^[$€£¥]/, '').replace(/%$/, '').replace('−', '-'); return /^-?\d+(\.\d+)?$/.test(s) ? +s : null; }
function fmtNum(v, dp = null){
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (dp == null && a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  return v.toLocaleString('en-US', { maximumFractionDigits: dp ?? (a >= 100 ? 0 : a >= 1 ? 2 : 3), minimumFractionDigits: dp ?? 0 });
}

/* a kind registers its layout, drawing, editing and export; the core turns it into a NODE kind */
// spec: { name, icon, blurb, label (a sample label), min: [w, h], layout(text) → { w, h, … }, fit?(el, L) → { w, h } with live
//         data, draw(b, L, { el, accent }), hit?(el, w, b) → { act, … }, press?(el, hit) (a click), edit?(el, hit) (a double-click),
//         form(el | null, { source }) → label | null, title?(text), describe(el), lines(el) → text rows for export, svg? }
function registerDataKind(kind, spec){
  DATA_KINDS[kind] = spec;
  NODE_KINDS[kind] = { name: spec.name, icon: spec.glyph || '▦', label: spec.label, font: 14, pad: [12, 10], wrap: 300, min: spec.min, align: 'left', data: true,
    layout: spec.layout, draw: spec.draw, fit: spec.fit, describe: el => `${spec.name} “${dataTitle(el)}”: ${spec.describe(el)}`,
    edit: (el, w) => dataEdit(el, w), svg: (el, b, n) => dataSVG(el, b, n) };
}

/* drawing: the parts every data node shares */
function dataCard(b, accent, kind){
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.10)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
  rr(ctx, b.x, b.y, b.w, b.h, 10); ctx.fillStyle = TH.panel; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1; ctx.strokeStyle = accent || TH.line; ctx.stroke(); ctx.restore();
  if (accent){ ctx.save(); rr(ctx, b.x, b.y, b.w, b.h, 10); ctx.clip(); ctx.fillStyle = accent; ctx.fillRect(b.x, b.y, b.w, 3); ctx.restore(); }
}
// the title row: a small kind tag on the right, the title on the left; returns the y where content starts
function dataHead(b, title, tag, extra = ''){
  const y = b.y + 18;
  ctx.font = `500 12px ${FONTS.sans}`; const ew = extra ? ctx.measureText(extra).width : 0;
  ctx.font = `600 10px ${FONTS.sans}`; const tw = ctx.measureText(tag).width + 12;
  rr(ctx, b.x + b.w - tw - 10, y - 8, tw, 16, 8); ctx.fillStyle = TH.panel2 || TH.paper; ctx.fill();
  ctx.fillStyle = TH.muted; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(tag, b.x + b.w - tw / 2 - 10, y + .5);
  ctx.textAlign = 'left';
  fitText(title || 'Untitled', b.x + 12, y, b.w - tw - 34 - (extra ? ew + 8 : 0), `650 14px ${FONTS.sans}`, TH.ink);
  if (extra){ ctx.font = `500 12px ${FONTS.sans}`; ctx.fillStyle = TH.muted; ctx.textBaseline = 'middle'; ctx.fillText(extra, b.x + b.w - tw - 18 - ew, y + .5); }
  ctx.beginPath(); ctx.moveTo(b.x + 1, b.y + 36); ctx.lineTo(b.x + b.w - 1, b.y + 36); ctx.strokeStyle = TH.line2 || TH.line; ctx.lineWidth = 1; ctx.stroke();
  return b.y + 36;
}
// one line of text, cut with an ellipsis to fit; returns the width drawn
function fitText(t, x, y, maxW, font, color, align = 'left'){
  ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = align;
  t = String(t ?? ''); if (maxW <= 4) return 0;
  let w = ctx.measureText(t).width;
  if (w > maxW){ let lo = 0, hi = t.length; while (lo < hi){ const m = (lo + hi + 1) >> 1; if (ctx.measureText(t.slice(0, m) + '…').width <= maxW) lo = m; else hi = m - 1; } t = t.slice(0, lo) + '…'; w = ctx.measureText(t).width; }
  ctx.fillText(t, x, y + .5); ctx.textAlign = 'left'; return w;
}
// "+ Add row" along the foot of a node
function dataFoot(b, label, y){
  ctx.beginPath(); ctx.moveTo(b.x + 1, y); ctx.lineTo(b.x + b.w - 1, y); ctx.strokeStyle = TH.line2 || TH.line; ctx.lineWidth = 1; ctx.stroke();
  fitText('+ ' + label, b.x + 12, y + 14, b.w - 24, `500 12px ${FONTS.sans}`, TH.accent);
  return { x: b.x, y, w: b.w, h: 28 };
}
function dataAvatar(id, x, y, r = 8){
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = `hsl(${authorHue(personOf(id))} 55% 38%)`; ctx.fill();
  ctx.font = `600 ${Math.round(r * .95)}px ${FONTS.sans}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(initials(personOf(id)).toUpperCase(), x, y + .5); ctx.textAlign = 'left';
}
function sparkline(vals, x, y, w, h, col){
  if (vals.length < 2) return;
  const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1, pt = (v, i) => [x + i / (vals.length - 1) * w, y + h - (v - lo) / sp * h];
  ctx.save(); ctx.beginPath(); vals.forEach((v, i) => { const [px, py] = pt(v, i); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.strokeStyle = col; ctx.lineWidth = 1.75; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.globalAlpha = .1; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
  const [ex, ey] = pt(vals.at(-1), vals.length - 1); ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.restore();
}
const SERIES = () => [TH.accent, TH.green, TH.amber, TH.red, '#1c7ed6', '#d6336c'];
const inRect = (w, r) => r && w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h;

/* clicking inside a data node: a checkbox, "+ Add row", "Open ↗" act on one click; a cell edits on a double-click */
const dataAt = w => { const el = hitTest(w); return el?.type === 'NODE' && DATA_KINDS[el.ek] && !el.locked ? el : null; };
POINTER_HOOKS.push((e, w) => {
  if (!S.lassoMode || placing || erasing || e.shiftKey || e.ctrlKey || e.metaKey || S.handTool) return false;
  const el = dataAt(w), K = el && DATA_KINDS[el.ek]; if (!K?.hit || !K.press) return false;
  const h = K.hit(el, w, box(el)); if (!h || !h.press) return false;
  S.sel = new Set([el.cid]); announceSel();
  Promise.resolve(K.press(el, h)).catch(err => { if (err?.name !== 'NotPermitted' && err?.name !== 'HistoryView') console.warn(err); });
  return true;
});
// hovering something clickable inside a node shows a pointer
FRAME_HOOKS.push(() => { if (!lastPointer || G) return; const el = S.lassoMode && !placing && dataAt(lastPointer), K = el && DATA_KINDS[el.ek], h = K?.hit?.(el, lastPointer, box(el)); const want = h?.press ? 'pointer' : ''; if (cv.style.cursor !== want && (want || cv.dataset.dataCur)){ cv.style.cursor = want; cv.dataset.dataCur = want ? '1' : ''; } });
// Enter, double-click or "Edit": a cell or item under the pointer edits in place; otherwise the author gets the form
function dataEdit(el, w){
  const K = DATA_KINDS[el.ek], h = w && K.hit?.(el, w, box(el));
  if (h && K.edit && K.edit(el, h) !== false) return true;
  if (el.author !== S.me.id){ toast(K.others || 'Only its author can change its structure. Comment on it instead (M).'); return true; }
  dataStructure(el); return true;
}
async function dataStructure(el){
  const K = DATA_KINDS[el.ek], text = await K.form(el, {}); if (text == null) return;
  const cur = current(el.cid); if (!cur) return;
  const label = typeof text === 'string' ? text : text.label, parent = typeof text === 'string' ? cur.parent : text.parent ?? null;
  if (label === cur.text && parent === cur.parent){ toast('Nothing changed.'); return; }
  const b = box(cur), o = S.D.off.get(cur.cid) || { w: 0, h: 0 };
  const cid = await commitNode({ kind: cur.ek, x: b.x, y: b.y, W: cur.bw + o.w, H: cur.bh + o.h, label, color: ecol(cur), parent, edits: cur.cid, fill: cur.fill });
  if (cid){ S.sel = new Set([cid]); dirty = true; say(`${K.name} updated.`); }
}
async function dataInsert(kind, at = null){
  const K = DATA_KINDS[kind]; closeMenu(false);
  const sel = S.sel.size === 1 ? current([...S.sel][0]) : null, source = sel?.type === 'NODE' && DATA_KINDS[sel.ek] ? sel : null;
  const out = await K.form(null, { source }); if (out == null) return null;
  const label = typeof out === 'string' ? out : out.label, parent = typeof out === 'string' ? null : out.parent ?? null;
  const L = nodeLayout(kind, label), sb = source && box(source), c = at || viewCenter();
  const spot = sb ? placeNear(sb, 'right', L.w, L.h, null) : { x: c.x - L.w / 2, y: c.y - L.h / 2 };
  const cid = await commitNode({ kind, x: spot.x, y: spot.y, label, color: 'ink', parent });
  if (cid){ S.sel = new Set([cid]); ensureVisible(current(cid)); dirty = true; say(`${K.name} “${label.split('\n')[0].slice(0, 50)}” added. Double-click a value to change it.`); }
  return cid;
}

/* editing one value in place: a field over the node that follows pans and zooms */
let DF = null;
const dfEl = document.createElement('input'); dfEl.id = 'dataField'; dfEl.className = 'data-field'; dfEl.autocomplete = 'off'; dfEl.hidden = true;
document.body.appendChild(dfEl);
// o: { el, rect (world), value, label (for screen readers), numeric?, align?, commit(value) → Promise, tab?(back) }
function dataField(o){
  if (DF) dfClose(true);
  DF = o; dfEl.value = o.value ?? ''; dfEl.placeholder = o.placeholder || ''; dfEl.setAttribute('aria-label', o.label); dfEl.inputMode = o.numeric ? 'decimal' : 'text';
  dfEl.style.textAlign = o.align || 'left'; dfEl.hidden = false; dfPlace(); DF.opened = Date.now();
  dfEl.focus(); dfEl.select(); setTimeout(() => { if (DF === o && document.activeElement !== dfEl){ dfEl.focus(); dfEl.select(); } }, 0); say(`Editing ${o.label}. Enter saves, Tab moves on, Escape cancels.`);
}
function dfPlace(){
  if (!DF) return; const r = DF.rect, z = S.view.zoom, p = toScreen(r.x, r.y);
  Object.assign(dfEl.style, { left: p.x + 'px', top: p.y + 'px', width: Math.max(60, r.w * z) + 'px', height: Math.max(22, r.h * z) + 'px', fontSize: Math.max(11, 13 * z) + 'px' });
}
async function dfClose(save, then = null){
  const o = DF; if (!o) return; DF = null; dfEl.hidden = true; cv.focus({ preventScroll: true });
  const v = dfEl.value.trim();
  if (save && v !== String(o.value ?? '').trim()){
    if (o.numeric && v && dataNum(v) == null){ toast('That isn’t a number.'); return; }
    try { await o.commit(v); } catch (err){ if (err?.name !== 'NotPermitted' && err?.name !== 'HistoryView') console.warn(err); }
  }
  if (then && o.tab) setTimeout(() => o.tab(then === 'back'), 0);
}
dfEl.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter'){ e.preventDefault(); dfClose(true); }
  else if (e.key === 'Escape'){ e.preventDefault(); dfClose(false); say('Cancelled.'); }
  else if (e.key === 'Tab' && DF?.tab){ e.preventDefault(); dfClose(true, e.shiftKey ? 'back' : 'next'); }
});
// leaving the field saves it, unless the click that opened it is still settling (a double-click's last pointer events)
dfEl.addEventListener('blur', () => { if (!DF) return; if (Date.now() - DF.opened < 400){ setTimeout(() => DF && dfEl.focus(), 0); return; } dfClose(true); });
dfEl.addEventListener('pointerdown', e => e.stopPropagation());
FRAME_HOOKS.push(dfPlace);
ACTION_HOOKS.push(() => { if (DF) dfClose(true); });

/* signing the values */
const dataSign = async (type, root, pairs) => publish(await signed(type, [['I', S.me.id], ['R', root], ...pairs, ['Z', ++S.lamport], ['T', Date.now()]]));
// ⌘Z takes a value back the way it was given: a cell or tick is set to what it was, a row or reading is revoked
function dataUndo(undo, redo){ S.hist.push({ kind: 'fn', undo, redo }); S.redo = []; }
async function setCell(el, row, col, val, prev){
  const sign = v => dataSign('CELL', dataRoot(el), [['A', encTxt(row)], ['B', encTxt(col)], ['M', encTxt(v)]]), cid = await sign(val);
  if (cid && prev !== undefined) dataUndo(() => sign(prev ?? ''), () => sign(val));
  return cid;
}
async function setTick(el, item, done, undoable = true){
  const sign = d => dataSign('TICK', dataRoot(el), [['A', encTxt(item)], ['S', d ? '1' : '0']]), cid = await sign(done);
  if (cid && undoable) dataUndo(() => sign(!done), () => sign(done));
  return cid;
}
function addReading(el, v, note = ''){
  const s = String(Math.round(v * 1e6) / 1e6); if (!DATA_NUM.test(s)){ toast('That number is too large to log.'); return Promise.resolve(null); }
  return dataSign('READING', dataRoot(el), [['V', encTxt(s)], ['M', encTxt(note)]]).then(c => (recordCreate(c), c));
}
const addRow = (el, vals) => dataSign('ROW', dataRoot(el), [['M', encTxt(vals.map(v => String(v).replace(/\t/g, ' ')).join('\t'))]]).then(c => (recordCreate(c), c));

/* export: a card with the title and the data as text rows, so an SVG reads the same as the canvas */
function dataSVG(el, b, n){
  const K = DATA_KINDS[el.ek], rows = (() => { try { return K.lines(el); } catch { return []; } })().slice(0, 40), x = v => esc(String(v));
  const o = [`<g><rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="10" fill="${TH.panel}" stroke="${TH.line}"/>`,
    `<text x="${n(b.x + 12)}" y="${n(b.y + 19)}" font-family="${x(FONTS.sans)}" font-size="14" font-weight="650" fill="${TH.ink}" dominant-baseline="central">${x(dataTitle(el))}</text>`,
    `<line x1="${n(b.x)}" y1="${n(b.y + 36)}" x2="${n(b.x + b.w)}" y2="${n(b.y + 36)}" stroke="${TH.line}"/>`];
  rows.forEach((r, i) => { const y = b.y + 50 + i * 20; if (y < b.y + b.h - 6) o.push(`<text x="${n(b.x + 12)}" y="${n(y)}" font-family="${x(el.ek === 'code' ? FONTS.mono : FONTS.sans)}" font-size="12.5" fill="${TH.ink}" dominant-baseline="central">${x(r.slice(0, 90))}</text>`); });
  return o.join('') + '</g>';
}

/* inserting: the Data button in the dock, the palette, and D */
const DATA_ORDER = ['table', 'checklist', 'metric', 'chart', 'formula', 'date', 'link', 'code'];
const dataItems = () => [{ head: 'Insert data' }, ...DATA_ORDER.filter(k => DATA_KINDS[k]).map(k => ({ label: DATA_KINDS[k].name, sub: DATA_KINDS[k].blurb, icon: DATA_KINDS[k].icon, run: () => dataInsert(k) }))];
const dataBtn = $('dataBtn');
function openData(){ openMenu(dataBtn, dataItems(), null, 'hub data'); }
dataBtn.onclick = () => $('menu').hidden ? openData() : closeMenu();
PALETTE_HOOKS.push(add => { for (const k of DATA_ORDER) if (DATA_KINDS[k]) add('data', `Insert ${DATA_KINDS[k].name.toLowerCase()}: ${DATA_KINDS[k].blurb}`, () => dataInsert(k)); });
KEY_HOOKS.push((e, c) => { if (c.onCanvas && !c.mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd'){ e.preventDefault(); openData(); return true; } return false; });
registerFeature({ id: 'data', name: 'Data nodes', group: 'remember', icon: 'table', records: ['CELL', 'TICK', 'READING', 'ROW'],
  blurb: 'Tables, checklists, metrics, charts, formulas, dates, links and code on the canvas, edited one signed value at a time',
  status: () => { const n = S.D.els.filter(el => el.type === 'NODE' && DATA_KINDS[el.ek] && visible(el)).length; return n ? plural(n, 'data node') : ''; },
  open: openData });
