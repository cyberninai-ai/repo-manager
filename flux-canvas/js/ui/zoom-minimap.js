'use strict';
// @module ui/zoom-minimap — Zoom controls and the overview map
// @uses renderer
/* ---------- zoom controls and overview map ---------- */
let miniOn = false;   // the overview is on demand (▣); remembered per browser
try { if (localStorage.getItem('flux:mini') === '1') miniOn = true; } catch {}
function zoomTo(z, at = viewCenter()){
  z = clampZ(z); const s = toScreen(at.x, at.y);
  S.view = { zoom: z, x: at.x - s.x / z, y: at.y - s.y / z }; dirty = true; say(`Zoom ${Math.round(z * 100)} percent`);
}
$('zIn').onclick = () => zoomTo(S.view.zoom * 1.25);
$('zOut').onclick = () => zoomTo(S.view.zoom / 1.25);
$('zPct').onclick = () => zoomTo(1);
$('zFit').onclick = () => { zoomFit(); dirty = true; };
$('zMini').onclick = () => { miniOn = !miniOn; $('mini').style.display = miniOn ? '' : 'none'; $('zMini').setAttribute('aria-pressed', String(miniOn)); try { localStorage.setItem('flux:mini', miniOn ? '1' : '0'); } catch {} dirty = true; };
$('mini').style.display = miniOn ? '' : 'none'; $('zMini').setAttribute('aria-pressed', String(miniOn));
let miniT = null;
function paintMini(){
  const pct = Math.round(S.view.zoom * 100) + '%'; if ($('zPct').textContent !== pct){ $('zPct').textContent = pct; $('zPct').setAttribute('aria-label', `${pct} zoom, reset to 100%`); }
  if (!miniOn || $('mini').offsetParent === null) return;
  const c = $('mini'), d = Math.min(2, devicePixelRatio || 1), W = 200, H = 130;
  if (c.width !== W * d){ c.width = W * d; c.height = H * d; }
  const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, W, H);
  const vp = { x: S.view.x, y: S.view.y, w: innerWidth / S.view.zoom, h: innerHeight / S.view.zoom };
  let u = { ...vp };
  const bs = [];
  for (const el of S.D.els){ if (!visible(el) || S.D.hidden.has(el.cid)) continue; const b = box(el); if (!b) continue; bs.push([b, el]); u = norm({ x: Math.min(u.x, b.x), y: Math.min(u.y, b.y) }, { x: Math.max(u.x + u.w, b.x + b.w), y: Math.max(u.y + u.h, b.y + b.h) }); }
  u = grow(u, Math.max(u.w, u.h) * 0.05);
  const k = Math.min(W / u.w, H / u.h), ox = (W - u.w * k) / 2 - u.x * k, oy = (H - u.h * k) / 2 - u.y * k;
  for (const [b, el] of bs){ g.fillStyle = el.type === 'IMAGE' ? TH.muted : colorOf(ecol(el)); g.globalAlpha = el.type === 'NODE' && el.ek === 'frame' ? .12 : .55; g.fillRect(ox + b.x * k, oy + b.y * k, Math.max(1.5, b.w * k), Math.max(1.5, b.h * k)); }
  g.globalAlpha = 1; g.strokeStyle = TH.accent; g.lineWidth = 1.5; g.strokeRect(ox + vp.x * k, oy + vp.y * k, vp.w * k, vp.h * k);
  miniT = { k, ox, oy };
}
function miniPan(e){
  if (!miniT) return; const r = $('mini').getBoundingClientRect();
  const wx = (e.clientX - r.left - miniT.ox) / miniT.k, wy = (e.clientY - r.top - miniT.oy) / miniT.k;
  S.view.x = wx - innerWidth / 2 / S.view.zoom; S.view.y = wy - innerHeight / 2 / S.view.zoom; dirty = true;
}
$('mini').addEventListener('pointerdown', e => { e.stopPropagation(); $('mini').setPointerCapture(e.pointerId); miniPan(e); });
$('mini').addEventListener('pointermove', e => { if (e.buttons) miniPan(e); });
$('zoomui').addEventListener('pointerdown', e => e.stopPropagation());

RENDER_HOOKS.dom.push(paintMini);
