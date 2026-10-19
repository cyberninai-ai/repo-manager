// Storage (audit S1, S5, P2): non-extractable keys in IndexedDB, append-only record log, migration from localStorage, blob cap
import { BASE, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b = await chromium.launch({ ...LAUNCH });
const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const W = (t = 300) => p.waitForTimeout(t);
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// 1. a fresh browser: the key is a non-extractable CryptoKey in IndexedDB, nothing secret in localStorage
await p.goto(BASE + '#storetest001'); await W(800);
const key = await p.evaluate(async () => {
  const k = await dbGet('keys', 'me');
  let exported = true; try { await crypto.subtle.exportKey('jwk', k.priv); } catch { exported = false; }
  return { db: DB.ok, same: k?.id === S.me.id, extractable: k?.priv.extractable, exported, ls: localStorage.getItem('flux:identity') };
});
ok(key.db && key.same, 'identity lives in IndexedDB');
ok(key.extractable === false && key.exported === false, 'private key cannot be exported');
ok(key.ls === null, 'no key material in localStorage');

// 2. records go to the append-only log and come back after a reload
await p.mouse.move(300, 300); await p.mouse.down(); await p.mouse.move(500, 360, { steps: 8 }); await p.mouse.up(); await W(600);
const before = await p.evaluate(() => S.records.size);
ok(await p.evaluate(async () => (await dbAll('records', canvasId)).length) === before, 'every record is in the log');
ok(await p.evaluate(() => localStorage.getItem('flux:canvas:' + canvasId)) === null, 'nothing written to localStorage');
await p.reload(); await W(900);
ok(await p.evaluate(() => S.D.els.filter(e => e.type === 'DRAW' && visible(e)).length) === 1, 'stroke restored from IndexedDB');
const me0 = await p.evaluate(() => S.me.id);

// 3. migration: a canvas and key left in localStorage by an older version move into IndexedDB
const legacy = await p.evaluate(async () => {
  const old = await newIdentity(true), prev = S.me; S.me = old;
  const raw = await signed('TEXT', [['I', old.id], ['X', encInt(10)], ['Y', encInt(20)], ['M', encTxt('from an older version')], ['F', 'sans'], ['S', 24], ['C', 'ink'], ['Z', 1], ['T', Date.now()]]);
  S.me = prev;
  localStorage.setItem('flux:canvas:legacytest01', raw);
  return { id: old.id, jwk: JSON.stringify({ alg: old.alg, id: old.id, jwk: old.jwk }) };
});
await p.evaluate(async l => { localStorage.setItem('flux:identity', l.jwk); await new Promise(r => { DB.db.transaction('keys', 'readwrite').objectStore('keys').delete('me').onsuccess = r; }); }, legacy);
await p.goto(BASE + '#legacytest01'); await p.reload(); await W(1000);
const mig = await p.evaluate(async () => ({ me: S.me.id, priv: (await dbGet('keys', 'me'))?.priv.extractable, ls: localStorage.getItem('flux:identity'), canvasLS: localStorage.getItem('flux:canvas:legacytest01'),
  texts: S.D.els.filter(e => e.type === 'TEXT').map(e => e.text), log: (await dbAll('records', 'legacytest01')).length }));
ok(mig.me === legacy.id && mig.priv === false, 'legacy key kept, now non-extractable');
ok(mig.ls === null && mig.canvasLS === null, 'legacy localStorage copies removed');
ok(mig.texts[0] === 'from an older version' && mig.log === 1, 'legacy canvas migrated into the log');
ok(me0 !== mig.me, 'sanity: the migrated key replaced the fresh one');

// 4. blob cap: a 3 MB blob is refused, a small one accepted
const cap = await p.evaluate(async () => { const big = new Uint8Array(3 * 1024 * 1024), small = new Uint8Array(1000); return [await addBlob(await cidOf(big), big), await addBlob(await cidOf(small), small)]; });
ok(cap[0] === false && cap[1] === true, 'blobs over 2 MB are refused');

// 5. the canvas list comes from IndexedDB
await p.click('#homeBtn'); await W(600);
const list = await p.evaluate(() => [...document.querySelectorAll('#homeList .open b')].map(b => b.textContent));
ok(list.length >= 2, 'canvas home lists both canvases');
await p.keyboard.press('Escape');

console.log(`asserted ${n} checks`);
console.log('errors', errs);
await b.close();
