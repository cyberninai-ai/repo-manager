// Moving comment pins
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import fs from 'fs';
const axe = fs.readFileSync(AXE,'utf8');
const b = await chromium.launch({ ...LAUNCH });
const ctx = await b.newContext({ viewport:{width:1200,height:780} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) });
await p.goto(BASE + '#pmtest00001'); await p.waitForTimeout(600);
const W = (t=250)=>p.waitForTimeout(t);
const sr = () => p.evaluate(()=>document.getElementById('sr').textContent);
const ids = await p.evaluate(async()=>{ const r=await commitShape('rect',{x:-200,y:-100},{x:0,y:20});
  const a=await commitComment({on:r, x:200, y:0, text:'on the rect'}); const f=await commitComment({x:150,y:150,text:'free'}); return {r,a,f} });
await W(300);
const pinS = id => p.evaluate(id=>{ const t=S.D.threads.get(id); const q=pinPos(t.root); const s=toScreen(q.x,q.y); return {x:s.x, y:s.y-14, wx:q.x, wy:q.y} }, id);
// drag anchored pin
let a0 = await pinS(ids.a);
await p.mouse.move(a0.x,a0.y); await p.mouse.down(); await p.mouse.move(a0.x-120, a0.y+60, {steps:8}); await p.mouse.up(); await W(400);
let a1 = await pinS(ids.a);
console.log('drag anchored pin', a1.wx-a0.wx, a1.wy-a0.wy, '| panel opened?', await p.evaluate(()=>document.getElementById('comments').style.display||'none'), '|', await sr());
// still follows its element
await p.evaluate(async r=>{ await commitMove(r, 50, 50) }, ids.r); await W(300);
let a2 = await pinS(ids.a); console.log('follows rect after drag', a2.wx-a1.wx, a2.wy-a1.wy);
// click (no move) opens thread
await p.mouse.click(a2.x, a2.y); await W(300);
console.log('click opens', await p.evaluate(id=>({panel:document.getElementById('comments').style.display, active:activeThread===id}), ids.a));
// drag free pin
let f0 = await pinS(ids.f);
await p.mouse.move(f0.x,f0.y); await p.mouse.down(); await p.mouse.move(f0.x+80, f0.y-40, {steps:6}); await p.mouse.up(); await W(400);
let f1 = await pinS(ids.f); console.log('drag free pin', f1.wx-f0.wx, f1.wy-f0.wy);
// undo
await p.evaluate(()=>document.getElementById('c').focus()); await p.keyboard.press('Control+z'); await W(300);
let f2 = await pinS(ids.f); console.log('undo ->', f2.wx-f0.wx, f2.wy-f0.wy);
// keyboard: move pin button, arrows, Enter
await p.evaluate(id=>openThread(id), ids.f); await W(300);
await p.click(`.thread[data-id="${ids.f}"] button[data-a="movepin"]`); await W();
console.log('focus after move pin:', await p.evaluate(()=>document.activeElement.id), '|', await sr());
for (let i=0;i<3;i++) await p.keyboard.press('Shift+ArrowLeft');
await p.keyboard.press('ArrowUp'); await W(700);
let f3 = await pinS(ids.f); console.log('keyboard pin move', f3.wx-f2.wx, f3.wy-f2.wy, '|', await sr());
await p.keyboard.press('Enter'); await W();
console.log('after Enter focus:', await p.evaluate(()=>document.activeElement.dataset.k ? 'reply box' : document.activeElement.id), 'pinMove', await p.evaluate(()=>pinMove));
// other tab sees moved pins; reload persists
const p2 = await ctx.newPage(); await p2.goto(BASE + '#pmtest00001'); await p2.waitForTimeout(800);
console.log('tab2 pin', JSON.stringify(await p2.evaluate(id=>pinPos(S.D.threads.get(id).root), ids.f)), 'tab1', JSON.stringify({x:f3.wx,y:f3.wy}));
await p.screenshot({path:OUT+'/pm.png'});
await p.addScriptTag({content: axe});
console.log('axe', JSON.stringify(await p.evaluate(async()=> (await axe.run(document,{resultTypes:['violations']})).violations.map(v=>v.id))));
console.log('errors', errs);
await b.close();
