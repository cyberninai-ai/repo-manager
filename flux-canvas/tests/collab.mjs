// Collaboration features: canvas home, templates, examples, connectors, voting, timer, summary, present, palette, audit, history
import { BASE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import fs from 'fs';
const axe = fs.readFileSync(AXE, 'utf8');
const b = await chromium.launch({ ...LAUNCH });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(BASE + '#collab00001'); await p.waitForTimeout(700);
const W = (t = 300) => p.waitForTimeout(t);
const sr = () => p.evaluate(() => document.getElementById('sr').textContent);
const runAxe = async label => { await p.addScriptTag({ content: axe }).catch(() => {}); console.log(`axe ${label}`, JSON.stringify(await p.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(v => v.id + ': ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | '))))); };

// 1. empty state and canvas home
console.log('empty state shown', await p.evaluate(() => !document.getElementById('empty').hidden));
await p.evaluate(() => document.getElementById('c').focus()); await p.keyboard.press('h'); await W();
console.log('home', JSON.stringify(await p.evaluate(() => ({ open: !document.getElementById('home').hidden, tpl: document.querySelectorAll('#homeTpl button').length, ex: document.querySelectorAll('#homeEx button').length, focus: document.activeElement.closest('#home') ? 'inside' : 'outside' }))));
for (let i = 0; i < 40; i++) await p.keyboard.press('Tab');
console.log('focus trapped in home', await p.evaluate(() => !!document.activeElement.closest('#home')));
await runAxe('home');
await p.screenshot({ path: OUT + '/collab-home.png' });

// 2. every template builds cleanly
for (const id of ['blank', 'brainstorm', 'feedback', 'story', 'moodboard', 'audit', 'mindmap']){
  await p.evaluate(id => newCanvasFrom(TEMPLATES.find(t => t.id === id)), id); await W(500);
  console.log(`template ${id}`, JSON.stringify(await p.evaluate(() => ({ title: canvasTitle(), els: S.D.els.filter(e => visible(e)).length, rej: S.rejected }))));
}

// 3. every example opens, verifies and renders
const exStats = {};
for (const id of ['offsite', 'retro', 'onboarding', 'brand', 'expense']){
  await p.evaluate(id => openExample(EXAMPLES.find(x => x.id === id)), id); await W(900);
  exStats[id] = await p.evaluate(async () => {
    let ok = 0, bad = 0; for (const r of S.records.values()) (await verifyRaw(parse(r.raw))) ? ok++ : bad++;
    return { title: canvasTitle(), records: S.records.size, ok, bad, rej: S.rejected, authors: new Set([...S.records.values()].map(r => r.author)).size,
      votes: [...(S.D.reactions?.values() || [])].reduce((a, m) => a + (m.vote?.size || 0), 0), audits: S.D.audits?.size || 0, signoffs: S.D.signoffs?.length || 0,
      threads: S.D.threads.size, images: S.D.els.filter(e => e.type === 'IMAGE').length, swatches: S.D.els.filter(e => e.ek === 'swatch').length };
  });
  console.log(`example ${id}`, JSON.stringify(exStats[id]));
  await p.screenshot({ path: OUT + `/collab-ex-${id}.png` });
}

// 4. canvases list and switching
await p.evaluate(() => openHome()); await W();
console.log('canvas list', await p.evaluate(() => [...document.querySelectorAll('#homeList .open b')].map(b => b.textContent).slice(0, 4).join(' | ')));
await p.keyboard.press('Escape'); await W();

// 5. audit walk on the expense example (open again for a clean canvas)
await p.evaluate(() => openExample(EXAMPLES.find(x => x.id === 'expense'))); await W(900);
await p.evaluate(() => { const s = S.D.els.find(e => e.type === 'NODE' && e.text === 'Submit expense'); S.sel = new Set([s.cid]); document.getElementById('c').focus(); });
await p.keyboard.press('a'); await W();
console.log('audit walk', JSON.stringify(await p.evaluate(() => ({ open: document.getElementById('audit').style.display, steps: walk.steps.map(c => S.records.get(c).text) }))));
await p.keyboard.press('1'); await W(400); await p.keyboard.press('2'); await W(400);
console.log('my verdicts', await p.evaluate(() => [...S.D.audits.values()].filter(m => m.has(S.me.id)).length), '|', await sr());
await runAxe('audit panel');
const report = await p.evaluate(() => auditReport());
console.log('report has table and signoff', report.includes('| # | Step |') && report.includes('## Sign-offs') && report.includes('Receipts over 90 days'));
const so = await p.evaluate(() => S.D.signoffs[0]);
console.log('signoff fences verdicts', so && so.members.length === 6);
await p.evaluate(() => closeAudit());

// 6. history: scrub back, signing is refused, back to now
const n0 = await p.evaluate(() => S.D.els.filter(e => visible(e)).length);
await p.keyboard.press('Shift+H'); await W(); await p.evaluate(() => { const r = document.getElementById('histRange'); r.value = 3; r.dispatchEvent(new Event('input')); }); await W(300);
const n1 = await p.evaluate(() => S.D.els.filter(e => visible(e)).length);
const refused = await p.evaluate(() => commitText({ x: 0, y: 0 }, 'should not sign').then(() => 'signed', e => e.name)); await W();
console.log('history', n0, '→', n1, '| refused while viewing:', refused === 'HistoryView' && (await p.evaluate(() => document.getElementById('toast').textContent)).startsWith('Viewing history'));
await p.evaluate(() => document.getElementById('histNow').click()); await W(300);
console.log('back to now', await p.evaluate(() => S.D.els.filter(e => visible(e)).length) === n0);

