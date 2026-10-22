// Tool dock, contextual style bar, Share menu, tooltips, welcome card: asserted, not just printed
import { PLAIN as BASE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'fs';
const axe = fs.readFileSync(AXE, 'utf8');
const b = await chromium.launch({ ...LAUNCH });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(BASE + '#toolstest001'); await p.waitForTimeout(700);
const W = (t = 250) => p.waitForTimeout(t);
const ev = (f, a) => p.evaluate(f, a);
const shown = id => ev(`document.getElementById('${id}').getClientRects().length > 0`);
const pressed = () => ev(() => [...document.querySelectorAll('#tools [aria-pressed="true"]')].map(b => b.dataset.tool));
const drag = async (a, z) => { await p.mouse.move(...a); await p.mouse.down(); await p.mouse.move(...z, { steps: 8 }); await p.mouse.up(); await W(400); };
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// 1. welcome card on an empty canvas; it steps aside on the first touch
ok(await shown('empty'), 'welcome card on an empty canvas');
ok(JSON.stringify(await pressed()) === '["select"]', 'Select is the starting tool');
ok(!(await shown('bar')), 'no style bar until a tool needs one');
await p.click('[data-tool="pen"]'); await W();
ok(await shown('gColor') && await shown('gBrush') && !(await shown('gText')), 'draw tool: colour and stroke, no text group');
await drag([200, 200], [380, 260]);
ok(!(await shown('empty')), 'welcome card hides after the first stroke');

// 2. rectangle tool: draws, then hands back to Select with the new shape selected
await p.evaluate(() => setTool('rect')); await W();
ok(await shown('hint') && (await ev(() => document.getElementById('hint').textContent)).includes('rectangle'), 'tool hint names the tool');
ok(!(await ev(() => document.getElementById('fillBtn').hidden)), 'fill toggle offered for shapes');
await p.click('#fillBtn'); ok(await ev(() => S.fill === true), 'fill toggles');
await drag([500, 200], [640, 300]);
const rect = await ev(() => { const r = S.records.get([...S.sel][0]); return r && { type: r.type, k: r.k, F: r.f.F }; });
ok(rect?.type === 'SHAPE' && rect.k === 'rect' && rect.F !== 'none', 'filled rectangle created and selected');
ok(JSON.stringify(await pressed()) === '["select"]', 'back to Select after drawing a shape');
await p.click('#fillBtn').catch(() => {}); await ev(() => { S.fill = false; });

// 3. ellipse tool
await p.evaluate(() => setTool('ellipse')); await drag([500, 400], [640, 480]);
ok(await ev(() => S.records.get([...S.sel][0])?.k) === 'circle', 'ellipse tool makes a circle shape');

// 4. line tool: element to element is a bound connector, empty space a straight 2-point line
await p.click('[data-tool="line"]'); await drag([570, 250], [570, 440]);
const arrow = await ev(() => { const r = S.records.get([...S.sel][0]); return r && { type: r.type, from: S.records.get(r.f.FROM)?.k, to: S.records.get(r.f.TO)?.k }; });
ok(arrow?.type === 'ARROW' && arrow.from === 'rect' && arrow.to === 'circle', 'line tool connects two elements');
const draws0 = await ev(() => [...S.records.values()].filter(r => r.type === 'DRAW').length);
await p.click('[data-tool="line"]'); await drag([800, 600], [1000, 640]);
ok(await ev(() => [...S.records.values()].filter(r => r.type === 'DRAW').length) === draws0 + 1, 'line tool on empty space draws a straight line');

// 5. hand tool pans; Escape returns to Select
await p.click('[data-tool="hand"]'); const v0 = await ev(() => ({ ...S.view }));
await drag([700, 500], [600, 450]);
ok(await ev(v => Math.round(S.view.x - v.x) === 100 && Math.round(S.view.y - v.y) === 50, v0), 'hand tool pans by the drag distance');
ok(!(await shown('bar')), 'style bar hides when the tool has nothing to style');
await ev(() => document.getElementById('c').focus()); await p.keyboard.press('Escape'); await W();
ok(JSON.stringify(await pressed()) === '["select"]', 'Escape leaves the hand tool');

// 6. contextual bar for text: size and font; a font change on own text is a signed edit
await p.click('[data-tool="text"]'); await p.mouse.click(300, 600); await W();
ok(await shown('gText') && await shown('barFonts'), 'text tool shows size and font while typing');
await p.keyboard.type('Hello'); await p.keyboard.press('Enter'); await W(400);
await ev(() => { const t = S.D.els.find(e => e.type === 'TEXT' && visible(e)); S.sel = new Set([t.cid]); dirty = true; }); await W();
await p.click('#barFonts [aria-label="Hand-drawn"]'); await W(500);
ok(await ev(() => S.D.els.find(e => e.type === 'TEXT' && visible(e)).f.F) === 'hand', 'font applied to the selected text');
ok(await ev(() => [...S.records.values()].filter(r => r.type === 'TEXT').length) === 2, 'font change is a new signed version');

// 7. shapes-and-cards tool shows the kind picker
await p.click('#nodeBtn'); await W();
ok(await shown('gKind'), 'kind picker for the shapes tool');
await p.click('[data-tool="select"]'); await ev(() => { S.sel.clear(); dirty = true; }); await W();
ok(!(await shown('bar')), 'nothing selected in Select: no style bar');

// 8. tooltip: label plus shortcut, hidden from assistive tech
await p.hover('[data-tool="pen"]'); await W(700);
const tip = await ev(() => ({ on: !document.getElementById('tip').hidden, txt: document.getElementById('tip').textContent, aria: document.getElementById('tip').getAttribute('aria-hidden') }));
ok(tip.on && tip.txt === 'DrawP' && tip.aria === 'true', 'tooltip shows name and key');

// 9. More menu: keyboard operable, Escape returns focus
await p.focus('#moreBtn'); await p.keyboard.press('Enter'); await W();
ok(await ev(() => !document.getElementById('menu').hidden && document.activeElement.getAttribute('role') === 'menuitem'), 'menu opens with focus on the first item');
await p.keyboard.press('ArrowDown'); await p.keyboard.press('End');
ok(await ev(() => document.activeElement.textContent.includes('Keyboard shortcuts')), 'End moves to the last item');
await p.screenshot({ path: OUT + '/tools-menu.png' });
await p.addScriptTag({ content: axe });
const v = await ev(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(v => v.id + ': ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')));
await p.keyboard.press('Escape'); await W();
ok(await ev(() => document.getElementById('menu').hidden && document.activeElement.id === 'moreBtn'), 'Escape closes the menu and returns focus');

// 10. dot grid toggles from the palette, and persists
await ev(() => commands().find(c => /dot grid/.test(c.t)).run());
ok(await ev(() => S.grid === false && localStorage.getItem('flux:grid') === '0'), 'dot grid off and remembered');

console.log(`asserted ${n} checks`);
console.log('axe', JSON.stringify(v));
console.log('errors', errs);
await b.close();
