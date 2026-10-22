// Bottom bar: brush, colour, text size
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import fs from 'fs';
const axe = fs.readFileSync(AXE,'utf8');
const b = await chromium.launch({ ...LAUNCH });
const ctx = await b.newContext({ viewport:{width:1200,height:780} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) });
await p.goto(BASE + '#bartest0001'); await p.waitForTimeout(600);
const W = (t=250)=>p.waitForTimeout(t);
const sr = () => p.evaluate(()=>document.getElementById('sr').textContent);
const setRange = (id, v) => p.$eval('#'+id, (el,v)=>{ el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }, v);
// brush via slider then draw
await setRange('brush', 18); await W();
await p.mouse.move(200,200); await p.mouse.down(); await p.mouse.move(400,260,{steps:10}); await p.mouse.up(); await W();
// brush via keys
await p.keyboard.press(']'); await p.keyboard.press(']'); await W(); console.log('] ->', await sr());
await p.mouse.move(200,320); await p.mouse.down(); await p.mouse.move(400,360,{steps:10}); await p.mouse.up(); await W();
console.log('stroke widths', await p.evaluate(()=>[...S.records.values()].filter(r=>r.type==='DRAW').map(r=>r.w)));
// colour swatch via keyboard: focus the checked radio, arrow right
await p.focus('#barColors [aria-checked="true"]'); await p.keyboard.press('ArrowRight'); await W();
console.log('colour ->', await p.evaluate(()=>S.color), '|', await sr());
// new text at size 60
await setRange('tsize', 60);
await p.evaluate(()=>document.getElementById('c').focus()); await p.keyboard.press('t'); await W(); await p.keyboard.type('Big title'); await p.keyboard.press('Enter'); await W();
const tcid = await p.evaluate(()=>[...S.records.values()].find(r=>r.type==='TEXT').cid);
console.log('new text size', await p.evaluate(c=>S.records.get(c).fs, tcid));
// select it, resize via slider drags (several inputs) -> one edit
await p.evaluate(c=>{ S.sel=new Set([c]); dirty=true }, tcid); await W();
console.log('bar target label:', await p.evaluate(()=>document.getElementById('tsizeTgt').textContent), '| slider', await p.$eval('#tsize', e=>e.value));
for (const v of [64,70,80,90]) { await p.$eval('#tsize', (el,v)=>{ el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); }, v); await W(60); }
console.log('live preview size', await p.evaluate(c=>{ const r=S.records.get(c); return r._previewFs }, tcid));
await W(800);
console.log('after settle', JSON.stringify(await p.evaluate(()=>({texts:S.D.els.filter(e=>e.type==='TEXT'&&visible(e)).map(e=>[e.text,e.fs]), edits:[...S.records.values()].filter(r=>r.type==='TEXT').length}))), '|', await sr());
// keyboard }: bigger
await p.evaluate(()=>{ const t=S.D.els.find(e=>e.type==='TEXT'&&visible(e)); S.sel=new Set([t.cid]); document.getElementById('c').focus() });
await p.keyboard.press('}'); await W(800);
console.log('} ->', await p.evaluate(()=>S.D.els.filter(e=>e.type==='TEXT'&&visible(e)).map(e=>e.fs)));
// undo restores previous size
await p.keyboard.press('Control+z'); await W();
console.log('undo ->', await p.evaluate(()=>S.D.els.filter(e=>e.type==='TEXT'&&visible(e)).map(e=>e.fs)));
// others' text not resized
const p2 = await ctx.newPage(); await p2.goto(BASE + '#bartest0001'); await p2.waitForTimeout(800);
await p2.evaluate(async()=>{ await commands().find(c=>c.t==='New identity for this tab').run(); const t=S.D.els.find(e=>e.type==='TEXT'&&visible(e)); S.sel=new Set([t.cid]); setTextSize(30,true); });
await p2.waitForTimeout(800);
console.log('tab2 on my text -> sizes', await p2.evaluate(()=>S.D.els.filter(e=>e.type==='TEXT'&&visible(e)).map(e=>e.fs)), 'tgt label:', JSON.stringify(await p2.evaluate(()=>document.getElementById('tsizeTgt').textContent)));
// inspector clears the bar
await p.evaluate(()=>{ const t=S.D.els.find(e=>e.type==='TEXT'&&visible(e)); S.sel=new Set([t.cid]); S.view.y -= 300; dirty=true }); await W();
console.log('inspector above bar', await p.evaluate(()=>{ const i=document.getElementById('insp').getBoundingClientRect(), b=document.getElementById('bar').getBoundingClientRect(); return i.bottom <= b.top }));
await p.screenshot({path:OUT+'/bar1.png'});
// fold
await p.click('#barFold'); await W();
console.log('folded', await p.evaluate(()=>({min:document.getElementById('bar').classList.contains('min'), h:document.getElementById('bar').offsetHeight})));
await p.click('#barFold');
await p.addScriptTag({content: axe});
console.log('axe', JSON.stringify(await p.evaluate(async()=> (await axe.run(document,{resultTypes:['violations']})).violations.map(v=>v.id+': '+v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(' | ')))));
await p.setViewportSize({width:390,height:760}); await W(300); await p.screenshot({path:OUT+'/bar2.png'});
console.log('mobile no overflow', await p.evaluate(()=>{ const b=document.getElementById('bar').getBoundingClientRect(); return b.left>=0 && b.right<=innerWidth }));
console.log('errors', errs);
await b.close();
