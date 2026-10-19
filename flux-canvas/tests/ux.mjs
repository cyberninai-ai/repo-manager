// Clipboard, toolbar, align, lock, eraser, zoom, outline, presence
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import fs from 'fs';
const axe = fs.readFileSync(AXE,'utf8');
const b = await chromium.launch({ ...LAUNCH });
const ctx = await b.newContext({ viewport:{width:1280,height:800}, permissions:['clipboard-read','clipboard-write'] });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(e.message+' @'+(e.stack||'').split('\n')[1])); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) });
await p.goto(BASE + '#uxtest00001'); await p.waitForTimeout(700);
const W = (t=300)=>p.waitForTimeout(t);
const sr = () => p.evaluate(()=>document.getElementById('sr').textContent);
const vis = (type) => p.evaluate(t=>S.D.els.filter(e=>(!t||e.type===t)&&visible(e)&&!S.D.hidden.has(e.cid)).length, type);
// content
const ids = await p.evaluate(async()=>{
  const a=await commitNode({kind:'card',x:-300,y:-100,label:'Alpha'}); const b=await commitNode({kind:'card',x:-60,y:-40,label:'Beta'}); const c=await commitNode({kind:'card',x:200,y:30,label:'Gamma'});
  const k=await commitNode({kind:'card',x:-300,y:60,label:'Kid of alpha',parent:a});
  const ar=await commitArrow(S.records.get(a), S.records.get(b));
  await new Promise(r=>setTimeout(r,30)); return {a,b,c,k,ar} });
