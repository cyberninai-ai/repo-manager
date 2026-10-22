// Flows (features/flow): items connected in order and run — steps that pass data, steps that respond (with a stand-in for
// AI), steps that write back — built through the Data menu and run with the Run button; two people over WebRTC
import { team, ok, until, count, axeOn } from './pair.mjs';
const { b, errs, pages: [A, B] } = await team(['Ana', 'Ben'], 'pipetest01');
const v = [];
const shot = async (p, kind, geom) => { await p.evaluate(k => { const el = S.D.els.find(e => e.ek === k && visible(e)); S.view = { ...S.view, zoom: 1 }; ensureVisible(el); dirty = true; }, kind); await p.waitForTimeout(120);
  return p.evaluate(([k, g]) => { const el = S.D.els.find(e => e.ek === k && visible(e)); const w = new Function('b', 'return ' + g)(box(el)); return toScreen(w.x, w.y); }, [kind, geom]); };
// Ana has an AI connected (a stand-in that answers predictably); Ben has none
await A.evaluate(() => { FLOW_RESPONDERS.ai = { name: 'Test AI', run: async ({ kind, prompt, items, count }) => kind === 'ideas' ? items.flatMap(i => Array.from({ length: count }, (_, k) => `AI idea ${k + 1} for ${i.text}`)) : `AI read ${items.length} items: ${prompt.split('\n')[0]}` }; });

// 1. a table to read from and one to write to
await A.evaluate(() => commitNode({ kind: 'table', x: -600, y: 200, label: tableText('Feedback', ['Quote', 'Votes'], [['Signup is too long', '6'], ['Love the templates', '2'], ['Can’t find export', '4']]) }));
await A.evaluate(() => commitNode({ kind: 'table', x: 900, y: 200, label: tableText('Backlog', ['Item', 'Source'], [['Dark mode', 'roadmap']]) }));

// 2. Ana makes a flow from the Data menu, then chains steps to it with D → Step
await A.click('#dataBtn'); await A.waitForTimeout(120);
ok(await A.evaluate(() => /Build a flow/.test(document.getElementById('menu').textContent)), 'the Data menu has a “Build a flow” section');
await A.locator('#menu [role=menuitem]', { hasText: 'Where a flow starts' }).click(); await A.waitForTimeout(120);
await A.fill('#ff-title', 'Triage feedback'); await A.fill('#ff-input', ''); await A.click('#formOk');
ok(await until(A, () => S.D.els.some(e => e.ek === 'flow')), 'a Flow node is on the canvas');
const addStep = async (match, fill) => {
  await A.click('#dataBtn'); await A.waitForTimeout(100);
  await A.locator('#menu [role=menuitem]', { hasText: 'One action' }).click(); await A.waitForTimeout(100);
  v.push(...(await axeOn(A, '#menu')).map(x => `step menu: ${x}`));
  await A.locator('#menu [role=menuitem]', { hasText: match }).first().click(); await A.waitForTimeout(120);
  await fill(); await A.click('#formOk'); await A.waitForTimeout(250);
};
await addStep('Keep the items that match', () => A.fill('#ff-where', 'Votes >= 4'));
ok(await A.evaluate(() => { const s = S.D.els.find(e => e.ek === 'step'), f = S.D.els.find(e => e.ek === 'flow'); return s && current(s.parent)?.cid === f.cid; }), 'the step is connected to the flow it was added after');
await addStep('A responder answers a prompt', () => A.fill('#ff-prompt', 'What should we fix first?\n{{all}}'));
await addStep('New ideas from each item', () => A.fill('#ff-count', '2'));
await addStep('Add rows to a table', () => A.selectOption('#ff-into', 'Backlog'));
v.push(...(await axeOn(A, '#formDlg').catch(() => [])).map(x => `form: ${x}`));
// the Feedback table feeds the filter: connected with an ordinary connector
await A.evaluate(() => { const t = S.D.els.find(e => e.ek === 'table' && /Feedback/.test(e.text)), s = S.D.els.find(e => e.ek === 'step' && /filter/.test(e.text)); return commitArrow(t, s); });
ok(await A.evaluate(() => { const P = pipePlan(S.D.els.find(e => e.ek === 'flow')); return !P.err && P.order.map(c => pipeTitle(S.records.get(c))).join(' > ') === 'Triage feedback > Feedback > Filter > Ask > Ideas > Add rows to a table'; }), 'the plan runs the flow, the table feeding in, then each step in order');

