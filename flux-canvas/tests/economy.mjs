// Delivery features (FEATURES D1–D5) and the mesh: approval flows, contribution proof, Canvas-to-Cash, peer witnesses,
// excerpts with proof — three people in a star, kept in sync by the mesh
import { team, ok, until, count, axeOn } from './pair.mjs';
import fs from 'fs';
const { b, errs, pages: [A, B, C] } = await team(['Ana', 'Ben', 'Chen'], 'econtest01');
const v = [];
const id = {}; for (const [k, p] of [['A', A], ['B', B], ['C', C]]) id[k] = await p.evaluate(() => S.me.id);

// mesh: Ben and Chen are only connected to Ana, yet see each other's work and presence
const n1 = await B.evaluate(() => commitNode({ kind: 'sticky', x: 0, y: 0, label: 'Landing page copy' }));
ok(await until(C, c => S.records.has(c), n1), 'mesh: Ben’s note reaches Chen through Ana');
ok(await until(C, b => peers.get(b)?.via === 'mesh', id.B), 'mesh: Chen sees Ben live, routed through Ana');
ok(await until(B, () => [...peers.values()].every(p => p.root === S.root) && peers.size === 2, null, 8000), 'mesh: all three hold the same state root');
const n2 = await C.evaluate(() => commitNode({ kind: 'sticky', x: 200, y: 0, label: 'Pricing table' }));
const n3 = await A.evaluate(() => commitNode({ kind: 'frame', x: -40, y: -60, W: 520, H: 260, label: 'Launch kit' }));
await A.evaluate(async ([a, c]) => { await setTask([S.records.get(a)], { status: 'done', owner: S.me.id }); }, [n1, n2]);
await until(B, c => S.records.has(c) && S.D.tasks?.size === 1, n3);

// approval flow: Engineering (Ben) then Legal (Chen), plus a condition: every task done
await A.evaluate(async ids => {
  await publish(await signed('FLOW', [['I', S.me.id], ['R', 'flow1'], ['M', encTxt('Launch')], ['G', `${encTxt('Engineering')}~1~${ids.B}_${encTxt('Legal')}~1~${ids.C}`], ['Q', '1'], ['C', 'tasks'], ['E', '0'], ['D', 0], ['Z', ++S.lamport], ['T', Date.now()]]));
}, id);
ok(await until(A, () => DELIVERY_HOOKS.choices.flatMap(h => h([])).some(c => /Launch/.test(c.label))), 'the flow is offered when delivering');
await A.waitForTimeout(300);
const dcid = await A.evaluate(async ids => {
  const f = [...S.records.values()].find(r => r.type === 'FLOW'), z = S.lamport + 1, root = await rootAt(z);
  return publish(await signed('DELIVER', [['I', S.me.id], ['R', 'dl1'], ['M', encTxt('Launch kit')], ['A', [ids.B, ids.C].join('_')], ['Q', 2], ['H', root], ['X', '0'], ['F', f.cid], ['Z', z], ['T', Date.now()]]));
}, id);
ok(await until(C, c => S.D.deliveries?.some(x => x.d.cid === c), dcid), 'the delivery reaches Chen');
await C.evaluate(c => approve(c, true), dcid);
ok(await until(A, c => { const x = S.D.deliveries.find(x => x.d.cid === c); return x && x.votes.size === 1 && !x.done && x.blockers.some(b => /after Engineering/.test(b)); }, dcid), 'Legal signed first: in an ordered flow it doesn’t count yet');
await B.evaluate(c => approve(c, true), dcid);
ok(await until(A, c => { const x = S.D.deliveries.find(x => x.d.cid === c); return x.flow.groups[0].done && !x.flow.groups[1].done; }, dcid), 'Engineering signs: Legal’s earlier signature still precedes it, so Legal must sign again');
await C.evaluate(c => approve(c, true), dcid);
ok(await until(A, c => S.D.deliveries.find(x => x.d.cid === c).done, dcid), 'Legal signs after Engineering: the flow is met and delivered');
await A.evaluate(() => toggleWork(true)); await A.waitForTimeout(200);
ok(await A.evaluate(() => /Engineering 1\/1/.test(document.getElementById('workBody').textContent)), 'Work panel shows the flow’s groups');
v.push(...await axeOn(A, '#work'));

// contribution: shares from the records, signed by the delivery’s author and recomputed by everyone
const shares = await A.evaluate(c => Object.fromEntries(contributionShares(S.D.deliveries.find(x => x.d.cid === c))), dcid);
ok(Object.values(shares).reduce((a, b) => a + b, 0) === 10000 && shares[id.A] > 0 && shares[id.B] > 0 && shares[id.C] > 0, 'contribution shares cover everyone and add up to 100%');
await A.evaluate(c => signCredit(S.D.deliveries.find(x => x.d.cid === c)), dcid);
ok(await until(B, c => { const x = S.D.deliveries.find(x => x.d.cid === c); const cr = creditOf(x); return cr && cr.valid === true; }, dcid), 'Ben recomputes the signed credit: it matches');
await B.evaluate(async c => { await publish(await signed('METHOD', [['I', S.me.id], ['R', 'm2'], ['M', encTxt('Approvals count more')], ['W', 'create~30_approve~50'], ['Z', ++S.lamport], ['T', Date.now()]])); }, dcid);
await until(A, () => [...S.records.values()].some(r => r.type === 'METHOD'));
await A.evaluate(() => takeStance([[...S.records.values()].find(r => r.type === 'METHOD').cid], 'agree'));
ok(await until(C, () => methodInUse().name === 'Approvals count more'), 'a proposed method the room agrees with becomes the method in use');

