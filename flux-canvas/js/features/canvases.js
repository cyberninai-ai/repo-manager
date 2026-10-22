'use strict';
// @module features/canvases — Canvas titles (META), the canvas home (your canvases, templates, worked examples), example authors
// @uses hooks, records, keyboard (switchCanvas), ui/dialogs

// META-I-{author}-R-{canvasId}-M-{title}-K-{template}-Z-T-SIG — latest wins; anyone may retitle (audit S2)
registerRecord('META', { parse(r, f){ if (!f.R) throw Error('meta'); r.title = decTxt(f.M || ''); r.tpl = f.K || ''; }, inherit: false });
DERIVE_HOOKS.push((D, by) => {
  let m = null;
  for (const r of by.META || []) if (r.f.R === canvasId) m = r;   // z order: the last is the latest
  D.meta = m ? { title: m.title, tpl: m.tpl, author: m.author } : null;
  paintTitle();
});
const canvasTitle = () => S.D.meta?.title || 'Untitled canvas';
function paintTitle(){
  const t = canvasTitle();
  if ($('ctitle').textContent !== t) $('ctitle').textContent = t;
  document.title = `${t} · Flux Canvas`;
  const empty = !S.D.els.some(el => visible(el));
  $('empty').hidden = !empty || !!S.touched;
}
async function setTitle(title, tpl = S.D.meta?.tpl || ''){
  title = String(title).trim().slice(0, 120); if (!title) return;
  await publish(await signed('META', [['I', S.me.id], ['R', canvasId], ['M', encTxt(title)], ['K', tpl || 'blank'], ['Z', ++S.lamport], ['T', Date.now()]]));
}
async function renameCanvas(){
  const v = await ask('Canvas title', S.D.meta?.title || '', 'Shown in the title bar, the canvas list and exports.');
  if (v && v.trim()){ await setTitle(v); say(`Canvas renamed “${v.trim()}”.`); }
}

/* example authors: three stable keys, so an example reads like real collaboration and is never mistaken for your work */
const EXAMPLE_NAMES = ['Ana', 'Ben', 'Chen'];
let exampleKeys = null;
async function exampleAuthors(){
  if (exampleKeys) return exampleKeys;
  const keep = keys => { exampleKeys = keys; keys.forEach((k, i) => NAMES.set(k.id, EXAMPLE_NAMES[i])); store.set('flux:exampleIds', JSON.stringify(keys.map(k => k.id))); return keys; };
  const kept = await Promise.all([0, 1, 2].map(i => dbGet('keys', 'example:' + i)));
  if (kept.every(k => k?.priv)) return keep(kept);
  let saved = null; try { saved = JSON.parse(localStorage.getItem('flux:exampleKeys') || 'null'); } catch {}   // older versions kept JWKs
  let keys = null;
  if (Array.isArray(saved) && saved.length === 3) try { keys = await Promise.all(saved.map(restoreIdentity)); } catch {}
  if (!keys){ keys = []; for (let i = 0; i < 3; i++) keys.push(await newIdentity(!DB.ok)); }
  let stored = true; for (let i = 0; i < 3; i++) stored = await keepIdentity(keys[i], 'example:' + i) && stored;
  if (stored) try { localStorage.removeItem('flux:exampleKeys'); } catch {}
  else if (keys[0].jwk) store.set('flux:exampleKeys', JSON.stringify(keys.map(m => ({ alg: m.alg, id: m.id, jwk: m.jwk }))));
  return keep(keys);
}
// names for example authors are known on every load, so reopened examples still read "Ana", not a key fragment
try { for (const key of ['flux:exampleIds', 'flux:exampleKeys']) (JSON.parse(localStorage.getItem(key) || '[]') || []).forEach((k, i) => { const id = typeof k === 'string' ? k : k?.id; if (id) NAMES.set(id, EXAMPLE_NAMES[i]); }); } catch {}
// Sign everything inside fn as another identity (examples only).
async function asAuthor(me, fn){ const prev = S.me; S.me = me; try { return await fn(); } finally { S.me = prev; } }

