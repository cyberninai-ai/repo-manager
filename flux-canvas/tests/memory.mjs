// Memory and network features (FEATURES R/N): replay, what changed, lineage forks with royalties, the canvas graph, linked
// devices and guardian recovery, zones and suggestions, task dependencies — four people (Ana's laptop is Ana's second device)
import { team, ok, until, count, axeOn } from './pair.mjs';
const { b, errs, pages: [A, B, L, N] } = await team(['Ana', 'Ben', 'Ana (laptop)', 'Ben (new phone)'], 'memtest01');
const v = [];
const id = {}; for (const [k, p] of [['A', A], ['B', B], ['L', L], ['N', N]]) id[k] = await p.evaluate(() => S.me.id);

// 1. zones: Ana makes a suggest zone; Ben's note inside waits for her; accepted it counts, declined it doesn't; locked refuses
const fr = await A.evaluate(() => commitNode({ kind: 'frame', x: 0, y: 0, W: 600, H: 400, label: 'Ana’s area' }));
await until(B, f => S.records.has(f), fr);
await A.evaluate(f => setZone(S.records.get(f), 'suggest'), fr);
await until(B, () => [...S.records.values()].some(r => r.type === 'ZONE'));
const s1 = await B.evaluate(() => commitNode({ kind: 'sticky', x: 100, y: 100, label: 'Ben’s idea' }));
ok(await until(A, c => S.D.pending.has(c) && suggestions().length === 1, s1), 'Ben’s note in Ana’s suggest zone waits as a suggestion');
ok(await A.evaluate(c => !S.D.els.some(e => e.cid === c), s1), 'it isn’t part of the canvas yet');
await A.evaluate(c => answer(c, true), s1);
ok(await until(B, c => S.D.els.some(e => e.cid === c) && !S.D.pending.has(c), s1), 'Ana accepts: it counts for everyone');
const s2 = await B.evaluate(() => commitNode({ kind: 'sticky', x: 300, y: 100, label: 'Another idea' }));
await until(A, c => S.D.pending.has(c), s2); await A.evaluate(c => answer(c, false), s2);
ok(await until(B, c => S.D.denied.has(c), s2), 'Ana declines: it is refused');
const out = await B.evaluate(() => commitNode({ kind: 'sticky', x: 900, y: 100, label: 'Outside the zone' }));
ok(await until(A, c => S.D.els.some(e => e.cid === c), out), 'outside the zone nothing is gated');
await A.evaluate(f => setZone(S.records.get(f), 'locked'), fr); await until(B, () => [...S.records.values()].filter(r => r.type === 'ZONE').length === 2);
const s3 = await B.evaluate(() => commitNode({ kind: 'sticky', x: 200, y: 200, label: 'Locked out' }));
ok(s3 === null, 'locked zone: Ben’s client refuses to sign it and says why');
await A.evaluate(() => openPanel('zones')); await A.waitForTimeout(150); v.push(...await axeOn(A, '#px-zones'));

// 2. dependencies: T2 depends on T1, T3 follows T2 → T1 ready, T2 and T3 blocked, critical path T1 → T2 → T3
const t = await A.evaluate(async () => { const t1 = await commitNode({ kind: 'card', x: 0, y: 900, label: 'Design' }), t2 = await commitNode({ kind: 'card', x: 300, y: 900, label: 'Build' }), t3 = await commitNode({ kind: 'card', x: 600, y: 900, label: 'Launch' });
  await setTask([t1, t2, t3].map(c => S.records.get(c)), { status: 'todo' }); await commitArrow(S.records.get(t2), S.records.get(t1), 'depends on'); await commitArrow(S.records.get(t2), S.records.get(t3)); return { t1, t2, t3 }; });
ok(await until(B, t => { const p = plan(); return p.ready.length === 1 && p.ready[0] === t.t1 && p.blocked.has(t.t2) && p.blocked.has(t.t3) && p.path.join() === [t.t1, t.t2, t.t3].join(); }, t), 'ready: Design; blocked: Build, Launch; critical path Design → Build → Launch');
await B.evaluate(t => setTask([S.records.get(t.t1)], { status: 'done' }), t); await A.waitForTimeout(400);
ok(await A.evaluate(t => S.D.tasks.get(t.t1).status === 'todo', t), 'Ben can’t tick off Ana’s task: it isn’t his');
await A.evaluate(([t, b]) => setTask([S.records.get(t.t1)], { owner: b }), [t, id.B]); await until(B, ([t, b]) => S.D.tasks.get(t.t1)?.owner === b, [t, id.B]);
await B.evaluate(t => setTask([S.records.get(t.t1)], { status: 'done' }), t);
ok(await until(A, t => plan().ready.includes(t.t2) && !plan().blocked.has(t.t2), t), 'assigned to Ben, he finishes Design: Build is ready');
await A.evaluate(() => toggleWork(true)); await A.waitForTimeout(200);
ok(await A.evaluate(() => /Critical path/.test(document.getElementById('workBody').textContent) && /Ready now/.test(document.getElementById('workBody').textContent)), 'Work panel: ready now and the critical path');
await A.evaluate(() => toggleWork(false));

