// Shared by the team-feature suites: people in separate browser contexts (own keys, own storage), connected peer to peer
// with swapped codes, plus a counting assert and a polling wait.
import { PLAIN, AXE, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'fs';
export const axeSrc = fs.readFileSync(AXE, 'utf8');
export async function team(names, room){
  const b = await chromium.launch({ ...LAUNCH, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const errs = [], pages = [];
  for (const name of names){
    const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
    await p.goto(PLAIN + '#' + room); await p.waitForTimeout(800);
    await p.evaluate(n => setMyName(n), name); pages.push(p);
  }
  // a star: everyone connects to the first person
  for (const p of pages.slice(1)){
    const offer = await pages[0].evaluate(() => rtcInvite()), answer = await p.evaluate(c => rtcJoin(c), offer);
    await pages[0].evaluate(c => rtcAccept(c), answer);
    await until(p, () => RTC.chans.size >= 1);
  }
  await until(pages[0], n => RTC.chans.size >= n, pages.length - 1);
  return { b, errs, pages };
}
let n = 0;
export const ok = (c, m) => { assert.ok(c, m); n++; };
export const count = () => n;
export async function until(pg, f, arg, ms = 6000){ const t = Date.now(); while (Date.now() - t < ms){ if (await pg.evaluate(f, arg)) return true; await pg.waitForTimeout(100); } return false; }
export async function axeOn(pg, sel){
  if (!await pg.evaluate(() => typeof axe !== 'undefined')) await pg.addScriptTag({ content: axeSrc });
  return pg.evaluate(async s => (await axe.run(document.querySelector(s), { resultTypes: ['violations'] })).violations.map(v => v.id + ': ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')), sel);
}
