// Pen always draws; select mode moves/resizes
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ ...LAUNCH });
const p = await b.newPage({viewport:{width:1100,height:750}});
const errs=[]; p.on('pageerror', e=>errs.push(e.message));
await p.goto(BASE + '#pentest0001'); await p.waitForTimeout(600);
await p.evaluate(()=>{ window.ask = async (l,v)=>v||'photo' });
await p.evaluate(async()=>{ const c=document.createElement('canvas'); c.width=800;c.height=500; const g=c.getContext('2d'); g.fillStyle='#74c0fc'; g.fillRect(0,0,800,500); const bl=await new Promise(r=>c.toBlob(r,'image/png')); await insertImage(new File([bl],'x.png',{type:'image/png'})); });
await p.waitForTimeout(400);
const st = () => p.evaluate(()=>({draws:[...S.records.values()].filter(r=>r.type==='DRAW').length, moves:[...S.records.values()].filter(r=>r.type==='MOVE').length, arrows:[...S.records.values()].filter(r=>r.type==='ARROW').length, sel:S.sel.size, mode:S.lassoMode?'select':'pen'}));
const ib = await p.evaluate(()=>{ const r=[...S.records.values()].find(r=>r.type==='IMAGE'); const b=box(r); const a=toScreen(b.x,b.y), z=toScreen(b.x+b.w,b.y+b.h); return {x0:a.x,y0:a.y,x1:z.x,y1:z.y} });
console.log('after insert', JSON.stringify(await st()));
const stroke = async (x,y,dx,dy) => { await p.mouse.move(x,y); await p.mouse.down(); for(let i=1;i<=15;i++) await p.mouse.move(x+dx*i/15, y+dy*i/15+Math.sin(i)*5); await p.mouse.up(); await p.waitForTimeout(150); };
await stroke(ib.x0+100, (ib.y0+ib.y1)/2, 200, 20);           // middle of image
await stroke(ib.x0+3, ib.y0+40, 0, 120);                       // right on the image edge
await p.mouse.click(ib.x0+300, ib.y0+60); await p.waitForTimeout(500);  // a dot on the image
console.log('pen on image', JSON.stringify(await st()));
// select mode: tap, drag move, resize
await p.keyboard.press('v');
await p.mouse.move(ib.x1-30, ib.y1-30); await p.mouse.down(); await p.mouse.move(ib.x1+20, ib.y1, {steps:6}); await p.mouse.up(); await p.waitForTimeout(300);
console.log('select-mode drag', JSON.stringify(await st()));
const hb = await p.evaluate(()=>{ const h=resizeHandle(); return toScreen(h.x,h.y) });
await p.mouse.move(hb.x,hb.y); await p.mouse.down(); await p.mouse.move(hb.x+60,hb.y+40,{steps:5}); await p.mouse.up(); await p.waitForTimeout(300);
console.log('resize', JSON.stringify(await st()));
// back to pen with the image still selected: drawing on it must draw
await p.keyboard.press('p');
await stroke(ib.x0+150, ib.y0+150, 150, 60);
console.log('pen over selection', JSON.stringify(await st()));
await p.screenshot({path:OUT+'/pen.png'});
console.log('errors', errs);
await b.close();
