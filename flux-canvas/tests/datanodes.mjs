// Data nodes (features/data): tables, checklists, metrics, charts, formulas, dates, links and code, and the signed
// values two people change at once — through the real interface (the Data menu, double-click a cell, click a box)
import { team, ok, until, count, axeOn } from './pair.mjs';
const { b, errs, pages: [A, B] } = await team(['Ana', 'Ben'], 'dnodetest01');
const v = [];
const scr = async (p, kind, geom) => { await p.evaluate(k => { const el = S.D.els.find(e => e.ek === k && visible(e)); S.view = { ...S.view, zoom: 1 }; ensureVisible(el); dirty = true; }, kind); await p.waitForTimeout(120);
  return p.evaluate(([k, g]) => { const el = S.D.els.find(e => e.ek === k && visible(e)); const w = new Function('el', 'b', 'return ' + g)(el, box(el)); return toScreen(w.x, w.y); }, [kind, geom]); };

// 1. Ana inserts a table from the Data button: one form, then it's on the canvas for both
await A.click('#dataBtn'); await A.waitForTimeout(150);
ok(await A.evaluate(() => /Insert data/.test(document.getElementById('menu').textContent) && document.querySelectorAll('#menu [role=menuitem]').length === 8), 'the Data menu offers eight kinds');
v.push(...(await axeOn(A, '#menu')).map(x => `menu: ${x}`));
await A.locator('#menu [role=menuitem]', { hasText: 'Rows and columns' }).click(); await A.waitForTimeout(150);
await A.fill('#ff-title', 'Pricing'); await A.fill('#ff-cols', 'Plan, Price, Seats');
await A.fill('#ff-rows', 'Free | 0 | 1\nTeam | 49 | 10\nBusiness | 199 | 50');
v.push(...(await axeOn(A, '#formDlg')).map(x => `form: ${x}`));
await A.click('#formOk');
ok(await until(B, () => S.D.els.some(e => e.ek === 'table' && tableView(e).rows.length === 3)), 'the table reaches Ben with three rows');
ok(await A.evaluate(() => tableView(S.D.els.find(e => e.ek === 'table')).sums[1] === 248), 'number columns get a total (0 + 49 + 199)');

// 2. Ben double-clicks a cell and types: a signed CELL, and Ana sees it
let p = await scr(B, 'table', `(g => ({ x: g.xs[1] + 20, y: g.rowY(1) + 12 }))(tableGeom(el, b))`);
await B.mouse.dblclick(p.x, p.y); await B.waitForTimeout(150);
ok(await B.evaluate(() => !document.getElementById('dataField').hidden && document.getElementById('dataField').getAttribute('aria-label') === 'Price of Team'), 'double-click opens the cell in place, labelled for screen readers');
await B.keyboard.press('Control+a'); await B.keyboard.type('59'); await B.keyboard.press('Tab');
ok(await until(B, () => !document.getElementById('dataField').hidden && /Seats/.test(document.getElementById('dataField').getAttribute('aria-label'))), 'Tab saves and moves to the next cell');
await B.keyboard.press('Escape');
ok(await until(A, () => tableView(S.D.els.find(e => e.ek === 'table')).rows[1].vals[1] === '59'), 'Ana sees Team at 59');
ok(await A.evaluate(() => { const r = tableView(S.D.els.find(e => e.ek === 'table')).rows[1]; return r.by[1] && r.by[1].author !== S.me.id; }), 'the cell knows Ben set it');

// 3. at the same moment Ana and Ben change different cells: both stay
await Promise.all([A.evaluate(() => { const el = S.D.els.find(e => e.ek === 'table'); return setCell(el, 'Free', 'Seats', '2'); }), B.evaluate(() => { const el = S.D.els.find(e => e.ek === 'table'); return setCell(el, 'Business', 'Seats', '60'); })]);
ok(await until(A, () => { const V = tableView(S.D.els.find(e => e.ek === 'table')); return V.rows[0].vals[2] === '2' && V.rows[2].vals[2] === '60'; }) && await until(B, () => { const V = tableView(S.D.els.find(e => e.ek === 'table')); return V.rows[0].vals[2] === '2' && V.rows[2].vals[2] === '60'; }), 'two edits at once to different cells: neither overwrites the other');

