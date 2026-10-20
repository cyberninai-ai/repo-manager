'use strict';
// @module features/flow/engine — Flows: canvas items connected in order and run as a pipeline. A flow starts at a Flow node
// and follows its connectors (arrows, and the links "+" handles make) through every item it reaches, in order. Notes and
// data nodes pass their content along; Step nodes act on it: some only pass data (filter, sort, pick…), some respond
// (ask, ideas: a responder writes something new, which is where AI plugs in), some write back to the canvas (notes,
// rows, items, readings). A run is signed: RUN names the flow and a log of what every step produced, so everyone sees
// the same responses and where they came from.
// @uses features/data/core, features/data/table, features/data/checklist, features/data/metric, features/data/formula, features/data/date, features/data/link, features/data/code, diagrams
// RUN-I-R-{flow root}-V-{log blob}-S-{ok|error}-C-{steps}-Z-T-SIG     the log is JSON: [{ r, t, mode, in, out: [item], err, ms }]
// An item is { text, f?: { field: value }, n?: number }: a row, a line, a value.

const PIPE_STEPS = {};       // do → { mode: 'pass' | 'respond' | 'write', name, blurb, fields: [form fields], summary(cfg), run: async (items, cfg, ctx) → items }
const FLOW_RESPONDERS = {};  // id → { name, builtin?, run: async ({ kind, prompt, items, count, cfg, step }) → string | string[] }: AI connects here
const PIPE_MODES = { pass: ['Passes data', null], respond: ['Responds', 'acc'], write: ['Writes', 'good'] };
const PIPE = { runs: new Map(), last: new Map(), logs: new Map(), focus: null };
const PIPE_GUARDS = [];      // async (plan, flow) → false to stop a run before it starts (code by someone else: features/flow/sandbox)
const PIPE_LIVE = new Map();  // during a run in this browser: element → { state: 'wait' | 'run' | 'ok' | 'err', out, err, ms }
let pipeRunning = null;
const PIPE_CAP = { steps: 60, items: 500, text: 2000, writes: 100, log: 256 * 1024 };

registerRecord('RUN', { parse(r, f){ must(isCid(f.R) && isCid(f.V) && (f.S === 'ok' || f.S === 'error'), 'run'); r.ok = f.S === 'ok'; r.steps = Math.min(999, Math.max(0, decInt(f.C || '0'))); r.title = decTxt(f.M || '').slice(0, 120); },
  blob: 'V', say: r => `ran the flow “${r.title.slice(0, 40)}”${r.ok ? '' : ' (with errors)'}` });
// a peer's log is untrusted: rebuilt field by field, capped, nothing but strings and finite numbers
function pipeLog(r){
  if (PIPE.logs.has(r.cid)) return PIPE.logs.get(r.cid);
  const b = S.blobs.get(r.f.V); if (!b) return null;
  let out = [];
  try {
    const raw = JSON.parse(new TextDecoder().decode(b)); if (!Array.isArray(raw)) throw 0;
    const str = (s, m) => typeof s === 'string' ? s.slice(0, m) : '';
    out = raw.slice(0, 100).map(s => ({ r: str(s?.r, 80), t: str(s?.t, 200), mode: own(PIPE_MODES, s?.mode) ? s.mode : 'pass', in: Number.isFinite(s?.in) ? s.in : 0, ms: Number.isFinite(s?.ms) ? s.ms : 0,
      err: str(s?.err, 300), out: (Array.isArray(s?.out) ? s.out : []).slice(0, PIPE_CAP.items).map(pipeItem) }));
  } catch { out = []; }
  PIPE.logs.set(r.cid, out); return out;
}
function pipeItem(i){
  const it = { text: typeof i?.text === 'string' ? i.text.slice(0, PIPE_CAP.text) : String(i?.text ?? '').slice(0, PIPE_CAP.text) };
  if (Number.isFinite(i?.n)) it.n = i.n;
  if (i?.f && typeof i.f === 'object'){ it.f = {}; for (const [k, v] of Object.entries(i.f).slice(0, 20)) if (typeof k === 'string' && k !== '__proto__') it.f[k.slice(0, 60)] = String(v ?? '').slice(0, 400); }
  return it;
}
DERIVE_HOOKS.push((D, by) => {
  PIPE.runs = new Map(); PIPE.last = new Map(); PIPE.edges = null;
  for (const r of by.RUN || []){ if (D.hidden.has(r.cid)) continue; if (!PIPE.runs.has(r.f.R)) PIPE.runs.set(r.f.R, []); PIPE.runs.get(r.f.R).push(r); }
  // what each step produced in the latest run that reached it
  for (const runs of PIPE.runs.values()) for (const r of runs){ const log = pipeLog(r); if (log) for (const s of log) if (s.r){ const p = PIPE.last.get(s.r); if (!p || p.run.z <= r.z) PIPE.last.set(s.r, { s, run: r }); } }
});
// blobs can arrive after their record: read the log once it's here
CHANGE_HOOKS.push(() => { for (const runs of PIPE.runs.values()) for (const r of runs) if (!PIPE.logs.has(r.cid) && S.blobs.has(r.f.V)){ changed(); return; } });

