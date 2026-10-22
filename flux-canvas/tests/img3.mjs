// Image formats sniffed from bytes
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ ...LAUNCH });
const p = await b.newPage({viewport:{width:1100,height:750}, colorScheme:'dark'});
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) });
await p.goto(BASE + '#img3test001'); await p.waitForTimeout(600);
// build sample bytes in page
const samples = await p.evaluate(async()=>{ const out={};
  const c=document.createElement('canvas'); c.width=640; c.height=420; const g=c.getContext('2d');
  const gr=g.createLinearGradient(0,0,640,420); gr.addColorStop(0,'#ff922b'); gr.addColorStop(1,'#5c7cfa'); g.fillStyle=gr; g.fillRect(0,0,640,420); g.fillStyle='#fff'; g.font='bold 60px sans-serif'; g.fillText('FILE',220,230);
  for (const t of ['image/png','image/jpeg','image/webp']) out[t]=[...new Uint8Array(await (await new Promise(r=>c.toBlob(r,t,.9))).arrayBuffer())];
  out['svg']=[...new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><rect width="200" height="120" fill="#2f9e44"/><circle cx="100" cy="60" r="40" fill="#fff"/></svg>')];
  out['junk']=[...crypto.getRandomValues(new Uint8Array(500))];
  return out; });
const toast = () => p.evaluate(()=>document.getElementById('toast').textContent);
let i=0;
for (const [k, bytes] of Object.entries(samples)) {
  await p.setInputFiles('#imgFile', { name: '713d0847ffa150502660a28411058e0'+(i++), mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  await p.waitForTimeout(500);
  const dlg = await p.evaluate(()=>({open:document.getElementById('ask').style.display==='block', preview: !document.getElementById('askImg').hidden && document.getElementById('askImg').width, val: document.getElementById('askIn').value}));
  if (k==='png') await p.screenshot({path:OUT+'/dialog.png'});
  if (dlg.open){ await p.keyboard.type(k+' sample'); await p.keyboard.press('Enter'); await p.waitForTimeout(500); }
  const last = await p.evaluate(()=>{ const r=[...S.records.values()].filter(r=>r.type==='IMAGE').pop(); return r && { t: S.imgs.get(r.f.R)?.constructor?.name || S.imgs.get(r.f.R), alt:r.alt } });
  console.log(k.padEnd(10), JSON.stringify(dlg), JSON.stringify(last), dlg.open ? '' : '| toast: '+await toast());
  await p.keyboard.press('Escape');
}
await p.evaluate(()=>zoomFit()); await p.waitForTimeout(300); await p.screenshot({path:OUT+'/img3.png'});
await p.reload(); await p.waitForTimeout(1200);
console.log('after reload', JSON.stringify(await p.evaluate(()=>[...S.records.values()].filter(r=>r.type==='IMAGE').map(r=>S.imgs.get(r.f.R)?.constructor?.name || S.imgs.get(r.f.R)))));
console.log('errors', errs);
await b.close();
