'use strict';
// @module features/data/formula — A computed value: an expression over other data nodes by name ([Cash] / [Monthly burn],
// sum([Estimates.Days])), recalculated whenever any of them changes. A spreadsheet that spans the canvas.
// @uses features/data/core, features/data/table, features/data/metric, features/data/checklist
// label:  Runway
//         = [Cash] / [Monthly burn]
//         unit: months
//         decimals: 1
// [Name] is a metric, formula, date (days from today) or checklist (percent done); [Table.Column] is a column's numbers,
// for sum, avg, min, max and count; [Table.Row.Column] is one cell.
function parseFormula(text){
  const F = { title: '', expr: '', unit: '', dp: null };
  for (const l of String(text).split('\n')){
    const t = l.trim(); if (!t) continue;
    const o = t.match(/^(unit|decimals)\s*:\s*(.*)$/i);
    if (t.startsWith('=')) F.expr = t.slice(1).trim().slice(0, 400);
    else if (o){ if (o[1].toLowerCase() === 'unit') F.unit = o[2].trim().slice(0, 16); else { const d = parseInt(o[2], 10); F.dp = d >= 0 && d <= 6 ? d : null; } }
    else if (!F.title) F.title = t.slice(0, 120);
  }
  return F;
}
const formulaText = f => [f.title, `= ${f.expr}`, ...(f.unit ? [`unit: ${f.unit}`] : []), ...(f.dp != null ? [`decimals: ${f.dp}`] : [])].join('\n');
const FX_FN = { sum: a => a.reduce((s, v) => s + v, 0), avg: a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN, min: a => Math.min(...a), max: a => Math.max(...a), count: a => a.length,
  round: (a, d) => { const k = 10 ** (d?.[0] ?? 0); return Math.round(a[0] * k) / k; }, abs: a => Math.abs(a[0]) };
