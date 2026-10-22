'use strict';
// @module features/flow/sandbox — Running code people write, safely. Flow code runs in a sealed worker: no network, no
// storage, no access to the page, stopped after two seconds. Live code and result pages render in sandboxed frames laid
// over the canvas: scripts run, but the frame has no origin (it can't read the app, its keys or its storage) and its
// content policy blocks every network request. Code someone else wrote runs only after you choose to run it.
// @uses features/flow/engine
const SANDBOX_MS = 2000;
// the worker: network and storage APIs removed before the code runs; the code is a function body over `items`
const SANDBOX_SRC = `for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'Worker', 'SharedWorker', 'BroadcastChannel', 'indexedDB', 'caches', 'WebTransport', 'navigator'])
  try { Object.defineProperty(self, k, { value: undefined, configurable: false, writable: false }); } catch {}
onmessage = e => { let out, err = ''; try { out = new Function('items', '"use strict";\\n' + e.data.code)(e.data.items); } catch (x) { err = String(x && x.message || x).slice(0, 300); }
  try { postMessage({ out: JSON.parse(JSON.stringify(out === undefined ? null : out)), err }); } catch (x) { postMessage({ out: null, err: 'The result must be text, numbers, lists or plain objects' }); } };`;
function pipeSandbox(code, items, ms = SANDBOX_MS){
  return new Promise((res, rej) => {
    let w; try { w = new Worker('data:text/javascript,' + encodeURIComponent(SANDBOX_SRC)); } catch { rej(new Error('Code can’t run in this browser (workers are blocked here)')); return; }
    const t = setTimeout(() => { w.terminate(); rej(new Error(`The code ran longer than ${ms / 1000} seconds and was stopped`)); }, ms);
    w.onmessage = e => { clearTimeout(t); w.terminate(); e.data?.err ? rej(new Error(e.data.err)) : res(e.data?.out); };
    w.onerror = e => { clearTimeout(t); w.terminate(); e.preventDefault?.(); rej(new Error(e.message || 'The code failed')); };
    w.postMessage({ code: String(code), items: JSON.parse(JSON.stringify(items)) });
  });
}
// what code returns, as flow items: a list of items or strings, one string, or a number
function sandboxItems(out){
  if (out == null) return [];
  const obj = x => pipeItem(x.text == null ? { ...x, text: Object.values(x).filter(v => v != null && typeof v !== 'object').join(' · ') } : x);   // { Plan, Price } reads as its values
  if (Array.isArray(out)) return out.slice(0, PIPE_CAP.items).map(x => x && typeof x === 'object' ? obj(x) : typeof x === 'number' ? { text: fmtNum(x), n: x } : { text: String(x) });
  if (typeof out === 'object') return [obj(out)];
  return typeof out === 'number' ? [{ text: fmtNum(out), n: out }] : [{ text: String(out) }];
}
// code steps and live code by someone else wait for a yes, once per browser session
const CODE_OK = new Set();
const codeTrusted = el => !el || el.author === S.me?.id || samePerson(el.author, S.me?.id) || CODE_OK.has(dataRoot(el));
async function trustCode(els){
  const todo = els.filter(e => !codeTrusted(e)); if (!todo.length) return true;
  const who = [...new Set(todo.map(e => whoName(e.author)))].join(', ');
  const v = await formDialog('Run code written by someone else?', [{ id: 'i', type: 'info', label: `${plural(todo.length, 'code step')} here ${todo.length === 1 ? 'was' : 'were'} written by ${who}. Code runs sealed off: no network, no access to your keys, your storage or this page, and it stops after ${SANDBOX_MS / 1000} seconds.` }],
    { ok: 'Run it', why: 'Read it first if you aren’t sure: double-click a step to see its code.' });
  if (!v) return false;
  for (const e of todo) CODE_OK.add(dataRoot(e)); return true;
}

/* live frames over the canvas: one per visible live-code or page node, placed and scaled with the view */
const liveLayer = document.createElement('div'); liveLayer.id = 'liveLayer'; liveLayer.setAttribute('aria-hidden', 'false');
document.body.insertBefore(liveLayer, document.body.firstChild?.nextSibling || null);
const LIVE_FRAMES = new Map();   // node root → { frame, doc }
const LIVE_MAX = 8;
const LIVE_CSP = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:`;
// a whole document from HTML, or from JavaScript drawing on a canvas the size of the frame
function liveDoc(lang, code, w, h){
  const body = lang === 'js' ? `<canvas id="c" width="${Math.round(w)}" height="${Math.round(h)}"></canvas><script>const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');\n${String(code).replace(/<\/script/gi, '<\\/script')}\n<\/script>` : String(code);
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${LIVE_CSP}"><style>html,body{margin:0;height:100%;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d2129;background:#fff;overflow:auto}canvas{display:block}</style></head><body>${body}</body></html>`;
}
// sources: (el) → { lang, code, area: { x, y, w, h } relative to the node's box } or null
const LIVE_SOURCES = [];
function paintLiveFrames(){
  const want = new Map(), z = S.view.zoom;
  if (!S.histZ) for (const el of S.D.els){
    if (el.type !== 'NODE' || !visible(el) || S.D.hidden.has(el.cid) || want.size >= LIVE_MAX) continue;
    for (const src of LIVE_SOURCES){ const s = src(el); if (!s) continue;
      const b = box(el), a = { x: b.x + s.area.x, y: b.y + s.area.y, w: s.area.w, h: s.area.h }, p = toScreen(a.x, a.y);
      if (p.x > innerWidth || p.y > innerHeight || p.x + a.w * z < 0 || p.y + a.h * z < 0 || a.w * z < 24) continue;   // off screen or too small to read
      want.set(dataRoot(el), { el, s, a, p }); }
  }
  for (const [k, f] of LIVE_FRAMES) if (!want.has(k)){ f.frame.remove(); LIVE_FRAMES.delete(k); }
  for (const [k, { el, s, a, p }] of want){
    let f = LIVE_FRAMES.get(k);
    if (!f){ const frame = document.createElement('iframe'); frame.sandbox = 'allow-scripts'; frame.referrerPolicy = 'no-referrer'; frame.className = 'live-frame'; frame.title = `${DATA_KINDS[el.ek]?.name || 'Live'}: ${dataTitle(el)}`; liveLayer.appendChild(frame); f = { frame, doc: '' }; LIVE_FRAMES.set(k, f); }
    const doc = liveDoc(s.lang, s.code, a.w, a.h);
    if (doc !== f.doc){ f.doc = doc; f.frame.srcdoc = doc; }
    const sel = S.sel.size === 1 && S.sel.has(el.cid) && !G;
    Object.assign(f.frame.style, { left: p.x + 'px', top: p.y + 'px', width: a.w + 'px', height: a.h + 'px', transform: `scale(${z})`, pointerEvents: sel ? 'auto' : 'none' });
    f.frame.tabIndex = sel ? 0 : -1;
  }
}
RENDER_HOOKS.dom.push(paintLiveFrames);
