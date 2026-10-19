// Performance (audit P1): load, derive, render and hit testing with 5,000 signed records
import { BASE, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const N = +(process.env.PERF_N || 5000);
const b = await chromium.launch({ ...LAUNCH });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(BASE + '#perftest0001'); await p.waitForTimeout(800);
// sign N notes and shapes spread over a large area, then load them the way a reload does
const res = await p.evaluate(async N => {
  const raws = [];
  for (let i = 0; i < N; i++){
    const x = (i % 100) * 220, y = Math.floor(i / 100) * 180;
    raws.push(i % 2 ? await signed('SHAPE', [['I', S.me.id], ['R', 'r' + i], ['K', 'rect'], ['X', encInt(x)], ['Y', encInt(y)], ['W', 160], ['H', 120], ['C', 'blue'], ['S', 2], ['F', 'none'], ['Z', ++S.lamport], ['T', Date.now()]])
      : await signed('NODE', [['I', S.me.id], ['K', 'sticky'], ['X', encInt(x)], ['Y', encInt(y)], ['W', 0], ['H', 0], ['M', encTxt('note ' + i)], ['C', 'yellow'], ['P', '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
  }
  const t0 = performance.now(); await importText(raws.join('\n'), false); await new Promise(r => setTimeout(r, 0)); const load = performance.now() - t0;
  const time = (f, k = 5) => { f(); const t = performance.now(); for (let i = 0; i < k; i++) f(); return (performance.now() - t) / k; };
  S.view = { x: 0, y: 0, zoom: 1 };
  const deriveMs = time(derive), renderMs = time(render);
  S.view = { x: -100, y: -100, zoom: 0.1 }; const renderAllMs = time(render, 3);
  S.view = { x: 0, y: 0, zoom: 1 };
  const hitMs = time(() => { for (let i = 0; i < 100; i++) hitTest({ x: Math.random() * 22000, y: Math.random() * 9000 }); }, 3) / 100;
  return { n: S.D.els.length, load: Math.round(load), deriveMs: +deriveMs.toFixed(1), renderMs: +renderMs.toFixed(1), renderAllMs: +renderAllMs.toFixed(1), hitMs: +hitMs.toFixed(3) };
}, N);
console.log('perf', JSON.stringify(res));
assert.equal(res.n, N, 'all records loaded');
assert.ok(res.deriveMs < 120, `derive ${res.deriveMs} ms`);
assert.ok(res.renderMs < 40, `render (viewport) ${res.renderMs} ms`);
assert.ok(res.hitMs < 1, `hit test ${res.hitMs} ms`);
// the same canvas with team features in use: tasks in a dependency chain, stances, claims, decisions, a suggest zone
const team = await p.evaluate(async () => {
  const raws = [], sig = async (t, pairs) => raws.push(await signed(t, [['I', S.me.id], ...pairs, ['Z', ++S.lamport], ['T', Date.now()]])), els = S.D.els.slice(0, 300);
  for (let i = 0; i < 60; i++) await sig('TASK', [['R', els[i].cid], ['S', 'todo'], ['A', '0'], ['D', '0']]);
  for (let i = 0; i < 59; i++) await sig('ARROW', [['FROM', els[i + 1].cid], ['TO', els[i].cid], ['C', 'ink'], ['S', 2], ['M', encTxt('depends on')]]);
  for (let i = 0; i < 200; i++) await sig('STANCE', [['R', els[i].cid], ['S', i % 3 ? 'agree' : 'disagree'], ['M', '']]);
  for (let i = 0; i < 30; i++) await sig('CLAIM', [['R', els[100 + i].cid], ['S', '1']]);
  for (let i = 0; i < 10; i++) await sig('DECISION', [['R', 'd' + i], ['M', encTxt('decision ' + i)], ['ON', els[i].cid], ['E', '0'], ['V', '1'], ['W', '0'], ['P', '0']]);
  await sig('ZONE', [['R', els[0].cid], ['S', 'suggest'], ['X', encInt(0)], ['Y', encInt(0)], ['W', 2000], ['H', 2000]]);
  await importText(raws.join('\n'), false); await new Promise(r => setTimeout(r, 50));
  const time = (f, k = 5) => { f(); const t = performance.now(); for (let i = 0; i < k; i++) f(); return +((performance.now() - t) / k).toFixed(1); };
  S.view = { x: 0, y: 0, zoom: 1 }; return { n: S.records.size, deriveMs: time(derive), renderMs: time(render) };
});
console.log('team features', JSON.stringify({ n: team.n }), team.renderMs < 40 && team.deriveMs < 120 ? 'within budget' : 'OVER BUDGET');
assert.ok(team.renderMs < 40, `render with team features ${team.renderMs} ms`);
assert.ok(team.deriveMs < 120, `derive with team features ${team.deriveMs} ms`);
console.log('errors', errs);
await b.close();