/* canvas list: summaries kept beside the record log (and any canvases older versions left in localStorage) */
async function canvasList(){
  const out = new Map();
  for (const c of await dbAll('canvases')) out.set(c.id, { id: c.id, title: c.title, n: c.n, last: c.last });
  try {
    for (let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i); if (!key || !key.startsWith('flux:canvas:')) continue;
      const id = key.slice(12); if (out.has(id)) continue; let title = '', n = 0, last = 0;
      for (const l of (localStorage.getItem(key) || '').split('\n')){
        if (!l || l.startsWith('BLOB-')) continue; n++;
        const t = l.match(/-T-(\d{10,})-SIG-/); if (t) last = Math.max(last, +t[1]);
        if (l.startsWith('META-') && l.includes(`-R-${id}-`)){ const m = l.match(/-M-([^-.]*)/); if (m) title = decTxt(m[1]); }
      }
      out.set(id, { id, title, n, last });
    }
  } catch {}
  const cur = out.get(canvasId);
  if (cur){ cur.title = S.D.meta?.title || cur.title; cur.n = S.records.size; cur.current = true; }
  else out.set(canvasId, { id: canvasId, title: S.D.meta?.title || '', n: S.records.size, last: Date.now(), current: true });
  return [...out.values()].filter(c => c.n || c.current).sort((a, b) => (!!b.current - !!a.current) || b.last - a.last);
}
const ago = t => { if (!t) return 'empty'; const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString(); };

// a new canvas you own (core/permissions): an id derived from your key, claimed with an OWNER record
async function createOwnedCanvas(){
  const { nonce, id } = await ownedCanvasId();
  await switchCanvas(id); await claimCanvas(nonce);
  return id;
}

/* the canvas home */
const CARD_ICONS = { blank: ['plus', 'slate'], brainstorm: ['sparkle', 'amber'], offsite: ['sparkle', 'amber'], mindmap: ['mindmap', 'violet'], flow: ['flow', 'blue'],
  wire: ['wire', 'slate'], feedback: ['columns', 'green'], retro: ['columns', 'green'], moodboard: ['palette', 'pink'], brand: ['palette', 'pink'],
  story: ['film', 'orange'], onboarding: ['film', 'orange'], audit: ['audit', 'teal'], expense: ['audit', 'teal'] };
