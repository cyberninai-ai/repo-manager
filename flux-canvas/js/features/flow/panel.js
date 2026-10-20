'use strict';
// @module features/flow/panel — The Flows panel (every flow, its runs, and what each step produced), the live view of a run on
// the canvas, the palette, and a template that brainstorms with a flow
// @uses features/flow/engine, features/flow/nodes, ui/panels, ui/hub
const flowsHereNow = () => S.D.els.filter(e => e.type === 'NODE' && e.ek === 'flow' && visible(e) && !S.D.hidden.has(e.cid) && !S.D.superseded.has(e.cid));
registerPanel({
  id: 'pipes', title: 'Flows', blurb: 'Items connected in order and run: some pass data on, some respond, some write back. Every run is signed.',
  paint(body){
    const fs = flowsHereNow();
    if (!fs.length){ body.innerHTML = `<p class="empty">No flows yet. A flow starts at a Flow node; connect notes, data and steps after it, then run it.</p><div class="acts"><button class="btn" data-new>${ic('pipe')}New flow</button></div>`; return; }
    const focus = fs.find(f => pipeKey(f) === PIPE.focus) || fs[0];
    const card = f => { const P = dataMemo(f, 'plan', () => pipePlan(f)), runs = PIPE.runs.get(pipeKey(f)) || [], last = runs.at(-1);
      return `<li class="card${f === focus ? ' hot' : ''}"><div class="hd"><b>${esc(parseFlow(f.text).title)}</b>${last ? `<span class="pill ${last.ok ? 'good' : 'bad'}">${last.ok ? 'Ran' : 'Errors'}</span>` : '<span class="pill">Not run</span>'}</div>
        <small>${P.err ? esc(P.err) : plural(P.order.length - 1, 'step')}${last ? ` · ${esc(whoName(last.author))}, ${when(last.t)} · ${plural(runs.length, 'run')}` : ''}</small>
        <div class="acts"><button class="btn primary" data-run="${f.cid}"${pipeRunning ? ' disabled' : ''}>${pipeRunning === f.cid ? 'Running…' : '▶ Run'}</button><button class="btn" data-trace="${f.cid}">What it did</button><button class="btn" data-go="${f.cid}">Show</button></div></li>`; };
    const runs = PIPE.runs.get(pipeKey(focus)) || [], last = runs.at(-1), log = last && pipeLog(last);
    const trace = !last ? '<p class="muted">Run it to see what each step produces.</p>' : !log ? '<p class="muted">The run’s log hasn’t arrived yet.</p>'
      : `<ol class="fl-trace">${log.map((s, i) => `<li><div class="hd"><span class="pill ${i ? PIPE_MODES[s.mode][1] || '' : 'acc'}">${i ? PIPE_MODES[s.mode][0] : 'Starts'}</span><b>${esc(s.t || 'Step')}</b><small>${i ? `${s.in} in → ${s.out.length} out` : plural(s.out.length, 'item')}</small></div>
          ${s.err ? `<p class="bad">⚠ ${esc(s.err)}</p>` : s.out.length ? `<ul>${s.out.slice(0, 4).map(i => `<li>${esc(i.text.slice(0, 160))}</li>`).join('')}${s.out.length > 4 ? `<li class="muted">+ ${s.out.length - 4} more</li>` : ''}</ul>` : i ? '<p class="muted">Nothing came out.</p>' : '<p class="muted">Starts empty: the steps bring the data.</p>'}</li>`).join('')}</ol>
        <small class="muted">Signed by ${esc(whoName(last.author))}, ${when(last.t)}. Responses are kept exactly as given, so everyone sees the same answer.</small>`;
    body.innerHTML = `<ul class="plain">${fs.map(card).join('')}</ul><h3>What “${esc(parseFlow(focus.text).title)}” did</h3>${trace}
      <div class="acts"><button class="btn" data-new>${ic('pipe')}New flow</button></div>`;
  },
  async click(e, b){
    if (b.dataset.run){ const f = S.records.get(b.dataset.run); if (f) await runFlow(f); return; }
    if (b.dataset.trace){ PIPE.focus = pipeKey(S.records.get(b.dataset.trace)); paintPanel('pipes'); return; }
    if (b.dataset.go) return goTo(b.dataset.go);
    if (b.hasAttribute('data-new')){ closePanel(false); dataInsert('flow'); }
  },
});
CHANGE_HOOKS.push(() => paintPanel('pipes'));
registerFeature({ id: 'pipes', name: 'Flows', group: 'data', icon: 'pipe', records: ['RUN'],
  blurb: 'Connect notes, data and steps in order and run them; responses are signed, and AI can answer when connected',
  status: () => pipeRunning ? 'running' : (n => n ? plural(n, 'flow') : '')(flowsHereNow().length), open: () => openPanel('pipes') });
