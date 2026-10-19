// Meeting features (FEATURES M1–M5): sealed records, silent rounds, facilitation, ritual contracts, structural presence — three people
import { team, ok, until, count, axeOn } from './pair.mjs';
const { b, errs, pages: [A, B, C] } = await team(['Ana', 'Ben', 'Chen'], 'meettest01');
const v = [];
const id = {}; for (const [k, p] of [['A', A], ['B', B], ['C', C]]) id[k] = await p.evaluate(() => S.me.id);

// 1. a sealed bid: everyone sees that it exists, nobody can read it until it opens; then it matches its commitment
const seal = await B.evaluate(async () => { const inner = await signed('NODE', [['I', S.me.id], ['R', 'bid1'], ['K', 'card'], ['X', encInt(0)], ['Y', encInt(0)], ['W', 0], ['H', 0], ['M', encTxt('Bid: 42k')], ['C', 'ink'], ['P', '0'], ['Z', ++S.lamport], ['T', Date.now()]]);
  const c = await sealRecord(inner, { kind: 'bid', at: Date.now() + 2500 }); return { c, inner: await cidOf(te.encode(inner)) }; });
ok(await until(A, s => S.D.seals?.has(s.c), seal), 'Ana sees that Ben sealed a bid');
ok(await A.evaluate(s => !S.records.has(s.inner) && !JSON.stringify([...S.records.values()].map(r => r.raw)).includes('42k'), seal), 'the bid’s content is nowhere in Ana’s records');
ok(await until(A, s => S.records.has(s.inner) && /42k/.test(S.records.get(s.inner).text), seal, 9000), 'at its time it opens for Ana, and matches its commitment');

// 2. a silent round: Ben and Chen write; nobody sees anyone’s notes until it ends; then all open together
await A.evaluate(() => startRound({ prompt: 'How might we cut onboarding time?', minutes: 0.08 }));
ok(await until(B, () => !!activeRound()) && await until(C, () => !!activeRound()), 'the round reaches everyone');
const before = await A.evaluate(() => S.D.els.length);
await B.evaluate(async () => { await commitNode({ kind: 'sticky', x: 0, y: 300, label: 'Self-serve setup wizard' }); await commitNode({ kind: 'sticky', x: 180, y: 300, label: 'Templates for top jobs' }); });
await C.evaluate(() => commitNode({ kind: 'sticky', x: 360, y: 300, label: 'Buddy for the first week' }));
ok(await until(A, () => [...S.D.seals.values()].filter(x => x.s.round).length === 3), 'Ana counts 3 sealed ideas');
ok(await A.evaluate(n => S.D.els.length === n && ![...S.records.values()].some(r => /wizard|Buddy/.test(r.text || '')), before), 'during the round no idea is readable, not even by the round’s starter');
ok(await B.evaluate(() => !document.getElementById('strip').textContent.includes('Buddy') && /Silent round/.test(document.getElementById('strip').textContent)), 'Ben’s strip shows the round, not Chen’s content');
ok(await until(A, () => ['wizard', 'Templates', 'Buddy'].every(w => [...S.records.values()].some(r => (r.text || '').includes(w))), null, 12000), 'when it ends every idea opens for everyone together');
ok(await A.evaluate(() => /Round revealed/.test(document.getElementById('strip').textContent)), 'the strip says the round was revealed');

// 3. a blind stance round on one item
const target = await A.evaluate(() => commitNode({ kind: 'card', x: 0, y: 600, label: 'Drop the free tier' }));
await until(B, t => S.records.has(t), target);
await A.evaluate(t => startRound({ prompt: 'Drop the free tier?', minutes: 0.06, mode: 'stances', on: t }), target);
await until(B, () => activeRound()?.cur.mode === 'stances');
await B.evaluate(() => blindStance(activeRound(), 'disagree')); await C.evaluate(() => blindStance(activeRound(), 'agree'));
ok(await A.evaluate(t => !consensus(t).n, target), 'blind stances: nothing counted while the round runs');
ok(await until(A, t => consensus(t).n === 2 && consensus(t).level === 'split', target, 12000), 'they open together: one agree, one disagree');

