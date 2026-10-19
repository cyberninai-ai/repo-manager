'use strict';
// @module features/presence — Live cursors over the canvas channel (ephemeral, unsigned)
// @uses records
/* ---------- presence: other people's cursors (ephemeral, unsigned) ---------- */
const peers = new Map();
let presT = 0;
function sendPresence(gone){
  if (!S.me) return;
  const now = Date.now(); if (!gone && now - presT < 40) return; presT = now;
  post({ presence: gone ? { id: S.me.id, gone: true } : { id: S.me.id, x: lastPointer?.x, y: lastPointer?.y } });
}
function onPresence(p){
  if (!p || typeof p.id !== 'string' || p.id === S.me?.id) return;
  if (p.gone){ peers.delete(p.id); paintAuthors(); dirty = true; return; }
  const had = peers.has(p.id);
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
  peers.set(p.id, { x: p.x, y: p.y, t: Date.now() }); dirty = true;
  if (!had){ paintAuthors(); say(`${short(p.id)} joined the canvas.`); }
}
function drawPeers(){
  if (!peers.size) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const [id, p] of peers){
    const s = toScreen(p.x, p.y), col = authorColor(id);
    if (s.x < -20 || s.y < -20 || s.x > innerWidth + 20 || s.y > innerHeight + 20) continue;
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 16); ctx.lineTo(4.5, 12); ctx.lineTo(8, 19); ctx.lineTo(10.5, 18); ctx.lineTo(7.2, 11.2); ctx.lineTo(12.5, 11); ctx.closePath();
    ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = `600 10px ${FONTS.mono}`; const label = short(id), w = ctx.measureText(label).width + 10;
    rr(ctx, 12, 18, w, 16, 8); ctx.fillStyle = col; ctx.fill(); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, 17, 26.5);
    ctx.restore();
  }
}
setInterval(() => { let gone = false; for (const [id, p] of peers) if (Date.now() - p.t > 6000){ peers.delete(id); gone = true; } if (gone){ paintAuthors(); dirty = true; } }, 1500);
addEventListener('pagehide', () => sendPresence(true));
addEventListener('blur', () => sendPresence(true));

WIRE_HOOKS.presence = onPresence;
RENDER_HOOKS.overlay.push(drawPeers);