await W();
await p.evaluate(()=>{ setMode(true); document.getElementById('c').focus() });
// 1. toolbar
await p.evaluate(i=>{ S.sel=new Set([i.a,i.b,i.c]); dirty=true }, ids); await W();
console.log('toolbar buttons', await p.evaluate(()=>[...document.querySelectorAll('#insp .tb button')].map(b=>b.getAttribute('aria-label').split(' (')[0]).join(' | ')));
console.log('toolbar above selection', await p.evaluate(()=>{ const t=document.getElementById('insp').getBoundingClientRect(); const sb=selBox(); return t.bottom <= toScreen(sb.x,sb.y).y }));
// 2. align top + distribute
await p.click('#insp button[data-a="al-t"]'); await W(400);
console.log('align top ys', await p.evaluate(i=>[i.a,i.b,i.c].map(c=>Math.round(box(current(c)).y)), ids));
await p.click('#insp button[data-a="dist-h"]'); await W(400);
console.log('distribute gaps', await p.evaluate(i=>{ const bs=[i.a,i.b,i.c].map(c=>box(current(c))).sort((x,y)=>x.x-y.x); return [Math.round(bs[1].x-(bs[0].x+bs[0].w)), Math.round(bs[2].x-(bs[1].x+bs[1].w))] }, ids));
// 3. copy/paste: copy Alpha+Kid+arrow+Beta; paste at pointer
await p.evaluate(i=>{ S.sel=new Set([i.a,i.k,i.b,i.ar]); dirty=true }, ids);
await p.mouse.move(700, 600);
await p.keyboard.press('Control+c'); await W();
await p.keyboard.press('Control+v'); await W(800);
const pasted = await p.evaluate(()=>[...S.sel].map(c=>{ const e=S.records.get(c); return [e.type, e.text||'', e.type==='NODE'&&e.parent?current(e.parent)?.text:'' , e.type==='ARROW'?[current(e.f.FROM)?.text, current(e.f.TO)?.text, S.sel.has(current(e.f.FROM)?.cid)]:''] }));
console.log('pasted', JSON.stringify(pasted), '|', await sr());
console.log('paste near pointer', await p.evaluate(()=>{ const b=selBox(), c=center(b), s=toScreen(c.x,c.y); return [Math.round(s.x), Math.round(s.y)] }));
// undo paste
await p.keyboard.press('Control+z'); await W(500); console.log('undo paste -> nodes', await vis('NODE'));
// 4. duplicate ⌘D
await p.evaluate(i=>{ S.sel=new Set([i.c]); dirty=true }, ids); await p.keyboard.press('Control+d'); await W(500);
console.log('dup', await vis('NODE'), await p.evaluate(()=>{ const e=S.records.get([...S.sel][0]); return e.text }));
// 5. alt-drag duplicate
const gb = await p.evaluate(i=>{ const c=center(box(current(i.c))); return toScreen(c.x,c.y) }, ids);
await p.evaluate(i=>{ S.sel=new Set([i.c]); dirty=true }, ids); await W();
await p.keyboard.down('Alt'); await p.mouse.move(gb.x,gb.y); await p.mouse.down(); await p.mouse.move(gb.x, gb.y+200, {steps:8}); await p.mouse.up(); await p.keyboard.up('Alt'); await W(600);
console.log('alt-drag', await vis('NODE'), 'original stayed', await p.evaluate(i=>Math.round(box(current(i.c)).y), ids));
// 6. snapping: drag Beta near Alpha's top edge
const before = await p.evaluate(i=>({a:box(current(i.a)), b:box(current(i.b))}), ids);
const bc = await p.evaluate(i=>{ const c=center(box(current(i.b))); return toScreen(c.x,c.y) }, ids);
await p.evaluate(i=>{ S.sel=new Set([i.b]); dirty=true }, ids); await W();
await p.mouse.move(bc.x,bc.y); await p.mouse.down(); await p.mouse.move(bc.x+33, bc.y+97, {steps:8});
console.log('guides while dragging', await p.evaluate(()=>G?.guides?.length));
await p.mouse.up(); await W(500);
const after = await p.evaluate(i=>({a:box(current(i.a)), b:box(current(i.b))}), ids);
console.log('snapped edges', JSON.stringify({ax:[after.a.x, after.a.x+after.a.w], bx:[after.b.x, after.b.x+after.b.w], ay:[after.a.y,after.a.y+after.a.h], by:[after.b.y, after.b.y+after.b.h]}));
// 7. front/back + lock
await p.evaluate(i=>{ S.sel=new Set([i.a]); dirty=true }, ids);
await p.keyboard.press('Control+Shift+ArrowUp'); await W(400);
console.log('front: top z?', await p.evaluate(i=>{ const v=S.D.els.filter(visible); return v[v.length-1].cid===current(i.a).cid }, ids));
await p.keyboard.press('Control+Shift+ArrowDown'); await W(400);
console.log('back: bottom z?', await p.evaluate(i=>{ const v=S.D.els.filter(visible); return v[0].cid===current(i.a).cid }, ids));
await p.keyboard.press('Control+Shift+l'); await W(400);
console.log('locked', await p.evaluate(i=>current(i.a).locked, ids), '|', await sr());
const ab = await p.evaluate(i=>{ const c=center(box(current(i.a))); return toScreen(c.x,c.y) }, ids);
await p.evaluate(()=>{ S.sel.clear(); dirty=true });
await p.mouse.click(ab.x, ab.y); await W(); console.log('click locked selects?', await p.evaluate(()=>S.sel.size));
await p.keyboard.press('p'); await p.mouse.move(ab.x-30,ab.y); await p.mouse.down(); await p.mouse.move(ab.x+30,ab.y+10,{steps:6}); await p.mouse.up(); await W(400);
console.log('drew over locked', await vis('DRAW'));
await p.evaluate(i=>{ S.sel=new Set([i.a]); document.getElementById('c').focus() }, ids); await p.keyboard.press('Delete'); await W(300);
console.log('delete locked ->', await p.evaluate(i=>S.D.hidden.has(current(i.a).cid), ids));
await p.keyboard.press('Control+Shift+l'); await W(300); console.log('unlocked', !(await p.evaluate(i=>current(i.a).locked, ids)));
// 8. arrow label
await p.evaluate(i=>{ S.sel=new Set([i.ar]); dirty=true }, ids); await W();
await p.click('#insp button[data-a="label"]'); await W(); await p.keyboard.press('Control+a'); await p.keyboard.type('depends on'); await p.keyboard.press('Enter'); await W(400);
console.log('label', await p.evaluate(i=>S.records.get(i.ar).elabel, ids), 'in svg', await p.evaluate(()=>toSVG().includes('depends on')));
// 9. eraser: draw two strokes then erase across
await p.evaluate(()=>{ S.sel.clear(); setMode(false); document.getElementById('c').focus() });
for (const y of [650, 700]) { await p.mouse.move(150,y); await p.mouse.down(); await p.mouse.move(400,y,{steps:8}); await p.mouse.up(); await W(200); }
const d0 = await vis('DRAW');
await p.keyboard.press('e'); await p.mouse.move(250, 620); await p.mouse.down(); await p.mouse.move(260, 730, {steps:12}); await p.mouse.up(); await W(500);
console.log('erase', d0, '->', await vis('DRAW'), '|', await sr());
await p.keyboard.press('Escape');
await p.keyboard.press('Control+z'); await W(400); console.log('undo erase ->', await vis('DRAW'));
// 10. zoom controls + minimap
await p.click('#zIn'); await W(); console.log('zoom', await p.evaluate(()=>document.getElementById('zPct').textContent));
await p.click('#zPct'); await W();
const mr = await p.evaluate(()=>{ const r=document.getElementById('mini').getBoundingClientRect(); return {x:r.left+10, y:r.top+10} });
const v0 = await p.evaluate(()=>({...S.view})); await p.mouse.click(mr.x, mr.y); await W();
console.log('minimap pans', await p.evaluate(v=>S.view.x!==v.x||S.view.y!==v.y, v0));
await p.click('#zFit'); await W();
// 11. outline paste
await p.evaluate(()=>{ S.view.x += 2000; dirty=true });
await p.evaluate(async()=>{ await mindmapFromOutline('Trip\n  Flights\n    Book\n    Seats\n  Hotel\n  Food\n    Breakfast\n  Budget\n  Packing'); });
await W(800);
console.log('outline', JSON.stringify(await p.evaluate(()=>{ const root=S.D.els.find(e=>e.type==='NODE'&&e.text==='Trip'&&visible(e)); const kids=(S.D.kids.get(root.cid)||[]).map(k=>S.records.get(k)); return {kids:kids.map(k=>[k.text, center(box(k)).x>center(box(root)).x?'R':'L', Math.round(box(k).y)]), sub:(S.D.kids.get(kids.find(k=>k.text==='Flights').cid)||[]).map(c=>S.records.get(c).text)} })));
await p.evaluate(()=>zoomFit()); await W(500); await p.screenshot({path:OUT+'/ux1.png'});
// 12. presence with a second tab
const p2 = await ctx.newPage(); await p2.goto(BASE + '#uxtest00001'); await p2.waitForTimeout(900);
await p2.evaluate(async()=>{ await commands().find(c=>c.t==='New identity for this tab').run(); });
for (let i=0;i<5;i++){ await p2.mouse.move(500+i*20, 400); await p2.waitForTimeout(60); }
await W(300);
console.log('peers on tab1', await p.evaluate(()=>[...peers.keys()].map(short)), 'live ring', await p.evaluate(()=>document.querySelectorAll('#authors .live').length));
await p.screenshot({path:OUT+'/ux2.png'});
await p.addScriptTag({content: axe});
await p.evaluate(i=>{ S.sel=new Set([i.b,i.c]); dirty=true }, ids); await W();
console.log('axe', JSON.stringify(await p.evaluate(async()=> (await axe.run(document,{resultTypes:['violations']})).violations.map(v=>v.id+': '+v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(' | ')))));
console.log('errors', errs);
await b.close();
