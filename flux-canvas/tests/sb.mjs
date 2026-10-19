// Sandboxed srcdoc frame with CSP (artifact hosts)
import { BASE, BUNDLE, AXE, OUT, LAUNCH } from './env.mjs';
import { chromium } from 'playwright';
import fs from 'fs';
const html = fs.readFileSync(BUNDLE,'utf8');
const b = await chromium.launch({ ...LAUNCH });
const p = await b.newPage({viewport:{width:1000,height:700}, colorScheme:'dark'});
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text().slice(0,160)) });
// like the artifact host: sandboxed srcdoc frame, no allow-forms, CSP without blob: images
await p.route('http://localhost:9/', r=>r.fulfill({contentType:'text/html', headers:{'Content-Security-Policy':"default-src 'self' 'unsafe-inline' 'unsafe-eval' https:; img-src 'self' data: https:"},
  body:`<body style="margin:0"><iframe id=f sandbox="allow-scripts allow-same-origin allow-popups" style="border:0;width:1000px;height:700px"></iframe></body>`}));
await p.goto('http://localhost:9/');
await p.$eval('#f', (f,h)=>{ f.srcdoc=h }, html);
await p.waitForTimeout(900);
const fr = p.frames()[1];
const png = await fr.evaluate(async()=>{ const c=document.createElement('canvas'); c.width=500;c.height=300; const g=c.getContext('2d'); g.fillStyle='#ff922b'; g.fillRect(0,0,500,300); g.fillStyle='#fff'; g.font='bold 50px sans-serif'; g.fillText('PHOTO',160,170); return [...new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer())] });
await (await fr.$('#imgFile')).setInputFiles({ name:'713d0847ffa150502660a28411058e09', mimeType:'application/octet-stream', buffer: Buffer.from(png) });
await p.waitForTimeout(700);
console.log('dialog', JSON.stringify(await fr.evaluate(()=>{ const el=document.getElementById('askImg'); return {open:document.getElementById('ask').style.display, preview: el.hidden ? 'hidden' : (el.width), tag: el.tagName} })));
await p.screenshot({path:OUT+'/sb-dialog.png'});
await fr.click('#ask button:last-child'); await p.waitForTimeout(800);
console.log('after OK', JSON.stringify(await fr.evaluate(()=>({open:document.getElementById('ask').style.display, images:[...S.records.values()].filter(r=>r.type==='IMAGE').length}))));
await p.screenshot({path:OUT+'/sb-after.png'});
console.log('errors', errs);
await b.close();