/* the graph: arrows and "+" links between visible elements */
const pipeKey = el => el.type === 'NODE' ? dataRoot(el) : el.cid;   // a node keeps its key across its author's edits
function pipeEdges(){
  if (PIPE.edges) return PIPE.edges;
  const out = new Map(), add = (a, b) => { if (!a || !b || a.cid === b.cid || !visible(a) || !visible(b) || S.D.hidden.has(a.cid) || S.D.hidden.has(b.cid)) return; if (!out.has(a.cid)) out.set(a.cid, []); if (!out.get(a.cid).includes(b.cid)) out.get(a.cid).push(b.cid); };
  for (const el of S.D.els){
    if (el.type === 'ARROW' && visible(el) && !S.D.hidden.has(el.cid)) add(current(el.f.FROM), current(el.f.TO));
    else if (el.type === 'NODE' && el.parent && !S.D.superseded.has(el.cid)) add(current(el.parent), el);
  }
  return PIPE.edges = out;
}
// every item the flow reaches, plus what feeds into those items from outside (a table connected into a step), in an order
// that respects the connectors; ties read left to right, then top to bottom. Another flow's start is never pulled in.
function pipePlan(flow){
  const E = pipeEdges(), seen = new Set([flow.cid]), q = [flow.cid], rev = new Map();
  for (const [a, bs] of E) for (const b of bs){ if (!rev.has(b)) rev.set(b, []); rev.get(b).push(a); }
  const isFlow = c => c !== flow.cid && S.records.get(c)?.ek === 'flow';
  while (q.length && seen.size <= PIPE_CAP.steps) for (const n of E.get(q.shift()) || []) if (!seen.has(n) && !isFlow(n)){ seen.add(n); q.push(n); }
  const up = [...seen];
  while (up.length && seen.size <= PIPE_CAP.steps) for (const p of rev.get(up.shift()) || []) if (!seen.has(p) && !isFlow(p)){ seen.add(p); up.push(p); }
  if (seen.size > PIPE_CAP.steps) return { err: `A flow can have up to ${PIPE_CAP.steps} steps.` };
  const preds = new Map([...seen].map(c => [c, []]));
  for (const a of seen) for (const b of E.get(a) || []) if (seen.has(b) && b !== flow.cid) preds.get(b).push(a);
  const deg = new Map([...seen].map(c => [c, preds.get(c).length])), at = c => { const b = box(S.records.get(c)); return b ? [b.x, b.y] : [0, 0]; };
  const order = [], ready = [...seen].filter(c => !deg.get(c));
  while (ready.length){
    ready.sort((a, b) => (b === flow.cid) - (a === flow.cid) || at(a)[0] - at(b)[0] || at(a)[1] - at(b)[1]);   // the flow first
    const c = ready.shift(); order.push(c);
    for (const n of E.get(c) || []) if (seen.has(n) && n !== flow.cid && deg.set(n, deg.get(n) - 1).get(n) === 0) ready.push(n);
  }
  if (order.length < seen.size){ const stuck = [...seen].find(c => !order.includes(c)); return { err: `These steps feed each other in a loop, at “${elTitle(stuck)}”.`, at: stuck }; }
  return { order, preds };
}