// 7. brainstorm: dot voting with a budget, chip toggling, timer synced to a second tab
await p.evaluate(() => openExample(EXAMPLES.find(x => x.id === 'offsite'))); await W(900);
console.log('vote pill is yours', await p.evaluate(() => document.getElementById('votes').textContent));
await p.evaluate(() => { S.voteBudget = 2; const n = S.D.els.filter(e => e.ek === 'sticky').slice(0, 3); S.sel = new Set([n[0].cid]); document.getElementById('c').focus(); });
await p.keyboard.press('d'); await W(300);
await p.evaluate(() => { const n = S.D.els.filter(e => e.ek === 'sticky'); S.sel = new Set([n[1].cid, n[2].cid]); });
await p.keyboard.press('d'); await W(300);
console.log('budget enforced', (await p.evaluate(() => document.getElementById('toast').textContent)).startsWith('Out of votes'), 'my votes', await p.evaluate(() => myVotes()));
const chip = await p.evaluate(() => { const n = S.D.els.find(e => e.ek === 'sticky'); return chips.find(c => c.cid === n.cid && c.kind === 'vote'); });
await p.mouse.click(chip.x + 5, chip.y + 5); await W(300);
console.log('chip click takes the vote back', await p.evaluate(() => myVotes()));
const p2 = await ctx.newPage(); await p2.goto(BASE + '#' + await p.evaluate(() => canvasId)); await p2.waitForTimeout(900);
await p.evaluate(() => startTimer(5)); await W(400);
console.log('timer in both tabs', await p.evaluate(() => !document.getElementById('timer').hidden), await p2.evaluate(() => !document.getElementById('timer').hidden && document.getElementById('timer').textContent));
await p.evaluate(() => stopTimer()); await W(300);
console.log('timer stopped in tab 2', await p2.evaluate(() => document.getElementById('timer').hidden));
await p2.close();
await p.evaluate(() => { S.sel = new Set(S.D.els.filter(e => e.ek === 'sticky').slice(0, 4).map(e => e.cid)); });
await p.evaluate(() => sortByVotes([...S.sel].map(c => S.records.get(c)))); await W(400);
console.log('sorted by votes', await p.evaluate(() => [...S.sel].map(c => S.records.get(c)).sort((a, b) => box(a).y - box(b).y).map(e => reactCount(e.cid, 'vote')).join(',')));

// 8. feedback summary
await p.evaluate(() => openExample(EXAMPLES.find(x => x.id === 'retro'))); await W(900);
const md = await p.evaluate(() => feedbackSummary());
console.log('summary', JSON.stringify({ cols: ['What went well', 'What to improve', 'Questions', 'Ideas'].every(c => md.includes('## ' + c)), top: md.split('\n').find(l => l.startsWith('1. ')), comments: md.includes('## Open comment threads') }));
await p.keyboard.press('Shift+S'); await W(); console.log('report dialog', await p.evaluate(() => !document.getElementById('report').hidden));
await runAxe('report'); await p.keyboard.press('Escape'); await W();

// 9. story: present in connector order, keys, Escape
await p.evaluate(() => openExample(EXAMPLES.find(x => x.id === 'onboarding'))); await W(1200);
await p.evaluate(() => { S.sel.clear(); document.getElementById('c').focus(); });
await p.keyboard.press('F5'); await W(600);
const s1 = await p.evaluate(() => document.getElementById('presentT').textContent);
await p.keyboard.press('ArrowRight'); await W(500); await p.keyboard.press('ArrowRight'); await W(500);
const s3 = await p.evaluate(() => document.getElementById('presentT').textContent);
await p.screenshot({ path: OUT + '/collab-present.png' });
await p.keyboard.press('Escape'); await W(300);
console.log('present', s1, '→', s3, '| ended', await p.evaluate(() => !document.body.classList.contains('presenting')));

// 10. moodboard: palette from a generated image
await p.evaluate(() => openExample(EXAMPLES.find(x => x.id === 'brand'))); await W(1200);
const pal = await p.evaluate(async () => { const img = S.D.els.find(e => e.type === 'IMAGE' && e.alt.startsWith('Warm')); return paletteOf(img); });
console.log('palette', pal.join(','), 'distinct', new Set(pal).size);

// 11. connectors: relation preset, shape and dash, in SVG
const conn = await p.evaluate(async () => {
  const a = await commitNode({ kind: 'card', x: 3000, y: 0, label: 'Claim' }), c = await commitNode({ kind: 'card', x: 3300, y: 120, label: 'Evidence' });
  const ar = await commitArrow(S.records.get(c), S.records.get(a)); await new Promise(r => setTimeout(r, 30));
  S.sel = new Set([ar]); await TOOLBAR_ACTIONS['rel:supports']([S.records.get(ar)]); await TOOLBAR_ACTIONS.shape([S.records.get(ar)]); await TOOLBAR_ACTIONS.dash([S.records.get(ar)]);
  await new Promise(r => setTimeout(r, 30)); const el = S.records.get(ar), svg = toSVG();
  return { label: el.elabel, color: ecol(el), shape: el.eshape, dash: el.edash, svgDash: svg.includes('stroke-dasharray'), svgLabel: svg.includes('>supports<') };
});
console.log('connector', JSON.stringify(conn));

// 12. double-click empty space in select mode drops a sticky note
await p.evaluate(() => { setMode(true); S.sel.clear(); S.view = { x: 5000, y: 5000, zoom: 1 }; dirty = true; document.getElementById('c').focus(); });
await p.mouse.click(640, 420); await p.waitForTimeout(80); await p.mouse.click(640, 420); await W();
await p.keyboard.type('Quick thought'); await p.keyboard.press('Enter'); await W(400);
console.log('sticky', await p.evaluate(() => S.D.els.filter(e => e.ek === 'sticky' && e.text === 'Quick thought').length));
await runAxe('canvas');
console.log('errors', errs);
await b.close();
