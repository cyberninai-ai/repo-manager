'use strict';
// @module features/taskflow — Dependencies and the critical path: connect two tasks and the canvas knows the order ("depends
// on" points at what must finish first; "leads to" or a plain arrow points at what comes next). Blocked tasks say what they wait
// for, the Work panel lists what is ready now, and the critical path (the longest chain of unfinished work) is outlined, so the
// team sees what actually delays the delivery. Nothing new is signed: it is read from tasks (TASK) and connectors (ARROW).
// @uses features/work (tasks, Work panel), features/connectors (relation labels), ui/panels (badges)
const edgeWord = a => (a.elabel ?? a.label ?? '').toLowerCase();
// edges between tasks: before → after
function taskEdges(){
  const t = S.D.tasks || new Map(), out = [];
  for (const a of S.D.els) if (a.type === 'ARROW' && !S.D.hidden.has(a.cid)){
    const f = current(a.f.FROM)?.cid, to = current(a.f.TO)?.cid; if (!t.has(f) || !t.has(to) || f === to) continue;
    const l = edgeWord(a); if (l && !/depends|leads|blocks|then|after|before/.test(l)) continue;   // "supports", "example of"… aren't order
    out.push(/depends|after/.test(l) ? [to, f] : [f, to]);
  }
  return out;
}
let planFor = null, planMemo = null;
function plan(){ if (planFor === S.D) return planMemo; planFor = S.D; return planMemo = planNow(); }   // once per change, not per frame
function planNow(){
  const t = S.D.tasks || new Map(), edges = taskEdges(), before = new Map(), after = new Map();
  for (const [a, b] of edges){ (before.get(b) || before.set(b, []).get(b)).push(a); (after.get(a) || after.set(a, []).get(a)).push(b); }
  const open = c => t.get(c)?.status !== 'done';
  const blocked = new Map(); for (const [c, bs] of before) if (open(c)){ const w = bs.filter(open); if (w.length) blocked.set(c, w); }
  // ordering the unfinished tasks (no recursion, so long chains are fine): what can't be ordered waits on a loop
  const nodes = [...t.keys()].filter(open).sort(), indeg = new Map(nodes.map(c => [c, 0]));
  for (const c of nodes) for (const n of after.get(c) || []) if (indeg.has(n)) indeg.set(n, indeg.get(n) + 1);
  const queue = nodes.filter(c => !indeg.get(c)), order = [];
  while (queue.length){ const c = queue.shift(); order.push(c); for (const n of after.get(c) || []) if (indeg.has(n)){ indeg.set(n, indeg.get(n) - 1); if (!indeg.get(n)) queue.push(n); } }
  const cyc = new Set(nodes.filter(c => !order.includes(c)));
  // the critical path: the longest chain through that order
  const dist = new Map(), prev = new Map();
  for (const c of order){ const d = (dist.get(c) || 1); dist.set(c, d); for (const n of after.get(c) || []) if (indeg.has(n) && !cyc.has(n) && d + 1 > (dist.get(n) || 1)){ dist.set(n, d + 1); prev.set(n, c); } }
  let end = null; for (const c of order) if (!end || dist.get(c) > dist.get(end)) end = c;
  const path = []; for (let c = end; c; c = prev.get(c)) path.unshift(c);
  const ready = [...t].filter(([c, x]) => x.status !== 'done' && !blocked.has(c)).map(([c]) => c);
  return { edges, blocked, ready, path: path.length > 1 ? path : [], longest: path.length, cycles: cyc };
}
RENDER_HOOKS.screen.push(() => {
  if (!S.D.tasks?.size) return;
  const p = plan(), onPath = new Set(p.path);
  for (const c of onPath){ const sb = screenBox(S.records.get(c)); if (!sb) continue; ctx.save(); ctx.strokeStyle = TONE.bad[1]; ctx.lineWidth = 2; ctx.setLineDash([8, 5]); rr(ctx, sb.x - 9, sb.y - 9, sb.w + 18, sb.h + 18, 12); ctx.stroke(); ctx.restore(); }
  for (const [c, w] of p.blocked){ const sb = screenBox(S.records.get(c)); if (!sb) continue; drawBadge(sb.x, sb.y + sb.h + 28, `⛔ waits on ${w.length === 1 ? elTitle(w[0]).slice(0, 22) : plural(w.length, 'task')}`, 'warn', () => { goTo(w[0]); }); }
  for (const c of p.cycles){ const sb = screenBox(S.records.get(c)); if (sb) drawBadge(sb.x + sb.w - 70, sb.y + sb.h + 28, '↻ loop', 'bad'); }
});
// the Work panel gets a "Next up" section: ready now, blocked, the critical path
WORK_SECTIONS.push(() => {
  const p = plan(); if (!p.edges.length) return '';
  const li = c => `<li><button class="wk-row" data-c="${c}"><span class="wk-t">${esc(elTitle(c))}</span>${S.D.tasks.get(c)?.owner ? `<span class="av" style="background:hsl(${authorHue(S.D.tasks.get(c).owner)} 55% 30%)">${esc(initials(S.D.tasks.get(c).owner))}</span>` : ''}</button></li>`;
  return `<h3>Ready now <span class="n">${p.ready.length}</span></h3><ul class="wk-list">${p.ready.map(li).join('')}</ul>
    ${p.path.length ? `<h3>Critical path <span class="n">${p.path.length} steps</span></h3><ul class="wk-list">${p.path.map(li).join('')}</ul>` : ''}
    ${p.blocked.size ? `<h3>Blocked <span class="n">${p.blocked.size}</span></h3><ul class="wk-list">${[...p.blocked.keys()].map(li).join('')}</ul>` : ''}
    ${p.cycles.size ? `<p class="wk-note">${plural(p.cycles.size, 'task')} wait on each other in a loop.</p>` : ''}`;
});
FLOW_CONDITIONS.path = { label: 'Nothing on the critical path is open', test: () => { const p = plan(); return p.cycles.size ? `${plural(p.cycles.size, 'task')} wait on each other in a loop` : p.longest ? `${plural(p.longest, 'task')} still open on the critical path` : true; } };
registerFeature({ id: 'taskflow', name: 'Dependencies and critical path', group: 'deliver', icon: 'deps', records: [],
  blurb: 'Connect tasks to order them: what is blocked, what is ready, and the chain that sets the date',
  status: () => { if (!S.D.tasks?.size) return ''; const p = plan(); return p.blocked.size ? `${p.blocked.size} blocked` : ''; },
  open: () => { toggleWork(true); toast('Connect two tasks: “depends on” points at what must finish first.'); } });