let homeBack = null;
function openHome(){
  homeBack = document.activeElement;
  const card = (attr, x) => { const i = CARD_ICONS[x.id] || ['blank', 'slate'];
    return `<button class="card2 h-${i[1]}" ${attr}><span class="cic" aria-hidden="true">${face(ICON_NAMES.has(i[0]) ? i[0] : x.icon)}</span><b>${esc(x.name || x.title)}</b><span>${esc(x.blurb)}</span></button>`; };
  $('homeTpl').innerHTML = TEMPLATES.map(t => card(`data-tpl="${t.id}"`, t)).join('');
  $('homeEx').innerHTML = EXAMPLES.map(x => card(`data-ex="${x.id}"`, x)).join('');
  $('homeList').innerHTML = '';
  canvasList().then(list => { $('homeList').innerHTML = list.map(c => `<li${c.current ? ' class="cur"' : ''}>
      <button class="open" data-open="${c.id}"><b>${esc(c.title || 'Untitled canvas')}</b><span>${c.n} record${c.n === 1 ? '' : 's'} · ${ago(c.last)}${c.current ? ' · open now' : ''}</span></button>
      ${c.current ? '' : `<button class="btn danger" data-rm="${c.id}" aria-label="Remove ${esc(c.title || 'untitled canvas')} from this browser">remove</button>`}</li>`).join(''); });
  $('home').hidden = false;
  setTimeout(() => ($('homeTpl').querySelector('button') || $('homeClose')).focus(), 0);
  say('Canvas home. Start from a template, open an example, or reopen one of your canvases.');
}
function closeHome(){ $('home').hidden = true; (homeBack && document.contains(homeBack) && homeBack !== document.body ? homeBack : cv).focus({ preventScroll: true }); }
async function newCanvasFrom(tpl){
  closeHome();
  await createOwnedCanvas();
  await setTitle(tpl.id === 'blank' ? 'Untitled canvas' : tpl.name, tpl.id);
  S.view = { x: -innerWidth / 2, y: -innerHeight / 2, zoom: 1 };
  if (tpl.build) await tpl.build(viewCenter());
  await new Promise(r => setTimeout(r, 0));
  if (tpl.id !== 'blank') zoomFit();
  if (tpl.id !== 'blank') setTool('select', true);
  dirty = true; toast(`New canvas · ${tpl.name}`);
}
async function openExample(x){
  closeHome();
  await createOwnedCanvas();
  const A = await exampleAuthors();
  S.view = { x: -innerWidth / 2, y: -innerHeight / 2, zoom: 1 };
  await asAuthor(A[0], () => setTitle(x.title, 'example:' + x.id));
  await x.build(A);
  S.hist = []; S.redo = []; S.sel.clear();
  changed();   // re-derive as you: views painted while examples signed as Ana, Ben or Chen (e.g. votes left) must be yours
  await new Promise(r => setTimeout(r, 0));
  zoomFit(); dirty = true;
  setTool('select', true);
  toast(`An example made by ${EXAMPLE_NAMES.join(', ')} · explore, vote and comment`);
}
$('home').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'homeClose') return closeHome();
  if (b.dataset.tpl) return newCanvasFrom(TEMPLATES.find(t => t.id === b.dataset.tpl));
  if (b.dataset.ex) return openExample(EXAMPLES.find(x => x.id === b.dataset.ex));
  if (b.dataset.open){ closeHome(); if (b.dataset.open !== canvasId){ await switchCanvas(b.dataset.open); zoomFit(); } return; }
  if (b.dataset.rm){
    if (b.dataset.armed !== '1'){ b.dataset.armed = '1'; b.textContent = 'confirm remove'; b.setAttribute('aria-label', 'Confirm removing this canvas from this browser'); return; }
    try { localStorage.removeItem('flux:canvas:' + b.dataset.rm); } catch {}
    await dbDeleteCanvas(b.dataset.rm);
    b.closest('li').remove(); say('Removed from this browser. Copies other people hold are unaffected.');
  }
});
$('home').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeHome(); });
$('homeBtn').onclick = openHome;
$('ctitle').onclick = renameCanvas;
$('emptyBtn').onclick = openHome;

TEMPLATES.push(
  { id: 'blank', name: 'Blank canvas', icon: '◻', blurb: 'An empty page. Draw, write, diagram.' },
  { id: 'mindmap', name: 'Mind map', icon: '✺', blurb: 'A central idea with branches. Tab adds children.', build: () => insertTemplate('mindmap') },
  { id: 'flow', name: 'Flowchart', icon: '⇣', blurb: 'Start, steps and a decision, connected.', build: () => insertTemplate('flow') },
  { id: 'wire', name: 'Wireframe', icon: '▯', blurb: 'A mobile sign-in screen to iterate on.', build: () => insertTemplate('mobile') },
);
PALETTE_HOOKS.push(add => {
  add('canvas', 'Canvases, templates and examples…', openHome, { k: 'H' });
  add('canvas', 'Rename canvas…', renameCanvas);
  for (const t of TEMPLATES) add('canvas', `New canvas · ${t.name}`, () => newCanvasFrom(t));
  for (const x of EXAMPLES) add('examples', `Open example · ${x.title}`, () => openExample(x));
});
KEY_HOOKS.push((e, c) => { if (c.onCanvas && !c.mod && !e.altKey && !e.shiftKey && c.k === 'h'){ e.preventDefault(); openHome(); return true; } return false; });
