// Comments and text editing
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import fs from 'fs';
const axe = fs.readFileSync(AXE,'utf8');
const b = await chromium.launch({ ...LAUNCH });
const ctx = await b.newContext({ viewport:{width:1200,height:780} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) });
await p.goto(BASE + '#cmtest00001'); await p.waitForTimeout(600);
const sr = () => p.evaluate(()=>document.getElementById('sr').textContent);
const W = ()=>p.waitForTimeout(250);
// T tool → click → type
await p.click('#textBtn'); await p.mouse.click(300,200); await W(); await p.keyboard.type('Draft title'); await p.keyboard.press('Enter'); await W();
// a rect, then an arrow from rect to text via select+C
await p.mouse.click(600,600); // focus canvas (dot after delay)
await p.waitForTimeout(500);
await p.keyboard.press('r'); await W();
const ids = await p.evaluate(()=>({t:[...S.records.values()].find(r=>r.type==='TEXT').cid, r:[...S.records.values()].find(r=>r.type==='SHAPE').cid}));
await p.evaluate(i=>{ S.sel=new Set([i.r,i.t]) }, ids); await p.keyboard.press('c'); await W();
// edit text: select it & Enter
await p.evaluate(i=>{ S.sel=new Set([i.t]) }, ids); await p.keyboard.press('Enter'); await W();
await p.keyboard.type('Final title'); await p.keyboard.press('Enter'); await W();
let st = await p.evaluate(()=>({texts:S.D.els.filter(e=>e.type==='TEXT'&&visible(e)).map(e=>e.text), superseded:S.D.superseded.size, arrowVisible:S.D.els.filter(e=>e.type==='ARROW'&&visible(e)).length}));
console.log('edit', JSON.stringify(st), '|', await sr());
await p.keyboard.press('Control+z'); await W();
console.log('undo edit', JSON.stringify(await p.evaluate(()=>S.D.els.filter(e=>e.type==='TEXT'&&visible(e)).map(e=>e.text))));
await p.keyboard.press('Control+Shift+z'); await W();
// comment tool on the rect
const rb = await p.evaluate(i=>{ const r=S.records.get(i.r), b=box(r); return toScreen(b.x+b.w-5, b.y+b.h/2) }, ids);
await p.click('#cmtBtn'); await p.mouse.click(rb.x, rb.y); await W();
console.log('composer focus:', await p.evaluate(()=>document.activeElement.id), '|', await p.evaluate(()=>document.querySelector('.compose label')?.textContent));
await p.keyboard.type('Is this the right size?'); await p.keyboard.press('Enter'); await W();
console.log('posted:', await sr());
// reply
await p.keyboard.type('Make it wider'); await p.keyboard.press('Enter'); await W();
// free comment via M with nothing selected (focus canvas)
await p.evaluate(()=>{ S.sel.clear(); toggleComments(false); document.getElementById('c').focus() });
await p.keyboard.press('m'); await W(); await p.keyboard.type('General note'); await p.keyboard.press('Enter'); await W();
st = await p.evaluate(()=>[...S.D.threads.values()].map(t=>({on:t.root.on?describe(current(t.root.on)):'canvas', n:1+t.replies.length, resolved:t.resolved})));
console.log('threads', JSON.stringify(st), 'badge', await p.evaluate(()=>document.getElementById('cmtN').textContent));
// move rect: pin must follow
const pinBefore = await p.evaluate(i=>{ const t=[...S.D.threads.values()].find(t=>t.root.on===i.r); return pinPos(t.root) }, ids);
await p.evaluate(async i=>{ await commitMove(i.r, 120, 40) }, ids); await W();
const pinAfter = await p.evaluate(i=>{ const t=[...S.D.threads.values()].find(t=>t.root.on===i.r); return pinPos(t.root) }, ids);
console.log('pin follows', pinAfter.x-pinBefore.x, pinAfter.y-pinBefore.y);
// click the pin opens thread
const ps = await p.evaluate(()=>toScreen(pinAfter_x=0,0));
const pinScreen = await p.evaluate(i=>{ const t=[...S.D.threads.values()].find(t=>t.root.on===i.r); const q=pinPos(t.root); return toScreen(q.x,q.y) }, ids);
await p.evaluate(()=>toggleComments(false)); await W();
await p.mouse.click(pinScreen.x, pinScreen.y-14); await W();
console.log('pin click ->', await p.evaluate(()=>({open:document.getElementById('comments').style.display, active:activeThread!=null, focus:document.activeElement.dataset.k?'reply box':document.activeElement.tagName})));
await p.screenshot({path:OUT+'/cm1.png'});
// resolve
await p.click('.thread.active button[data-a="resolve"]'); await W();
console.log('resolved badge', await p.evaluate(()=>document.getElementById('cmtN').textContent), '|', await sr());
// second author: tab 2 sees comments, can't edit my text, can reply; draft preserved on tab1 while typing
const p2 = await ctx.newPage(); await p2.goto(BASE + '#cmtest00001'); await p2.waitForTimeout(800);
await p2.evaluate(async()=>{ await commands().find(c=>c.t==='New identity for this tab').run(); });
console.log('tab2 threads', await p2.evaluate(()=>S.D.threads.size));
await p2.evaluate(()=>{ const t=S.D.els.find(e=>e.type==='TEXT'&&visible(e)); editText(t) }); await p2.waitForTimeout(200);
console.log('tab2 edit others text ->', await p2.evaluate(()=>document.getElementById('toast').textContent));
// tab1 typing a reply in open general thread while tab2 posts
const gid = await p.evaluate(()=>[...S.D.threads.entries()].find(([,t])=>!t.root.on)[0]);
await p.evaluate(id=>openThread(id), gid); await W();
await p.keyboard.type('half-typed');
await p2.evaluate(async id=>{ await commitComment({x:0,y:0,text:'from author two',re:id}) }, gid); await p.waitForTimeout(500);
console.log('draft kept:', await p.evaluate(()=>({v:document.activeElement.value, k:document.activeElement.dataset.k?'ok':'lost'})), 'msgs', await p.evaluate(id=>1+S.D.threads.get(id).replies.length, gid));
// delete own comment
await p.evaluate(()=>{ S.cmShowDone=true; paintComments() });
// axe with comments panel open
await p.addScriptTag({content: axe});
console.log('axe', JSON.stringify(await p.evaluate(async()=> (await axe.run(document,{resultTypes:['violations']})).violations.map(v=>v.id+': '+v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(' | ')))));
await p.screenshot({path:OUT+'/cm2.png'});
// persistence + export roundtrip
await p.reload(); await p.waitForTimeout(1000);
console.log('reload', JSON.stringify(await p.evaluate(()=>({threads:S.D.threads.size, rej:S.rejected, text:S.D.els.filter(e=>e.type==='TEXT'&&visible(e)).map(e=>e.text)}))));
console.log('errors', errs);
await b.close();
