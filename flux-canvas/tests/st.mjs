// Restyling existing lines; text up to 400
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import fs from 'fs';
const axe = fs.readFileSync(AXE,'utf8');
const b = await chromium.launch({ ...LAUNCH });
const ctx = await b.newContext({ viewport:{width:1200,height:780} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) });
await p.goto(BASE + '#sttest00001'); await p.waitForTimeout(600);
const W = (t=250)=>p.waitForTimeout(t);
const sr = () => p.evaluate(()=>document.getElementById('sr').textContent);
const slide = async (id, vals) => { for (const v of vals){ await p.$eval('#'+id, (el,v)=>{ el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); }, v); await W(50); } await p.$eval('#'+id, el=>el.dispatchEvent(new Event('change',{bubbles:true}))); };
// two old strokes + a rect + an arrow, drawn at width 4
for (const y of [200, 300]) { await p.mouse.move(200,y); await p.mouse.down(); await p.mouse.move(450,y+40,{steps:10}); await p.mouse.up(); await W(); }
await p.evaluate(async()=>{ const r=await commitShape('rect',{x:-50,y:-150},{x:150,y:-50}); });
await W();
const lines = await p.evaluate(()=>S.D.els.filter(e=>e.type!=='TEXT').map(e=>[e.type, lw(e)]));
console.log('before', JSON.stringify(lines));
// select all old lines and drag brush to 24
await p.evaluate(()=>{ S.sel=new Set(S.D.els.map(e=>e.cid)); dirty=true }); await W();
console.log('bar label:', await p.evaluate(()=>document.getElementById('brushTgt').textContent));
await slide('brush', [8,14,20,24]);
console.log('live preview', JSON.stringify(await p.evaluate(()=>S.D.els.map(e=>lw(e)))));
await W(800);
console.log('after settle', JSON.stringify(await p.evaluate(()=>({w:S.D.els.map(e=>[e.type,lw(e)]), styles:[...S.records.values()].filter(r=>r.type==='STYLE').length}))), '|', await sr());
// keys ] with selection
await p.evaluate(()=>document.getElementById('c').focus()); await p.keyboard.press(']'); await W(800);
console.log('] ->', JSON.stringify(await p.evaluate(()=>S.D.els.map(e=>lw(e)))));
// recolour selection
await p.click('#barColors [data-c="blue"]'); await W(400);
console.log('recolour ->', JSON.stringify(await p.evaluate(()=>S.D.els.map(e=>ecol(e)))), '|', await sr());
// undo recolour, undo width
await p.evaluate(()=>document.getElementById('c').focus());
await p.keyboard.press('Control+z'); await W(300);
console.log('undo colour ->', JSON.stringify(await p.evaluate(()=>S.D.els.map(e=>ecol(e)))));
await p.keyboard.press('Control+z'); await W(300);
console.log('undo ] ->', JSON.stringify(await p.evaluate(()=>S.D.els.map(e=>lw(e)))));
// hit testing follows the new width: point 10px off the stroke centre
// nothing selected: brush only for new
await p.evaluate(()=>{ S.sel.clear(); dirty=true }); await slide('brush',[30]); await W(600);
await p.mouse.move(200,450); await p.mouse.down(); await p.mouse.move(450,480,{steps:10}); await p.mouse.up(); await W(300);
console.log('new stroke width', await p.evaluate(()=>[...S.records.values()].filter(r=>r.type==='DRAW').pop().w), 'old unchanged', JSON.stringify(await p.evaluate(()=>S.D.els.slice(0,3).map(e=>lw(e)))));
// big text 300, two texts resized together
await p.evaluate(async()=>{ await commitText({x:-500,y:-300},'Huge'); await commitText({x:-500,y:100},'Also'); }); await W();
await p.evaluate(()=>{ S.sel=new Set(S.D.els.filter(e=>e.type==='TEXT'&&visible(e)).map(e=>e.cid)); dirty=true }); await W();
console.log('text label', await p.evaluate(()=>document.getElementById('tsizeTgt').textContent));
await slide('tsize', [100,200,300]); await W(900);
console.log('texts', JSON.stringify(await p.evaluate(()=>S.D.els.filter(e=>e.type==='TEXT'&&visible(e)).map(e=>[e.text,e.fs]))), 'sel', await p.evaluate(()=>S.sel.size), '|', await sr());
// another author cannot restyle my lines
const p2 = await ctx.newPage(); await p2.goto(BASE + '#sttest00001'); await p2.waitForTimeout(800);
await p2.evaluate(async()=>{ await commands().find(c=>c.t==='New identity for this tab').run(); S.sel=new Set(S.D.els.map(e=>e.cid)); setBrush(60,true); });
await p2.waitForTimeout(800);
console.log('tab2 toast:', await p2.evaluate(()=>document.getElementById('toast').textContent), '| widths', JSON.stringify(await p2.evaluate(()=>S.D.els.filter(e=>e.type==='DRAW').map(e=>lw(e)))));
// forged STYLE from tab2 on my stroke is ignored by derive
await p2.evaluate(async()=>{ const d=S.D.els.find(e=>e.type==='DRAW'); await commitStyle(d.cid,{W:70}); }); await p.waitForTimeout(500);
console.log('forged style ignored on tab1', await p.evaluate(()=>S.D.els.filter(e=>e.type==='DRAW').map(e=>lw(e))));
// reload keeps styles
await p.reload(); await p.waitForTimeout(1000);
console.log('reload', JSON.stringify(await p.evaluate(()=>({w:S.D.els.map(e=>[e.type,lw(e)]), rej:S.rejected}))));
await p.screenshot({path:OUT+'/st.png'});
await p.addScriptTag({content: axe});
console.log('axe', JSON.stringify(await p.evaluate(async()=> (await axe.run(document,{resultTypes:['violations']})).violations.map(v=>v.id))));
console.log('errors', errs);
await b.close();