// 3. Run: click the button on the flow
const r = await shot(A, 'flow', '({ x: b.x + b.w - 50, y: b.y + 24 })');
await A.mouse.click(r.x, r.y);
ok(await until(A, () => !pipeRunning && [...S.records.values()].some(r => r.type === 'RUN'), null, 15000), 'one click on Run runs it and signs the run');
const log = await A.evaluate(() => pipeLog([...S.records.values()].find(r => r.type === 'RUN')));
ok(log.length === 6 && log[2].out.length === 2 && log[2].mode === 'pass', 'the filter only passes data on: 3 rows in, the 2 with 4 votes or more out');
ok(log[3].mode === 'respond' && log[3].out[0].text === 'AI read 2 items: What should we fix first?', 'Ask responds with the connected AI');
ok(log[4].out.length === 2 && /^AI idea 1 for AI read 2 items/.test(log[4].out[0].text), 'Ideas responds too, per item that reaches it');
ok(await A.evaluate(() => tableView(S.D.els.find(e => e.ek === 'table' && /Backlog/.test(e.text))).rows.length === 3), 'the last step writes two rows into Backlog');

// 4. Ben has no AI, but sees exactly Ana's responses, signed, and the rows
ok(await until(B, () => { const r = [...S.records.values()].find(r => r.type === 'RUN'); const l = r && pipeLog(r); return l && l[3].out[0]?.text === 'AI read 2 items: What should we fix first?'; }), 'Ben sees the same response, from the signed run');
ok(await B.evaluate(() => { const s = S.D.els.find(e => e.ek === 'step' && /do: ask/.test(e.text)); const o = pipeOut(s); return o && o.out[0].text.startsWith('AI read') && o.run.author !== S.me.id; }), 'the Ask step on Ben’s canvas shows Ana’s answer and that it’s hers');
ok(await until(B, () => tableView(S.D.els.find(e => e.ek === 'table' && /Backlog/.test(e.text))).rows.length === 3), 'and the rows the flow wrote');
await B.evaluate(() => openPanel('pipes')); await B.waitForTimeout(150);
ok(await B.evaluate(() => /What “Triage feedback” did/.test(document.getElementById('px-pipes').textContent) && document.querySelectorAll('#px-pipes .fl-trace > li').length === 6), 'the Flows panel lists what each step did');
v.push(...(await axeOn(B, '#px-pipes')).map(x => `panel: ${x}`));

// 5. without AI, Ben's run of the same flow answers with the built-in responders, and says so in the log
await B.evaluate(() => runFlow(S.D.els.find(e => e.ek === 'flow')));
ok(await until(B, () => [...S.records.values()].filter(r => r.type === 'RUN').length === 2), 'Ben can run it too');
ok(await B.evaluate(() => { const r = [...S.records.values()].filter(r => r.type === 'RUN').at(-1), l = pipeLog(r); return l[3].out[0].text.startsWith('What should we fix first?') && /^What if|^Who else|^What could|^Combine|^Remove|^Do |^Make|^Turn/.test(l[4].out[0].text); }), 'his run uses the built-in responders: the filled-in prompt, and idea prompts');

