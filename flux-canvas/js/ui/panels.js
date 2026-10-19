'use strict';
// @module ui/panels — One host for feature side panels: a feature calls registerPanel() and gets a panel that opens one at a
// time, repaints when the canvas changes (keeping focus and anything typed), and closes on Escape
// @uses ui/icons, features/work, features/comments, features/structure, ui/ledger (to close the older panels)
const PANELS = new Map();
let panelOpen = null;
// p: { id, title, blurb, paint(body), click?(e, button), change?(e), onOpen?(), onClose?(), live?: false to skip repaint on change }
function registerPanel(p){
  const el = document.createElement('aside');
  el.className = 'ledger fx'; el.id = 'px-' + p.id; el.setAttribute('aria-label', p.title); el.style.display = 'none';
  el.innerHTML = `<header><h2><span>${esc(p.title)}</span><button class="ibtn sm" data-close aria-label="Close ${esc(p.title)}">${ic('x')}</button></h2>
    ${p.blurb ? `<div class="stats">${esc(p.blurb)}</div>` : ''}</header><div class="list fx-body"></div>`;
  document.body.appendChild(el);
  el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closePanel(); });
  el.addEventListener('pointerdown', e => e.stopPropagation());
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.hasAttribute('data-close')) return closePanel(); p.click?.(e, b); });
  el.addEventListener('change', e => p.change?.(e));
  PANELS.set(p.id, { ...p, el, body: el.querySelector('.fx-body') });
}
function openPanel(id){
  const p = PANELS.get(id); if (!p) return;
  closeOlderPanels();
  if (panelOpen && panelOpen !== id) closePanel(false);
  panelOpen = id; p.el.style.display = 'flex'; p.onOpen?.(); paintPanel(id);
  setTimeout(() => (p.el.querySelector('[data-autofocus]') || p.el.querySelector('[data-close]')).focus(), 0);
}
function closePanel(back = true){
  const p = PANELS.get(panelOpen); if (!p) return;
  p.el.style.display = 'none'; panelOpen = null; p.onClose?.();
  if (back) cv.focus({ preventScroll: true });
}
const togglePanel = id => panelOpen === id ? closePanel() : openPanel(id);
// repaint without losing what people were doing: focus, typed values and open details survive
function paintPanel(id = panelOpen){
  const p = PANELS.get(id); if (!p || panelOpen !== id) return;
  const focus = document.activeElement?.closest?.('[data-k]')?.dataset.k, vals = {}, open = new Set();
  for (const f of p.body.querySelectorAll('input[data-k],textarea[data-k],select[data-k]')) vals[f.dataset.k] = f.type === 'checkbox' ? f.checked : f.value;
  for (const d of p.body.querySelectorAll('details[data-k][open]')) open.add(d.dataset.k);
  try { p.paint(p.body); } catch (err){ console.warn('panel paint failed', err); }
  for (const f of p.body.querySelectorAll('input[data-k],textarea[data-k],select[data-k]')) if (f.dataset.k in vals && !f.hasAttribute('data-fresh')){ if (f.type === 'checkbox') f.checked = vals[f.dataset.k]; else f.value = vals[f.dataset.k]; }
  for (const d of p.body.querySelectorAll('details[data-k]')) if (open.has(d.dataset.k)) d.open = true;
  if (focus) p.body.querySelector(`[data-k="${CSS.escape(focus)}"]`)?.focus({ preventScroll: true });
}
// the side panels that predate the host close it when they open, and it closes them
function closeOlderPanels(){
  if (S.ledger) toggleLedger(false);
  if ($('comments').style.display === 'flex') toggleComments(false);
  if (ST.on) toggleStructure(false);
  if (WK.on) toggleWork(false);
}
CHANGE_HOOKS.push(() => { const p = PANELS.get(panelOpen); if (p && p.live !== false) paintPanel(); });
SYNC_HOOKS.push(() => { const p = PANELS.get(panelOpen); if (p?.sync) paintPanel(); });

/* small shared pieces for panels */
const avatar = id => `<span class="av" style="background:hsl(${authorHue(id)} 55% 30%)" aria-hidden="true">${esc(initials(id))}</span>`;
const whoName = id => id === S.me?.id ? 'You' : short(id);
const elTitle = cid => { const el = cid && current(cid); return el ? ((el.text || el.alt || el.elabel || KIND(el)).replace(/\s+/g, ' ').trim().slice(0, 70) || KIND(el)) : 'something removed'; };
function goTo(cid){ const el = current(cid); if (!el) return; S.sel = new Set([el.cid]); ensureVisible(el); announceSel(); dirty = true; }
const when = t => { const d = new Date(t); return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }); };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* canvas badges: small labels team features draw beside elements (screen pixels), clickable */
const BADGES = [];   // this frame's clickable badges: { x, y, w, h, run }
const TONE = { good: ['#e3f4ea', '#14633f'], warn: ['#fdf0dc', '#7a4404'], bad: ['#fde2e1', '#a3151f'], acc: ['#eceafd', '#4a43c9'], ink: ['#1d2129', '#ffffff'] };
function drawBadge(x, y, text, tone = null, run = null){
  ctx.font = `600 11px ${FONTS.sans}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const w = Math.ceil(ctx.measureText(text).width) + 14, [bg, fg] = tone ? TONE[tone] : [TH.panel, TH.ink];
  rr(ctx, x, y, w, 20, 10); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = tone ? fg : TH.line; ctx.globalAlpha *= tone ? .35 : 1; ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = fg; ctx.fillText(text, x + 7, y + 10.5);
  if (run) BADGES.push({ x, y, w, h: 20, run });
  return w;
}
// an element's box on screen, or null when it is off screen or hidden
function screenBox(el){
  const b = el && visible(el) && box(el); if (!b) return null;
  const a = toScreen(b.x, b.y), c = toScreen(b.x + b.w, b.y + b.h);
  if (c.x < -80 || c.y < -40 || a.x > innerWidth + 80 || a.y > innerHeight + 40) return null;
  return { x: a.x, y: a.y, w: c.x - a.x, h: c.y - a.y };
}
RENDER_HOOKS.screen.unshift(() => { BADGES.length = 0; });
POINTER_HOOKS.push(e => { const b = BADGES.find(b => e.clientX >= b.x && e.clientX <= b.x + b.w && e.clientY >= b.y && e.clientY <= b.y + b.h); if (!b) return false; b.run(e); return true; });
