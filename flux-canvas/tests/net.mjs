// Network sync (audit C1): two browsers that share nothing locally sync through the relay, live and after being offline
import { LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'flux-relay-'));
const start = () => new Promise(res => {
  const r = spawn(process.execPath, [path.join(here, '../tools/relay.mjs'), '--port', '0', '--host', '127.0.0.1', '--data', data]);
  r.stdout.on('data', d => { const m = String(d).match(/:(\d+)/); if (m) res({ r, port: +m[1] }); });
});
let { r: relay, port } = await start();
const b = await chromium.launch({ ...LAUNCH });
const errs = [];
const open = async (hash = 'netcanvas001', p) => { // separate contexts: no shared BroadcastChannel or IndexedDB
  const pg = p || await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://127.0.0.1:${port}/?tool=pen#${hash}`); await pg.waitForTimeout(1200); return pg;
};
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const texts = pg => pg.evaluate(() => S.D.els.filter(e => e.type === 'TEXT' && visible(e)).map(e => e.text).sort());
const until = async (pg, f, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms){ if (await pg.evaluate(f)) return true; await pg.waitForTimeout(100); } return false; };

const A = await open(), B = await open();
ok(await until(A, () => NET.state === 'live' && NET.peers === 2), 'both browsers live on the relay');
ok(await until(A, () => document.getElementById('liveBtn').dataset.state === 'live'), 'live button shows the session');
// 1. live: a record signed in A appears in B, a stroke with its blob too
await A.evaluate(() => commitText({ x: 0, y: 0 }, 'hello from A'));
ok(await until(B, () => S.D.els.some(e => e.text === 'hello from A')), 'text arrives live');
await A.mouse.move(300, 300); await A.mouse.down(); await A.mouse.move(420, 360, { steps: 6 }); await A.mouse.up();
ok(await until(B, () => S.D.els.some(e => e.type === 'DRAW' && S.blobs.has(e.f.R))), 'stroke and its point blob arrive');
// 2. presence: A's cursor shows in B
await A.mouse.move(500, 300);
ok(await until(B, () => peers.size === 1), 'cursor presence over the relay');
// 3. offline: B closes, A keeps working, B comes back and catches up
await B.close();
await A.evaluate(() => commitText({ x: 0, y: 80 }, 'while B was away'));
const B2 = await open();
ok(await until(B2, () => S.D.els.some(e => e.text === 'while B was away')), 'catches up after being offline');
// 4. the relay restarts from its data directory; a newcomer gets everything with nobody else online
await A.close(); await B2.close(); relay.kill(); await new Promise(r => setTimeout(r, 300));
({ r: relay, port } = await start());
const C = await open();
ok(await until(C, () => S.D.els.filter(e => e.type === 'TEXT').length === 2 && S.D.els.some(e => e.type === 'DRAW')), 'relay data survives a restart');
// 5. a tampered record sent through the relay is refused
await C.evaluate(() => { const r = [...S.records.values()].find(r => r.type === 'TEXT'); NET.ws.send(JSON.stringify({ room: canvasId, msg: { raw: r.raw.replace(/-M-[^-]+/, '-M-forged' ) } })); });
const D = await open();
ok(await until(D, () => S.why['bad signature'] >= 1), 'a forged record from the relay is rejected');
ok(JSON.stringify(await texts(D)) === JSON.stringify(['hello from A', 'while B was away']), 'and does not render');

console.log(`asserted ${n} checks`);
console.log('errors', errs);
await b.close(); relay.kill(); fs.rmSync(data, { recursive: true, force: true });
