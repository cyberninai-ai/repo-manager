'use strict';
// @module features/story — Story building: storyboard template, the story order of frames (connectors first, then reading
// order) and Present mode, which flies from frame to frame. Example: a storyboard with illustrations.
// @uses hooks, builders, diagrams

function storyOrder(){
  const frames = S.D.els.filter(e => e.type === 'NODE' && e.ek === 'frame' && visible(e) && !S.D.hidden.has(e.cid));
  if (!frames.length) return [];
  const ids = new Set(frames.map(f => f.cid)), next = new Map(), hasIn = new Set();
  const join = (a, b) => { if (a && b && a !== b && ids.has(a) && ids.has(b) && !next.has(a) && !hasIn.has(b)){ next.set(a, b); hasIn.add(b); } };
  for (const el of S.D.els) if (el.type === 'ARROW' && visible(el)) join(current(el.f.FROM)?.cid, current(el.f.TO)?.cid);
  for (const f of frames) if (f.parent) join(current(f.parent)?.cid, f.cid);
  const reading = frames.slice().sort((a, b) => { const A = box(a), B = box(b); return Math.abs(A.y - B.y) > Math.min(A.h, B.h) / 2 ? A.y - B.y : A.x - B.x; });
  const order = [], seen = new Set();
  for (const f of reading){ if (seen.has(f.cid) || hasIn.has(f.cid)) continue; let c = f.cid; while (c && !seen.has(c)){ order.push(c); seen.add(c); c = next.get(c); } }
  for (const f of reading) if (!seen.has(f.cid)) order.push(f.cid);
  return order;
}

let show = null;   // { order, i, back }
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function flyTo(b){
  const pad = 60, availH = innerHeight - 90;
  const z = clampZ(Math.min((innerWidth - pad * 2) / b.w, (availH - pad) / b.h, 2.5));
  const to = { zoom: z, x: b.x + b.w / 2 - innerWidth / 2 / z, y: b.y + b.h / 2 - availH / 2 / z };
  if (reduceMotion()){ S.view = to; dirty = true; return; }
  const from = { ...S.view }, t0 = performance.now(), d = 420;
  const step = now => { const k = Math.min(1, (now - t0) / d), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    S.view = { zoom: from.zoom + (to.zoom - from.zoom) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }; dirty = true; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function sceneText(f){
  const fb = box(f);
  return S.D.els.filter(el => el !== f && (el.type === 'NODE' || el.type === 'TEXT') && el.ek !== 'image' && visible(el) && inside(center(box(el)), fb))
    .map(el => el.text).filter(Boolean).join(' · ');
}
function goScene(i){
  if (!show) return;
  show.i = Math.max(0, Math.min(show.order.length - 1, i));
  const f = S.records.get(show.order[show.i]); if (!f) return;
  flyTo(box(f));
  const cap = sceneText(f);
  $('presentT').textContent = f.text; $('presentN').textContent = `${show.i + 1} / ${show.order.length}`;
  $('presentCap').textContent = cap;
  say(`Scene ${show.i + 1} of ${show.order.length}: ${f.text}. ${cap}`);
}
function present(){
  const order = storyOrder();
  if (!order.length){ toast('Add frames first (◇ → ▯ screen frame), or start from the Storyboard template.'); return; }
  const sel = S.sel.size === 1 ? current([...S.sel][0])?.cid : null;
  show = { order, i: Math.max(0, order.indexOf(sel)), back: { ...S.view } };
  S.sel.clear(); finishText(true);
  document.body.classList.add('presenting'); $('present').hidden = false;
  goScene(show.i); setTimeout(() => $('presentNext').focus(), 0);
}
function endPresent(){
  if (!show) return;
  S.view = show.back; show = null; dirty = true;
  document.body.classList.remove('presenting'); $('present').hidden = true; cv.focus({ preventScroll: true });
  say('Presentation ended.');
}
function presentKeys(e, c){   // while presenting, the keyboard drives the story and nothing else
  if (!show){ if (e.key === 'F5' || (c.onCanvas && !c.mod && !e.altKey && e.key === 'P' && e.shiftKey)){ e.preventDefault(); present(); return true; } return false; }
  const k = e.key;
  if (e.target.closest?.('#present') && e.target.tagName === 'BUTTON' && (k === 'Enter' || k === ' ')) return false;   // the focused button acts
  if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(k)){ e.preventDefault(); goScene(show.i + 1); }
  else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)){ e.preventDefault(); goScene(show.i - 1); }
  else if (k === 'Home'){ e.preventDefault(); goScene(0); }
  else if (k === 'End'){ e.preventDefault(); goScene(show.order.length - 1); }
  else if (k === 'Escape'){ e.preventDefault(); endPresent(); }
  else if (k === 'Tab') return false;
  return true;
}
KEY_HOOKS.unshift(presentKeys);
POINTER_HOOKS.unshift(() => { if (!show) return false; goScene(show.i + 1); return true; });
$('presentPrev').onclick = () => goScene(show.i - 1);
$('presentNext').onclick = () => goScene(show.i + 1);
$('presentEnd').onclick = endPresent;
PALETTE_HOOKS.push(add => add('story', 'Present frames as a story', present, { k: 'F5 · ⇧P' }));

