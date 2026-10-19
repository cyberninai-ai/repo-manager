// Keyboard-only use and accessibility (axe)
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import fs from 'fs';
const axe = fs.readFileSync(AXE,'utf8');
const b = await chromium.launch({ ...LAUNCH });
const ctx = await b.newContext({ viewport:{width:1100,height:750} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) });
await p.goto(BASE + '#kbtest00001');
await p.waitForTimeout(600);
const sr = () => p.evaluate(()=>document.getElementById('sr').textContent);
const kb = async (k, wait=150) => { await p.keyboard.press(k); await p.waitForTimeout(wait); };
// keyboard only: focus canvas via Tab from body
await p.keyboard.press('Tab'); console.log('focused:', await p.evaluate(()=>document.activeElement.id));
await kb('r', 300); console.log('R ->', await sr());
await kb('o', 300);
await kb('t'); await p.keyboard.type('label'); await kb('Enter', 300);
console.log('records', await p.evaluate(()=>[...S.records.values()].map(r=>r.type).join()));
await p.evaluate(()=>document.getElementById('c').focus());
await kb('Escape');
await kb('Tab'); console.log('Tab1 ->', await sr());
await kb('Tab'); console.log('Tab2 ->', await sr());
const before = await p.evaluate(()=>{ const r=S.records.get([...S.sel][0]); return box(r) });
for (let i=0;i<3;i++) await kb('Shift+ArrowRight', 30);
await kb('ArrowDown', 700);
const after = await p.evaluate(()=>{ const r=S.records.get([...S.sel][0]); return box(r) });
console.log('moved', after.x-before.x, after.y-before.y, '->', await sr());
// connect: select first two via tab+shift? use lasso-free: select all of rect & circle via palette-less API
await p.evaluate(()=>{ const els=S.D.els.filter(e=>e.type==='SHAPE'); S.sel=new Set(els.map(e=>e.cid)); });
await kb('c', 300); console.log('C ->', await sr());
await kb('Escape'); await kb('Tab');
await kb('Delete', 300); console.log('Delete ->', await sr());
await kb('Control+z', 300);
// select mode with pointer: tap on circle outline selects; drag moves
await kb('v'); console.log('V ->', await sr());
const circ = await p.evaluate(()=>{ const r=S.D.els.find(e=>e.type==='SHAPE'&&e.k==='circle'); const b=box(r); return toScreen(b.x+b.w/2, b.y) });
await p.mouse.click(circ.x, circ.y+1); await p.waitForTimeout(200);
console.log('tap select ->', await sr());
await p.mouse.move(circ.x, circ.y+1); await p.mouse.down(); await p.mouse.move(circ.x+80, circ.y+60,{steps:6}); await p.mouse.up(); await p.waitForTimeout(300);
console.log('moves:', await p.evaluate(()=>[...S.records.values()].filter(r=>r.type==='MOVE').length));
// image with alt text dialog
const pr = p.evaluate(async()=>{ const c=document.createElement('canvas'); c.width=300;c.height=200; c.getContext('2d').fillRect(0,0,300,200); const bl=await new Promise(r=>c.toBlob(r,'image/png')); await insertImage(new File([bl],'site-plan.png',{type:'image/png'})); });
await p.waitForTimeout(300);
console.log('ask focused:', await p.evaluate(()=>document.activeElement.id), 'value:', await p.evaluate(()=>document.getElementById('askIn').value));
await p.keyboard.type(' sketch'); await p.keyboard.press('Enter'); await pr; await p.waitForTimeout(300);
console.log('image alt:', await p.evaluate(()=>[...S.records.values()].find(r=>r.type==='IMAGE')?.alt), '| sel:', await p.evaluate(()=>describe(S.records.get([...S.sel][0]))));
await kb('+', 300); console.log('+ ->', await sr());
console.log('summary:', await p.evaluate(()=>document.getElementById('summary').textContent));
// palette keyboard
await kb('/'); await p.keyboard.type('help'); await kb('Enter'); console.log('help focus:', await p.evaluate(()=>document.activeElement.id)); 
await kb('Escape'); console.log('after esc focus:', await p.evaluate(()=>document.activeElement.id));
await p.screenshot({path:OUT+'/kb.png'});
// axe
await p.addScriptTag({content: axe});
for (const state of ['base','ledger','palette']) {
  if (state==='ledger') await p.evaluate(()=>toggleLedger(true));
  if (state==='palette'){ await p.evaluate(()=>{toggleLedger(false); openPalette()}); }
  await p.waitForTimeout(200);
  const res = await p.evaluate(async()=> (await axe.run(document,{resultTypes:['violations']})).violations.map(v=>v.id+' ('+v.impact+'): '+v.nodes.slice(0,3).map(n=>n.target.join(' ')).join(' | ')));
  console.log('axe', state, res.length? res : 'clean');
}
console.log('errors', errs);
await b.close();
