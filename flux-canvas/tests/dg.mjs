// Diagrams: nodes, handles, tidy, templates, SVG
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import fs from 'fs';
const axe = fs.readFileSync(AXE,'utf8');
const b = await chromium.launch({ ...LAUNCH });
const ctx = await b.newContext({ viewport:{width:1280,height:800} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(e.message+' '+(e.stack||'').split('\n')[1])); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) });
await p.goto(BASE + '#dgtest00001'); await p.waitForTimeout(700);
const W = (t=250)=>p.waitForTimeout(t);
const sr = () => p.evaluate(()=>document.getElementById('sr').textContent);
const nodes = () => p.evaluate(()=>S.D.els.filter(e=>e.type==='NODE'&&visible(e)).map(e=>({k:e.ek,t:e.text,p:e.parent?current(e.parent)?.text:null,w:box(e).w,h:box(e).h})));
// 1. N tool → click → type → Tab (child) → type → Ctrl+Enter (sibling) → type → Enter
await p.evaluate(()=>document.getElementById('c').focus());
await p.click('#nodeBtn'); await W();
await p.click('#barKinds [data-k="topic"]'); await W();
console.log('placing:', await p.evaluate(()=>placing), '|', await sr());
await p.mouse.click(400, 380); await W();
console.log('editor:', await p.evaluate(()=>({open:document.activeElement===ta, v:ta.value})));
await p.keyboard.type('Product launch'); await p.keyboard.press('Tab'); await W(400);
await p.keyboard.type('Marketing'); await p.keyboard.press('Control+Enter'); await W(400);
await p.keyboard.type('Engineering and a much longer label that should wrap onto more lines'); await p.keyboard.press('Enter'); await W(400);
console.log('nodes', JSON.stringify(await nodes()));
console.log('mode', await p.evaluate(()=>S.lassoMode?'select':'pen'), '| sel', await p.evaluate(()=>describe(current([...S.sel][0]))));
// 2. Alt+Up on the selected node → new child up; Escape cancels
await p.keyboard.press('Alt+ArrowUp'); await W(); await p.keyboard.press('Escape'); await W();
console.log('after esc nodes', (await nodes()).length);
// 3. + handle click (right) creates child, drag + handle onto another node connects
const sel = await p.evaluate(()=>{ const n=soleNode(); return n && n.text });
const hs = await p.evaluate(()=>growHandles().map(h=>({dir:h.dir, ...toScreen(h.x,h.y)})));
const right = hs.find(h=>h.dir==='right');
await p.mouse.click(right.x, right.y); await W(); await p.keyboard.type('Docs'); await p.keyboard.press('Enter'); await W(400);
console.log('plus click child of', sel, '->', JSON.stringify((await nodes()).filter(n=>n.t==='Docs')));
// drag from the "Docs" handle down onto "Marketing"
const hs2 = await p.evaluate(()=>growHandles().map(h=>({dir:h.dir, ...toScreen(h.x,h.y)})));
const mk = await p.evaluate(()=>{ const n=S.D.els.find(e=>e.type==='NODE'&&visible(e)&&e.text==='Marketing'); const c=center(box(n)); return toScreen(c.x,c.y) });
const dn = hs2.find(h=>h.dir==='down');
await p.mouse.move(dn.x,dn.y); await p.mouse.down(); await p.mouse.move(mk.x, mk.y, {steps:10}); await p.mouse.up(); await W(400);
console.log('arrows', await p.evaluate(()=>S.D.els.filter(e=>e.type==='ARROW'&&visible(e)).length), '|', await sr());
// 4. drag a + handle to empty space → new node there
const hs3 = await p.evaluate(()=>growHandles().map(h=>({dir:h.dir, ...toScreen(h.x,h.y)})));
const up = hs3.find(h=>h.dir==='up'); await p.mouse.move(up.x,up.y); await p.mouse.down(); await p.mouse.move(up.x+60, up.y-150, {steps:8}); await p.mouse.up(); await W();
await p.keyboard.type('Dropped'); await p.keyboard.press('Enter'); await W(400);
console.log('dropped', JSON.stringify((await nodes()).filter(n=>n.t==='Dropped')));
// 5. edit label via double click in select mode; node grows
const ml = await p.evaluate(()=>{ const n=S.D.els.find(e=>e.type==='NODE'&&visible(e)&&e.text==='Marketing'); const c=center(box(n)); return {...toScreen(c.x,c.y), w:box(n).w} });
await p.mouse.click(ml.x, ml.y); await p.waitForTimeout(80); await p.mouse.click(ml.x, ml.y); await W();
await p.keyboard.press('Control+a'); await p.keyboard.type('Marketing & growth team'); await p.keyboard.press('Enter'); await W(400);
const m2 = await p.evaluate(()=>{ const n=S.D.els.find(e=>e.type==='NODE'&&visible(e)&&e.text.startsWith('Marketing')); return {t:n.text, w:box(n).w, arrowsOk:S.D.els.filter(e=>e.type==='ARROW'&&visible(e)).length, kids:descendants(current(S.D.els.find(x=>x.type==='NODE'&&x.text==='Product launch'&&visible(x)).cid)).length} });
console.log('edit', JSON.stringify(m2), 'grew', m2.w - ml.w);
// 6. move root moves subtree
const before = await p.evaluate(()=>(S.D.els.filter(e=>e.type==='NODE'&&visible(e)).map(e=>[e.text, Math.round(box(e).x)])));
await p.evaluate(()=>{ const r=S.D.els.find(x=>x.type==='NODE'&&x.text==='Product launch'&&visible(x)); S.sel=new Set([r.cid]); document.getElementById('c').focus() });
for (let i=0;i<4;i++) await p.keyboard.press('Shift+ArrowLeft'); await W(700);
const after = await p.evaluate(()=>(S.D.els.filter(e=>e.type==='NODE'&&visible(e)).map(e=>[e.text, Math.round(box(e).x)])));
console.log('subtree moved', JSON.stringify(after.map((a,i)=>[a[0].slice(0,10), a[1]-before[i][1]])));
// 7. tidy
await p.keyboard.press('l'); await W(700); console.log('tidy:', await sr());
// 8. change kind of selected to rect via bar; recolour
await p.click('#barKinds [data-k="rect"]'); await W(400);
console.log('kind change', await p.evaluate(()=>soleNode()?.ek));
await p.keyboard.press('Control+z'); await W(300);
// 9. resize node by handle: bigger and never smaller than text
await p.evaluate(()=>{ const r=S.D.els.find(x=>x.type==='NODE'&&x.text==='Docs'&&visible(x)); S.sel=new Set([r.cid]); dirty=true });  await W();
const rh = await p.evaluate(()=>{ const h=resizeHandle(); return toScreen(h.x,h.y) });
const db = await p.evaluate(()=>box(soleNode()));
await p.mouse.move(rh.x,rh.y); await p.mouse.down(); await p.mouse.move(rh.x+80, rh.y+40, {steps:5}); await p.mouse.up(); await W(400);
const db2 = await p.evaluate(()=>box(soleNode()));
await p.mouse.move(rh.x+80,rh.y+40); await p.mouse.down(); await p.mouse.move(rh.x-200, rh.y-100, {steps:5}); await p.mouse.up(); await W(400);
const db3 = await p.evaluate(()=>box(soleNode()));
console.log('resize', db2.w-db.w, db2.h-db.h, '| shrink floor', db3.w, db3.h, 'auto', JSON.stringify(await p.evaluate(()=>{ const L=nodeLayout(soleNode().ek, soleNode().text); return [L.w,L.h] })));
await p.screenshot({path:OUT+'/dg1.png'});
// 10. templates
for (const t of ['mindmap','flow','mobile','web']) { await p.evaluate(t=>{ S.view.x += 1400; }, t); await p.evaluate(t=>insertTemplate(t), t); await W(600); }
console.log('template nodes', await p.evaluate(()=>S.D.els.filter(e=>e.type==='NODE'&&visible(e)).length), 'groups', await p.evaluate(()=>S.D.groups.length));
await p.evaluate(()=>zoomFit()); await W(400); await p.screenshot({path:OUT+'/dg2.png'});
// 11. SVG export parses
const svg = await p.evaluate(()=>toSVG());
const ok = await p.evaluate(svg=>{ const d=new DOMParser().parseFromString(svg,'image/svg+xml'); return {err: !!d.querySelector('parsererror'), paths:d.querySelectorAll('path').length, texts:d.querySelectorAll('text').length, colorMix: svg.includes('color-mix')} }, svg);
console.log('svg', JSON.stringify(ok), (svg.length/1024).toFixed(1)+'KB');
fs.writeFileSync(OUT+'/out.svg', svg);
// 12. second tab sees everything; reload
const p2 = await ctx.newPage(); await p2.goto(BASE + '#dgtest00001'); await p2.waitForTimeout(1200);
console.log('tab2 nodes', await p2.evaluate(()=>S.D.els.filter(e=>e.type==='NODE'&&visible(e)).length), 'rej', await p2.evaluate(()=>S.rejected));
await p.addScriptTag({content: axe});
console.log('axe', JSON.stringify(await p.evaluate(async()=> (await axe.run(document,{resultTypes:['violations']})).violations.map(v=>v.id+': '+v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(' | ')))));
console.log('errors', errs);
await b.close();