// 4. facilitation: role, agenda, pulling to the item, queue, floor, handover
await A.evaluate(() => facilitate(S.me.id));
const frame = await A.evaluate(() => commitNode({ kind: 'frame', x: 2000, y: 2000, W: 400, H: 300, label: 'Pricing' }));
await A.evaluate(f => setAgenda([{ title: 'Pricing', min: 10, frame: f }, { title: 'Owners', min: 5 }]), frame);
await A.evaluate(() => nextItem());
ok(await until(B, () => S.D.meet?.at === 0 && amFac() === false), 'Ben follows the agenda: item 1 is running');
ok(await until(B, () => S.view.x > 1000), 'the new item pulled Ben’s view to its frame');
await B.evaluate(() => raiseHand(true)); await A.waitForTimeout(150); await C.evaluate(() => raiseHand(true));
ok(await until(A, ids => JSON.stringify(S.D.meet.queue) === JSON.stringify([ids.B, ids.C]), id), 'the queue keeps the order hands went up');
await A.evaluate(b => giveFloor(b), id.B);
ok(await until(C, ids => S.D.meet.floor === ids.B && S.D.meet.queue.length === 1, id), 'Ana gives Ben the floor; his hand comes down');
await C.evaluate(() => nextItem()); await A.waitForTimeout(400);
ok(await A.evaluate(() => S.D.meet.at === 0), 'Chen isn’t the facilitator: his “next” doesn’t count');
await A.evaluate(c => facilitate(c), id.C);
ok(await until(C, () => amFac()), 'Ana hands the role to Chen');
await C.evaluate(() => nextItem()); await C.evaluate(() => nextItem());
ok(await until(A, () => S.D.meet.done), 'Chen finishes the meeting');
const mins = await A.evaluate(() => minutes());
ok(/## 1\. Pricing/.test(mins) && /## 2\. Owners/.test(mins) && /Spoke: Ben/.test(mins), 'minutes list items, timings and who spoke');
await A.evaluate(() => openPanel('meeting')); await A.waitForTimeout(150); v.push(...await axeOn(A, '#px-meeting'));

// 5. ritual contracts: a "success" without the outputs reads as incomplete; with them, it is a success
await A.evaluate(() => startRitual('retro'));
ok(await until(B, () => !!openRitual()), 'the retro reaches Ben');
await B.evaluate(() => closeRitual(openRitual(), 'success')); await A.waitForTimeout(500);
ok(await A.evaluate(() => !S.D.rituals[0].close), 'a participant can’t close someone’s ritual before its time box is over');
await A.evaluate(() => closeRitual(openRitual(), 'success'));
ok(await until(B, () => S.D.rituals[0].close && outcomeOf(S.D.rituals[0]) === 'incomplete'), 'closing as a success without its outputs counts as incomplete');
await A.evaluate(() => startRitual('custom', { name: 'Go/no-go', need: { decision: 1 }, people: 2, min: 10 }));
await until(B, () => openRitual()?.r.name === 'Go/no-go');
await B.evaluate(() => recordDecision({ text: 'Go for the beta' })); await until(A, () => S.D.decisions?.length === 1); await A.evaluate(() => takeStance([S.D.decisions[0].d.cid], 'agree'));
ok(await until(A, () => ritualProgress(openRitual().r).met), 'a decision and two people: the contract is met');
await A.evaluate(() => closeRitual(openRitual(), 'success'));
ok(await until(B, () => outcomeOf(S.D.rituals.at(-1)) === 'success' && FLOW_CONDITIONS.ritual.test() === true), 'closed as a success, and approval flows can require it');
await A.evaluate(() => openPanel('rituals')); await A.waitForTimeout(150);
ok(await A.evaluate(() => /1 of 2 closed as a success/.test(document.querySelector('#px-rituals').textContent)), 'the record: 1 of 2 closed as a success');
v.push(...await axeOn(A, '#px-rituals'));

// 6. structural presence: where attention gathers, who is reading, who stopped sharing
await A.evaluate(t => { S.sel = new Set([t]); sendPresence(false, true); }, target); await B.evaluate(t => { S.sel = new Set([t]); sendPresence(false, true); }, target);
ok(await until(A, t => hotSpots().some(([c, s]) => c === t && s.size === 2), target), 'two people on one item: a hot spot');
await B.evaluate(() => { ATT.since = Date.now() - 30000; sendPresence(false, true); });
ok(await until(A, b => modeOf(b, peers.get(b)).mode === 'reading', id.B), 'Ben has been on it for 30s: reading');
await B.evaluate(() => { ATT.share = false; sendPresence(false, true); });
ok(await until(A, b => modeOf(b, peers.get(b)).mode === 'private', id.B), 'Ben stops sharing: shown as not sharing');
await A.evaluate(() => openPanel('room')); await A.waitForTimeout(150); v.push(...await axeOn(A, '#px-room'));
await A.evaluate(() => openPanel('sealed')); await A.waitForTimeout(150); v.push(...await axeOn(A, '#px-sealed'));
await A.screenshot({ path: 'tests/out/meeting.png' });

console.log(`asserted ${count()} checks`);
console.log('axe', JSON.stringify(v));
console.log('errors', errs);
await b.close();
