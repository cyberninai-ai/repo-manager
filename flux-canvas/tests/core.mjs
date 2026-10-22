// Signing, sync, persistence, tamper rejection
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ ...LAUNCH });
const ctx = await b.newContext({ viewport:{width:1200,height:800} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) });
await p.goto(BASE + '#testcanvas01');
await p.waitForTimeout(500);
const m=p.mouse;
// stroke
await m.move(200,200); await m.down(); for(let i=0;i<40;i++) await m.move(200+i*5,200+Math.sin(i/4)*30); await m.up();
// rect
await p.keyboard.down('Shift'); await m.move(500,200); await m.down(); await m.move(650,300,{steps:5}); await m.up(); await p.keyboard.up('Shift');
// circle
await p.keyboard.down('Alt'); await m.move(800,450); await m.down(); await m.move(920,560,{steps:5}); await m.up(); await p.keyboard.up('Alt');
await p.waitForTimeout(200);
// arrow from rect edge (650,250) right edge to circle
await m.move(650,250); await m.down(); await m.move(860,500,{steps:10}); await m.up();
await p.waitForTimeout(200);
// text via double tap
await m.click(300,500); await p.waitForTimeout(80); await m.click(300,500);
await p.waitForTimeout(100); await p.keyboard.type('hello-world.'); await p.keyboard.press('Enter');
await p.waitForTimeout(300);
let st = await p.evaluate(()=>({n:S.records.size, types:[...S.records.values()].map(r=>r.type+(r.neg!==null?'neg':'')), rej:S.rejected}));
console.log(JSON.stringify(st));
// lasso select rect with ctrl, then move
await p.keyboard.down('Control'); await m.move(480,180); await m.down(); for (const [x,y] of [[680,180],[680,320],[480,320],[480,180]]) await m.move(x,y,{steps:4}); await m.up(); await p.keyboard.up('Control');
console.log('sel', await p.evaluate(()=>S.sel.size));
await p.keyboard.down('Control'); await m.move(570,250); await m.down(); await m.move(570,400,{steps:5}); await m.up(); await p.keyboard.up('Control');
await p.waitForTimeout(300);
await p.screenshot({path:OUT+'/s1.png'});
// undo move, delete selection
await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
await p.keyboard.press('Delete'); await p.waitForTimeout(300);
st = await p.evaluate(()=>({n:S.records.size, hidden:S.D.hidden.size, rej:S.rejected, lam:S.lamport}));
console.log(JSON.stringify(st));
const exp = await p.evaluate(()=>canvasText(false));
console.log('export bytes', exp.length, exp.slice(0,200));
// reload & check persistence
await p.reload(); await p.waitForTimeout(800);
console.log('after reload', JSON.stringify(await p.evaluate(()=>({n:S.records.size, hidden:S.D.hidden.size, rej:S.rejected}))));
// second tab, new identity, sync
const p2 = await ctx.newPage(); p2.on('pageerror', e=>errs.push('p2 '+e.message));
await p2.goto(BASE + '#testcanvas01'); await p2.waitForTimeout(600);
await p2.evaluate(async()=>{ const c=commands().find(c=>c.t==='New identity for this tab'); await c.run(); });
await p2.mouse.move(300,650); await p2.mouse.down(); await p2.mouse.move(500,700,{steps:10}); await p2.mouse.up(); await p2.waitForTimeout(500);
console.log('p1 sees', JSON.stringify(await p.evaluate(()=>({n:S.records.size, authors:new Set([...S.records.values()].map(r=>r.author)).size}))));
// import roundtrip into fresh canvas
await p.evaluate(async(t)=>{ await importAndReport(t) }, exp);
// tamper
const r = await p.evaluate(async()=>{ const raw=[...S.records.values()].find(r=>r.type==='TEXT').raw.replace('hello','HELLO'); const before=S.rejected; await ingest(raw); return S.rejected-before });
console.log('tamper rejected', r);
await p.evaluate(()=>toggleLedger(true)); await p.waitForTimeout(200);
await p.screenshot({path:OUT+'/s2.png'});
await p.emulateMedia({colorScheme:'dark'}); await p.evaluate(()=>{toggleLedger(false);dirty=true}); await p.waitForTimeout(200); await p.screenshot({path:OUT+'/s3.png'});
console.log('errors', errs);
await b.close();
