'use strict';
// @module features/flow/nodes — The Flow node (where a flow starts, with its Run button) and the Step node (one action:
// it passes data, responds, or writes), and adding steps so each one connects to the last
// @uses features/flow/engine, features/data/core, diagrams, ui/form
// Flow label:  Brainstorm onboarding           Step label:  Keep the painful ones
//              Long signup form                             do: filter
//              No sample data                               where: votes > 2
// (the lines under a flow's title are what it starts with; a step's lines are its action and settings)
const STEP_KEYS = new Set(['do', 'where', 'by', 'order', 'count', 'fields', 'with', 'text', 'prompt', 'as', 'using', 'color', 'max', 'into', 'field']);
function parseFlow(text){ const ls = String(text).split('\n').map(l => l.trim()).filter(Boolean); return { title: (ls[0] || 'Flow').slice(0, 120), input: ls.slice(1, 101).map(l => l.replace(/^[-*•]\s*/, '').slice(0, 500)).filter(Boolean) }; }
const flowText = (title, input) => [title, ...input.map(i => `- ${i}`)].join('\n');
// "key: value" lines; a line that isn't a known key continues the one before (a prompt can span lines)
function parseStep(text){
  const ls = String(text).split('\n'), c = { title: '', do: 'filter' }; let last = null;
  for (const l of ls){
    const m = l.match(/^\s*([a-z]+)\s*:\s?(.*)$/i);
    if (m && STEP_KEYS.has(m[1].toLowerCase())){ last = m[1].toLowerCase(); c[last] = m[2].trim().slice(0, 2000); }
    else if (!c.title && !last && l.trim()) c.title = l.trim().slice(0, 120);
    else if (last && (last === 'prompt' || last === 'text')) c[last] += '\n' + l.replace(/^ {2}/, '');
  }
  c.do = String(c.do || 'filter').toLowerCase().trim();
  return c;
}
const stepText = (title, c) => [title, `do: ${c.do}`, ...Object.entries(c).filter(([k, v]) => k !== 'do' && k !== 'title' && STEP_KEYS.has(k) && String(v ?? '').trim() !== '').map(([k, v]) => `${k}: ${String(v).replace(/\n/g, '\n  ')}`)].join('\n');

/* the flow node */
const FLOW_RUN = b => ({ x: b.x + b.w - 84, y: b.y + 12, w: 72, h: 26 });
registerDataKind('flow', {
  name: 'Flow', icon: 'pipe', glyph: '▶', menu: 'flow', blurb: 'Where a flow starts: connect steps to it, then run it', min: [300, 104],
  label: flowText('Flow', []),
  layout(){ return { w: 300, h: 104 }; },
  draw(b, L, { el, accent }){
    if (!el) return;
    const F = parseFlow(el.text), P = dataMemo(el, 'plan', () => pipePlan(el)), runs = PIPE.runs.get(pipeKey(el)) || [], last = runs.at(-1), running = pipeRunning === el.cid, tone = accent || TH.accent;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.10)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2; rr(ctx, b.x, b.y, b.w, b.h, 12); ctx.fillStyle = TH.panel; ctx.fill(); ctx.restore();
    rr(ctx, b.x, b.y, b.w, b.h, 12); ctx.lineWidth = 1.5; ctx.strokeStyle = tone; ctx.stroke();
    ctx.save(); rr(ctx, b.x, b.y, b.w, b.h, 12); ctx.clip(); ctx.fillStyle = tint(tone, .08); ctx.fillRect(b.x, b.y, b.w, 50); ctx.restore();
    fitText(F.title, b.x + 14, b.y + 25, b.w - 110, `700 15px ${FONTS.sans}`, TH.ink);
    const r = FLOW_RUN(b); rr(ctx, r.x, r.y, r.w, r.h, 13); ctx.fillStyle = running ? tint(tone, .3) : tone; ctx.fill();
    fitText(running ? 'Running…' : '▶ Run', r.x + r.w / 2, r.y + 13, r.w - 8, `650 12.5px ${FONTS.sans}`, running ? tone : '#fff', 'center');
    const n = P.err ? 0 : P.order.length - 1;
    fitText(P.err ? '⚠ ' + P.err : n ? P.order.slice(1, 6).map(c => pipeTitle(current(c) || S.records.get(c))).join(' → ') + (n > 5 ? ' → …' : '') : 'Connect a step to it: select it, then D → Step', b.x + 14, b.y + 64, b.w - 28, `500 12px ${FONTS.sans}`, P.err ? TH.red : TH.muted);
    fitText(last ? `${last.ok ? '✓' : '⚠'} Ran ${when(last.t)} by ${whoName(last.author)} · ${plural(runs.length, 'run')}` : `${plural(n, 'step')}${F.input.length ? ` · starts with ${plural(F.input.length, 'item')}` : ''} · not run yet`,
      b.x + 14, b.y + 86, b.w - 28, `500 11.5px ${FONTS.sans}`, last && !last.ok ? TH.red : TH.muted);
  },
  hit(el, w, b){ return inRect(w, FLOW_RUN(b)) ? { act: 'run', press: true } : null; },
  press(el){ return runFlow(el); },
  others: 'Press ▶ Run to run it. Only its author changes what it starts with.',
  async form(el){
    const F = el ? parseFlow(el.text) : null;
    const v = await formDialog(el ? 'Edit flow' : 'New flow', [
      { id: 'title', label: 'Name', type: 'text', value: F ? F.title : 'Brainstorm onboarding' },
      { id: 'input', label: 'Start with (optional)', type: 'textarea', rows: 4, value: F ? F.input.join('\n') : 'Long signup form\nNo sample data\nPricing unclear', hint: 'One item per line. Steps connected to the flow receive these, plus whatever the items they pass through add.' },
    ], { ok: el ? 'Sign the new version' : 'Add flow', why: 'A flow runs everything connected after it, in order. Every run is signed with what each step produced.' });
    if (!v) return null;
    return flowText(v.title.trim() || 'Flow', v.input.split('\n').map(s => s.trim()).filter(Boolean));
  },
  describe(el){ const P = dataMemo(el, 'plan', () => pipePlan(el)), runs = PIPE.runs.get(pipeKey(el)) || []; return `${P.err ? P.err : plural(P.order.length - 1, 'step')}${runs.length ? `, last run ${runs.at(-1).ok ? 'succeeded' : 'had errors'}` : ', not run yet'}. Press Run to run it`; },
  lines(el){ const P = pipePlan(el); return P.err ? [P.err] : P.order.slice(1).map((c, i) => `${i + 1}. ${pipeTitle(current(c) || S.records.get(c))}`); },
});

