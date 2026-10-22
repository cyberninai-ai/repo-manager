'use strict';
// @module features/data/metric — A number that matters, with its history: anyone logs a new value (READING, signed), the
// node shows the latest, the change since the one before, progress to a target and a sparkline of every reading
// @uses features/data/core
// label:  Monthly revenue
//         value: 38        (the starting value, before any reading)
//         unit: $k
//         target: 50
//         better: higher   (or lower: costs, bugs, time to answer)
function parseMetric(text){
  const M = { title: '', value: null, unit: '', target: null, better: 'higher' };
  for (const l of String(text).split('\n')){
    const t = l.trim(), m = t.match(/^(value|unit|target|better)\s*:\s*(.*)$/i);
    if (m){ const k = m[1].toLowerCase(), v = m[2].trim(); if (k === 'value' || k === 'target') M[k] = dataNum(v); else if (k === 'unit') M.unit = v.slice(0, 16); else M.better = /^low/i.test(v) ? 'lower' : 'higher'; }
    else if (t && !M.title) M.title = t.slice(0, 120);
  }
  return M;
}
const metricText = m => [m.title, ...(m.value != null ? [`value: ${m.value}`] : []), ...(m.unit ? [`unit: ${m.unit}`] : []), ...(m.target != null ? [`target: ${m.target}`] : []), ...(m.better === 'lower' ? ['better: lower'] : [])].join('\n');
function metricView(el){
  return dataMemo(el, 'mt', () => {
    const M = parseMetric(el.text), rs = DATA.readings.get(dataRoot(el)) || [];
    const hist = [...(M.value != null ? [{ value: M.value, base: true }] : []), ...rs.map(r => ({ value: r.value, r }))];
    const cur = hist.at(-1) || null, prev = hist.at(-2) || null;
    return { ...M, hist, cur, prev, last: rs.at(-1) || null };
  });
}
// the value right now, for formulas
const metricValue = el => metricView(el).cur?.value ?? null;
registerDataKind('metric', {
  name: 'Metric', icon: 'metric', glyph: '↗', blurb: 'A number with a target; anyone logs a new value and the history stays', min: [260, 168],
  label: metricText({ title: 'Metric', value: 0 }),
  layout(){ return { w: 260, h: 168 }; },
  draw(b, L, { el, accent }){
    if (!el) return;
    const V = metricView(el), y0 = b.y + 36, good = TH.green, bad = TH.red;
    dataCard(b, accent); dataHead(b, V.title || 'Metric', 'METRIC');
    const spark = V.hist.length >= 2 && b.w >= 240, vw = spark ? b.w * .55 : b.w - 24;
    ctx.font = `700 30px ${FONTS.sans}`; const val = V.cur ? fmtNum(V.cur.value) : '—';
    const w1 = fitText(val, b.x + 12, y0 + 30, vw - 30, `700 30px ${FONTS.sans}`, TH.ink);
    if (V.unit) fitText(V.unit, b.x + 16 + w1, y0 + 34, vw - w1 - 10, `500 14px ${FONTS.sans}`, TH.muted);
    if (V.cur && V.prev && V.prev.value !== V.cur.value){
      const d = V.cur.value - V.prev.value, up = d > 0, pct = V.prev.value ? Math.abs(d / V.prev.value * 100) : null, better = up === (V.better === 'higher');
      fitText(`${up ? '▲' : '▼'} ${pct != null ? fmtNum(pct, pct < 10 ? 1 : 0) + '%' : fmtNum(Math.abs(d))} since last`, b.x + 12, y0 + 58, vw, `600 12px ${FONTS.sans}`, better ? good : bad);
    } else fitText(!V.hist.length ? 'No value yet' : V.hist.length === 1 && V.hist[0].base ? 'Starting value' : plural(V.hist.length, 'reading'), b.x + 12, y0 + 58, vw, `500 12px ${FONTS.sans}`, TH.muted);
    if (spark) sparkline(V.hist.slice(-24).map(h => h.value), b.x + b.w * .6, y0 + 14, b.w * .4 - 14, 40, accent || TH.accent);
    // progress to the target
    const ty = y0 + 80;
    if (V.target != null && V.cur){
      const p = V.better === 'higher' ? V.cur.value / (V.target || 1) : V.target / (V.cur.value || 1), f = Math.max(0, Math.min(1, p));
      rr(ctx, b.x + 12, ty, b.w - 24, 6, 3); ctx.fillStyle = TH.line2 || TH.line; ctx.fill();
      rr(ctx, b.x + 12, ty, Math.max(6, (b.w - 24) * f), 6, 3); ctx.fillStyle = p >= 1 ? good : accent || TH.accent; ctx.fill();
      fitText(`${fmtNum(Math.round(p * 100))}% of target ${fmtNum(V.target)}${V.unit ? ' ' + V.unit : ''}`, b.x + 12, ty + 17, b.w - 24, `500 11.5px ${FONTS.sans}`, TH.muted);
    } else if (V.last) {
      dataAvatar(V.last.author, b.x + 20, ty + 8, 8);
      fitText(`${whoName(V.last.author)} · ${when(V.last.t)}${V.last.note ? ' · ' + V.last.note : ''}`, b.x + 34, ty + 8, b.w - 46, `500 11.5px ${FONTS.sans}`, TH.muted);
    }
    dataFoot(b, 'Log a value', b.y + b.h - 28);
  },
  hit(el, w, b){ return w.y >= b.y + b.h - 28 ? { act: 'log', press: true } : w.y > b.y + 36 ? { act: 'value' } : null; },
  press(el){ metricLog(el); },
  edit(el, h){ if (h.act !== 'value' && h.act !== 'log') return false; metricLog(el); return true; },
  others: 'Log a new value at the bottom. Only its author changes the name, unit and target.',
  async form(el){
    const V = el ? metricView(el) : null;
    const v = await formDialog(el ? 'Edit metric' : 'New metric', [
      { id: 'title', label: 'What it measures', type: 'text', value: V ? V.title : 'Weekly active teams' },
      { id: 'value', label: el ? 'Starting value' : 'Value now', type: 'text', value: V?.value ?? '', half: true },
      { id: 'unit', label: 'Unit', type: 'text', value: V ? V.unit : '', half: true, hint: '$k, %, ms, users…' },
      { id: 'target', label: 'Target', type: 'text', value: V?.target ?? '', half: true },
      { id: 'better', label: 'Better is', type: 'select', value: V?.better || 'higher', options: [['higher', 'Higher'], ['lower', 'Lower']], half: true },
    ], { ok: el ? 'Sign the new version' : 'Add metric', why: 'Anyone who can draw here logs new values; every reading is signed and kept, so the history can’t be rewritten.' });
    if (!v) return null;
    const num = s => String(s).trim() === '' ? null : dataNum(s);
    if (String(v.value).trim() && num(v.value) == null || String(v.target).trim() && num(v.target) == null){ toast('Value and target must be numbers.'); return null; }
    return metricText({ title: v.title.trim() || 'Metric', value: num(v.value), unit: v.unit.trim(), target: num(v.target), better: v.better });
  },
  describe(el){ const V = metricView(el); return `${V.cur ? fmtNum(V.cur.value) : 'no value'}${V.unit ? ' ' + V.unit : ''}${V.target != null ? `, target ${fmtNum(V.target)}` : ''}, ${plural(V.hist.length, 'reading')}`; },
  lines(el){ const V = metricView(el); return [`${V.cur ? fmtNum(V.cur.value) : '—'} ${V.unit}`.trim(), ...(V.target != null ? [`Target ${fmtNum(V.target)}`] : []), ...V.hist.slice(-8).map(h => `${h.r ? new Date(h.r.t).toLocaleDateString() : 'start'}: ${fmtNum(h.value)}`)]; },
});
function metricLog(el){
  const b = box(current(el.cid) || el), V = metricView(el);
  dataField({ el, rect: { x: b.x + 8, y: b.y + b.h - 26, w: Math.min(180, b.w - 16), h: 24 }, value: '', numeric: true, placeholder: V.cur ? String(V.cur.value) : 'Value',
    label: `New value for ${V.title || 'the metric'}`, commit: async v => { if (!v) return; await addReading(el, dataNum(v)); say(`Logged ${v} for ${V.title}.`); } });
}