// 3. linked devices: Ana's laptop links to Ana; Ben sees one person; the laptop's approval counts for Ana
const code = await A.evaluate(() => linkCode());
await L.evaluate(c => useLinkCode(c), code);
ok(await until(A, l => (S.D.linkAsks || []).some(([a]) => a === l), id.L), 'Ana sees the laptop’s request');
await A.evaluate(l => devSign('LINK', [['R', l], ['S', '1']]), id.L);
ok(await until(B, ids => samePerson(ids.A, ids.L) && short(ids.L) === short(ids.A) && /^Ana/.test(short(ids.A)), id), 'Ben sees one person with one name on both devices');
const dl = await B.evaluate(async a => { const z = S.lamport + 1, root = await rootAt(z); return publish(await signed('DELIVER', [['I', S.me.id], ['R', 'dv1'], ['M', encTxt('Copy deck')], ['A', a], ['Q', 1], ['H', root], ['X', '0'], ['Z', z], ['T', Date.now()]])); }, id.A);
await until(L, c => S.D.deliveries?.some(x => x.d.cid === c), dl);
await L.evaluate(c => approve(c, true), dl);
ok(await until(B, c => S.D.deliveries.find(x => x.d.cid === c)?.done, dl), 'the laptop approves for Ana: delivered');
// guardian recovery: Ben names Ana as his guardian; Ben's new phone asks; Ana confirms; the phone is Ben
await B.evaluate(a => devSign('GUARD', [['R', a], ['S', '1'], ['Q', 1]]), id.A);
await until(N, b => S.D.guards?.has(b), id.B);
await N.evaluate(b => askRecovery(b), id.B);
ok(await until(A, ids => (S.D.recoveries || []).some(r => r.lost === ids.B && r.key === ids.N && r.asked && !r.done), id), 'Ana (guardian) sees the recovery request');
await L.evaluate(ids => devSign('RECOVER', [['R', ids.B], ['K', ids.N]]), id);   // Ana confirming from her laptop counts: she is the guardian
ok(await until(B, ids => samePerson(ids.B, ids.N) && short(ids.N) === short(ids.B) && /^Ben/.test(short(ids.B)), id), 'confirmed by the guardian: the new phone is Ben');
await A.evaluate(() => openPanel('devices')); await A.waitForTimeout(150); v.push(...await axeOn(A, '#px-devices'));

// 4. what changed since Ana's last visit
await A.evaluate(() => { SN.visit = { z: S.lamport, t: Date.now() }; SN.base = 'visit'; });
const nb = await B.evaluate(() => commitNode({ kind: 'sticky', x: 900, y: 400, label: 'Late addition' }));
await B.evaluate(async c => { await publish(await signed('MOVE', [['I', S.me.id], ['R', c], ['DX', encInt(40)], ['DY', encInt(0)], ['Z', ++S.lamport], ['T', Date.now()]])); }, out);
ok(await until(A, ([n, o]) => { const l = changesSince(); return l.some(x => x.cid === n && x.kind === 'added') && l.some(x => x.cid === o && x.kind === 'moved'); }, [nb, out]), 'since my last visit: one added, one moved, by Ben');
await A.evaluate(() => openPanel('since')); await A.waitForTimeout(150);
ok(await A.evaluate(() => /1 added/.test(document.querySelector('#px-since').textContent) && /1 moved/.test(document.querySelector('#px-since').textContent)), 'the panel counts them');
v.push(...await axeOn(A, '#px-since'));

// 5. replay: step back to the start, only decisions, play; nothing can be signed meanwhile
await A.evaluate(() => recordDecision({ text: 'Ship the copy deck' }));
await A.evaluate(() => { closePanel(false); openHistory(); setHist(1); });
ok(await A.evaluate(() => S.D.els.length === 1 && S.histZ != null), 'replay at step 1: the canvas as it was then');
ok(await A.evaluate(async () => { try { await signed('NODE', [['I', S.me.id]]); return false; } catch (e) { return e.name === 'HistoryView'; } }), 'nothing can be signed during replay');
await A.evaluate(() => { RP.scope = 'decisions'; RP.speed = 'step'; });
ok(await A.evaluate(() => RP.recs[nextInScope(0) - 1].type === 'ZONE' || RP_MOMENTS.has(RP.recs[nextInScope(0) - 1].type) || RP.recs[nextInScope(0) - 1].type === 'STANCE'), 'scoped replay jumps to the next decision-like moment');
v.push(...await axeOn(A, '#history'));
await A.evaluate(() => closeHistory());
ok(await A.evaluate(() => S.histZ == null && document.getElementById('history').hidden), 'back to now');

