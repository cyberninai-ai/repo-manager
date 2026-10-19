// Comment previews and thumbnails
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import fs from 'fs';
const axe = fs.readFileSync(AXE,'utf8');
const b = await chromium.launch({ ...LAUNCH });
const p = await b.newPage({ viewport:{width:1200,height:780} });
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) });
await p.goto(BASE + '#pvtest00001'); await p.waitForTimeout(600);
const W = (t=250)=>p.waitForTimeout(t);
// content: image + strokes on it, a rect, a text
await p.evaluate(()=>{ window.ask = async (l,v)=>'floor plan' });
await p.evaluate(async()=>{ const c=document.createElement('canvas'); c.width=600;c.height=380; const g=c.getContext('2d'); g.fillStyle='#d0ebff'; g.fillRect(0,0,600,380); g.strokeStyle='#1c7ed6'; g.lineWidth=8; g.strokeRect(40,40,520,300); g.beginPath(); g.moveTo(300,40); g.lineTo(300,340); g.stroke(); const bl=await new Promise(r=>c.toBlob(r,'image/png')); await insertImage(new File([bl],'plan.png',{type:'image/png'}), {x:-250,y:-60}); });
await W();
await p.mouse.move(300,300); await p.mouse.down(); for (let i=0;i<20;i++) await p.mouse.move(300+i*9, 300+Math.sin(i/3)*25); await p.mouse.up(); await W();
await p.evaluate(async()=>{ await commitShape('rect',{x:220,y:-150},{x:400,y:-40}); await commitText({x:240,y:60},'Kitchen?'); });
await W();
const els = await p.evaluate(()=>Object.fromEntries(S.D.els.map(e=>[e.type,e.cid])));
await p.evaluate(async e=>{
  const img=S.records.get(e.IMAGE), bi=box(img), r=S.records.get(e.SHAPE), br=box(r);
  const c1=await commitComment({on:e.IMAGE, x:bi.w*0.5, y:bi.h*0.4, text:'Should this wall move 1m to the left? It would free up the hallway.'});
  await commitComment({on:e.IMAGE, x:0,y:0, text:'Yes, agreed.', re:c1});
  await commitComment({on:e.SHAPE, x:br.w, y:0, text:'Storage unit, check the depth'});
  await commitComment({x:-450, y:250, text:'Overall looks good'});
}, els);
await W(400);
console.log('previews', await p.evaluate(()=>[...document.querySelectorAll('#previews .pv')].map(e=>e.textContent.replace(/\s+/g,' ').trim().slice(0,70))));
await p.screenshot({path:OUT+'/pv1.png'});
// hover a pin -> big card with latest reply
const pin = await p.evaluate(e=>{ const t=[...S.D.threads.values()].find(t=>t.root.on===e.IMAGE); const q=pinPos(t.root); return toScreen(q.x,q.y) }, els);
await p.mouse.move(pin.x, pin.y-14); await W();
console.log('hover big:', await p.evaluate(()=>document.querySelector('.pv.big')?.textContent.replace(/\s+/g,' ').trim()));
// previews follow a moved image
const before = await p.evaluate(()=>document.querySelector('.pv.big').getBoundingClientRect().left);
await p.evaluate(async e=>{ await commitMove(e.IMAGE, 60, 0) }, els); await W(400);
console.log('follow dx', await p.evaluate(()=>document.querySelector('.pv.big')?.getBoundingClientRect().left) - before);
// click a preview opens thread, thumbnails drawn
await p.click('.pv:not(.big)'); await W(400);
console.log('opened thread', await p.evaluate(()=>({panel:document.getElementById('comments').style.display, active:!!activeThread, thumbs:[...document.querySelectorAll('canvas.thumb')].map(c=>{ const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]) n++; return n>100 }) })));
await p.screenshot({path:OUT+'/pv2.png'});
// toggle off
await p.click('#cmPrev'); await W();
console.log('toggle off ->', await p.evaluate(()=>document.querySelectorAll('#previews .pv').length), '(only active/hover remain)');
await p.addScriptTag({content: axe});
console.log('axe', JSON.stringify(await p.evaluate(async()=> (await axe.run(document,{resultTypes:['violations']})).violations.map(v=>v.id+': '+v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(' | ')))));
console.log('errors', errs);
await b.close();