/* what an item on the canvas contributes */
function pipeItems(el){
  if (el.type === 'TEXT') return el.text.trim() ? [{ text: el.text.trim() }] : [];
  if (el.type === 'IMAGE') return el.alt ? [{ text: el.alt }] : [];
  if (el.type !== 'NODE') return [];
  const t = el.ek;
  if (t === 'table'){ const V = tableView(el), j = V.sums.findIndex(s => s != null);   // a row reads as its name; its cells are fields; its value the first number column
    return V.rows.map(r => { const it = { text: r.vals[0] || r.vals.filter(Boolean).join(' · '), f: Object.fromEntries(V.cols.map((c, k) => [c, r.vals[k] ?? ''])) }, n = j > 0 ? dataNum(r.vals[j]) : null; if (n != null) it.n = n; return it; }); }
  if (t === 'checklist'){ const V = checklistView(el); return V.items.map(i => ({ text: i.text, f: { done: i.done ? 'yes' : 'no' } })); }
  if (t === 'metric'){ const V = metricView(el); return V.cur ? [{ text: `${V.title}: ${fmtNum(V.cur.value)}${V.unit ? ' ' + V.unit : ''}`, n: V.cur.value, f: { name: V.title, value: String(V.cur.value), unit: V.unit } }] : []; }
  if (t === 'formula'){ const R = formulaResult(el); return R.err ? [] : [{ text: `${R.title}: ${fmtNum(R.value, R.dp)}${R.unit ? ' ' + R.unit : ''}`, n: R.value, f: { name: R.title, value: String(R.value) } }]; }
  if (t === 'date'){ const D = parseDate(el.text), d = dateDays(el), it = { text: `${D.title}: ${dateRel(d).toLowerCase()}`, f: { name: D.title, days: String(d ?? '') } }; if (d != null) it.n = d; return [it]; }
  if (t === 'link'){ const K = parseLink(el.text); return [{ text: [K.title, K.url, K.note].filter(Boolean).join(' — '), f: { title: K.title, url: K.url, note: K.note } }]; }
  if (t === 'code'){ const C = parseCode(el.text); return [{ text: C.lines.join('\n'), f: { language: C.lang } }]; }
  if (t === 'live'){ const C = parseCode(el.text); return [{ text: C.lines.join('\n'), f: { language: C.lang } }]; }
  if (t === 'chart' || t === 'flow' || t === 'frame' || t === 'results') return [];   // a results node shows what reaches it and passes it on
  return el.text.trim() ? [{ text: el.text.trim() }] : [];   // a note, card, idea or shape: its words are context
}