// 6. errors are clear: a responder that isn't connected, a table that doesn't exist, a loop
await A.evaluate(() => commitNode({ kind: 'flow', x: -600, y: 900, label: flowText('Broken', ['one', 'two']) }));
await A.evaluate(() => { const f = S.D.els.find(e => e.ek === 'flow' && /Broken/.test(e.text)); return commitNode({ kind: 'step', x: -250, y: 900, label: stepText('Ask nobody', { do: 'ask', prompt: '{{all}}', using: 'nobody' }), parent: f.cid }); });
await A.evaluate(() => runFlow(S.D.els.find(e => e.ek === 'flow' && /Broken/.test(e.text))));
ok(await until(A, () => { const r = [...S.records.values()].filter(r => r.type === 'RUN' && !r.ok).at(-1); return r && /No responder “nobody” is connected/.test(pipeLog(r)?.[1]?.err || ''); }), 'a responder that isn’t connected is a step error, and the run is marked as having errors');
await A.evaluate(async () => { const s = S.D.els.find(e => e.ek === 'step' && /nobody/.test(e.text)), f = S.D.els.find(e => e.ek === 'flow' && /Broken/.test(e.text)); await commitArrow(s, f); });
ok(await until(A, () => !!pipePlan(S.D.els.find(e => e.ek === 'flow' && /Broken/.test(e.text))).err === false), 'an arrow back to the flow’s own start doesn’t make a loop');
const x = await A.evaluate(async () => { const a = await commitNode({ kind: 'step', x: 0, y: 1300, label: stepText('A', { do: 'count' }) }), bb = await commitNode({ kind: 'step', x: 300, y: 1300, label: stepText('B', { do: 'count' }), parent: a });
  const f = await commitNode({ kind: 'flow', x: -300, y: 1300, label: flowText('Loop', []) }); await commitArrow(current(f), current(a)); await commitArrow(current(bb), current(a)); await new Promise(r => setTimeout(r, 50)); return pipePlan(current(f)).err; });
ok(/loop/.test(x || ''), 'a loop between steps is reported before anything runs');

// 7. a forged run log is cleaned before anyone sees it: no markup, no prototype keys, capped
const forged = await B.evaluate(async () => {
  const f = S.D.els.find(e => e.ek === 'flow' && /Triage/.test(e.text)), bad = JSON.stringify([{ r: 'x', t: '<img src=x onerror=alert(1)>', mode: '__proto__', in: 'NaN', out: [{ text: '<script>alert(1)</script>'.repeat(200), f: { __proto__: { polluted: 1 }, a: { b: 1 } } }], err: 5 }]);
  const bytes = te.encode(bad), V = await cidOf(bytes);
  await publish(await signed('RUN', [['I', S.me.id], ['R', dataRoot(f)], ['V', V], ['S', 'ok'], ['C', '1'], ['M', encTxt('Forged')], ['Z', ++S.lamport], ['T', Date.now()]]), { [V]: bytes });
  await new Promise(r => setTimeout(r, 200));
  const l = pipeLog([...S.records.values()].filter(r => r.type === 'RUN').at(-1));
  openPanel('pipes'); paintPanel('pipes');
  return { mode: l[0].mode, len: l[0].out[0].text.length, inN: l[0].in, polluted: ({}).polluted, imgs: document.querySelectorAll('#px-pipes img, #px-pipes script').length };
});
ok(forged.mode === 'pass' && forged.len === 2000 && forged.inN === 0 && forged.polluted === undefined && forged.imgs === 0, 'a hostile log is rebuilt: unknown mode, oversize text, prototype keys and markup are all neutralised');

// 8. the activity log and the hub
ok(await A.evaluate(() => [...S.records.values()].filter(r => r.type === 'RUN').some(r => /^ran the flow “Triage feedback”/.test(activityText(r)))), 'the activity log reads “ran the flow …”');
await A.evaluate(() => document.getElementById('hubBtn').click()); await A.waitForTimeout(100);
ok(await A.evaluate(() => /Data and flows/.test(document.getElementById('menu').textContent) && /Flows/.test(document.getElementById('menu').textContent)), 'the Team menu has a “Data and flows” group');
await A.evaluate(() => { closeMenu(false); zoomFit(); }); await A.waitForTimeout(200);
await A.screenshot({ path: 'tests/out/pipes.png' });

console.log(`asserted ${count()} checks`);
console.log('axe', JSON.stringify(v));
console.log('errors', JSON.stringify(errs));
await b.close();
if (v.length || errs.length) process.exit(1);
