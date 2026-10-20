'use strict';
// @module features/data/chart — A chart: bars, lines or a donut, from values in its label or live from the table, metric
// or checklist it is connected to (its parent, P), so it redraws as people change cells and log readings
// @uses features/data/core, features/data/table, features/data/metric, features/data/checklist
// label:  Signups by month
//         type: bar          (bar, line or pie)
//         column: Seats      (a table's column; every number column when absent)
//         Jan: 12            (values, when it isn't connected to a source)
const CHART_TYPES = [['bar', 'Bars'], ['line', 'Line'], ['pie', 'Donut']];
function parseChart(text){
  const C = { title: '', type: 'bar', column: '', points: [] };
  for (const l of String(text).split('\n')){
    const t = l.trim(); if (!t) continue;
    if (!C.title){ C.title = t.slice(0, 120); continue; }   // the first line is the title, whatever it says
    const o = t.match(/^(type|column)\s*:\s*(.*)$/i), p = t.match(/^(.{1,60}?)\s*:\s*(.+)$/);
    if (o){ const v = o[2].trim(); if (o[1].toLowerCase() === 'type'){ if (CHART_TYPES.some(([k]) => k === v.toLowerCase())) C.type = v.toLowerCase(); } else C.column = v.slice(0, 60); }
    else if (p && dataNum(p[2]) != null && C.points.length < 60) C.points.push([p[1], dataNum(p[2])]);
  }
  return C;
}
const chartText = c => [c.title, `type: ${c.type}`, ...(c.column ? [`column: ${c.column}`] : []), ...c.points.map(([k, v]) => `${k}: ${v}`)].join('\n');
// where the numbers come from: { labels, series: [{ name, vals }], from }
function chartData(el){
  return dataMemo(el, 'ch', () => {
    const C = parseChart(el.text), src = el.parent && current(el.parent), ok = src && visible(src) && !S.D.hidden.has(src.cid);
    if (ok && src.ek === 'table'){
      const V = tableView(src), want = C.column.toLowerCase();
      const cols = V.cols.map((c, j) => [c, j]).filter(([c, j]) => j > 0 && (want ? c.toLowerCase() === want : V.sums[j] != null)).slice(0, 4);
      return { ...C, from: dataTitle(src) || 'a table', labels: V.rows.map(r => r.vals[0] || '—'), series: cols.map(([c, j]) => ({ name: c, vals: V.rows.map(r => dataNum(r.vals[j]) ?? 0) })) };
    }
    if (ok && src.ek === 'metric'){
      const V = metricView(src), days = new Set(V.hist.filter(h => h.r).map(h => new Date(h.r.t).toDateString()));   // all on one day: label by time
      const tag = h => !h.r ? 'start' : days.size > 1 ? new Date(h.r.t).toLocaleDateString([], { month: 'short', day: 'numeric' }) : new Date(h.r.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return { ...C, type: C.type === 'bar' && !/type:/i.test(el.text) ? 'line' : C.type, from: V.title, labels: V.hist.map(tag), series: [{ name: V.title, vals: V.hist.map(h => h.value) }] };
    }
    if (ok && src.ek === 'checklist'){ const V = checklistView(src); return { ...C, from: V.title, labels: ['Done', 'Open'], series: [{ name: V.title, vals: [V.done, V.items.length - V.done] }] }; }
    return { ...C, from: null, labels: C.points.map(p => p[0]), series: C.points.length ? [{ name: C.title, vals: C.points.map(p => p[1]) }] : [] };
  });
}
// a round axis maximum: 37 → 40, 120 → 150
function niceMax(v){ if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
registerDataKind('chart', {
  name: 'Chart', icon: 'chart', glyph: '▥', blurb: 'Bars, a line or a donut, live from a table or metric it is connected to', min: [300, 200],
  label: chartText({ title: 'Chart', type: 'bar', points: [['A', 3], ['B', 5], ['C', 2]] }),
  layout(){ return { w: 380, h: 240 }; },
  draw(b, L, { el, accent }){
    if (!el) return;
    const D = chartData(el), cols = SERIES(); if (accent) cols.unshift(accent);
    dataCard(b, accent); dataHead(b, D.title || 'Chart', 'CHART', D.from ? `from ${D.from}`.slice(0, 28) : '');
    const n = D.labels.length, all = D.series.flatMap(s => s.vals);
    if (!n || !all.length){ fitText(el.parent ? 'The source has no numbers yet.' : 'No values yet. Edit the chart to add some.', b.x + 12, b.y + b.h / 2 + 10, b.w - 24, `500 12.5px ${FONTS.sans}`, TH.muted); return; }
    const legend = D.series.length > 1 && D.type !== 'pie', top = b.y + 36 + (legend ? 30 : 14), bottom = b.y + b.h - 26;
    if (legend){ let lx = b.x + 12; D.series.forEach((s, i) => { ctx.fillStyle = cols[i % cols.length]; rr(ctx, lx, b.y + 50, 10, 10, 2); ctx.fill(); lx += 16 + fitText(s.name, lx + 14, b.y + 55, 120, `500 11.5px ${FONTS.sans}`, TH.muted) + 12; }); }
    if (D.type === 'pie'){
      const vals = D.series[0].vals.map(v => Math.max(0, v)), tot = vals.reduce((s, v) => s + v, 0) || 1, r = Math.min((bottom - top) / 2 + 8, b.w * .22), cx = b.x + 16 + r, cy = (top + bottom) / 2 + 6;
      let a = -Math.PI / 2;
      vals.forEach((v, i) => { const da = v / tot * Math.PI * 2; ctx.beginPath(); ctx.arc(cx, cy, r, a, a + da); ctx.arc(cx, cy, r * .58, a + da, a, true); ctx.closePath(); ctx.fillStyle = cols[i % cols.length]; ctx.fill(); a += da; });
      fitText(fmtNum(tot), cx, cy, r, `700 15px ${FONTS.sans}`, TH.ink, 'center');
      const lx = cx + r + 18, rows = Math.min(n, Math.floor((bottom - top + 20) / 20));
      for (let i = 0; i < rows; i++){ const y = top + 4 + i * 20; ctx.fillStyle = cols[i % cols.length]; rr(ctx, lx, y - 5, 10, 10, 2); ctx.fill();
        const w = fitText(D.labels[i], lx + 16, y, b.x + b.w - lx - 70, `500 12px ${FONTS.sans}`, TH.ink); void w;
        fitText(`${fmtNum(vals[i])} · ${Math.round(vals[i] / tot * 100)}%`, b.x + b.w - 12, y, 64, `500 11.5px ${FONTS.sans}`, TH.muted, 'right'); }
      return;
    }
    const lo = Math.min(0, ...all), hi = niceMax(Math.max(...all, 0) || 1), left = b.x + 44, right = b.x + b.w - 12, H = bottom - top, yOf = v => bottom - (v - lo) / (hi - lo || 1) * H;
    for (let k = 0; k <= 4; k++){ const v = lo + (hi - lo) * k / 4, y = yOf(v);
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.strokeStyle = k ? TH.line2 || TH.line : TH.line; ctx.lineWidth = 1; ctx.stroke();
      fitText(fmtNum(v), left - 6, y, 38, `500 10.5px ${FONTS.sans}`, TH.muted, 'right'); }
    const step = (right - left) / n, every = Math.ceil(n / Math.max(1, Math.floor((right - left) / 54)));
    D.labels.forEach((l, i) => { if (i % every === 0) fitText(l, left + step * (i + .5), bottom + 12, step * every - 4, `500 11px ${FONTS.sans}`, TH.muted, 'center'); });
    if (D.type === 'line'){
      D.series.forEach((s, si) => { const c = cols[si % cols.length]; ctx.beginPath(); s.vals.forEach((v, i) => { const x = left + step * (i + .5), y = yOf(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.strokeStyle = c; ctx.lineWidth = 2.25; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
        s.vals.forEach((v, i) => { ctx.beginPath(); ctx.arc(left + step * (i + .5), yOf(v), 3, 0, Math.PI * 2); ctx.fillStyle = TH.panel; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.stroke(); }); });
      return;
    }
    const k = D.series.length, gw = Math.min(step * .72, 26 * k + 8), bw = gw / k;
    D.series.forEach((s, si) => s.vals.forEach((v, i) => { const x = left + step * i + (step - gw) / 2 + si * bw, y0 = yOf(Math.max(0, lo)), y = yOf(v);
      rr(ctx, x + 1, Math.min(y, y0), Math.max(2, bw - 2), Math.max(1, Math.abs(y0 - y)), Math.min(4, bw / 3)); ctx.fillStyle = cols[si % cols.length]; ctx.fill();
      if (k === 1 && bw > 26) fitText(fmtNum(v), x + bw / 2, Math.min(y, y0) - 8, bw + 10, `600 10.5px ${FONTS.sans}`, TH.muted, 'center'); }));
  },
  others: 'A chart follows its data: change the table or metric it is connected to.',
  async form(el, { source } = {}){
    const C = el ? parseChart(el.text) : null, srcs = S.D.els.filter(e => e.type === 'NODE' && ['table', 'metric', 'checklist'].includes(e.ek) && visible(e) && !S.D.hidden.has(e.cid) && !S.D.superseded.has(e.cid));
    const cur = el ? (el.parent && current(el.parent)?.cid) || '' : source && ['table', 'metric', 'checklist'].includes(source.ek) ? source.cid : '';
    const v = await formDialog(el ? 'Edit chart' : 'New chart', [
      { id: 'title', label: 'Title', type: 'text', value: C ? C.title : (cur ? dataTitle(current(cur)) : 'Signups by month') },
      { id: 'type', label: 'Kind', type: 'select', value: C?.type || (current(cur)?.ek === 'metric' ? 'line' : current(cur)?.ek === 'checklist' ? 'pie' : 'bar'), options: CHART_TYPES, half: true },
      { id: 'src', label: 'Data from', type: 'select', value: cur, options: [['', 'The values below'], ...srcs.map(s => [s.cid, `${DATA_KINDS[s.ek].name}: ${dataTitle(s) || 'untitled'}`])], half: true },
      { id: 'column', label: 'Table column', type: 'text', value: C?.column || '', hint: 'For a table: one column to chart. Empty charts every number column.' },
      { id: 'points', label: 'Values', type: 'textarea', rows: 5, value: C ? C.points.map(([k, n]) => `${k}: ${n}`).join('\n') : 'Jan: 12\nFeb: 19\nMar: 27\nApr: 31', hint: 'One “label: number” per line, used when the chart isn’t connected to a source.' },
    ], { ok: el ? 'Sign the new version' : 'Add chart', why: 'Connected to a table or metric, the chart redraws whenever someone changes a cell or logs a value.' });
    if (!v) return null;
    const label = chartText({ title: v.title.trim() || 'Chart', type: v.type, column: v.column.trim(), points: parseChart('x\n' + v.points).points });
    return { label, parent: v.src && S.records.has(v.src) ? v.src : null };
  },
  describe(el){ const D = chartData(el); return `${{ bar: 'bar', line: 'line', pie: 'donut' }[D.type]} chart${D.from ? ` from ${D.from}` : ''}: ${D.series.map(s => `${s.name} ${D.labels.map((l, i) => `${l} ${fmtNum(s.vals[i])}`).join(', ')}`).join('; ') || 'no values'}`; },
  lines(el){ const D = chartData(el); return D.labels.map((l, i) => `${l}: ${D.series.map(s => fmtNum(s.vals[i])).join(' / ')}`); },
});
