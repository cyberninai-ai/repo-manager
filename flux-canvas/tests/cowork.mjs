// Co-work (audit W1–W9): two people connected peer to peer — names, live presence and follow, tasks, a delivery approved
// by both on the same version, the proof, and the state root that tells them they see the same canvas
import { PLAIN, AXE, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'fs';
const axe = fs.readFileSync(AXE, 'utf8');
const b = await chromium.launch({ ...LAUNCH, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
const errs = [];
const open = async () => { const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(PLAIN + '#coworktest01'); await p.waitForTimeout(900); return p; };
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const until = async (pg, f, arg, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms){ if (await pg.evaluate(f, arg)) return true; await pg.waitForTimeout(100); } return false; };
const A = await open(), B = await open();   // separate contexts: no shared tabs, storage or relay

// 1. names
await A.evaluate(() => setMyName('Ana')); await B.evaluate(() => setMyName('Ben'));
// 2. peer to peer with two codes, no server
const offer = await A.evaluate(() => rtcInvite()), answer = await B.evaluate(c => rtcJoin(c), offer);
await A.evaluate(c => rtcAccept(c), answer);
ok(await until(A, () => RTC.chans.size === 1) && await until(B, () => RTC.chans.size === 1), 'direct connection open on both sides');
const ids = await A.evaluate(async () => { const a = await commitNode({ kind: 'sticky', x: 0, y: 0, label: 'Draft the pitch' }); const c = await commitNode({ kind: 'sticky', x: 260, y: 0, label: 'Book the venue' }); return { a, c, me: S.me.id }; });
const benId = await B.evaluate(() => S.me.id);
ok(await until(B, i => S.records.has(i.a) && S.records.has(i.c), ids), 'notes arrive over the direct connection');
ok(await until(B, () => NAMES.get([...peers.keys()][0]) === 'Ana'), 'Ben sees Ana by name');
ok(await until(A, () => document.getElementById('liveBtn').dataset.state === 'live' && /Live · 2/.test(document.getElementById('liveBtn').textContent)), 'live button: two people, in sync');
ok(await until(A, () => [...peers.values()].every(p => p.root === S.root)), 'same state root on both sides');
// 3. presence: Ana selects a note, Ben sees it; Ben follows Ana's view
await A.evaluate(i => { S.sel = new Set([i.c]); S.view = { x: 900, y: 600, zoom: 1.5 }; dirty = true; sendPresence(false, true); }, ids);
ok(await until(B, i => [...peers.values()][0]?.sel.includes(i.c), ids), 'Ben sees what Ana has selected');
await B.evaluate(() => startFollow([...peers.keys()][0]));
ok(await until(B, () => Math.abs(S.view.zoom - 1.5) < .01), 'following puts Ben on Ana’s view');
await B.evaluate(() => stopFollow());
// 4. tasks: Ana assigns a note to Ben, Ben moves it to Doing, Ana sees it
await A.evaluate(async ([i, ben]) => { await setTask([S.records.get(i.a)], { status: 'todo', owner: ben }); }, [ids, benId]);
ok(await until(B, ([i, ben]) => S.D.tasks.get(i.a)?.owner === ben, [ids, benId]), 'Ben has the task');
await B.evaluate(() => toggleWork(true)); await B.waitForTimeout(300);
ok(await B.evaluate(() => document.getElementById('workN').textContent === '1' && document.querySelectorAll('#workBody .wk-row').length === 1), 'Work panel lists it, badge counts it');
await B.evaluate(async i => setTask([S.records.get(i.a)], { status: 'doing' }), ids);
ok(await until(A, i => S.D.tasks.get(i.a)?.status === 'doing', ids), 'Ana sees Doing');
await B.addScriptTag({ content: axe });
const v = await B.evaluate(async () => (await axe.run(document.getElementById('work'), { resultTypes: ['violations'] })).violations.map(v => v.id + ': ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')));
// 5. delivery: Ana asks both to approve this exact version; both approve; it is delivered
await A.evaluate(async ben => {
  const z = S.lamport + 1, root = await rootAt(z);
  await publish(await signed('DELIVER', [['I', S.me.id], ['R', 'd1'], ['M', encTxt('Offsite plan')], ['A', [S.me.id, ben].join('_')], ['Q', 2], ['H', root], ['X', '0'], ['Z', z], ['T', Date.now()]]));
}, benId);
ok(await until(B, () => S.D.deliveries?.length === 1), 'Ben receives the delivery');
const dcid = await B.evaluate(() => S.D.deliveries[0].d.cid);
await B.evaluate(c => approve(c, true), dcid);
ok(await until(A, () => S.D.deliveries[0].ok.length === 1 && !S.D.deliveries[0].done), 'one of two approvals: not delivered yet');
await A.evaluate(c => approve(c, true), dcid);
ok(await until(B, () => S.D.deliveries[0].done), 'both approved the same version: delivered');
// work added after the request is not part of the delivered version
await A.evaluate(() => commitNode({ kind: 'sticky', x: 0, y: 300, label: 'After delivery' }));
await A.waitForTimeout(400);
ok(await A.evaluate(() => S.D.deliveries[0].done), 'later work does not change a delivered version');
await A.evaluate(c => showProof(c), dcid); await A.waitForTimeout(200);
const proof = await A.evaluate(() => document.getElementById('reportBody').textContent);
ok(/Delivered — 2 of 2/.test(proof) && proof.includes('Ana') && proof.includes('Ben') && /DELIVER-I-/.test(proof) && (proof.match(/APPROVE-I-/g) || []).length === 2, 'proof names contributors and carries the signed approvals');

console.log(`asserted ${n} checks`);
console.log('axe', JSON.stringify(v));
console.log('errors', errs);
await b.close();