const SCENES_TPL = [['1 · Setup', 'Who is it about, and where are they?'], ['2 · Trigger', 'What changes?'], ['3 · Struggle', 'What gets in the way?'], ['4 · Turn', 'What do they discover?'], ['5 · Resolution', 'How does it end, and what is different now?']];
async function storyboard(c, scenes, art = null){
  const W = 330, H = 320, gap = 90, x0 = c.x - (scenes.length * (W + gap) - gap) / 2, y0 = c.y - H / 2, frames = [];
  for (const [i, [title, caption]] of scenes.entries()){
    const x = x0 + i * (W + gap), f = await mk('frame', x, y0, title, { W, H, color: 'violet' });
    const img = art ? await scene(art[i][0], art[i][1], x + 16, y0 + 44, W - 32, 170, art[i][2]) : await mk('image', x + 16, y0 + 44, 'Sketch the scene', { W: W - 32, H: 170 });
    const cap = await mk('card', x + 16, y0 + 228, caption, { W: W - 32 });
    await groupAll([f, img, cap]); frames.push(f);
  }
  for (let i = 1; i < frames.length; i++) await link(frames[i - 1], frames[i]);
  return frames;
}
TEMPLATES.push({ id: 'story', name: 'Storyboard', icon: '▤', blurb: 'Five connected scenes with a sketch and a caption each. Present with F5.', build: c => storyboard(c, SCENES_TPL) });
EXAMPLES.push({ id: 'onboarding', title: 'Onboarding story — Maya’s first week', icon: '▤', blurb: 'A five-scene storyboard with illustrations and comments. Press F5 to present it.', build: async ([ana, ben, chen]) => {
  const c = center0();
  const art = [
    ['room', ['#f1e7d8', '#c9b79c', '#7aa2c4', '#8c6b4f', '#2f4858', '#f7c873'], 'Maya at her new desk, morning light'],
    ['people', ['#e8eef7', '#f4a261', '#2a9d8f', '#e76f51', '#264653'], 'Three teammates waving hello'],
    ['dunes', ['#fbe3c4', '#f2c48d', '#e09f5c', '#c97b3d', '#8c4f24'], 'A desert of unread documentation'],
    ['dusk', ['#283c63', '#928a97', '#f88f01', '#fbe8d3', '#3d5a80', '#293241', '#1b263b'], 'Sunset over hills: the moment it clicks'],
    ['sea', ['#a8dadc', '#e6f4f1', '#457b9d', '#1d3557', '#f1faee'], 'Calm sea: settled in, shipping'],
  ];
  const scenes = [['1 · Monday', 'Maya joins. Laptop works, accounts don’t yet.'], ['2 · The team', 'A buddy and a 30-minute tour beat a 40-page wiki.'],
    ['3 · Docs desert', 'Too many docs, no path. She asks in five channels.'], ['4 · First PR', 'A starter task with a real reviewer: it clicks.'], ['5 · Friday', 'She ships a fix and writes the guide she wished she had.']];
  const frames = await by(ana, () => storyboard(c, scenes, art));
  await tick();
  const t = await by(ben, () => noteOn(frames[2], 'This is the scene to fix first. One “start here” page?'));
  await by(chen, () => replyTo(t, 'And a buddy assigned before day one.'));
  await by(chen, () => setReact(frames[3], 'love', true));
} });