/* running */
const pipeTitle = el => el.type === 'NODE' && DATA_KINDS[el.ek] ? dataTitle(el) || DATA_KINDS[el.ek].name : elTitle(el.cid);
async function runFlow(flowEl){
  flowEl = current(flowEl.cid);
  if (pipeRunning){ toast('A flow is already running here. Wait for it to finish.'); return null; }
  const P = pipePlan(flowEl); if (P.err){ toast(P.err); if (P.at) goTo(P.at); return null; }
  for (const g of PIPE_GUARDS) if (await g(P, flowEl) === false){ say('Run cancelled.'); return null; }
  const F = parseFlow(flowEl.text), outs = new Map(), log = [], ctx = { flow: flowEl, writes: 0, made: [] };
  pipeRunning = flowEl.cid; PIPE_LIVE.clear(); for (const c of P.order) PIPE_LIVE.set(c, { state: 'wait' }); dirty = true;
  say(`Running “${F.title}”: ${plural(P.order.length - 1, 'step')}.`);
  let ok = true;
  try {
    for (const c of P.order){
      const el = current(c) || S.records.get(c), input = P.preds.get(c).flatMap(p => outs.get(p) || []), live = PIPE_LIVE.get(c);
      live.state = 'run'; dirty = true; await new Promise(r => setTimeout(r, 60));   // let people see it move
      const t0 = performance.now();
      let out = [], err = '';
      try {
        if (c === flowEl.cid) out = F.input.map(text => ({ text }));
        else if (el.type === 'NODE' && el.ek === 'step'){ const cfg = parseStep(el.text), st = PIPE_STEPS[cfg.do]; if (!st) throw new Error(`No action “${cfg.do}”`); ctx.step = el; out = await st.run(input.map(i => ({ ...i })), cfg, ctx); }
        else out = [...input, ...pipeItems(el)];
        out = (out || []).slice(0, PIPE_CAP.items).map(pipeItem);
      } catch (e){ err = e?.message || 'failed'; ok = false; if (e?.name === 'NotPermitted' || e?.name === 'HistoryView') { log.push({ r: pipeKey(el), t: pipeTitle(el), mode: pipeMode(el), in: input.length, out: [], err, ms: 0 }); throw e; } }
      const ms = Math.round(performance.now() - t0);
      outs.set(c, out); Object.assign(live, { state: err ? 'err' : 'ok', out, err, ms, in: input.length }); dirty = true;
      log.push({ r: pipeKey(el), t: pipeTitle(el), mode: pipeMode(el), in: input.length, out, err, ms });
    }
  } catch (e){ ok = false; if (e?.name !== 'NotPermitted' && e?.name !== 'HistoryView') console.warn(e); }
  finally { pipeRunning = null; dirty = true; }
  // sign the run: the log goes with it as a blob, so the responses are the same for everyone
  let json = JSON.stringify(log);
  for (let cap = 200; json.length > PIPE_CAP.log && cap >= 5; cap = Math.floor(cap / 2)) json = JSON.stringify(log.map(s => ({ ...s, out: s.out.slice(0, cap) })));
  const bytes = te.encode(json), V = await cidOf(bytes);
  let cid = null;
  try { cid = await publish(await signed('RUN', [['I', S.me.id], ['R', pipeKey(flowEl)], ['V', V], ['S', ok ? 'ok' : 'error'], ['C', log.length - 1], ['M', encTxt(F.title)], ['Z', ++S.lamport], ['T', Date.now()]]), { [V]: bytes }); }
  catch (e){ if (e?.name !== 'NotPermitted' && e?.name !== 'HistoryView') console.warn(e); }
  const last = log.at(-1);
  say(`${F.title}: ${ok ? 'done' : 'finished with errors'}. ${last ? `The last step gave ${plural(last.out.length, 'item')}.` : ''}`);
  toast(`${F.title} ran · ${plural(log.length - 1, 'step')}${ok ? '' : ' · with errors'}${ctx.made.length ? ` · ${plural(ctx.made.length, 'thing')} written` : ''}`);
  setTimeout(() => { if (!pipeRunning){ PIPE_LIVE.clear(); dirty = true; } }, 4000);
  PIPE.focus = pipeKey(flowEl); if (panelOpen === 'pipes') paintPanel('pipes');
  return cid;
}
function pipeMode(el){ return el.type === 'NODE' && el.ek === 'step' ? PIPE_STEPS[parseStep(el.text).do]?.mode || 'pass' : 'pass'; }
// the output a step shows: the run happening here, else the latest signed run that reached it
function pipeOut(el){ const live = PIPE_LIVE.get(el.cid); if (live && live.state !== 'wait') return { live: true, state: live.state, out: live.out || [], err: live.err, ms: live.ms, in: live.in };
  const l = PIPE.last.get(pipeKey(el)); return l ? { state: l.s.err ? 'err' : 'ok', out: l.s.out, err: l.s.err, ms: l.s.ms, in: l.s.in, run: l.run } : null; }

/* the steps */
// a field of an item, by name, case-insensitive; "text" and "value" always work
function pipeField(it, name){
  const k = String(name).trim().toLowerCase(); if (k === 'text') return it.text; if ((k === 'value' || k === 'n') && it.n != null) return it.n;
  if (it.f) for (const [f, v] of Object.entries(it.f)) if (f.toLowerCase() === k) return v;
  return undefined;
}
const pipeFill = (tpl, it, all) => String(tpl).replace(/\{\{\s*([^}]{1,60}?)\s*\}\}/g, (_, k) => k.toLowerCase() === 'all' ? all : k.toLowerCase() === 'count' ? String(all.split('\n').filter(Boolean).length) : String(it ? pipeField(it, k) ?? '' : ''));
const pipeAll = items => items.map(i => (items.length > 1 ? '- ' : '') + i.text).join('\n');
function pipeTest(it, where){
  const m = String(where).match(/^(.+?)\s*(>=|<=|!=|=|>|<|\bcontains\b|\bhas\b|\bis not\b|\bis\b)\s*(.*)$/i); if (!m) return String(it.text).toLowerCase().includes(String(where).trim().toLowerCase());
  const [, f, op0, want] = m, op = op0.toLowerCase(), have = pipeField(it, f), hn = dataNum(have), wn = dataNum(want), h = String(have ?? '').toLowerCase(), w = want.trim().toLowerCase();
  if (op === 'contains' || op === 'has') return h.includes(w);
  if (op === '=' || op === 'is') return hn != null && wn != null ? hn === wn : h === w;
  if (op === '!=' || op === 'is not') return hn != null && wn != null ? hn !== wn : h !== w;
  if (hn == null || wn == null) return false;
  return op === '>' ? hn > wn : op === '<' ? hn < wn : op === '>=' ? hn >= wn : hn <= wn;
}
function pipeStep(id, spec){ PIPE_STEPS[id] = spec; }
pipeStep('filter', { mode: 'pass', name: 'Filter', blurb: 'Keep the items that match', fields: [{ id: 'where', label: 'Keep items where', type: 'text', value: 'Price > 50', hint: 'A field and a test: Price > 50, Status = Done, text contains pricing. Or just words to look for.' }],
  summary: c => `where ${c.where || '…'}`, run: (items, c) => c.where ? items.filter(i => pipeTest(i, c.where)) : items });
