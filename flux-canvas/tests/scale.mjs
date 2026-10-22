// Scaling from the centre: + / − on the keyboard and Shift on a resize handle move both ends together, keep the
// proportions, and come back to exactly the starting box
import { PLAIN, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b = await chromium.launch(LAUNCH);
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
await p.goto(PLAIN + '#scaletest01'); await p.waitForTimeout(800);
const boxOf = c => p.evaluate(c => { const x = box(current(c)); return { x: x.x, y: x.y, w: x.w, h: x.h }; }, c);
const mid = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const select = c => p.evaluate(c => { S.sel = new Set([c]); S.view = { x: -200, y: -150, zoom: 1 }; dirty = true; cv.focus(); }, c);
const press = async (k, times) => { for (let i = 0; i < times; i++) await p.keyboard.press(k); await p.evaluate(() => kbChain); await p.waitForTimeout(150); };

for (const [kind, make] of [['rectangle', () => commitShape('rect', { x: 0, y: 0 }, { x: 200, y: 100 })], ['node', () => commitNode({ kind: 'rect', x: 0, y: 0, W: 200, H: 100, label: 'Step' })]]){
  const c = await p.evaluate(make); await p.waitForTimeout(150); await select(c);
  const b0 = await boxOf(c);
  // 1. + scales up by 10% from the centre: both ends move by the same amount, the proportions hold
  await press('+', 1);
  let b1 = await boxOf(c);
  ok(b1.w === 220 && b1.h === 110, `${kind}: + scales by 10% (${b1.w} × ${b1.h})`);
  ok(b0.x - b1.x === (b1.x + b1.w) - (b0.x + b0.w) && b0.y - b1.y === (b1.y + b1.h) - (b0.y + b0.h), `${kind}: left and right, top and bottom move equally`);
  ok(mid(b1).x === mid(b0).x && mid(b1).y === mid(b0).y, `${kind}: the centre stays put`);
  // 2. held keys: five up, five down, back to exactly the start, centre unchanged all the way
  await press('+', 4); const big = await boxOf(c);
  ok(Math.abs(big.w / big.h - 2) < 0.02 && mid(big).x === mid(b0).x && mid(big).y === mid(b0).y, `${kind}: after five steps still 2:1 and centred (${big.w} × ${big.h})`);
  await press('-', 5); const back = await boxOf(c);
  ok(JSON.stringify(back) === JSON.stringify(b0), `${kind}: five down returns exactly to the starting box`);
  // 3. − stops at the smallest size the content allows
  await press('-', 40); const small = await boxOf(c);
  ok(small.w >= 16 && small.h >= 16 && Math.abs(mid(small).x - mid(b0).x) <= 1 && Math.abs(mid(small).y - mid(b0).y) <= 1, `${kind}: shrinking stops at its smallest, still centred (${small.w} × ${small.h})`);
  await p.evaluate(() => undo()); await p.waitForTimeout(100);
  await p.evaluate(c => setNeg(c, true), c); await p.waitForTimeout(100);
}

// 4. Shift on a corner handle: from the centre, proportions kept; without Shift the opposite corner stays
const img = await p.evaluate(() => commitShape('rect', { x: 0, y: 0 }, { x: 200, y: 100 })); await p.waitForTimeout(150); await select(img);
const h0 = await boxOf(img), se = await p.evaluate(c => { const b = box(current(c)); return toScreen(b.x + b.w, b.y + b.h); }, img);
await p.keyboard.down('Shift'); await p.mouse.move(se.x, se.y); await p.mouse.down(); await p.mouse.move(se.x + 40, se.y + 10, { steps: 6 }); await p.mouse.up(); await p.keyboard.up('Shift');
await p.waitForTimeout(200);
const h1 = await boxOf(img);
ok(h1.w > h0.w && Math.abs(h1.w / h1.h - 2) < 0.03, `Shift-drag keeps 2:1 (${h1.w} × ${h1.h})`);
ok(h0.x - h1.x === (h1.x + h1.w) - (h0.x + h0.w) && h0.y - h1.y === (h1.y + h1.h) - (h0.y + h0.h), 'Shift-drag moves both ends together');
const se2 = await p.evaluate(c => { const b = box(current(c)); return toScreen(b.x + b.w, b.y + b.h); }, img);
await p.mouse.move(se2.x, se2.y); await p.mouse.down(); await p.mouse.move(se2.x + 30, se2.y + 30, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(200);
const h2 = await boxOf(img);
ok(h2.x === h1.x && h2.y === h1.y && h2.w === h1.w + 30 && h2.h === h1.h + 30, 'without Shift the opposite corner stays where it was');
// 5. an edge handle with Shift grows both sides of that axis and the other axis in proportion
const sh = await p.evaluate(c => { const b = box(current(c)); return toScreen(b.x + b.w, b.y + b.h / 2); }, img);
const before = await boxOf(img);
await p.keyboard.down('Shift'); await p.mouse.move(sh.x, sh.y); await p.mouse.down(); await p.mouse.move(sh.x + 50, sh.y, { steps: 5 }); await p.mouse.up(); await p.keyboard.up('Shift'); await p.waitForTimeout(200);
const after = await boxOf(img);
ok(after.w > before.w && after.h > before.h && Math.abs(mid(after).x - mid(before).x) <= 1 && Math.abs(mid(after).y - mid(before).y) <= 1, `Shift on a side handle scales the whole shape from its centre (${after.w} × ${after.h})`);

console.log(`asserted ${n} checks`);
console.log('errors', JSON.stringify(errs));
await b.close();
if (errs.length) process.exit(1);
