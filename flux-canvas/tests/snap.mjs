// Snapping guides
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ ...LAUNCH });
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errs=[]; p.on('pageerror', e=>errs.push(e.message));
await p.goto(BASE + '#snaptest001'); await p.waitForTimeout(700);
const ids = await p.evaluate(async()=>{ const a=await commitNode({kind:'card',x:-300,y:-100,label:'Alpha'}); const b=await commitNode({kind:'card',x:0,y:100,label:'Beta that is wider'}); await new Promise(r=>setTimeout(r,30)); setMode(true); return {a,b} });
await p.waitForTimeout(300);
const st = await p.evaluate(i=>({a:box(S.records.get(i.a)), b:box(S.records.get(i.b))}), ids);
// drag Beta so its left edge lands 4px right of Alpha's left edge, and its top 3px below Alpha's bottom + 0
const bc = await p.evaluate(i=>{ const c=center(box(S.records.get(i.b))); return toScreen(c.x,c.y) }, ids);
const dx = (st.a.x + 4) - st.b.x, dy = (st.a.y + st.a.h + 3) - st.b.y;
await p.evaluate(i=>{ S.sel=new Set([i.b]); dirty=true }, ids); await p.waitForTimeout(200);
await p.mouse.move(bc.x,bc.y); await p.mouse.down(); await p.mouse.move(bc.x+dx, bc.y+dy, {steps:10});
console.log('guides', await p.evaluate(()=>G?.guides?.map(g=>g.x!=null?'x':'y')));
await p.screenshot({path:OUT+'/snap.png'});
await p.mouse.up(); await p.waitForTimeout(500);
const en = await p.evaluate(i=>({a:box(S.records.get(i.a)), b:box(S.records.get(i.b))}), ids);
console.log('left edges', en.a.x, en.b.x, '| B top vs A bottom', en.b.y, en.a.y+en.a.h);
// ctrl held: no snapping
const bc2 = await p.evaluate(i=>{ const c=center(box(S.records.get(i.b))); return toScreen(c.x,c.y) }, ids);
await p.mouse.move(bc2.x,bc2.y); await p.mouse.down(); await p.keyboard.down('Control'); await p.mouse.move(bc2.x+3, bc2.y, {steps:4}); await p.mouse.up(); await p.keyboard.up('Control'); await p.waitForTimeout(400);
console.log('free drag x', await p.evaluate(i=>box(S.records.get(i.b)).x, ids));
console.log('errors', errs);
await b.close();