pipeStep('sort', { mode: 'pass', name: 'Sort', blurb: 'Put the items in order', fields: [{ id: 'by', label: 'Sort by', type: 'text', value: 'text', half: true }, { id: 'order', label: 'Order', type: 'select', value: 'asc', options: [['asc', 'Low to high, A to Z'], ['desc', 'High to low, Z to A']], half: true }],
  summary: c => `by ${c.by || 'text'}${c.order === 'desc' ? ', descending' : ''}`,
  run: (items, c) => { const k = i => pipeField(i, c.by || 'text'), s = [...items].sort((a, b) => { const x = k(a), y = k(b), nx = dataNum(x), ny = dataNum(y); return nx != null && ny != null ? nx - ny : String(x ?? '').localeCompare(String(y ?? '')); }); return c.order === 'desc' ? s.reverse() : s; } });
pipeStep('take', { mode: 'pass', name: 'Take', blurb: 'Keep the first few', fields: [{ id: 'count', label: 'How many', type: 'text', value: '5' }], summary: c => `the first ${c.count || 5}`, run: (items, c) => items.slice(0, Math.max(0, parseInt(c.count, 10) || 5)) });
pipeStep('pick', { mode: 'pass', name: 'Pick fields', blurb: 'Keep only some columns', fields: [{ id: 'fields', label: 'Fields', type: 'text', value: 'Plan, Price', hint: 'Separated by commas' }], summary: c => c.fields || '…',
  run: (items, c) => { const fs = String(c.fields || '').split(',').map(s => s.trim()).filter(Boolean); return items.map(i => ({ ...i, f: Object.fromEntries(fs.map(f => [f, pipeField(i, f) ?? ''])), text: fs.map(f => pipeField(i, f) ?? '').filter(v => v !== '').join(' · ') })); } });
pipeStep('unique', { mode: 'pass', name: 'Remove repeats', blurb: 'One of each', fields: [], summary: () => 'one of each', run: items => { const seen = new Set(); return items.filter(i => { const k = i.text.trim().toLowerCase(); return !seen.has(k) && seen.add(k); }); } });
pipeStep('split', { mode: 'pass', name: 'Split', blurb: 'One item per line or comma', fields: [{ id: 'by', label: 'Split at', type: 'select', value: 'lines', options: [['lines', 'Lines'], ['commas', 'Commas'], ['sentences', 'Sentences']] }], summary: c => `at ${c.by || 'lines'}`,
  run: (items, c) => items.flatMap(i => i.text.split(c.by === 'commas' ? /\s*,\s*/ : c.by === 'sentences' ? /(?<=[.!?])\s+/ : /\n+/).map(s => s.replace(/^[-*•]\s*/, '').trim()).filter(Boolean).map(text => ({ text }))) });
pipeStep('join', { mode: 'pass', name: 'Join', blurb: 'Everything as one item', fields: [{ id: 'with', label: 'Between items', type: 'select', value: 'lines', options: [['lines', 'New lines'], ['bullets', 'Bullets'], ['commas', 'Commas']] }], summary: c => `with ${c.with || 'lines'}`,
  run: (items, c) => items.length ? [{ text: items.map(i => (c.with === 'bullets' ? '• ' : '') + i.text).join(c.with === 'commas' ? ', ' : '\n') }] : [] });
pipeStep('template', { mode: 'pass', name: 'Format', blurb: 'Rewrite each item from a pattern', fields: [{ id: 'text', label: 'Pattern', type: 'text', value: '{{Plan}} costs ${{Price}}', hint: '{{field}} for a field, {{text}} for the item' }], summary: c => c.text || '…',
  run: (items, c) => items.map(i => ({ ...i, text: pipeFill(c.text || '{{text}}', i, '') })) });
