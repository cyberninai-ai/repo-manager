// Outline panel (audit X2) and the context menu: asserted
import { BASE, AXE, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'fs';
const axe = fs.readFileSync(AXE, 'utf8');
const b = await chromium.launch({ ...LAUNCH });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(BASE + '#polishtest01'); await p.waitForTimeout(800);
const W = (t = 300) => p.waitForTimeout(t);
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
// a frame with two notes, one connected to an outside card, a vote and a comment
await p.evaluate(async () => {
  const f = await commitNode({ kind: 'frame', x: -400, y: -250, W: 420, H: 320, label: 'Ideas' });
  const a = await commitNode({ kind: 'sticky', x: -370, y: -180, label: 'Cabin by a lake' });
  const c = await commitNode({ kind: 'sticky', x: -180, y: -180, label: 'City hotel' });
  const d = await commitNode({ kind: 'card', x: 200, y: -150, label: 'Budget' });
  await tick(); await commitArrow(S.records.get(a), S.records.get(d), 'depends on');
  window.ids = { f, a, c, d };
});
await W(500);
// 1. outline: Shift+O opens a tree in reading order with frames, contents and connections
await p.evaluate(() => document.getElementById('c').focus()); await p.keyboard.press('Shift+O'); await W();
const tree = await p.evaluate(() => [...document.querySelectorAll('#stTree [role=treeitem]')].map(li => ({ l: +li.getAttribute('aria-level'), t: li.querySelector('.st-l').textContent, m: li.querySelector('.st-m')?.textContent || '' })));
ok(tree.length >= 4, 'outline lists the elements');
const frame = tree.find(x => x.t.includes('Ideas')), cabin = tree.find(x => x.t.includes('Cabin'));
ok(frame && frame.l === 1 && cabin && cabin.l === 2, 'notes sit inside their frame');
ok(cabin.m.includes('→') && cabin.m.includes('Budget') && cabin.m.includes('depends on'), 'connections and their meaning are listed');
ok(await p.evaluate(() => document.activeElement?.getAttribute('role') === 'treeitem'), 'focus moves into the tree');
// arrow keys move, Enter shows the element on the canvas
await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await W();
ok(await p.evaluate(() => S.sel.size === 1 && document.activeElement?.getAttribute('role') === 'treeitem'), 'Enter selects it on the canvas, focus stays in the tree');
await p.keyboard.press('Home'); await p.keyboard.press('ArrowLeft'); await W();
ok(await p.evaluate(() => document.querySelector('#stTree [aria-expanded]')?.getAttribute('aria-expanded') === 'false'), 'Left collapses a frame');
await p.addScriptTag({ content: axe });
const v1 = await p.evaluate(async () => (await axe.run(document.getElementById('structure'), { resultTypes: ['violations'] })).violations.map(v => v.id + ': ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')));
await p.keyboard.press('Escape'); await W();
ok(await p.evaluate(() => document.getElementById('structure').style.display === 'none'), 'Escape closes the outline');

// 2. context menu: right-click on an element offers element actions; on empty paper, canvas actions
const at = await p.evaluate(() => { const b = box(S.records.get(window.ids.d)); return toScreen(b.x + b.w / 2, b.y + b.h / 2); });
await p.mouse.click(at.x, at.y, { button: 'right' }); await W();
const m1 = await p.evaluate(() => ({ open: !document.getElementById('menu').hidden, items: [...document.querySelectorAll('#menu [role=menuitem] span')].map(s => s.textContent), sel: [...S.sel] }));
ok(m1.open && m1.items.includes('Bring to front') && m1.items.includes('Delete'), 'element menu');
ok(m1.sel.length === 1, 'right-click selects the element');
await p.keyboard.press('Escape'); await W();
await p.mouse.click(1100, 650, { button: 'right' }); await W();
const m2 = await p.evaluate(() => [...document.querySelectorAll('#menu [role=menuitem] span')].map(s => s.textContent));
ok(m2.includes('Sticky note here') && m2.includes('Zoom to fit'), 'canvas menu on empty paper');
await p.click('#menu >> text=Sticky note here'); await W(400);
ok(await p.evaluate(() => taOpen()), 'sticky note editor opens where you clicked');
await p.keyboard.type('From the menu'); await p.keyboard.press('Enter'); await W(400);
ok(await p.evaluate(() => S.D.els.some(e => e.text === 'From the menu')), 'note created');
// keyboard: Shift+F10 opens it for the selection
await p.evaluate(() => { S.sel = new Set([window.ids.d]); document.getElementById('c').focus(); }); await p.keyboard.press('Shift+F10'); await W();
ok(await p.evaluate(() => !document.getElementById('menu').hidden && document.activeElement?.getAttribute('role') === 'menuitem'), 'Shift+F10 opens it from the keyboard');
await p.keyboard.press('Escape');
// a right-drag still pans, without a menu
const v0 = await p.evaluate(() => S.view.x);
await p.mouse.move(600, 500); await p.mouse.down({ button: 'right' }); await p.mouse.move(500, 500, { steps: 5 }); await p.mouse.up({ button: 'right' }); await W();
ok(await p.evaluate(v => S.view.x !== v && document.getElementById('menu').hidden, v0), 'right-drag pans, no menu');

console.log(`asserted ${n} checks`);
console.log('axe', JSON.stringify(v1));
console.log('errors', errs);
await b.close();
