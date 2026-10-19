'use strict';
// @module features/comment-pins — Comment pins on the canvas, preview cards and thread thumbnails
// @uses comments
// Pin position: comments on an element are stored relative to its box, so they follow it.
function pinPos(c){
  const o = S.D.off.get(c.cid) || { x: 0, y: 0 };
  let x = c.x + o.x, y = c.y + o.y;
  if (G && G.targets?.has(c.cid) && (G.kind === 'pin' || G.keyboard)){ x += G.dx; y += G.dy; }
  if (c.on){ const t = current(c.on), b = t && box(t); if (b) return { x: b.x + x, y: b.y + y }; }
  return { x, y };
}
function pinAt(sx, sy){
  for (const [id, t] of [...S.D.threads].reverse()){
    if (!threadShown(t)) continue;
    const p = pinPos(t.root), s = toScreen(p.x, p.y);
    if (Math.hypot(sx - s.x, sy - s.y + 14) < 15) return id;
  }
  if (draft){ const s = toScreen(draft.px, draft.py); if (Math.hypot(sx - s.x, sy - s.y + 14) < 15) return 'draft'; }
  return null;
}
const threadShown = t => !S.D.hidden.has(t.root.cid) && (!t.resolved || S.cmShowDone);
function drawPins(){
  const z = S.view.zoom;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pin = (s, color, label, active, faded) => {
    ctx.save(); ctx.globalAlpha = faded ? .5 : 1;
    ctx.translate(s.x, s.y - 14);
    ctx.beginPath(); ctx.moveTo(-5, 9); ctx.lineTo(0, 14); ctx.lineTo(5, 9); ctx.arc(0, 0, 11, Math.PI * 0.68, Math.PI * 2.32); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = active ? 3 : 2; ctx.strokeStyle = active ? getComputedStyle(document.documentElement).getPropertyValue('--amber').trim() : '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold 10px ${FONTS.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 0.5);
    ctx.restore();
  };
  for (const [id, t] of S.D.threads){
    if (!threadShown(t)) continue;
    const p = pinPos(t.root), s = toScreen(p.x, p.y);
    if (s.x < -20 || s.y < -20 || s.x > innerWidth + 20 || s.y > innerHeight + 40) continue;
    const n = 1 + t.replies.filter(c => !S.D.hidden.has(c.cid)).length;
    pin(s, t.resolved ? '#868e96' : authorColor(t.root.author), t.resolved ? '✓' : String(n), id === activeThread, t.resolved);
  }
  if (draft) pin(toScreen(draft.px, draft.py), authorColor(S.me.id), '+', true, false);
  if (z) {}
}
// Previews: a card beside each open pin (or just the hovered one), so comments read without opening the panel.
let hoverThread = null;
S.cmPrev = true;
function paintPreviews(){
  const box2 = $('previews'); if (!box2) return;
  const ids = [];
  for (const [id, t] of S.D.threads) if (threadShown(t) && (S.cmPrev || id === hoverThread || id === activeThread)) ids.push(id);
  const keep = new Set();
  for (const id of ids){
    const t = S.D.threads.get(id), p = pinPos(t.root), s = toScreen(p.x, p.y);
    if (s.x < -240 || s.y < -60 || s.x > innerWidth || s.y > innerHeight + 20) continue;
    keep.add(id);
    let el = box2.querySelector(`[data-id="${id}"]`);
    const replies = t.replies.filter(c => !S.D.hidden.has(c.cid)), last = replies[replies.length - 1];
    const big = id === hoverThread || id === activeThread;
    const html = `<div class="by"><b>${t.root.author === S.me?.id ? 'you' : esc(short(t.root.author))}</b><span>${new Date(t.root.t).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span></div>
      <div class="tx">${esc(t.root.text)}</div>
      ${replies.length ? `<div class="more">${replies.length} repl${replies.length > 1 ? 'ies' : 'y'}${big && last ? ` · latest from ${last.author === S.me?.id ? 'you' : esc(short(last.author))}: ${esc(last.text.slice(0, 80))}` : ''}</div>` : ''}
      ${t.resolved ? '<div class="more">resolved</div>' : ''}`;
    if (!el){ el = document.createElement('div'); el.className = 'pv'; el.dataset.id = id; el.onclick = () => openThread(id); box2.appendChild(el); }
    if (el.dataset.h !== html){ el.innerHTML = html; el.dataset.h = html; }
    el.classList.toggle('big', big); el.classList.toggle('done', t.resolved);
    el.style.setProperty('--c', authorColor(t.root.author));
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = s.x + 16, y = s.y - 30;
    if (x + w > innerWidth - 8) x = s.x - 16 - w;
    el.style.left = Math.max(8, x) + 'px'; el.style.top = Math.min(Math.max(8, y), innerHeight - h - 8) + 'px';
  }
  for (const el of [...box2.children]) if (!keep.has(el.dataset.id)) el.remove();
}
// Thumbnail of what a comment points at, drawn by the canvas renderer into a small canvas.
function drawThumb(cnv, t){
  const c = t.root, target = c.on && current(c.on), tb = target && box(target);
  const p = pinPos(c);
  const area = tb ? grow(tb, Math.max(12, Math.max(tb.w, tb.h) * 0.08)) : { x: p.x - 160, y: p.y - 90, w: 320, h: 180 };
  const W = cnv.clientWidth || 300, H = cnv.clientHeight || 96, d = Math.min(3, devicePixelRatio || 1);
  cnv.width = W * d; cnv.height = H * d;
  const k = Math.min(W / area.w, H / area.h), ox = (W - area.w * k) / 2, oy = (H - area.h * k) / 2;
  const c2 = cnv.getContext('2d'), prev = ctx;
  ctx = c2;
  try {
    c2.setTransform(d * k, 0, 0, d * k, d * (ox - area.x * k), d * (oy - area.y * k));
    for (const el of S.D.els){ if (!visible(el)) continue; const b = box(el); if (b && b.x < area.x + area.w && b.y < area.y + area.h && b.x + b.w > area.x && b.y + b.h > area.y) drawEl(el); }
    if (tb){ c2.setLineDash([4 / k, 3 / k]); c2.lineWidth = 1.5 / k; c2.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--amber').trim(); c2.strokeRect(tb.x, tb.y, tb.w, tb.h); }
    c2.setTransform(d, 0, 0, d, 0, 0);
    const s = { x: ox + (p.x - area.x) * k, y: oy + (p.y - area.y) * k };
    c2.beginPath(); c2.arc(s.x, s.y - 7, 6, 0, Math.PI * 2); c2.fillStyle = t.resolved ? '#868e96' : authorColor(c.author); c2.fill();
  } finally { ctx = prev; }
}
RENDER_HOOKS.overlay.push(drawPins);
RENDER_HOOKS.dom.push(paintPreviews);