pipeStep('count', { mode: 'pass', name: 'Count', blurb: 'How many came in', fields: [], summary: () => 'the items', run: items => [{ text: plural(items.length, 'item'), n: items.length }] });
pipeStep('sum', { mode: 'pass', name: 'Total', blurb: 'Add up a field', fields: [{ id: 'field', label: 'Field', type: 'text', value: 'value' }], summary: c => `of ${c.field || 'value'}`,
  run: (items, c) => { const t = items.reduce((s, i) => s + (dataNum(pipeField(i, c.field || 'value')) ?? 0), 0); return [{ text: `Total ${c.field || 'value'}: ${fmtNum(t)}`, n: t }]; } });
// responders: who answers a step that responds. "auto" uses a connected AI first, then the built-in one
function pipeResponder(c, fallback){
  const id = (c.using || 'auto').toLowerCase();
  if (id !== 'auto'){ if (!own(FLOW_RESPONDERS, id)) throw new Error(`No responder “${id}” is connected`); return FLOW_RESPONDERS[id]; }
  return Object.values(FLOW_RESPONDERS).find(r => !r.builtin) || FLOW_RESPONDERS[fallback];
}
const pipeLines = r => (Array.isArray(r) ? r : String(r ?? '').split(/\n+/)).map(s => String(s).replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
pipeStep('ask', { mode: 'respond', name: 'Ask', blurb: 'A responder answers a prompt about what came in', fields: [
  { id: 'prompt', label: 'Prompt', type: 'textarea', rows: 4, value: 'Summarise these in one sentence:\n{{all}}', hint: '{{all}} is everything that came in, {{count}} how many' },
  { id: 'as', label: 'Answer as', type: 'select', value: 'text', options: [['text', 'One answer'], ['list', 'A list (one item per line)']], half: true },
  { id: 'using', label: 'Responder', type: 'select', value: 'auto', half: true, options: () => [['auto', 'Automatic'], ...Object.entries(FLOW_RESPONDERS).map(([k, r]) => [k, r.name])] }],
  summary: c => `${(c.prompt || '').split('\n')[0].slice(0, 40)}`,
  async run(items, c, ctx){ const R = pipeResponder(c, 'echo'), prompt = pipeFill(c.prompt || '{{all}}', items[0], pipeAll(items));
    const r = await R.run({ kind: 'ask', prompt, items, cfg: c, step: ctx.step }); return c.as === 'list' ? pipeLines(r).map(text => ({ text })) : [{ text: (Array.isArray(r) ? r.join('\n') : String(r ?? '')).trim() }]; } });
pipeStep('ideas', { mode: 'respond', name: 'Ideas', blurb: 'New ideas from each item, to brainstorm on', fields: [
  { id: 'count', label: 'Ideas per item', type: 'text', value: '3', half: true },
  { id: 'using', label: 'Responder', type: 'select', value: 'auto', half: true, options: () => [['auto', 'Automatic'], ...Object.entries(FLOW_RESPONDERS).map(([k, r]) => [k, r.name])] },
  { id: 'prompt', label: 'Steer it (optional)', type: 'text', value: '', hint: 'For an AI responder: “cheap to try”, “for first-time users”…' }],
  summary: c => `${c.count || 3} per item`,
  async run(items, c, ctx){ const R = pipeResponder(c, 'spark'), n = Math.min(10, Math.max(1, parseInt(c.count, 10) || 3));
    const r = await R.run({ kind: 'ideas', prompt: c.prompt || '', items: items.slice(0, 20), count: n, cfg: c, step: ctx.step }); return pipeLines(r).slice(0, 100).map(text => ({ text })); } });
// without AI: one answer is the prompt filled in (what an AI would be asked); a list is one draft line per item
FLOW_RESPONDERS.echo = { name: 'Built-in: fill in the prompt', builtin: true, run: ({ prompt, items, cfg }) => cfg?.as === 'list' && items.length ? items.map(i => `Draft: ${i.text}`) : prompt };
// built-in brainstorming without AI: prompts that turn each item into new angles (SCAMPER), and pairs of items combined
const SPARK = ['What if “%” were free for the first month?', 'What could replace “%” entirely?', 'Combine “%” with something people already use daily', 'What if “%” took one click instead of many?',
  'Who else could use “%”, and how?', 'Remove one step from “%”: what breaks, what improves?', 'Do “%” in reverse order', 'Make “%” visible to the whole team', 'What would “%” look like on a phone?', 'Turn “%” into a weekly ritual'];
FLOW_RESPONDERS.spark = { name: 'Built-in: idea prompts', builtin: true, run: ({ items, count }) => {
  const out = [], seed = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  for (const it of items){ const t = it.text.replace(/\s+/g, ' ').slice(0, 60), s = seed(t); for (let k = 0; k < count; k++) out.push(SPARK[(s + k * 3) % SPARK.length].replace('%', t)); }
  if (items.length > 1) out.push(`Combine “${items[0].text.slice(0, 40)}” with “${items[1].text.slice(0, 40)}”`);
  return out; } };
// writing back to the canvas: each write is an ordinary signed record by whoever runs the flow
const pipeTarget = (c, kind) => { const t = DATA.titles.get(String(c.into || '').trim().toLowerCase()); if (!t || t.ek !== kind) throw new Error(`No ${DATA_KINDS[kind].name.toLowerCase()} called “${c.into || ''}” here`); return t; };
const pipeBudget = (ctx, n) => { if (ctx.writes + n > PIPE_CAP.writes) throw new Error(`A run writes at most ${PIPE_CAP.writes} things`); ctx.writes += n; };
const titlesOf = kind => () => [...DATA.titles.values()].filter(e => e.ek === kind).map(e => [dataTitle(e), dataTitle(e)]);
pipeStep('notes', { mode: 'write', name: 'Make notes', blurb: 'A sticky note for each item, beside this step', fields: [{ id: 'color', label: 'Colour', type: 'select', value: 'ink', options: [['ink', 'Yellow'], ['blue', 'Blue'], ['green', 'Green'], ['pink', 'Pink'], ['violet', 'Violet'], ['orange', 'Orange']] }, { id: 'max', label: 'At most', type: 'text', value: '12', half: true }],
  summary: c => `up to ${c.max || 12}`,
  async run(items, c, ctx){ const max = Math.min(30, Math.max(1, parseInt(c.max, 10) || 12)), list = items.slice(0, max); pipeBudget(ctx, list.length);
    const b = box(ctx.step), cols = Math.ceil(Math.sqrt(list.length));
    for (const [k, it] of list.entries()){ const cid = await commitNode({ kind: 'sticky', x: b.x + b.w + 80 + (k % cols) * 180, y: b.y + Math.floor(k / cols) * 160, label: it.text.slice(0, 300), color: c.color || 'ink' }); if (cid) ctx.made.push(cid); }
    return items; } });
pipeStep('rows', { mode: 'write', name: 'Add rows to a table', blurb: 'Each item becomes a row; fields fill the columns with the same name', fields: [{ id: 'into', label: 'Table', type: 'select', value: '', options: titlesOf('table') }],
  summary: c => `into ${c.into || '…'}`,
  async run(items, c, ctx){ const t = pipeTarget(c, 'table'), V = tableView(t); pipeBudget(ctx, items.length);
    for (const it of items){ const vals = V.cols.map((col, j) => { const v = pipeField(it, col); return v != null ? String(v) : j === 0 ? it.text : ''; }); const cid = await addRow(t, vals); if (cid) ctx.made.push(cid); }
    return items; } });
pipeStep('items', { mode: 'write', name: 'Add to a checklist', blurb: 'Each item becomes a checklist item', fields: [{ id: 'into', label: 'Checklist', type: 'select', value: '', options: titlesOf('checklist') }], summary: c => `into ${c.into || '…'}`,
  async run(items, c, ctx){ const t = pipeTarget(c, 'checklist'); pipeBudget(ctx, items.length); for (const it of items){ const cid = await addRow(t, [it.text.slice(0, 300)]); if (cid) ctx.made.push(cid); } return items; } });
pipeStep('log', { mode: 'write', name: 'Log to a metric', blurb: 'The first number that comes in becomes a reading', fields: [{ id: 'into', label: 'Metric', type: 'select', value: '', options: titlesOf('metric') }], summary: c => `into ${c.into || '…'}`,
  async run(items, c, ctx){ const t = pipeTarget(c, 'metric'), v = items.map(i => i.n ?? dataNum(i.text)).find(v => v != null); if (v == null) throw new Error('No number came in'); pipeBudget(ctx, 1); const cid = await addReading(t, v, `from the flow “${parseFlow(ctx.flow.text).title}”`); if (cid) ctx.made.push(cid); return items; } });