class FxError extends Error {}
const fxFail = m => { throw new FxError(m); };
function fxTokens(s){
  const out = [], re = /\s*(?:(\d+(?:\.\d+)?)|\[([^\]]{1,120})\]|([a-z]+)|([-+*/^%(),]))/iy; let pos = 0;
  while (pos < s.length){ re.lastIndex = pos; const m = re.exec(s); if (!m) break; pos = re.lastIndex;
    out.push(m[1] != null ? { n: +m[1] } : m[2] != null ? { ref: m[2].trim() } : m[3] != null ? { id: m[3].toLowerCase() } : { op: m[4] }); }
  if (s.slice(pos).trim()) fxFail(`I can’t read “${s.slice(pos).trim().slice(0, 12)}”`);
  return out;
}
// evaluate: numbers, + - * / % ^, parentheses, functions and references; refs(name) → number or list of numbers
function fxEval(expr, refs){
  const t = fxTokens(expr); let i = 0;
  const peek = () => t[i], eat = op => t[i]?.op === op ? (i++, true) : false;
  const num = v => Array.isArray(v) ? fxFail('Use sum(), avg(), min(), max() or count() on a column') : v;
  const expr0 = () => { let v = term(); for (;;){ if (eat('+')) v = num(v) + num(term()); else if (eat('-')) v = num(v) - num(term()); else return v; } };
  const term = () => { let v = power(); for (;;){ if (eat('*')) v = num(v) * num(power()); else if (eat('/')){ const d = num(power()); v = d === 0 ? fxFail('Division by zero') : num(v) / d; } else if (eat('%')) v = num(v) % num(power()); else return v; } };
  const power = () => { const v = unary(); return eat('^') ? num(v) ** num(power()) : v; };
  const unary = () => eat('-') ? -num(unary()) : eat('+') ? num(unary()) : prim();
  const prim = () => {
    const k = t[i++]; if (!k) fxFail('The expression ends too soon');
    if (k.n != null) return k.n;
    if (k.ref != null) return refs(k.ref);
    if (k.op === '('){ const v = expr0(); if (!eat(')')) fxFail('A “)” is missing'); return v; }
    if (k.id){
      const f = FX_FN[k.id]; if (!f) fxFail(`No function “${k.id}”`); if (!eat('(')) fxFail(`${k.id} needs ( )`);
      const args = []; if (!eat(')')){ do args.push(expr0()); while (eat(',')); if (!eat(')')) fxFail('A “)” is missing'); }
      const flat = args.slice(0, k.id === 'round' ? 1 : undefined).flat();
      if (!flat.length && k.id !== 'count') fxFail(`${k.id}() needs numbers`);
      return f(flat, k.id === 'round' ? args.slice(1).map(num) : undefined);
    }
    fxFail(`Unexpected “${k.op}”`);
  };
  const v = expr0(); if (i < t.length) fxFail(`Unexpected “${peek().op ?? peek().id ?? '…'}”`);
  return num(v);
}
const FX_BUSY = new Set();
// what [name] means: a node by its title, or a table's column or cell
function fxRef(name, used){
  const n = name.toLowerCase(), direct = DATA.titles.get(n);
  if (direct){ used.add(direct.cid); return fxNodeValue(direct, name); }
  const parts = name.split('.');
  for (let k = parts.length - 1; k >= 1; k--){
    const tb = DATA.titles.get(parts.slice(0, k).join('.').trim().toLowerCase()); if (tb?.ek !== 'table') continue;
    used.add(tb.cid);
    const V = tableView(tb), rest = parts.slice(k).map(p => p.trim().toLowerCase()), col = V.cols.findIndex(c => c.toLowerCase() === rest.at(-1));
    if (col < 0) fxFail(`${dataTitle(tb)} has no column “${parts.at(-1).trim()}”`);
    if (rest.length === 1) return V.rows.map(r => dataNum(r.vals[col])).filter(v => v != null);
    const row = V.rows.find(r => String(r.vals[0]).trim().toLowerCase() === rest.slice(0, -1).join('.'));
    if (!row) fxFail(`${dataTitle(tb)} has no row “${parts.slice(k, -1).join('.').trim()}”`);
    const v = dataNum(row.vals[col]); return v == null ? fxFail(`“${row.vals[col]}” isn’t a number`) : v;
  }
  fxFail(`Nothing here is called “${name}”`);
}
function fxNodeValue(el, name){
  if (el.ek === 'metric'){ const v = metricValue(el); return v == null ? fxFail(`${name} has no value yet`) : v; }
  if (el.ek === 'formula'){ const r = formulaResult(el); return r.err ? fxFail(/depends on itself/.test(r.err) ? 'It depends on itself' : `${name} can’t be calculated`) : r.value; }
  if (el.ek === 'checklist'){ const V = checklistView(el); return V.items.length ? V.done / V.items.length * 100 : 0; }
  if (el.ek === 'date'){ const d = dateDays(el); return d == null ? fxFail(`${name} has no date`) : d; }
  if (el.ek === 'table') fxFail(`Name a column: [${name}.Column]`);
  fxFail(`${name} isn’t a number`);
}
function formulaResult(el){
  return dataMemo(el, 'fx', () => {
    const F = parseFormula(el.text), used = new Set();
    if (FX_BUSY.has(el.cid)) return { ...F, err: 'It depends on itself', used };
    if (!F.expr) return { ...F, err: 'No expression yet', used };
    FX_BUSY.add(el.cid);
    try { const v = fxEval(F.expr, name => fxRef(name, used)); return Number.isFinite(v) ? { ...F, value: v, used } : { ...F, err: 'Not a finite number', used }; }
    catch (e){ return { ...F, err: e instanceof FxError ? e.message : 'Can’t calculate this', used }; }
    finally { FX_BUSY.delete(el.cid); }
  });
}
registerDataKind('formula', {
  name: 'Formula', icon: 'formula', glyph: 'ƒ', blurb: 'A value computed from other data nodes by name, always up to date', min: [240, 124],
  label: formulaText({ title: 'Formula', expr: '1 + 1' }),
  layout(text){ const F = parseFormula(text); mctx.font = `500 12px ${FONTS.mono}`; return { w: Math.min(440, Math.max(240, mctx.measureText('= ' + F.expr).width + 28)), h: 124 }; },
  draw(b, L, { el, accent }){
    if (!el) return;
    const R = formulaResult(el); dataCard(b, accent); dataHead(b, R.title || 'Formula', 'FORMULA');
    if (R.err) fitText('⚠ ' + R.err, b.x + 12, b.y + 66, b.w - 24, `600 13px ${FONTS.sans}`, TH.red);
    else { const w = fitText(fmtNum(R.value, R.dp), b.x + 12, b.y + 64, b.w - 60, `700 28px ${FONTS.sans}`, TH.ink); if (R.unit) fitText(R.unit, b.x + 16 + w, b.y + 68, b.w - w - 28, `500 14px ${FONTS.sans}`, TH.muted); }
    ctx.fillStyle = TH.panel2 || TH.paper; rr(ctx, b.x + 8, b.y + b.h - 34, b.w - 16, 26, 6); ctx.fill();
    fitText('= ' + R.expr, b.x + 16, b.y + b.h - 21, b.w - 32, `500 12px ${FONTS.mono}`, TH.muted);
  },
  hit(el, w, b){ return w.y > b.y + 36 ? { act: 'expr' } : null; },
  others: 'A formula recalculates from the nodes it names. Only its author changes the expression.',
  async form(el){
    const F = el ? parseFormula(el.text) : null, names = [...DATA.titles.entries()].filter(([, e]) => e.ek !== 'chart' && e.ek !== 'link' && e.ek !== 'code' && e.cid !== el?.cid).map(([, e]) => e.ek === 'table' ? `[${dataTitle(e)}.${tableView(e).cols[1] || 'Column'}]` : `[${dataTitle(e)}]`).slice(0, 8);
    const v = await formDialog(el ? 'Edit formula' : 'New formula', [
      { id: 'title', label: 'Name', type: 'text', value: F ? F.title : 'Runway', hint: 'Other formulas can use it as [Name].' },
      { id: 'expr', label: 'Expression', type: 'text', value: F ? F.expr : (names.length >= 2 ? `${names[0]} / ${names[1]}` : names[0] ? `${names[0]} * 2` : '12 * 4'),
        hint: names.length ? `On this canvas: ${names.join(' ')}. Also sum( ) avg( ) min( ) max( ) count( ) round(x, d) abs( ).` : 'Name other data nodes in [brackets]: [Revenue] / [Costs], sum([Table.Column]).' },
      { id: 'unit', label: 'Unit', type: 'text', value: F?.unit || '', half: true },
      { id: 'dp', label: 'Decimals', type: 'text', value: F?.dp ?? '', half: true, hint: 'Empty: as many as it needs.' },
    ], { ok: el ? 'Sign the new version' : 'Add formula', why: 'The value is never stored: everyone computes it from the same signed data, so it can’t drift.' });
    if (!v) return null;
    try { fxTokens(v.expr); } catch (e){ toast(e.message); return null; }
    return formulaText({ title: v.title.trim() || 'Formula', expr: v.expr.replace(/^\s*=/, '').trim(), unit: v.unit.trim(), dp: /^[0-6]$/.test(String(v.dp).trim()) ? +String(v.dp).trim() : null });
  },
  describe(el){ const R = formulaResult(el); return R.err ? `${R.expr}, which can’t be calculated: ${R.err}` : `${fmtNum(R.value, R.dp)}${R.unit ? ' ' + R.unit : ''}, computed as ${R.expr}`; },
  lines(el){ const R = formulaResult(el); return [R.err ? '⚠ ' + R.err : `${fmtNum(R.value, R.dp)} ${R.unit}`.trim(), '= ' + R.expr]; },
});
// a selected formula shows where its numbers come from
RENDER_HOOKS.under.push(() => {
  if (S.sel.size !== 1) return;
  const el = current([...S.sel][0]); if (el?.type !== 'NODE' || el.ek !== 'formula' || !visible(el)) return;
  const R = formulaResult(el), to = box(el);
  for (const c of R.used || []){ const s = current(c); if (!s || !visible(s)) continue; ctx.save(); ctx.setLineDash([5 / S.view.zoom, 5 / S.view.zoom]); drawLink(box(s), to, true, TH.accent, 1.5 / Math.max(.5, S.view.zoom)); ctx.restore(); }
});
