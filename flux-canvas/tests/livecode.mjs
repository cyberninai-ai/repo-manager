// Code on the canvas and flows to drop in (features/flow/sandbox, output, demos): live code edited as you type and run in
// sealed frames, the Code step in a sealed worker, Results that show a flow's output (a rendered page too), asking before
// running someone else's code, and every demo flow dropping in and running; two people over WebRTC
import { team, ok, until, count, axeOn } from './pair.mjs';
const { b, errs, pages: [A, B] } = await team(['Ana', 'Ben'], 'livetest01');
const v = [];
const frames = p => p.evaluate(() => [...document.querySelectorAll('#liveLayer iframe')].map(f => ({ sandbox: f.getAttribute('sandbox'), csp: /Content-Security-Policy[^>]*default-src 'none'/.test(f.srcdoc), doc: f.srcdoc.length, title: f.title })));

// 1. Ana adds live code from the Data menu: it runs on the canvas, and the editor opens beside it
await A.click('#dataBtn'); await A.waitForTimeout(120);
ok(await A.evaluate(() => /Flow templates/.test(document.getElementById('menu').textContent) && /Live code/.test(document.getElementById('menu').textContent)), 'the Data menu offers Live code and Flow templates');
await A.locator('#menu [role=menuitem]', { hasText: 'Write HTML or JavaScript' }).click();
ok(await until(A, () => S.D.els.some(e => e.ek === 'live') && document.getElementById('px-livecode')?.style.display === 'flex'), 'a live-code node is added and its editor opens');
ok(await until(A, () => document.querySelectorAll('#liveLayer iframe').length === 1), 'its code runs on the canvas');
let f = await frames(A);
ok(f[0].sandbox === 'allow-scripts' && f[0].csp, 'in a sandboxed frame (scripts only, no origin) with a policy that blocks the network');
v.push(...(await axeOn(A, '#px-livecode')).map(x => `editor: ${x}`));

