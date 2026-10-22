// Verification (audit S3, S4): Ed25519 in plain JS, refusal reasons, implausible clocks parked until the canvas catches up
import { BASE, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b = await chromium.launch({ ...LAUNCH });
const p = await (await b.newContext()).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(BASE + '#verifytest01'); await p.waitForTimeout(800);
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const sign = (z, t, text) => p.evaluate(async ([z, t, text]) => {
  const other = await newIdentity(false), prev = S.me; S.me = other;
  try { return await build('TEXT', [['I', other.id], ['X', encInt(0)], ['Y', encInt(0)], ['M', encTxt(text)], ['F', 'sans'], ['S', 20], ['C', 'ink'], ['Z', z], ['T', t]])
    + '-SIG-' + b58enc(new Uint8Array(await crypto.subtle.sign(SIGALG[other.alg], other.priv, te.encode(build('TEXT', [['I', other.id], ['X', encInt(0)], ['Y', encInt(0)], ['M', encTxt(text)], ['F', 'sans'], ['S', 20], ['C', 'ink'], ['Z', z], ['T', t]]))))); }
  finally { S.me = prev; }
}, [z, t, text]);

// 1. the JS verifier accepts real Ed25519 records and refuses tampered ones
await p.evaluate(() => { S.jsVerify = true; });
const good = await sign(1, Date.now(), 'hello');
ok(good.startsWith('TEXT-I-ed'), 'test record is Ed25519');
ok(await p.evaluate(r => ingest(r).then(Boolean), good), 'JS verifier accepts a valid signature');
const bad = good.replace(/-M-[^-]+/, '-M-' + 'tampered');
ok(await p.evaluate(r => ingest(r).then(c => c === null), bad), 'JS verifier refuses a changed payload');
ok(await p.evaluate(() => S.why['bad signature'] === 1), 'refusal reason recorded');
await p.evaluate(() => { S.jsVerify = false; });

// 2. a Z far past anything seen waits; it is ingested once the canvas catches up
const far = await sign(50000, Date.now(), 'from the future');
ok(await p.evaluate(r => ingest(r).then(c => c === null && S.parked.size === 1), far), 'Z far ahead is parked');
ok(await p.evaluate(() => !S.D.els.some(e => e.text === 'from the future')), 'parked record does not render');
const mid = await sign(45000, Date.now(), 'catching up');
await p.evaluate(r => ingest(r), await sign(9000, Date.now(), 'step'));
await p.evaluate(r => ingest(r), await sign(19000, Date.now(), 'step 2'));
await p.evaluate(r => ingest(r), await sign(29000, Date.now(), 'step 3'));
await p.evaluate(r => ingest(r), await sign(39000, Date.now(), 'step 4'));
ok(await p.evaluate(() => S.parked.size === 1), 'still waiting at Z 39000');
await p.evaluate(r => ingest(r), mid);
await p.waitForTimeout(300);
ok(await p.evaluate(() => S.parked.size === 0 && S.D.els.some(e => e.text === 'from the future')), 'parked record lands once Z is plausible');

// 3. a timestamp hours in the future waits too
const later = await sign(45001, Date.now() + 3 * 3600e3, 'tomorrow');
ok(await p.evaluate(r => ingest(r).then(c => c === null && S.parked.size === 1), later), 'T far in the future is parked');
await p.evaluate(() => { S.ledger = true; toggleLedger(true); });
ok((await p.evaluate(() => document.getElementById('ledgerStats').textContent)).includes('1 waiting'), 'ledger shows the waiting record');

console.log(`asserted ${n} checks`);
console.log('errors', errs);
await b.close();