// 6. lineage: on a canvas Ana owns, she sets a 10% royalty; Ben forks; the fork keeps the original signatures and pays Ana first
const owned = await A.evaluate(() => createOwnedCanvas());
await B.evaluate(c => switchCanvas(c), owned); await B.evaluate(() => sendHello(false));
const tpl = await A.evaluate(async () => { const n = await commitNode({ kind: 'card', x: 0, y: 0, label: 'Template step' }); await publish(await signed('INHERIT', [['I', S.me.id], ['R', canvasId], ['S', 'open'], ['Y', 1000], ['Z', ++S.lamport], ['T', Date.now()]])); return n; });
ok(await until(B, n => S.records.has(n) && !!S.D.inherit && S.D.inherit.bp === 1000, tpl, 8000), 'Ben has the template and its terms, signed by its owner');
const forged = await B.evaluate(async () => { await publish(await signed('INHERIT', [['I', S.me.id], ['R', canvasId], ['S', 'open'], ['Y', 5000], ['Z', ++S.lamport + 100], ['T', Date.now()]])); await new Promise(r => setTimeout(r, 300)); return S.D.inherit.bp; });
ok(forged === 1000, 'terms signed by someone other than the owner don’t count');
const parentId = await B.evaluate(() => canvasId);
const forkId = await B.evaluate(() => forkCanvas());
ok(forkId && forkId !== parentId, 'Ben forked into a new canvas he owns');
ok(await B.evaluate(([f, p]) => S.records.has(f) && samePerson(S.P.owner, S.me.id) && S.D.lineage?.parent === p && parentTerms()?.bp === 1000, [tpl, parentId]), 'the fork has the original records, its lineage and the template owner’s royalty terms');
ok(await until(A, () => (S.D.forks || []).length === 1), 'Ana’s canvas lists the fork');
const hijack = await B.evaluate(async () => { await publish(await signed('LINEAGE', [['I', S.me.id], ['R', canvasId], ['P', 'zzzzzz99'], ['H', S.D.lineage.root], ['C', 1], ['K', '0'], ['Z', ++S.lamport], ['T', Date.now()]])); await new Promise(r => setTimeout(r, 300)); return S.D.lineage.parent; });
ok(hijack === parentId, 'a later LINEAGE naming another parent doesn’t replace the first one');
const lines = await B.evaluate(async () => { const z = S.lamport + 1, root = await rootAt(z);
  const d = await publish(await signed('DELIVER', [['I', S.me.id], ['R', 'fd1'], ['M', encTxt('Fork delivery')], ['A', S.me.id], ['Q', 1], ['H', root], ['X', '0'], ['Z', z], ['T', Date.now()]]));
  await approve(d, true); await publish(await signed('PAY', [['I', S.me.id], ['R', d], ['A', 100000], ['U', 'FXN'], ['S', 'even'], ['P', '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
  await new Promise(r => setTimeout(r, 200)); const x = S.D.deliveries.find(x => x.d.cid === d); return payoutLines(x, S.D.pays.get(d)); });
ok(lines.some(l => l.to === id.A && l.why === 'royalty' && l.cents === 10000) && lines.reduce((a, l) => a + l.cents, 0) === 100000, 'a payout on the fork pays Ana her 10% royalty first');
await B.evaluate(() => openPanel('lineage')); await B.waitForTimeout(300); v.push(...await axeOn(B, '#px-lineage'));

// 7. the canvas graph: Ben's device holds the parent and the fork; questions run across both; a result is signed
await B.evaluate(() => flushSave());
const g = await B.evaluate(async () => { const all = await graphLoad(); const d = PRESETS.decisions.run(all); GQ.preset = 'decisions'; GQ.rows = { ...d, all }; await signResult(); return { canvases: all.length, decisions: d.body.length, work: PRESETS.work.run(all).body.length }; });
ok(g.canvases >= 3 && g.decisions >= 1 && g.work >= 2, `graph: ${g.canvases} canvases, ${g.decisions} decision rows, work for ${g.work} people`);
await B.evaluate(() => openPanel('graph')); await B.waitForTimeout(150); v.push(...await axeOn(B, '#px-graph'));
await A.screenshot({ path: 'tests/out/memory.png' });

console.log(`asserted ${count()} checks`);
console.log('axe', JSON.stringify(v));
console.log('errors', errs);
await b.close();
