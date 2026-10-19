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
console.log('errors', errs);
await b.close();
