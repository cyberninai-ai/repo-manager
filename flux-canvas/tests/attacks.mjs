// Attacks on the team features (audit round 4): each is something a peer with their own key and a modified client could sign
// and send. Every one must be refused or have no effect on what honest peers see.
import { team, ok, until, count, axeOn } from './pair.mjs';
const encInt = n => n < 0 ? 'n' + (-n) : String(n), encTxt = s => encodeURIComponent(s).replace(/[-.!~*'()_]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const { b, errs, pages: [A, M] } = await team(['Ana', 'Mallory'], 'attacktest01');
const v = [];
const sign = (p, type, pairs) => p.evaluate(async ([type, pairs]) => publish(await signed(type, [['I', S.me.id], ...pairs.map(([k, x]) => [k, x === '$z' ? ++S.lamport : x === '$t' ? Date.now() : x]), ...(pairs.some(([k]) => k === 'Z') ? [] : [['Z', ++S.lamport], ['T', Date.now()]])])), [type, pairs]);
// on a canvas Ana owns, where Mallory may draw and comment
const owned = await A.evaluate(() => createOwnedCanvas());
await M.evaluate(c => switchCanvas(c), owned); await M.evaluate(() => sendHello(false));
const mId = await M.evaluate(() => S.me.id), aId = await A.evaluate(() => S.me.id);
await until(M, () => !!S.P?.owner);

// 1. zones: a zone is the frame's own area; the owner is never gated; nobody can blank the canvas
const aNote = await A.evaluate(() => commitNode({ kind: 'sticky', x: 2000, y: 2000, label: 'Ana’s far note' }));
const mFrame = await M.evaluate(() => commitNode({ kind: 'frame', x: 0, y: 0, W: 300, H: 200, label: 'Mallory’s frame' }));
await until(A, f => S.records.has(f), mFrame);
await sign(M, 'ZONE', [['R', mFrame], ['S', 'locked'], ['X', encInt(-1000000)], ['Y', encInt(-1000000)], ['W', 2000000000], ['H', 2000000000]]);
await A.waitForTimeout(400);
ok(await A.evaluate(c => S.D.els.some(e => e.cid === c) && !S.D.denied.has(c), aNote), 'a zone with a huge claimed area doesn’t blank anyone’s work');
const inside = await A.evaluate(() => commitNode({ kind: 'sticky', x: 50, y: 50, label: 'Owner inside Mallory’s zone' }));
await A.waitForTimeout(300);
ok(await A.evaluate(c => S.D.els.some(e => e.cid === c), inside), 'the canvas owner is never gated by someone’s zone');

// 2. flows: conditions are judged after every feature's view exists; an unknown or prototype condition fails closed
const fact = await A.evaluate(() => commitNode({ kind: 'sticky', x: 400, y: 0, label: 'We have 10k users' }));
await A.evaluate(c => markClaim([c]), fact);
const flowCid = await sign(A, 'FLOW', [['R', 'f1'], ['M', encTxt('Strict')], ['G', `${encTxt('Mallory')}~1~${mId}`], ['Q', '0'], ['C', 'claims'], ['E', '0'], ['D', 0]]);
const badFlow = await sign(A, 'FLOW', [['R', 'f2'], ['M', encTxt('Proto')], ['G', `${encTxt('Mallory')}~1~${mId}`], ['Q', '0'], ['C', 'constructor'], ['E', '0'], ['D', 0]]);
const d1 = await A.evaluate(([f, m]) => deliver({ title: 'Needs grounded claims', approvers: [m], quorum: 1, flow: f }), [flowCid, mId]);
const d2 = await A.evaluate(([f, m]) => deliver({ title: 'Prototype condition', approvers: [m], quorum: 1, flow: f }), [badFlow, mId]);
await until(M, ([a, b]) => S.D.deliveries?.some(x => x.d.cid === a) && S.D.deliveries.some(x => x.d.cid === b), [d1, d2]);
await M.evaluate(([a, b]) => Promise.all([approve(a, true), approve(b, true)]), [d1, d2]);
await A.waitForTimeout(600);
ok(await A.evaluate(c => { const x = S.D.deliveries.find(x => x.d.cid === c); return x.votes.size === 1 && !x.done && x.blockers.some(b => /claim/.test(b)); }, d1), 'approved, but an ungrounded claim blocks a flow that requires grounded claims');
ok(await A.evaluate(c => !S.D.deliveries.find(x => x.d.cid === c).done, d2), 'a flow naming “constructor” as a condition is not met');

// 3. a delivered version is a fixed list: a record signed later with a low Z changes nothing
const plain = await A.evaluate(m => deliver({ title: 'Plain', approvers: [m], quorum: 1 }), mId);
await until(M, c => S.D.deliveries?.some(x => x.d.cid === c), plain);
const before = await A.evaluate(c => { const x = S.D.deliveries.find(x => x.d.cid === c); return JSON.stringify([...contributionShares(x)]); }, plain);
await sign(M, 'NODE', [['R', 'late'], ['K', 'sticky'], ['X', encInt(0)], ['Y', encInt(900)], ['W', 0], ['H', 0], ['M', encTxt('Backdated')], ['C', 'ink'], ['P', '0'], ['Z', 1], ['T', '$t']]);
await A.waitForTimeout(400);
ok(await A.evaluate(([c, b]) => JSON.stringify([...contributionShares(S.D.deliveries.find(x => x.d.cid === c))]) === b, [plain, before]), 'a backdated record doesn’t change the delivered version’s shares');
await M.evaluate(c => approve(c, true), plain);
ok(await until(A, c => S.D.deliveries.find(x => x.d.cid === c).done, plain), 'and doesn’t stop the version from being approved');

// 4. money: a forged credit, a settlement without its approval, changed terms
await sign(A, 'PAY', [['R', plain], ['A', 10000], ['U', 'FXN'], ['S', 'even'], ['P', '0']]);
await A.waitForTimeout(300);
ok(await A.evaluate(c => { const x = S.D.deliveries.find(x => x.d.cid === c); return !termsApproved(x, S.D.pays.get(c)); }, plain), 'terms attached after the approval aren’t approved: nothing can be released');
await A.evaluate(async c => { const x = S.D.deliveries.find(x => x.d.cid === c), p = S.D.pays.get(c); await publish(await signed('SETTLE', [['I', S.me.id], ['R', c], ['H', x.d.root], ['L', `${S.me.id}~10000`], ['K', p.cid], ['U', 'FXN'], ['Z', ++S.lamport], ['T', Date.now()]])); }, plain);
await A.waitForTimeout(300);
ok(await A.evaluate(c => !S.D.settles.get(c), plain), 'a settlement signed directly, without approved terms, isn’t paid');
await A.evaluate(async ([c, m]) => { const x = S.D.deliveries.find(x => x.d.cid === c); await publish(await signed('CREDIT', [['I', S.me.id], ['R', c], ['H', x.d.root], ['L', `${S.me.id}~10000`], ['K', 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], ['G', '0'], ['Z', ++S.lamport], ['T', Date.now()]])); }, [plain, mId]);
await A.waitForTimeout(300);
ok(await A.evaluate(c => !creditOf(S.D.deliveries.find(x => x.d.cid === c)), plain), 'a credit naming a method that doesn’t exist isn’t counted');

// 5. silent rounds: Mallory can't end Ana's round early (the round is its first record)
const round = await A.evaluate(() => startRound({ prompt: 'Ideas', minutes: 1 }));
await until(M, r => S.D.rounds?.has(r), round);
await sign(M, 'ROUND', [['R', 'whatever'], ['M', ''], ['E', String(Date.now())], ['A', 'all'], ['K', 'ideas'], ['ON', '0'], ['P', round]]);
await A.waitForTimeout(300);
ok(await A.evaluate(r => S.D.rounds.get(r).cur.end > Date.now() + 20000, round), 'Mallory’s “end the round” is ignored');
const lens = await A.evaluate(async () => { const s1 = await signed('STANCE', [['I', S.me.id], ['R', 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], ['S', 'agree'], ['M', ''], ['Z', 1], ['T', 1]]), s2 = await signed('STANCE', [['I', S.me.id], ['R', 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], ['S', 'disagree'], ['M', ''], ['Z', 1], ['T', 1]]);
  const c1 = await sealRecord(s1, { kind: 'stance', at: Date.now() + 6e5 }), c2 = await sealRecord(s2, { kind: 'stance', at: Date.now() + 6e5 }); return [S.records.get(c1).f.B.length, S.records.get(c2).f.B.length]; });
ok(lens[0] === lens[1], 'a sealed “agree” and “disagree” have the same length');

// 6. facilitation: once the successor has acted, the previous holder can't backdate another handover
await A.evaluate(m => facilitate(m), mId); await until(M, m => S.D.meet?.fac === m, mId);
await M.evaluate(a => facilitate(a), aId); await until(A, a => S.D.meet.fac === a, aId);
await A.evaluate(() => setAgenda([{ title: 'Pricing', min: 10 }])); await until(M, () => !!S.D.meet.agenda);
await M.evaluate(async () => { const root = S.D.meet.roles[0].cid; await publish(await signed('FACIL', [['I', S.me.id], ['R', S.me.id], ['S', '1'], ['P', root], ['Z', S.D.meet.roles[1].z - 1], ['T', Date.now()]])); });
await A.waitForTimeout(400);
ok(await A.evaluate(a => S.D.meet.fac === a && !!S.D.meet.agenda, aId), 'a backdated handover doesn’t take back a role its successor already used');

// 7. decisions and claims: strangers can't reverse, unmark or self-ground
const dec = await A.evaluate(() => recordDecision({ text: 'One-way: we open-source the core', reversible: false }));
await until(M, c => S.D.decisions?.some(x => x.d.cid === c), dec);
await sign(M, 'REVIEW', [['R', dec], ['S', 'reverse'], ['M', ''], ['W', '0']]);
await sign(A, 'REVIEW', [['R', dec], ['S', 'reverse'], ['M', ''], ['W', '0']]);
await A.waitForTimeout(400);
ok(await A.evaluate(c => S.D.decisions.find(x => x.d.cid === c).status === 'active', dec), 'a one-way decision stays: not reversed by a stranger, nor by its author');
await sign(M, 'CLAIM', [['R', fact], ['S', '0']]); await A.waitForTimeout(300);
ok(await A.evaluate(c => S.D.claims.has(c), fact), 'a stranger can’t unmark someone’s claim');
const mNote = await M.evaluate(() => commitNode({ kind: 'sticky', x: 900, y: 0, label: 'Ana’s team is 40 people' }));
await until(A, c => S.records.has(c), mNote);
await A.evaluate(async c => { await markClaim([c]); await addEvidence(c, { url: 'https://example.com/team', note: '40 people' }); await checkClaim(c, 'ok'); }, mNote);
await A.waitForTimeout(300);
ok(await A.evaluate(c => S.D.claims.get(c).state === 'evidenced', mNote), 'whoever marked a claim can’t ground it themselves');

// 8. malformed but signed: prototype names, bad times, scripts in ids
const refused = await A.evaluate(async () => { const r = []; for (const [t, p] of [['STANCE', [['R', 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], ['S', '__proto__']]], ['RITUAL', [['R', 'r1'], ['M', 'x'], ['U', 'toString~1'], ['Q', 1], ['E', 5]]],
    ['LINEAGE', [['R', canvasId], ['P', '"><img src=x>'], ['H', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']]], ['NODE', [['R', 'n'], ['K', 'card'], ['X', '0'], ['Y', '0'], ['M', 'x'], ['C', 'ink'], ['P', '0'], ['Z', 1], ['T', 'NaN']]],
    ['LINK', [['R', S.me.id], ['S', '1']]], ['EVIDENCE', [['R', 'bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], ['E', '0'], ['U', encTxt('javascript:alert(1)')], ['S', 'supports'], ['M', '']]]]){
    const n = S.records.size, before = S.why.malformed || 0; await ingest(await signed(t, [['I', S.me.id], ...p, ...(p.some(([k]) => k === 'Z') ? [] : [['Z', ++S.lamport], ['T', Date.now()]])])); r.push((S.why.malformed || 0) > before && S.records.size === n); } return r; });
ok(refused.every(Boolean), `malformed records are refused: ${JSON.stringify(refused)}`);
await M.evaluate(() => post({ presence: { id: '"><img src=x onerror="window.__pwned=1">', x: 0, y: 0, s: 1 } }));
await A.waitForTimeout(400); await A.evaluate(() => { openPanel('graph'); openPanel('room'); openPanel('meeting'); });
ok(await A.evaluate(() => !window.__pwned && ![...peers.keys()].some(k => k.includes('<'))), 'a presence id with markup is dropped before it reaches any panel');
await A.screenshot({ path: 'tests/out/attacks.png' });

console.log(`asserted ${count()} checks`);
console.log('axe', JSON.stringify(v));
console.log('errors', errs);
await b.close();