PALETTE_HOOKS.push(add => { for (const f of flowsHereNow()) add('data', `Run flow: ${parseFlow(f.text).title}`, () => runFlow(f)); add('data', 'Flows: every flow and what it did', () => openPanel('pipes')); });

/* a run on the canvas: the step at work is outlined and the connectors it has passed along light up */
RENDER_HOOKS.world.push(() => {
  if (!PIPE_LIVE.size) return;
  const z = S.view.zoom, t = performance.now() / 60;
  for (const [c, s] of PIPE_LIVE){ const el = S.records.get(c), b = el && visible(el) && box(el); if (!b) continue;
    if (s.state === 'run'){ ctx.save(); ctx.strokeStyle = TH.accent; ctx.lineWidth = 2.5 / z; ctx.setLineDash([8 / z, 6 / z]); ctx.lineDashOffset = -t / z; rr(ctx, b.x - 6 / z, b.y - 6 / z, b.w + 12 / z, b.h + 12 / z, 14 / z); ctx.stroke(); ctx.restore(); }
    else if (s.state === 'wait'){ ctx.save(); ctx.globalAlpha = .5; ctx.strokeStyle = TH.line; ctx.lineWidth = 1 / z; ctx.setLineDash([3 / z, 4 / z]); rr(ctx, b.x - 4 / z, b.y - 4 / z, b.w + 8 / z, b.h + 8 / z, 12 / z); ctx.stroke(); ctx.restore(); }
  }
});
FRAME_HOOKS.push(() => { if (pipeRunning) dirty = true; });
// notes and data nodes in a running flow say what they passed on; steps and flows show it themselves
RENDER_HOOKS.screen.push(() => {
  for (const [c, s] of PIPE_LIVE){ const el = S.records.get(c); if (!el || !visible(el) || el.type === 'NODE' && (el.ek === 'step' || el.ek === 'flow') || s.state === 'wait') continue;
    placeBadge(el, 'bottom', s.state === 'run' ? '… passing on' : s.err ? '⚠ ' + s.err.slice(0, 30) : `✓ passes ${plural(s.out?.length || 0, 'item')}`, s.state === 'run' ? 'acc' : s.err ? 'bad' : 'good'); }
});

/* a canvas to start from: brainstorm with a flow */
TEMPLATES.push({ id: 'flow-brainstorm', name: 'Brainstorm flow', icon: 'pipe', blurb: 'A flow that takes pain points, keeps the big ones, sparks ideas and puts them on notes. Connect AI to make the ideas smarter.', build: async c => {
  const mk = (kind, dx, dy, label, parent = null) => commitNode({ kind, x: c.x + dx, y: c.y + dy, label, parent });
  const f = await mk('flow', -620, -200, flowText('Brainstorm onboarding', []));
  const t = await mk('table', -620, -40, tableText('Pain points', ['Pain', 'Votes'], [['Long signup form', '5'], ['No sample data', '4'], ['Pricing unclear', '1'], ['Slow first load', '3']]));
  const s1 = await mk('step', -260, -200, stepText('Keep the big ones', { do: 'filter', where: 'Votes >= 3' }), f);
  await commitArrow(current(t), current(s1));
  const s2 = await mk('step', 60, -200, stepText('Spark ideas', { do: 'ideas', count: '2', using: 'auto' }), s1);
  await mk('step', 380, -200, stepText('Put them on notes', { do: 'notes', color: 'ink', max: '8' }), s2);
} });
