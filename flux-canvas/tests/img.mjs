// Images: insert, move, resize, sync, export
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ ...LAUNCH });
const ctx = await b.newContext({ viewport:{width:1100,height:750} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) });
await p.goto(BASE + '#imgtest0001');
await p.waitForTimeout(600);
await p.evaluate(()=>{ window.ask = async (l,v)=>v||'test image' });
// generate a test photo in-page and insert it via the real path
await p.evaluate(async()=>{ const c=document.createElement('canvas'); c.width=2400; c.height=1600; const g=c.getContext('2d');
  const gr=g.createLinearGradient(0,0,2400,1600); gr.addColorStop(0,'#4dabf7'); gr.addColorStop(1,'#f783ac'); g.fillStyle=gr; g.fillRect(0,0,2400,1600);
  g.fillStyle='#fff'; g.font='bold 200px sans-serif'; g.fillText('PHOTO',700,900);
  const blob=await new Promise(r=>c.toBlob(r,'image/png')); await insertImage(new File([blob],'p.png',{type:'image/png'})); });
await p.waitForTimeout(500);
let st=await p.evaluate(()=>{ const r=[...S.records.values()].find(r=>r.type==='IMAGE'); const b=box(r); return {sel:S.sel.size, box:b, blob:S.blobs.get(r.f.R).length>1000, raw:r.raw.split('-X-')[0]} });
console.log(JSON.stringify(st));
const B=st.box, sx=x=>(x-(-550))*1, sy=y=>(y-(-375));
// move: drag from inside image
await p.mouse.move(sx(B.x+B.w/2), sy(B.y+B.h/2)); await p.mouse.down(); await p.mouse.move(sx(B.x+B.w/2)-150, sy(B.y+B.h/2)-60,{steps:8}); await p.mouse.up();
await p.waitForTimeout(300);
// resize from corner
let b2=await p.evaluate(()=>box([...S.records.values()].find(r=>r.type==='IMAGE')));
await p.mouse.move(sx(b2.x+b2.w), sy(b2.y+b2.h)); await p.mouse.down(); await p.mouse.move(sx(b2.x+b2.w)+120, sy(b2.y+b2.h)+80,{steps:8}); await p.mouse.up();
await p.waitForTimeout(300);
let b3=await p.evaluate(()=>box([...S.records.values()].find(r=>r.type==='IMAGE')));
console.log('moved', JSON.stringify(b2), 'resized', JSON.stringify(b3));
// Esc then draw on top of the image and next to it
await p.keyboard.press('Escape');
await p.mouse.move(sx(b3.x+60), sy(b3.y+b3.h/2)); await p.mouse.down(); for(let i=0;i<30;i++) await p.mouse.move(sx(b3.x+60)+i*8, sy(b3.y+b3.h/2)+Math.sin(i/3)*25); await p.mouse.up();
await p.mouse.move(sx(b3.x+b3.w+40), sy(b3.y+40)); await p.mouse.down(); await p.mouse.move(sx(b3.x+b3.w+200), sy(b3.y+160),{steps:10}); await p.mouse.up();
await p.waitForTimeout(300);
// tap on image selects it
await p.mouse.click(sx(b3.x+b3.w-40), sy(b3.y+40)); await p.waitForTimeout(500);
console.log('tap selects image', await p.evaluate(()=>[...S.sel].map(c=>S.records.get(c).type).join()));
await p.screenshot({path:OUT+'/img1.png'});
// undo resize? check undo of last create (stroke) etc; reload persistence
await p.reload(); await p.waitForTimeout(1000);
console.log('after reload', JSON.stringify(await p.evaluate(()=>({n:S.records.size, types:[...S.records.values()].map(r=>r.type).join(), rej:S.rejected, box:box([...S.records.values()].find(r=>r.type==='IMAGE'))}))));
// second tab gets image live
await p.evaluate(()=>{ window.ask = async (l,v)=>v||'test image' });
const p2=await ctx.newPage(); await p2.goto(BASE + '#imgtest0001'); await p2.waitForTimeout(800);
await p.evaluate(async()=>{ const c=document.createElement('canvas'); c.width=300;c.height=200; const g=c.getContext('2d'); g.fillStyle='#2f9e44'; g.fillRect(0,0,300,200); const bl=await new Promise(r=>c.toBlob(r,'image/png')); await insertImage(new File([bl],'g.png',{type:'image/png'}), {x:-450,y:150}); });
await p2.waitForTimeout(600);
console.log('tab2 images', await p2.evaluate(()=>[...S.records.values()].filter(r=>r.type==='IMAGE').length));
// export/import roundtrip into new canvas
const exp=await p.evaluate(()=>canvasText(false));
await p.evaluate(()=>switchCanvas('roundtrip01')); 
console.log('import', JSON.stringify(await p.evaluate(async t=>{ const r=await importText(t); return {...r, imgs:[...S.records.values()].filter(r=>r.type==='IMAGE').length} }, exp)));
await p.waitForTimeout(400); await p.screenshot({path:OUT+'/img2.png'});
console.log('errors', errs);
await b.close();