// 4. Ben adds a row from "+ Add row"
p = await scr(B, 'table', `(g => ({ x: b.x + 40, y: g.footY + 14 }))(tableGeom(el, b))`);
await B.mouse.click(p.x, p.y); await B.waitForTimeout(150);
ok(await B.evaluate(() => !document.getElementById('dataField').hidden), '“Add row” opens a field');
await B.keyboard.type('Enterprise'); await B.keyboard.press('Enter');
ok(await until(A, () => tableView(S.D.els.find(e => e.ek === 'table')).rows.at(-1).vals[0] === 'Enterprise'), 'Ana sees Ben’s new row');
await B.evaluate(() => setCell(S.D.els.find(e => e.ek === 'table'), 'Enterprise', 'Price', '499'));
ok(await until(A, () => tableView(S.D.els.find(e => e.ek === 'table')).rows.at(-1).vals[1] === '499'), 'cells of an added row are edited like any other');

// 5. Ben's ⌘Z takes his cell back
await B.evaluate(() => { const el = S.D.els.find(e => e.ek === 'table'); return setCell(el, 'Free', 'Price', '5', tableView(el).rows[0].vals[1]); });
await until(A, () => tableView(S.D.els.find(e => e.ek === 'table')).rows[0].vals[1] === '5');
await B.evaluate(() => undo());
ok(await until(A, () => tableView(S.D.els.find(e => e.ek === 'table')).rows[0].vals[1] === '0'), 'undo sets the cell back, for everyone');

// 6. Ana changes the structure: a column added, a value Ben set changed in the form; her value wins, Ben's row stays
await A.evaluate(() => { const el = S.D.els.find(e => e.ek === 'table'); S.sel = new Set([el.cid]); editAny(el); }); await A.waitForTimeout(150);
ok(await A.evaluate(() => document.getElementById('formDlg').style.display === 'block' && /Team \| 59/.test(document.getElementById('ff-rows').value)), 'the author’s form shows the values as everyone sees them');
await A.fill('#ff-cols', 'Plan, Price, Seats, Notes');
await A.evaluate(() => { const t = document.getElementById('ff-rows'); t.value = t.value.replace('Team | 59', 'Team | 69'); });
await A.click('#formOk');
ok(await until(B, () => { const V = tableView(S.D.els.find(e => e.ek === 'table' && visible(e))); return V.cols.length === 4 && V.rows[1].vals[1] === '69' && V.rows.at(-1).vals[0] === 'Enterprise'; }), 'new column, Ana’s 69 wins over Ben’s older 59, and Ben’s row is kept');
ok(await B.evaluate(() => S.D.els.filter(e => e.ek === 'table' && visible(e)).length === 1), 'still one table (a new version, not a copy)');
await B.evaluate(() => { const el = S.D.els.find(e => e.ek === 'table' && visible(e)); S.sel = new Set([el.cid]); editAny(el); }); await B.waitForTimeout(100);
ok(await B.evaluate(() => document.getElementById('formDlg')?.style.display !== 'block'), 'Ben can’t open the structure form of Ana’s table (Enter opens a cell or explains)');

// 7. a checklist: Ben ticks a box with one click; Ana sees it done, by Ben
await A.evaluate(() => { dataInsert('checklist'); }); await A.waitForTimeout(150);
await A.fill('#ff-title', 'Launch'); await A.fill('#ff-items', '[ ] Pricing page\n[ ] Docs\n[ ] Announcement'); await A.click('#formOk');
await until(B, () => S.D.els.some(e => e.ek === 'checklist'));
p = await scr(B, 'checklist', `(g => ({ x: b.x + 20, y: g.rowY(1) + 14 }))(checklistGeom(el, b))`);
await B.mouse.click(p.x, p.y);
ok(await until(A, () => { const V = checklistView(S.D.els.find(e => e.ek === 'checklist')); return V.done === 1 && V.items[1].done && V.items[1].by.author !== S.me.id; }), 'one click on the box ticks “Docs”, signed by Ben');
ok(await A.evaluate(() => /1 of 3 done/.test(describe(S.D.els.find(e => e.ek === 'checklist')))), 'screen readers hear the progress');

