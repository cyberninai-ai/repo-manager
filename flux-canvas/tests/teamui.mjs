// The team features through the interface, by clicking as a person would: every item in the Team hub opens what it says,
// "Needs you" and its count, the Deliver dialog with payment terms, approving and releasing from the inbox, the stance button,
// the live panel's shortcuts, ritual templates in the canvas home, and help
import { team, ok, until, count, axeOn } from './pair.mjs';
const { b, errs, pages: [A, B] } = await team(['Ana', 'Ben'], 'teamuitest01');
const v = [];
const shown = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && !e.hidden; }, sel);
const closeAll = async p => { await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.evaluate(() => { closePanel(false); if (!document.getElementById('history').hidden) closeHistory(); if (WK.on) toggleWork(false); if (document.getElementById('formDlg')?.style.display === 'block') closeForm(null); closeMenu(false); }); };

// 1. every feature in the Team hub opens from its menu item
await A.evaluate(() => commitNode({ kind: 'sticky', x: 0, y: 0, label: 'Homepage copy' }));
const feats = await A.evaluate(() => FEATURES.filter(f => f.open).map(f => ({ id: f.id, name: f.name })));
ok(feats.length >= 22, `the Team hub lists ${feats.length} features`);
for (const f of feats){
  await A.click('#hubBtn'); await A.waitForTimeout(80);
  const item = A.locator('#menu [role^=menuitem]', { hasText: f.name }).first();
  await item.click(); await A.waitForTimeout(250);
  const where = await A.evaluate(id => document.getElementById('px-' + id)?.style.display === 'flex' ? '#px-' + id : !document.getElementById('history').hidden ? '#history' : document.getElementById('formDlg')?.style.display === 'block' ? '#formDlg' : WK.on ? '#work' : '', f.id);
  ok(!!where, `${f.name} opens (${where || 'nothing'})`);
  if (where) v.push(...(await axeOn(A, where)).map(x => `${f.id}: ${x}`));
  await closeAll(A);
}

// 2. deliver from the Work panel: one dialog with approvers and payment; Ben approves from "Needs you"; Ana releases
await A.click('#workBtn'); await A.waitForTimeout(150);
await A.click('#wkDeliver'); await A.waitForTimeout(150);
ok(await shown(A, '#formDlg'), 'Deliver opens one dialog');
await A.fill('#ff-title', 'Homepage');
const benId = await B.evaluate(() => S.me.id);
await A.evaluate(ben => { for (const c of document.querySelectorAll('[id^="ff-who-"]')) c.checked = c.value === ben; }, benId);
await A.fill('#ff-q', '1'); await A.fill('#ff-pay', '500');
v.push(...(await axeOn(A, '#formDlg')).map(x => `deliver: ${x}`));
await A.click('#formOk'); await A.waitForTimeout(300);
ok(await until(B, () => S.D.deliveries?.length === 1 && S.D.pays?.size === 1), 'the delivery reaches Ben with its payment terms');
ok(await until(B, () => document.getElementById('hubN').textContent === '1'), 'Ben’s Team button counts one thing waiting for him');
await B.click('#hubBtn'); await B.waitForTimeout(100);
ok(await B.evaluate(() => /Needs you · 1/.test(document.getElementById('menu').textContent)), '“Needs you” heads the Team menu');
await B.locator('#menu [role^=menuitem]', { hasText: 'Approve “Homepage”' }).click(); await B.waitForTimeout(200);
ok(await shown(B, '#work'), 'the item opens the Work panel');
await B.locator('#work [data-ap]').first().click();
ok(await until(A, () => S.D.deliveries[0].done), 'Ben approves with one click: delivered');
ok(await until(A, () => document.getElementById('hubN').textContent === '1'), 'Ana’s count: a payment to release');
await A.click('#hubBtn'); await A.waitForTimeout(100);
await A.locator('#menu [role^=menuitem]', { hasText: 'Release the payment' }).click(); await A.waitForTimeout(200);
await A.locator('#work [data-release]').first().click();
ok(await until(B, () => S.D.settles?.size === 1), 'Ana releases it from the Work panel; Ben sees it paid');
await closeAll(A); await closeAll(B);

// 3. the stance button on a selected note
const note = await A.evaluate(() => S.D.els.find(e => e.text === 'Homepage copy').cid);
await A.evaluate(c => { S.sel = new Set([c]); dirty = true; }, note); await A.waitForTimeout(250);
await A.click('[data-a="stance"]'); await A.waitForTimeout(100);
ok(await A.evaluate(() => /Blind round on this/.test(document.getElementById('menu').textContent)), 'the stance menu offers a blind round');
await A.locator('#menu [role^=menuitem]', { hasText: 'Agree' }).first().click();
ok(await until(B, c => consensus(c).c.agree === 1, note), 'agree, from the toolbar, reaches Ben');

// 4. the live panel launches the session tools
await A.evaluate(() => { S.sel.clear(); dirty = true; }); await A.click('#liveBtn'); await A.waitForTimeout(150);
ok(await A.evaluate(() => /Run this session/.test(document.getElementById('sessionBody').textContent) && document.querySelectorAll('#sessionBody [data-feature]').length >= 7), 'the live panel lists the session and network tools');
v.push(...(await axeOn(A, '#session')).map(x => `session: ${x}`));
await A.locator('#sessionBody [data-feature="meeting"]').click(); await A.waitForTimeout(200);
ok(await shown(A, '#px-meeting'), 'from it, the facilitated meeting opens');
await closeAll(A);

// 5. ritual templates in the canvas home start the contract
await A.click('#homeBtn'); await A.waitForTimeout(200);
ok(await A.evaluate(() => !!document.querySelector('[data-tpl="ritual-retro"]')), 'the canvas home offers a retro with its contract');
await A.click('[data-tpl="ritual-retro"]'); await A.waitForTimeout(800);
ok(await until(A, () => !!openRitual() && /Retro/.test(document.getElementById('strip').textContent)), 'the retro starts: its board and its contract, shown in the strip');

// 6. help and the shortcut
await A.evaluate(() => cv.focus()); await A.keyboard.press('Shift+T'); await A.waitForTimeout(100);
ok(await shown(A, '#menu'), '⇧T opens the Team menu');
await A.keyboard.press('Escape'); await A.evaluate(() => cv.focus()); await A.keyboard.press('?'); await A.waitForTimeout(150);
ok(await A.evaluate(() => /Working as a team/.test(document.getElementById('help').textContent)), 'help explains working as a team');
await A.screenshot({ path: 'tests/out/teamui.png' });

console.log(`asserted ${count()} checks`);
console.log('axe', JSON.stringify(v));
console.log('errors', errs);
await b.close();
