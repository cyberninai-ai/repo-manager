// Data (audit D1, D2, D3): groups by CID, compaction that peers follow, undo that survives a reload
import { BASE, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b = await chromium.launch({ ...LAUNCH });
const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
const p = await ctx.newPage(), q = await ctx.newPage();
const errs = []; for (const pg of [p, q]){ pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); }
const W = (t = 300) => p.waitForTimeout(t);
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
await p.goto(BASE + '#datatest0001'); await q.goto(BASE + '#datatest0001'); await W(900);

// 1. a group lists member CIDs instead of copying the records
const ids = await p.evaluate(async () => [await commitShape('rect', { x: 0, y: 0 }, { x: 80, y: 60 }), await commitShape('circle', { x: 120, y: 0 }, { x: 200, y: 60 })]);
await p.evaluate(async ids => { S.sel = new Set(ids); await groupSelection(); }, ids); await W();
const g = await p.evaluate(() => { const g = [...S.records.values()].find(r => r.type === 'GROUP'); return { K: g.f.K, P: 'P' in g.f, size: g.raw.length, members: g.members.length }; });
ok(g.K && !g.P && g.members === 2, 'GROUP names its members by CID');
ok(g.size < 500, 'group record is small (no copied records)');
ok(await q.evaluate(ids => S.D.groupOf.get(ids[0]) && S.D.groupOf.get(ids[0]) === S.D.groupOf.get(ids[1]), ids), 'the other tab sees the group');

// 2. compaction: five moves become one, dead styles go, nothing visible changes; the other tab follows
const target = ids[0];
await p.evaluate(async t => { for (let i = 0; i < 5; i++) await commitMove(t, 10, 5); for (const c of ['red', 'blue', 'green']) await commitStyle(t, { C: c }); }, target); await W(500);
const pos = (pg) => pg.evaluate(t => { const b = box(S.records.get(t)); return [Math.round(b.x), Math.round(b.y), ecol(S.records.get(t))]; }, target);
const before = await pos(p), count0 = await p.evaluate(() => S.records.size);
ok(JSON.stringify(before) === JSON.stringify([50, 25, 'green']), 'moves and styles applied');
const saved = await p.evaluate(() => compactHistory()); await W(600);
ok(saved === 6, 'five moves fold into one and two styles go (6 fewer)');
ok(await p.evaluate(() => S.records.size) === count0 - 6 + 0, 'records after compaction');
ok(JSON.stringify(await pos(p)) === JSON.stringify(before), 'nothing visible changes');
ok(await q.evaluate(t => [...S.records.values()].filter(r => r.type === 'MOVE' && r.f.R === t).length, target) === 1, 'the other tab drops the folded moves');
ok(JSON.stringify(await pos(q)) === JSON.stringify(before), 'and sees the same position');
ok(await p.evaluate(async () => (await dbAll('records', canvasId)).length) === await p.evaluate(() => S.records.size), 'storage matches after compaction');

// 3. undo after a reload: the stack is rebuilt from your own records
await p.reload(); await W(1000);
ok(JSON.stringify(await pos(p)) === JSON.stringify(before), 'compacted canvas reloads the same');
ok(await p.evaluate(() => S.hist.length) > 0, 'undo stack rebuilt');
await p.evaluate(() => document.getElementById('c').focus());
await p.keyboard.press('Control+z'); await W(400);   // last: the compacted move
ok(JSON.stringify((await pos(p)).slice(0, 2)) === '[0,0]', 'undo after reload reverses the move');
await p.keyboard.press('Control+z'); await W(400);   // the colour: red and blue were folded away, so back to the original
ok((await pos(p))[2] === 'ink', 'undo after reload restores the colour from before');

console.log(`asserted ${n} checks`);
console.log('errors', errs);
await b.close();