// 8. a metric: readings from both; the history is kept and a connected chart follows it
const m = await A.evaluate(() => commitNode({ kind: 'metric', x: 900, y: 0, label: 'Revenue\nvalue: 30\nunit: $k\ntarget: 50' }));
await until(B, c => S.records.has(c), m);
p = await scr(B, 'metric', `({ x: b.x + 40, y: b.y + b.h - 14 })`);
await B.mouse.click(p.x, p.y); await B.waitForTimeout(100); await B.keyboard.type('36'); await B.keyboard.press('Enter');
await A.evaluate(c => addReading(S.records.get(c), 41), m);
ok(await until(A, c => { const V = metricView(S.records.get(c)); return V.hist.length === 3 && V.cur.value === 41; }, m) && await until(B, c => metricView(S.records.get(c)).cur?.value === 41, m), 'readings from both people, in order: 30 → 36 → 41');
await A.evaluate(c => commitNode({ kind: 'chart', x: 900, y: 300, label: 'Revenue trend\ntype: line', parent: c }), m);
ok(await until(B, () => { const c = S.D.els.find(e => e.ek === 'chart'); return c && chartData(c).series[0]?.vals.join() === '30,36,41'; }), 'a chart connected to the metric draws its history');
await B.evaluate(c => addReading(S.records.get(c), 44), m);
ok(await until(A, () => chartData(S.D.els.find(e => e.ek === 'chart')).series[0].vals.at(-1) === 44), 'and redraws when a value is logged');

// 9. formulas: by name, over a column, and they follow the data
await A.evaluate(() => commitNode({ kind: 'formula', x: 0, y: 500, label: 'Average price\n= avg([Pricing.Price])' }));
await A.evaluate(() => commitNode({ kind: 'formula', x: 300, y: 500, label: 'Gap\n= [Revenue] - 50\nunit: $k' }));
ok(await until(A, () => { const f = S.D.els.filter(e => e.ek === 'formula').map(e => formulaResult(e).value); return f.includes(-6) && f.some(x => Math.abs(x - (0 + 69 + 199 + 499) / 4) < 1e-9); }), 'formulas read a metric and a table column');
await B.evaluate(() => setCell(S.D.els.find(e => e.ek === 'table' && visible(e)), 'Free', 'Price', '33'));
ok(await until(A, () => S.D.els.filter(e => e.ek === 'formula').some(e => formulaResult(e).value === 200)), 'Ben changes a cell: the average follows (33 + 69 + 199 + 499) / 4 = 200');
await A.evaluate(() => commitNode({ kind: 'formula', x: 0, y: 700, label: 'Loop A\n= [Loop B] + 1' })); await A.evaluate(() => commitNode({ kind: 'formula', x: 300, y: 700, label: 'Loop B\n= [Loop A] + 1' }));
ok(await until(A, () => S.D.els.filter(e => e.ek === 'formula' && /^Loop/.test(e.text)).every(e => /depends on itself/.test(formulaResult(e).err || ''))), 'a loop between formulas is reported, not hung on');
ok(await A.evaluate(() => { try { fxEval('1 +', () => 0); return false; } catch (e){ return e instanceof FxError; } }) && await A.evaluate(() => fxEval('round(2 ^ 3 / 3, 2) + sum(1, 2)', () => 0)) === 5.67, 'the expression reader: precedence, functions, errors');

// 10. a date counts in days, and formulas can use it
const in5 = new Date(Date.now() + 5 * 864e5), ymd = `${in5.getFullYear()}-${String(in5.getMonth() + 1).padStart(2, '0')}-${String(in5.getDate()).padStart(2, '0')}`;
await A.evaluate(d => commitNode({ kind: 'date', x: 0, y: 900, label: `Beta launch\n${d}` }), ymd);
await A.evaluate(() => commitNode({ kind: 'formula', x: 300, y: 900, label: 'Weeks left\n= [Beta launch] / 7\ndecimals: 1' }));
ok(await until(A, () => S.D.els.some(e => e.ek === 'formula' && Math.abs((formulaResult(e).value ?? 0) - 5 / 7) < 1e-9)), 'a date is days from today in a formula (5 days → 0.7 weeks)');

// 11. links: only http(s) opens; a forged javascript: link is drawn as text and never followed
await A.evaluate(() => { dataInsert('link'); }); await A.waitForTimeout(150);
await A.fill('#ff-url', 'javascript:alert(1)'); await A.click('#formOk'); await A.waitForTimeout(150);
ok(await A.evaluate(() => !S.D.els.some(e => e.ek === 'link')), 'the form refuses a javascript: address');
await A.evaluate(() => closeForm(null));
await B.evaluate(() => commitNode({ kind: 'link', x: 0, y: 1100, label: 'Click me\njavascript:alert(document.cookie)' }));
ok(await until(A, () => { const el = S.D.els.find(e => e.ek === 'link'); return el && !DATA_KINDS.link.hit(el, { x: box(el).x + box(el).w - 40, y: box(el).y + 24 }, box(el)) && /isn’t a web link/.test(describe(el)); }), 'a forged link with javascript: has no open button and says so');

