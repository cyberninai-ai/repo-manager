// Permissions (audit S2): owned canvases, forged ownership refused, GRANT enforcement in the view and before signing, the dialog
import { BASE, AXE, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'fs';
const axe = fs.readFileSync(AXE, 'utf8');
const b = await chromium.launch({ ...LAUNCH });
const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const W = (t = 300) => p.waitForTimeout(t);
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
// a peer that doesn't check permissions before signing: build and sign by hand
const helpers = () => p.evaluate(() => {
  window.rawAs = async (me, action, pairs) => { const pl = build(action, pairs); return pl + '-SIG-' + b58enc(new Uint8Array(await crypto.subtle.sign(SIGALG[me.alg], me.priv, te.encode(pl)))); };
});

// 1. a first visit makes a canvas you own
await p.goto(BASE.replace(/#.*$/, '')); await W(1200); await helpers();
const st = await p.evaluate(() => ({ id: canvasId, owner: S.P?.owner, me: S.me.id, rec: [...S.records.values()].filter(r => r.type === 'OWNER').length }));
ok(/^o[a-z2-7]{15}$/.test(st.id), 'owned canvas id');
ok(st.owner === st.me && st.rec === 1, 'you are the owner, proven by an OWNER record');

// 2. someone else can't claim it
ok(await p.evaluate(async () => { const o = await newIdentity(false); window.other = o;
  return ingest(await rawAs(o, 'OWNER', [['I', o.id], ['R', canvasId], ['K', 'forged'], ['Z', ++S.lamport], ['T', Date.now()]])).then(c => c === null && S.why['invalid claim'] === 1); }), 'forged OWNER refused');

// 3. Everyone else may only comment: another author's drawing is not shown, their comment is
await p.evaluate(() => grant('all', ['comment'])); await W();
const drawCid = await p.evaluate(async () => { const o = window.other;
  const bytes = encodePoints([{ x: 0, y: 0, t: 0 }, { x: 50, y: 50, t: 10 }]), R = await cidOf(bytes); await addBlob(R, bytes);
  return ingest(await rawAs(o, 'DRAW', [['I', o.id], ['R', R], ['C', 'red'], ['W', 4], ['Z', ++S.lamport], ['T', Date.now()]])); });
const cmCid = await p.evaluate(async () => { const o = window.other;
  return ingest(await rawAs(o, 'COMMENT', [['I', o.id], ['ON', '0'], ['RE', '0'], ['X', encInt(10)], ['Y', encInt(10)], ['M', encTxt('looks good')], ['Z', ++S.lamport], ['T', Date.now()]])); });
await W();
ok(await p.evaluate(c => S.D.denied.has(c) && !S.D.els.some(e => e.cid === c), drawCid), 'drawing without permission is not shown');
ok(await p.evaluate(c => S.D.threads.has(c), cmCid), 'comment is allowed');
// that author's own client refuses to sign it in the first place
ok(await p.evaluate(async () => { try { await asAuthor(window.other, () => commitShape('rect', { x: 0, y: 0 }, { x: 40, y: 40 })); return false; } catch (e) { return e.name === 'NotPermitted'; } }), 'client refuses to sign what is not permitted');
// 4. a grant for that author makes their earlier drawing appear
await p.evaluate(() => grant(window.other.id, ['draw', 'comment'])); await W();
ok(await p.evaluate(c => S.D.els.some(e => e.cid === c), drawCid), 'granted: earlier drawing now shows');
// 5. a GRANT from someone who isn't the owner changes nothing
await p.evaluate(async () => { const o = window.other; await ingest(await rawAs(o, 'GRANT', [['I', o.id], ['R', canvasId], ['A', 'all'], ['P', 'draw_comment_move_audit'], ['Z', ++S.lamport], ['T', Date.now()]])); }); await W();
ok(await p.evaluate(() => S.P.grants.get('all').perms.size === 1), 'non-owner GRANT ignored');

// 6. the dialog: open from Share, the owner toggles a permission, a GRANT is signed
await p.click('#shareBtn'); await W(); await p.click('#menu >> text=People and permissions'); await W(400);
ok(await p.evaluate(() => !document.getElementById('people').hidden && document.querySelectorAll('#peopleTable input').length >= 12), 'dialog lists people and permissions');
const grants0 = await p.evaluate(() => [...S.records.values()].filter(r => r.type === 'GRANT').length);
await p.click('#peopleTable input[data-who="all"][data-p="audit"]'); await W(500);
ok(await p.evaluate(() => [...S.records.values()].filter(r => r.type === 'GRANT').length) === grants0 + 1 && await p.evaluate(() => S.P.grants.get('all').perms.has('audit')), 'checkbox signs a GRANT');
await p.addScriptTag({ content: axe });
const v = await p.evaluate(async () => (await axe.run(document.getElementById('people'), { resultTypes: ['violations'] })).violations.map(v => v.id + ': ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')));
await p.keyboard.press('Escape'); await W();

// 7. an unowned canvas offers an owned copy with the same content
await p.goto(BASE.replace(/#.*$/, '') + '#permlegacy01'); await W(900); await helpers();
await p.evaluate(async () => { await commitText({ x: 0, y: 0 }, 'keep me'); }); await W();
await p.evaluate(() => openPeople()); await W();
ok(await p.evaluate(() => !!document.getElementById('peopleCopy')), 'unowned canvas offers an owned copy');
await p.click('#peopleCopy'); await W(1200);
ok(await p.evaluate(() => canvasId.startsWith('o') && S.P.owner === S.me.id && S.D.els.some(e => e.text === 'keep me')), 'owned copy carries the content');

console.log(`asserted ${n} checks`);
console.log('axe', JSON.stringify(v));
console.log('errors', errs);
await b.close();