/* the step node */
const STEP_H = 158;
registerDataKind('step', {
  name: 'Step', icon: 'step', glyph: '◆', menu: 'flow', blurb: 'One action: pass data on, respond, or write to the canvas', min: [270, STEP_H],
  label: stepText('Step', { do: 'filter', where: '' }),
  layout(){ return { w: 280, h: STEP_H }; },
  draw(b, L, { el, accent }){
    if (!el) return;
    const c = parseStep(el.text), st = PIPE_STEPS[c.do], mode = st?.mode || 'pass', tone = mode === 'respond' ? TH.accent : mode === 'write' ? TH.green : null, o = pipeOut(el);
    dataCard(b, accent || (o?.state === 'run' ? TH.accent : null)); dataHead(b, c.title || st?.name || 'Step', PIPE_MODES[mode][0].toUpperCase(), '', tone);
    fitText(st ? `${st.name} · ${st.summary(c)}` : `⚠ No action “${c.do}”`, b.x + 12, b.y + 50, b.w - 24, `500 12px ${FONTS.sans}`, st ? TH.muted : TH.red);
    const ax = b.x + 8, ay = b.y + 62, aw = b.w - 16, ah = b.h - 62 - 30;
    rr(ctx, ax, ay, aw, ah, 7); ctx.fillStyle = TH.panel2 || TH.paper; ctx.fill();
    if (!o || o.state === 'run' && !o.out.length) fitText(o?.state === 'run' ? 'Working…' : 'Run the flow to see what comes out', ax + 10, ay + ah / 2, aw - 20, `500 12px ${FONTS.sans}`, o?.state === 'run' ? TH.accent : TH.muted);
    else if (o.err) fitText('⚠ ' + o.err, ax + 10, ay + 16, aw - 20, `600 12px ${FONTS.sans}`, TH.red);
    else { const rows = Math.floor((ah - 8) / 17), shown = o.out.slice(0, o.out.length > rows ? rows - 1 : rows);
      shown.forEach((it, i) => fitText((o.out.length > 1 ? '• ' : '') + it.text.replace(/\s+/g, ' '), ax + 10, ay + 13 + i * 17, aw - 20, `${mode === 'respond' ? 500 : 400} 12px ${FONTS.sans}`, TH.ink));
      if (o.out.length > shown.length) fitText(`+ ${o.out.length - shown.length} more`, ax + 10, ay + 13 + shown.length * 17, aw - 20, `500 11.5px ${FONTS.sans}`, TH.muted);
      if (!o.out.length) fitText('Nothing came out', ax + 10, ay + 16, aw - 20, `500 12px ${FONTS.sans}`, TH.muted); }
    const foot = !o ? 'Not run yet' : o.state === 'run' ? 'Running…' : `${o.err ? '⚠' : '✓'} ${o.in != null ? `${o.in} in → ` : ''}${o.out.length} out${o.ms ? ` · ${o.ms} ms` : ''}${o.run ? ` · ${whoName(o.run.author)}, ${when(o.run.t)}` : ''}`;
    fitText(foot, b.x + 12, b.y + b.h - 14, b.w - 24, `500 11.5px ${FONTS.sans}`, o?.err ? TH.red : o?.state === 'run' ? TH.accent : TH.muted);
  },
  others: 'Only its author changes this step. Run the flow to see what it does.',
  insert: () => stepMenu(),
  form: (el, { action } = {}) => stepForm(el, action),
  describe(el){ const c = parseStep(el.text), st = PIPE_STEPS[c.do], o = pipeOut(el); return `${st ? `${st.name.toLowerCase()} ${st.summary(c)}, ${PIPE_MODES[st.mode][0].toLowerCase()}` : `unknown action ${c.do}`}${o ? `; last gave ${plural(o.out.length, 'item')}${o.err ? `, error: ${o.err}` : ''}` : ''}`; },
  lines(el){ const c = parseStep(el.text), o = pipeOut(el); return [`${c.do}: ${PIPE_STEPS[c.do]?.summary(c) || ''}`, ...(o ? o.out.slice(0, 8).map(i => '• ' + i.text) : [])]; },
});
// the form for one action's settings; options can be computed when it opens (tables on the canvas, responders)
async function stepForm(el, action){
  const c = el ? parseStep(el.text) : { do: action }, st = PIPE_STEPS[c.do]; if (!st){ toast(`No action “${c.do}”.`); return null; }
  const fields = st.fields.map(f => ({ ...f, value: c[f.id] ?? f.value, options: typeof f.options === 'function' ? f.options() : f.options }));
  for (const f of fields) if (f.type === 'select' && f.options && !f.options.length) f.options = [['', 'Nothing to pick on this canvas yet']];
  const v = await formDialog(`${el ? 'Edit' : 'New'} step: ${st.name}`, [
    { id: 'title', label: 'Name', type: 'text', value: c.title || st.name },
    ...(el ? [{ id: 'do', label: 'Action', type: 'select', value: c.do, options: Object.entries(PIPE_STEPS).map(([k, s]) => [k, `${s.name} (${PIPE_MODES[s.mode][0].toLowerCase()})`]) }] : []),
    ...(fields.length ? [{ id: 'sec', label: 'Settings', type: 'section' }] : []), ...fields,
  ], { ok: el ? 'Sign the new version' : 'Add step', why: `${st.blurb}. ${st.mode === 'pass' ? 'It only passes data on, changed.' : st.mode === 'respond' ? 'A responder writes something new; with AI connected, it answers.' : 'It writes to the canvas when the flow runs, signed by whoever runs it.'}` });
  if (!v) return null;
  const out = { do: v.do || c.do }; for (const f of fields) out[f.id] = String(v[f.id] ?? '').trim();
  return stepText(v.title.trim() || st.name, out);
}
// D → Step: pick an action, fill it in, and it lands after what's selected, connected to it
function stepMenu(){
  const items = [];
  for (const [mode, [label]] of Object.entries(PIPE_MODES)){ items.push({ head: label }); for (const [k, s] of Object.entries(PIPE_STEPS)) if (s.mode === mode) items.push({ label: s.name, sub: s.blurb, icon: mode === 'respond' ? 'sparkle' : mode === 'write' ? 'edit' : 'step', tone: mode === 'respond' ? 'mlive' : '', run: () => stepInsert(k) }); }
  openMenu(dataBtn, items, null, 'hub data');
}
async function stepInsert(action){
  closeMenu(false);
  const sel = S.sel.size === 1 ? current([...S.sel][0]) : null, from = sel && sel.type !== 'ARROW' && visible(sel) ? sel : null;
  const label = await stepForm(null, action); if (label == null) return null;
  const L = nodeLayout('step', label), sb = from && box(from), c = viewCenter();
  const spot = sb ? placeNear(sb, 'right', L.w, L.h, null) : { x: c.x - L.w / 2, y: c.y - L.h / 2 };
  const cid = await commitNode({ kind: 'step', x: spot.x, y: spot.y, label, color: 'ink', parent: from?.type === 'NODE' ? from.cid : null });
  if (!cid) return null;
  if (from && from.type !== 'NODE') await commitArrow(from, current(cid));
  S.sel = new Set([cid]); ensureVisible(current(cid)); dirty = true;
  say(`Step “${parseStep(label).title}” added${from ? ` after ${pipeTitle(from)}` : ''}. With it selected, D → Step adds the next one.`);
  return cid;
}