// 12. forged and malformed values are refused; a locked table ignores values signed after the lock
const root = await A.evaluate(() => dataRoot(S.D.els.find(e => e.ek === 'metric')));
const bad = await B.evaluate(async r => { const before = S.why.malformed || 0; for (const V of ['1e400', 'NaN', '12abc', '']) await ingest(await signed('READING', [['I', S.me.id], ['R', r], ['V', encTxt(V)], ['M', ''], ['Z', ++S.lamport], ['T', Date.now()]])); await ingest(await signed('CELL', [['I', S.me.id], ['R', 'nope'], ['A', 'x'], ['B', 'y'], ['M', 'z'], ['Z', ++S.lamport], ['T', Date.now()]])); return (S.why.malformed || 0) - before; }, root);
ok(bad === 5, 'readings that aren’t plain numbers and cells naming no node are refused as malformed');
await A.evaluate(() => { const el = S.D.els.find(e => e.ek === 'table' && visible(e)); S.sel = new Set([el.cid]); return toggleLock(); });
await until(B, () => S.D.els.find(e => e.ek === 'table' && visible(e))?.locked);
await B.evaluate(() => { const el = S.D.els.find(e => e.ek === 'table' && visible(e)); return dataSign('CELL', dataRoot(el), [['A', encTxt('Team')], ['B', encTxt('Price')], ['M', encTxt('1')]]); });
await A.waitForTimeout(400);
ok(await A.evaluate(() => tableView(S.D.els.find(e => e.ek === 'table' && visible(e))).rows[1].vals[1] === '69'), 'locked: a cell signed after the lock takes no part');

// 13. export: the SVG carries the data as text
const svg = await A.evaluate(() => toSVG());
ok(/Pricing/.test(svg) && /Enterprise/.test(svg) && /Revenue/.test(svg), 'SVG export writes each data node’s title and values');
ok(!/<script/i.test(svg) && !/<a\b/i.test(svg), 'nothing in the export is markup: titles and values are escaped text');

// 14. in someone's suggest zone a value waits for them, like any other edit
const fr = await A.evaluate(() => commitNode({ kind: 'frame', x: 2000, y: 0, W: 600, H: 400, label: 'Ana’s area' }));
const cl2 = await A.evaluate(() => commitNode({ kind: 'checklist', x: 2050, y: 60, label: 'Ana’s list\n- [ ] One' }));
await until(B, c => S.records.has(c), cl2); await A.evaluate(f => setZone(S.records.get(f), 'suggest'), fr);
await until(B, () => [...S.records.values()].some(r => r.type === 'ZONE'));
const tk = await B.evaluate(c => setTick(S.records.get(c), 'One', true), cl2);
ok(await until(A, c => S.D.pending.has(c), tk) && await A.evaluate(c => checklistView(S.records.get(c)).done === 0, cl2), 'Ben’s tick in Ana’s suggest zone waits for her');
await A.evaluate(c => answer(c, true), tk);
ok(await until(B, c => checklistView(S.records.get(c)).done === 1, cl2), 'she accepts: it counts');

// 15. the ledger says what each value change was
ok(await A.evaluate(() => [...S.records.values()].filter(r => r.type === 'CELL').some(r => /^set Price of “Team” to “59”/.test(activityText(r)))), 'the activity log reads “set Price of “Team” to “59””');
// D opens the menu from the keyboard
await A.evaluate(() => { closeMenu(false); S.sel.clear(); cv.focus(); }); await A.keyboard.press('d'); await A.waitForTimeout(100);
ok(await A.evaluate(() => !document.getElementById('menu').hidden && /Insert data/.test(document.getElementById('menu').textContent)), 'D opens the Data menu');
await A.keyboard.press('Escape');
await A.evaluate(() => { S.view = { x: -100, y: -120, zoom: .7 }; dirty = true; }); await A.waitForTimeout(200);
await A.screenshot({ path: 'tests/out/datanodes.png' });

console.log(`asserted ${count()} checks`);
console.log('axe', JSON.stringify(v));
console.log('errors', JSON.stringify(errs));
await b.close();
if (v.length || errs.length) process.exit(1);