// 2. typing updates the canvas at once, unsigned until Sign
await A.evaluate(() => { const s = document.getElementById('lcL'); s.value = 'html'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await A.fill('#lcC', '<h1 id="h">Hello from Ana</h1><script>document.getElementById("h").style.color = "rebeccapurple"</script>');
ok(await until(A, () => [...document.querySelectorAll('#liveLayer iframe')].some(f => /Hello from Ana/.test(f.srcdoc))), 'typing shows on the canvas straight away');
ok(await A.evaluate(() => LIVE_DRAFT.size === 1 && /Unsigned/.test(document.querySelector('#px-livecode .pill').textContent)), 'as an unsigned change only Ana sees');
ok(await B.evaluate(() => !S.D.els.some(e => e.ek === 'live' && /Hello from Ana/.test(e.text))), 'Ben doesn’t have it yet');
await A.click('#px-livecode [data-save]');
ok(await until(B, () => S.D.els.some(e => e.ek === 'live' && visible(e) && /Hello from Ana/.test(e.text))), 'Sign: a new version reaches Ben');
ok(await A.evaluate(() => LIVE_DRAFT.size === 0 && S.D.els.filter(e => e.ek === 'live' && visible(e)).length === 1), 'still one node, now signed');

// 3. Ben doesn't run Ana's code until he chooses to
await B.evaluate(() => { const el = S.D.els.find(e => e.ek === 'live' && visible(e)); S.view = { ...S.view, zoom: 1 }; ensureVisible(el); dirty = true; }); await B.waitForTimeout(200);
ok(await B.evaluate(() => document.querySelectorAll('#liveLayer iframe').length === 0 && /press Run/.test(describe(S.D.els.find(e => e.ek === 'live' && visible(e))))), 'Ben sees “Run code by Ana”, nothing running');
const pt = await B.evaluate(() => { const b = box(S.D.els.find(e => e.ek === 'live' && visible(e))); return toScreen(b.x + b.w / 2, b.y + b.h / 2); });
await B.mouse.click(pt.x, pt.y);
ok(await until(B, () => [...document.querySelectorAll('#liveLayer iframe')].some(f => /Hello from Ana/.test(f.srcdoc))), 'one click and it runs for him');
await B.evaluate(() => { S.sel = new Set([S.D.els.find(e => e.ek === 'live' && visible(e)).cid]); editAny(S.D.els.find(e => e.ek === 'live' && visible(e))); }); await B.waitForTimeout(100);
ok(await B.evaluate(() => document.getElementById('px-livecode')?.style.display !== 'flex'), 'only Ana opens the editor of her code');

// 4. the Code step: runs in a sealed worker, stops a runaway loop, has no network
const step = await A.evaluate(async () => {
  const f = await commitNode({ kind: 'flow', x: 0, y: 900, label: flowText('Code', ['alpha', 'beta', 'gamma']) });
  const s = await commitNode({ kind: 'step', x: 340, y: 900, label: stepText('Shout', { do: 'code', text: 'return items.map(i => ({ ...i, text: i.text.toUpperCase() + "!" }));' }), parent: f });
  await commitNode({ kind: 'results', x: 680, y: 900, label: resultsText('Out', 'list'), parent: s });
  await new Promise(r => setTimeout(r, 50)); const cid = await runFlow(current(f)); return pipeLog(S.records.get(cid)).map(s => s.out.map(i => i.text).join(','));
});
ok(step[1] === 'ALPHA!,BETA!,GAMMA!' && step[2] === step[1], 'code transforms the items, and Results shows what arrives');
const errsOf = await A.evaluate(async () => { const out = []; for (const code of ['while (true) {}', 'return fetch("https://example.com")', 'return indexedDB.open("x")', 'return localStorage.getItem("k")'])
  try { await pipeSandbox(code, []); out.push('ran'); } catch (e){ out.push(e.message); } return out; });
ok(/longer than 2 seconds/.test(errsOf[0]), 'a loop that never ends is stopped after 2 seconds');
ok(errsOf.slice(1).every(m => m !== 'ran'), `no network and no storage inside: ${errsOf.slice(1).join(' / ')}`);

// 5. Ben runs Ana's flow: he is asked about her code first; no means no run
const before = await B.evaluate(() => [...S.records.values()].filter(r => r.type === 'RUN').length);
await B.evaluate(() => { runFlow(S.D.els.find(e => e.ek === 'flow' && /^Code/.test(e.text))); });
ok(await until(B, () => document.getElementById('formDlg')?.style.display === 'block' && /written by Ana/.test(document.getElementById('formDlg').textContent)), 'running a flow with Ana’s code asks Ben first, naming her');
v.push(...(await axeOn(B, '#formDlg')).map(x => `consent: ${x}`));
await B.click('#formNo'); await B.waitForTimeout(300);
ok(await B.evaluate(n => [...S.records.values()].filter(r => r.type === 'RUN').length === n, before), 'he says no: nothing runs');
await B.evaluate(() => { runFlow(S.D.els.find(e => e.ek === 'flow' && /^Code/.test(e.text))); }); await until(B, () => document.getElementById('formDlg')?.style.display === 'block');
await B.click('#formOk');
ok(await until(B, n => [...S.records.values()].filter(r => r.type === 'RUN').length === n + 1, before), 'he says yes: it runs');

// 6. drop in every demo flow and run it: each works without AI
const res = await A.evaluate(async () => { const out = {};
  for (const d of FLOW_DEMOS){ const m = await dropDemo(d.id); await new Promise(r => setTimeout(r, 80)); const fk = d.nodes.find(n => n[1] === 'flow'); if (!fk){ out[d.id] = m.made.length; continue; }
    const cid = await runFlow(current(m.keys.get(fk[0]))); await new Promise(r => setTimeout(r, 60)); const r = S.records.get(cid), l = pipeLog(r); out[d.id] = { ok: r.ok, last: l.at(-1).out.map(i => i.text) }; }
  return out; });
const ran = Object.entries(res).filter(([, r]) => typeof r === 'object');
ok(ran.length >= 12 && ran.every(([, r]) => r.ok), `all ${ran.length} demo flows run without errors`);
ok(res.edl.last[0] === '00:00 to 00:18  Interview B, take 1', 'video: the edit decision list starts with the best clip at 00:00');
ok(res.rice.last.join() === 'Shorter signup (RICE 640),Slack alerts (RICE 400),Templates gallery (RICE 210)', 'product: RICE ranks the top three');
ok(res.actions.last.join() === 'Ana drafts the announcement,Ben fixes the signup bug,Chen books the demo', 'meetings: the actions, tidied');
ok(await A.evaluate(() => checklistView(S.D.els.find(e => e.ek === 'checklist' && /Action items/.test(e.text))).items.length === 3), 'and they land on the checklist');
ok(res.sketch === 2, 'coding: the live sketches drop in');
// the landing page renders on the canvas from the flow's output
await A.evaluate(() => { const r = S.D.els.find(e => e.ek === 'results' && /Preview/.test(e.text)); S.view = { ...S.view, zoom: 1 }; ensureVisible(r); dirty = true; }); await A.waitForTimeout(300);
ok(await A.evaluate(() => [...document.querySelectorAll('#liveLayer iframe')].some(f => /Every change, signed/.test(f.srcdoc))), 'coding: the page the flow wrote is rendered on the canvas');
// Ben sees Ana's page only once he chooses to
ok(await until(B, () => S.D.els.some(e => e.ek === 'results' && /Preview/.test(e.text) && pipeOut(e)?.out?.length)), 'Ben has the run');
await B.evaluate(() => { const r = S.D.els.find(e => e.ek === 'results' && /Preview/.test(e.text)); S.view = { ...S.view, zoom: 1 }; ensureVisible(r); dirty = true; }); await B.waitForTimeout(300);
ok(await B.evaluate(() => ![...document.querySelectorAll('#liveLayer iframe')].some(f => /Every change, signed/.test(f.srcdoc))), 'but her page isn’t shown until he asks');
await B.evaluate(() => { DATA_KINDS.results.press(S.D.els.find(e => e.ek === 'results' && /Preview/.test(e.text))); }); await B.waitForTimeout(300);
ok(await B.evaluate(() => [...document.querySelectorAll('#liveLayer iframe')].some(f => /Every change, signed/.test(f.srcdoc))), 'one click shows it');
await A.evaluate(() => demoMenu()); await A.waitForTimeout(100);
ok(await A.evaluate(() => ['Writing', 'Coding', 'Design', 'Video editing', 'Marketing', 'Research', 'Product', 'Meetings'].every(h => document.getElementById('menu').textContent.includes(h))), 'the gallery groups flows by kind of work');
v.push(...(await axeOn(A, '#menu')).map(x => `gallery: ${x}`));
await A.evaluate(() => closeMenu(false));
await A.screenshot({ path: 'tests/out/livecode.png' });

console.log(`asserted ${count()} checks`);
console.log('axe', JSON.stringify(v));
console.log('errors', JSON.stringify(errs));
await b.close();
if (v.length || errs.length) process.exit(1);
