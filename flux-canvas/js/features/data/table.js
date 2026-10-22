'use strict';
// @module features/data/table — A table on the canvas: columns and rows in its label (a markdown table), cells anyone can
// change in place (CELL), rows anyone can add (ROW), and a total under every number column
// @uses features/data/core
// label:  Title
//         | Plan | Price | Seats |
//         | --- | --- | --- |
//         | Free | 0 | 1 |
const TB = { head: 36, hrow: 30, row: 28, foot: 28, maxCols: 12, maxRows: 200 };
function parseTable(text){
  let title = ''; const rows = [];
  for (const l of String(text).split('\n')){
    const t = l.trim(); if (!t) continue;
    if (t.startsWith('|') || t.includes('\t')){
      const cells = t.startsWith('|') ? t.replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim()) : t.split('\t').map(c => c.trim());
      if (!cells.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cells.slice(0, TB.maxCols));
    } else if (!title && !rows.length) title = t.slice(0, 120);
  }
  const cols = (rows.shift() || ['Name', 'Value']).map((c, i) => c || `Column ${i + 1}`);
  return { title, cols, rows: rows.slice(0, TB.maxRows).map(r => cols.map((_, i) => r[i] ?? '')) };
}
const tableCell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const tableText = (title, cols, rows) => [title, `| ${cols.map(tableCell).join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${cols.map((_, i) => tableCell(r[i])).join(' | ')} |`)].filter(Boolean).join('\n');
// the table as everyone sees it: the label's rows, then rows others added, with every cell's latest value
function tableView(el){
  return dataMemo(el, 'tb', () => {
    const T = parseTable(el.text), root = dataRoot(el), rows = T.rows.map(r => ({ vals: r.slice(), by: r.map(() => null), row: null }));
    for (const r of DATA.rows.get(root) || []) if (rows.length < TB.maxRows) rows.push({ vals: T.cols.map((_, i) => r.vals[i] ?? ''), by: T.cols.map(() => null), row: r });
    const keys = keyed(rows.map(r => r.vals[0] || '—')), colKeys = keyed(T.cols), cells = DATA.cells.get(root);
    if (cells) rows.forEach((r, i) => colKeys.forEach((c, j) => { const rec = cells.get(keys[i] + '\u0000' + c.toLowerCase()); if (rec){ r.vals[j] = rec.val; r.by[j] = rec; } }));
    // a column of numbers gets a total
    const sums = T.cols.map((_, j) => { const vs = rows.map(r => r.vals[j]).filter(v => String(v).trim()); return vs.length && vs.every(v => dataNum(v) != null) ? vs.reduce((s, v) => s + dataNum(v), 0) : null; });
    sums[0] = null;
    return { ...T, rows, keys, colKeys, sums, hasSum: sums.some(s => s != null) };
  });
}
function tableWidths(T){
  mctx.font = `600 12px ${FONTS.sans}`; const hw = T.cols.map(c => mctx.measureText(c).width);
  mctx.font = `400 13px ${FONTS.sans}`;
  return T.cols.map((_, j) => Math.round(Math.min(240, Math.max(64, hw[j] + 26, ...T.rows.map(r => mctx.measureText(String(r[j] ?? '')).width + 22)))));
}
function tableGeom(el, b){
  const V = tableView(el), ws = dataMemo(el, 'tw', () => tableWidths({ cols: V.cols, rows: V.rows.map(r => r.vals) })).slice();   // the widths fit every value, others' too
  while (ws.length < V.cols.length) ws.push(80);
  const extra = b.w - ws.reduce((s, w) => s + w, 0); if (extra > 0) ws[ws.length - 1] += extra;
  const xs = []; let x = b.x; for (const w of ws){ xs.push(x); x += w; }
  const y0 = b.y + TB.head, rowY = i => y0 + TB.hrow + i * TB.row, sumY = rowY(V.rows.length), footY = sumY + (V.hasSum ? TB.row : 0);
  return { V, xs, ws, y0, rowY, sumY, footY };
}
registerDataKind('table', {
  name: 'Table', icon: 'table', glyph: '▦', blurb: 'Rows and columns; anyone can change a cell or add a row', min: [240, 120],
  label: tableText('Table', ['Name', 'Value'], [['', '']]),
  layout(text){ const T = parseTable(text), widths = tableWidths(T); return { w: Math.max(240, widths.reduce((s, w) => s + w, 0)), h: TB.head + TB.hrow + T.rows.length * TB.row + TB.foot, widths }; },
  fit(el){ const V = tableView(el), ws = dataMemo(el, 'tw', () => tableWidths({ cols: V.cols, rows: V.rows.map(r => r.vals) })); return { w: ws.reduce((s, w) => s + w, 0), h: TB.head + TB.hrow + V.rows.length * TB.row + (V.hasSum ? TB.row : 0) + TB.foot }; },
  draw(b, L, { el, accent }){
    if (!el) return;
    const g = tableGeom(el, b), V = g.V;
    dataCard(b, accent); dataHead(b, V.title || 'Table', 'TABLE', plural(V.rows.length, 'row'));
    ctx.fillStyle = TH.panel2 || TH.paper; ctx.fillRect(b.x + 1, g.y0, b.w - 2, TB.hrow);
    // numbers sit on the right, so they line up, and so does their column's name
    V.cols.forEach((c, j) => { const num = V.sums[j] != null; fitText(c, num ? g.xs[j] + g.ws[j] - 10 : g.xs[j] + 10, g.y0 + TB.hrow / 2, g.ws[j] - 18, `600 12px ${FONTS.sans}`, TH.muted, num ? 'right' : 'left'); });
    V.rows.forEach((r, i) => {
      const y = g.rowY(i);
      ctx.beginPath(); ctx.moveTo(b.x + 1, y); ctx.lineTo(b.x + b.w - 1, y); ctx.strokeStyle = TH.line2 || TH.line; ctx.lineWidth = 1; ctx.stroke();
      r.vals.forEach((v, j) => {
        const num = V.sums[j] != null && dataNum(v) != null, x = num ? g.xs[j] + g.ws[j] - 10 : g.xs[j] + 10;
        fitText(v, x, y + TB.row / 2, g.ws[j] - 18, `${j === 0 ? 550 : 400} 13px ${FONTS.sans}`, TH.ink, num ? 'right' : 'left');
        if (r.by[j] && r.by[j].author !== el.author){ ctx.beginPath(); ctx.arc(g.xs[j] + g.ws[j] - 4, y + 5, 2.2, 0, Math.PI * 2); ctx.fillStyle = `hsl(${authorHue(personOf(r.by[j].author))} 55% 45%)`; ctx.fill(); }   // someone else set this value
      });
      if (r.row && r.row.author !== el.author){ ctx.fillStyle = `hsl(${authorHue(personOf(r.row.author))} 55% 45%)`; ctx.fillRect(b.x + 1, y + 6, 2, TB.row - 12); }   // a row someone else added
    });
    for (let j = 1; j < V.cols.length; j++){ ctx.beginPath(); ctx.moveTo(g.xs[j], g.y0); ctx.lineTo(g.xs[j], g.footY); ctx.strokeStyle = TH.line2 || TH.line; ctx.stroke(); }
    if (V.hasSum){
      ctx.beginPath(); ctx.moveTo(b.x + 1, g.sumY); ctx.lineTo(b.x + b.w - 1, g.sumY); ctx.strokeStyle = TH.line; ctx.stroke();
      fitText('Total', g.xs[0] + 10, g.sumY + TB.row / 2, g.ws[0] - 18, `600 12px ${FONTS.sans}`, TH.muted);
      V.sums.forEach((s, j) => { if (s != null) fitText(fmtNum(s), g.xs[j] + g.ws[j] - 10, g.sumY + TB.row / 2, g.ws[j] - 18, `650 13px ${FONTS.sans}`, TH.ink, 'right'); });
    }
    dataFoot(b, 'Add row', g.footY);
  },
  hit(el, w, b){
    const g = tableGeom(el, b), V = g.V;
    if (w.y >= g.footY && w.y <= b.y + b.h) return { act: 'add', press: true, rect: { x: b.x + 6, y: g.footY + 3, w: Math.min(b.w - 12, 220), h: TB.foot - 6 } };
    if (w.y < g.rowY(0) || w.y >= g.sumY) return null;
    const i = Math.floor((w.y - g.rowY(0)) / TB.row), j = g.xs.findLastIndex(x => w.x >= x);
    return i >= 0 && i < V.rows.length && j >= 0 ? { act: 'cell', i, j } : null;
  },
  press(el, h){ if (h.act === 'add') tableAdd(el); },
  edit(el, h){ if (h.act !== 'cell') return false; tableCellEdit(el, h.i, h.j); return true; },
  others: 'Double-click a cell to change it, or add a row at the bottom. Only its author changes the columns.',
  async form(el){
    const V = el ? tableView(el) : null, base = V ? V.rows.filter(r => !r.row) : null;
    const v = await formDialog(el ? 'Edit table' : 'New table', [
      { id: 'title', label: 'Title', type: 'text', value: V ? V.title : 'Estimates' },
      { id: 'cols', label: 'Columns', type: 'text', value: (V ? V.cols : ['Task', 'Owner', 'Days']).join(', '), hint: 'Separated by commas. The first column names each row.' },
      { id: 'rows', label: 'Rows', type: 'textarea', rows: 8, mono: true, value: base ? base.map(r => r.vals.join(' | ')).join('\n') : 'Research | Ana | 3\nDesign | | 5\nBuild | | 8',
        hint: `One row per line, cells separated by |.${V && V.rows.length > base.length ? ` ${plural(V.rows.length - base.length, 'row')} added by others stay as they are.` : ''}` },
    ], { ok: el ? 'Sign the new version' : 'Add table', why: el ? 'Everyone keeps editing cells; the values you change here are signed as cell edits.' : 'Anyone who can draw on this canvas can change a cell or add a row; each change is signed.' });
    if (!v) return null;
    const cols = v.cols.split(',').map(c => c.trim()).filter(Boolean).slice(0, TB.maxCols); if (!cols.length) cols.push('Name');
    const rows = v.rows.split('\n').filter(l => l.trim()).slice(0, TB.maxRows).map(l => l.split('|').map(c => c.trim()));
    const label = tableText(v.title.trim(), cols, rows);
    // values changed in the form become cell edits too: a newer cell edit by someone else would otherwise still win
    if (el){ const keys = keyed(rows.map(r => r[0] || '—')), at = new Map(V.keys.map((k, i) => [k, V.rows[i]])), ci = new Map(V.colKeys.map((c, j) => [c.toLowerCase(), j]));
      const kc = keyed(cols), todo = [];
      rows.forEach((r, i) => { const old = at.get(keys[i]); if (!old || old.row) return; kc.forEach((c, j) => { const oj = ci.get(c.toLowerCase()); if (oj != null && j > 0 && (r[j] ?? '') !== (old.vals[oj] ?? '')) todo.push([keys[i], c, r[j] ?? '']); }); });
      setTimeout(async () => { for (const [k, c, val] of todo) await setCell(current(el.cid) || el, k, c, val); }, 0);
    }
    return label;
  },
  title: text => parseTable(text).title,
  describe(el){ const V = tableView(el); return `${plural(V.cols.length, 'column')} (${V.cols.join(', ')}), ${plural(V.rows.length, 'row')}${V.hasSum ? `; totals ${V.cols.map((c, j) => V.sums[j] != null ? `${c} ${fmtNum(V.sums[j])}` : '').filter(Boolean).join(', ')}` : ''}`; },
  lines(el){ const V = tableView(el); return [V.cols.join(' | '), ...V.rows.map(r => r.vals.join(' | ')), ...(V.hasSum ? ['Total | ' + V.sums.slice(1).map(s => s == null ? '' : fmtNum(s)).join(' | ')] : [])]; },
});
function tableCellEdit(el, i, j){
  el = current(el.cid); if (!el) return;
  const g = tableGeom(el, box(el)), V = g.V; if (!V.rows[i] || j >= V.cols.length) return;
  dataField({ el, rect: { x: g.xs[j] + 2, y: g.rowY(i) + 2, w: g.ws[j] - 4, h: TB.row - 4 }, value: V.rows[i].vals[j], align: V.sums[j] != null ? 'right' : 'left',
    label: `${V.cols[j]} of ${V.rows[i].vals[0] || 'row ' + (i + 1)}`,
    commit: v => setCell(el, V.keys[i], V.colKeys[j], v, V.rows[i].vals[j]),
    tab: back => { const n = V.cols.length, k = i * n + j + (back ? -1 : 1); if (k >= 0 && k < V.rows.length * n) tableCellEdit(el, Math.floor(k / n), k % n); } });
}
function tableAdd(el){
  const g = tableGeom(el, box(el)), V = g.V;
  dataField({ el, rect: { x: g.xs[0] + 2, y: g.footY + 2, w: Math.max(140, g.ws[0] - 4), h: TB.foot - 4 }, value: '', placeholder: V.cols[0], label: `New row: ${V.cols[0]}`,
    commit: async v => { if (!v) return; await addRow(el, [v]); say(`Row “${v}” added. Double-click its cells to fill them in.`); } });
}