// Canvas-to-Cash: pledges, terms, release; the settlement recomputes everywhere
await B.evaluate(async () => { await publish(await signed('FUND', [['I', S.me.id], ['R', canvasId], ['A', 300000], ['U', 'FXN'], ['M', ''], ['Z', ++S.lamport], ['T', Date.now()]])); });
await A.evaluate(async c => { await publish(await signed('PAY', [['I', S.me.id], ['R', c], ['A', 100000], ['U', 'FXN'], ['S', 'credit'], ['P', '0'], ['Z', ++S.lamport], ['T', Date.now()]])); }, dcid);
ok(await until(A, c => S.D.pays?.has(c), dcid), 'payment terms are attached to the delivery');
await A.evaluate(c => release(S.D.deliveries.find(x => x.d.cid === c)), dcid);
ok(await until(C, c => { const x = S.D.deliveries.find(x => x.d.cid === c), s = S.D.settles.get(c); return s && settleValid(x, s) && s.lines.reduce((a, l) => a + l.cents, 0) === 100000; }, dcid), 'Chen recomputes the settlement: 1,000 FXN split by the signed credit');
ok(await until(B, () => S.D.pool.get('FXN')?.pledged === 300000 && S.D.pool.get('FXN').paid === 100000), 'pool: 3,000 pledged, 1,000 paid out');
const forged = await B.evaluate(async c => { const x = S.D.deliveries.find(x => x.d.cid === c); return settleValid(x, { lines: [{ to: S.me.id, cents: 100000 }], unit: 'FXN' }); }, dcid);
ok(!forged, 'a settlement paying everything to one person doesn’t recompute');
const man = await A.evaluate(c => manifest(S.D.deliveries.find(x => x.d.cid === c)), dcid);
ok(man.settlement && man.lines.length === 3 && man.approvals.length === 2, 'the payout manifest carries the settlement, lines and approvals');
await A.evaluate(() => openPanel('funding')); await A.waitForTimeout(150); v.push(...await axeOn(A, '#px-funding'));

// witnesses: Chen countersigns the delivered version; others check it against their own records
await C.evaluate(c => witnessDelivery(S.D.deliveries.find(x => x.d.cid === c)), dcid);
ok(await until(A, c => { const x = S.D.deliveries.find(x => x.d.cid === c); return witnessesOf(x.d.root).length === 1 && WIT.checked.get(witnessesOf(x.d.root)[0].cid) === true; }, dcid), 'Ana sees Chen’s witness and it matches her version');
await A.evaluate(() => witnessNow('end of day'));
ok(await until(B, () => [...S.D.witnessed.values()].length === 2), 'a witness of the current state reaches Ben');
await B.evaluate(() => openPanel('witness')); await B.waitForTimeout(400);
ok(await B.evaluate(() => (document.querySelector('#px-witness').textContent.match(/Matches ✓/g) || []).length === 2), 'Ben’s browser verified both witnesses');
v.push(...await axeOn(B, '#px-witness'));

// excerpt: share only the frame; it verifies elsewhere without the rest of the canvas
const ex = await A.evaluate(([c, f]) => { S.sel = new Set([f]); return makeExcerpt(S.D.deliveries.find(x => x.d.cid === c), [f]); }, [dcid, n3]);
ok(ex.records.length >= 3 && ex.records.length < ex.ids.length, `excerpt: ${ex.records.length} records of ${ex.ids.length}, the rest as hashes`);
const page = await (await b.newContext()).newPage(); await page.goto((await A.evaluate(() => location.href.split('#')[0])) + '#verifyexc1'); await page.waitForTimeout(700);
const verdict = await page.evaluate(e => verifyExcerpt(e), ex);
ok(verdict.ok && verdict.approvals === 2 && verdict.records === ex.records.length, 'a stranger verifies it: signed, part of the version, approved 2 of 2');
const bad = await page.evaluate(e => { const t = JSON.parse(JSON.stringify(e)); t.ids = t.ids.slice(1); return verifyExcerpt(t); }, ex);
ok(!bad.ok && /don’t add up/.test(bad.lines.join(' ')), 'tampering with the version list is caught');
const bad2 = await page.evaluate(e => { const t = JSON.parse(JSON.stringify(e)); t.records[0] = t.records[0].replace(/-M-[^-]*/, '-M-Changed'); return verifyExcerpt(t); }, ex);
ok(!bad2.ok, 'an altered record is caught');
await A.evaluate(() => openPanel('excerpt')); await A.waitForTimeout(150); v.push(...await axeOn(A, '#px-excerpt'));
await A.evaluate(c => showProof(c), dcid); await A.waitForTimeout(150);
const proof = await A.evaluate(() => document.getElementById('reportBody').textContent);
ok(/Approval flow — Launch/.test(proof) && /## Contribution/.test(proof) && /## Payment/.test(proof) && /## Witnesses/.test(proof), 'the proof carries the flow, contribution, payment and witnesses');
fs.writeFileSync('tests/out/proof.md', proof);
await A.evaluate(() => { document.getElementById('reportClose').click(); openPanel('mesh'); }); await A.waitForTimeout(150); v.push(...await axeOn(A, '#px-mesh'));
await A.screenshot({ path: 'tests/out/economy.png' });

console.log(`asserted ${count()} checks`);
console.log('axe', JSON.stringify(v));
console.log('errors', errs);
await b.close();
