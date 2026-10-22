'use strict';
// @module features/presence — Who is here right now: named cursors, what each person has selected or is editing, their view
// (to follow them), and their state root (to know you see the same canvas). Ephemeral and unsigned; nothing here is stored.
// @uses records (post), profiles, net (S.root)
const peers = new Map();   // id → { x, y, t, name, sel, edit, view, root, n, tool, via }
let presT = 0;
let presSeq = 0;
function presenceNow(){
  const z = S.view.zoom, extra = {};
  for (const f of PRESENCE_FIELDS) try { Object.assign(extra, f()); } catch {}
  return { ...extra, s: ++presSeq, id: S.me.id, name: myName() || undefined, x: lastPointer?.x, y: lastPointer?.y, sel: [...S.sel].slice(0, 40),
    edit: editingCid || (typeof taNode !== 'undefined' && taNode?.orig?.cid) || null, tool: currentTool(), root: S.root, n: S.records.size,
    view: { x: Math.round(S.view.x + innerWidth / 2 / z), y: Math.round(S.view.y + innerHeight / 2 / z), zoom: +z.toFixed(3) } };
}
function sendPresence(gone, beat = false){
  if (!S.me) return;
  const now = Date.now(); if (!gone && !beat && now - presT < 40) return; presT = now;
  post({ presence: gone ? { id: S.me.id, gone: true } : presenceNow() });
}
setInterval(() => sendPresence(false, true), 2000);   // a heartbeat: people who are reading, not moving, stay visible
function onPresence(p, via){
  if (!p || !isKey(p.id) || p.id === S.me?.id) return;   // presence is unsigned: only key-shaped ids, never markup
  if (p.gone){ peers.delete(p.id); if (S.follow === p.id) stopFollow(); paintAuthors(); paintSession(); dirty = true; return; }
  const had = peers.has(p.id), prev = peers.get(p.id) || {};
  const name = typeof p.name === 'string' ? p.name.slice(0, 40) : '';
  if (name && !S.D.profiles?.has(p.id)) NAMES.set(p.id, name);   // a name before their first record arrives
  peers.set(p.id, { x: Number.isFinite(p.x) ? p.x : prev.x, y: Number.isFinite(p.y) ? p.y : prev.y, t: Date.now(), name,
    sel: Array.isArray(p.sel) ? p.sel.filter(isCid).slice(0, 40) : [], edit: isCid(p.edit) ? p.edit : null,
    view: p.view && Number.isFinite(p.view.x) && Number.isFinite(p.view.zoom) ? p.view : prev.view, root: typeof p.root === 'string' && /^[a-z2-7]{6,16}$/.test(p.root) ? p.root : prev.root,
    n: Number.isFinite(p.n) ? p.n : prev.n, tool: typeof p.tool === 'string' ? p.tool.slice(0, 20) : '', via: p.hop > 0 ? 'mesh' : via || prev.via || 'tab',
    through: p.hop > 0 && isKey(p.through) ? p.through : null, att: p.att && typeof p.att === 'object' ? { on: isCid(p.att.on) ? p.att.on : null, for: +p.att.for || 0, idle: +p.att.idle || 0, off: !!p.att.off } : null });
  if (S.follow === p.id) followView(peers.get(p.id).view);
  dirty = true;
  if (!had){ paintAuthors(); toast(`${short(p.id)} joined`); sendPresence(false, true); }
  paintSession();
}
// follow someone's view (click them in the session panel); your own pan, zoom or Esc stops it
function startFollow(id){ S.follow = id; followView(peers.get(id)?.view); paintSession(); toast(`Following ${short(id)} · move or press Esc to stop`); }
function stopFollow(){ if (!S.follow) return; S.follow = null; paintSession(); }
function followView(v){ if (!v) return; const z = Math.max(0.1, Math.min(8, v.zoom)); S.view = { zoom: z, x: v.x - innerWidth / 2 / z, y: v.y - innerHeight / 2 / z }; dirty = true; }
// bring everyone to what you're looking at (they follow until they move)
function spotlight(){ post({ spotlight: { id: S.me.id } }); toast('Everyone here is now following your view'); }
WIRE_HOOKS.spotlight = s => { if (s?.id && peers.has(s.id) && s.id !== S.me?.id) startFollow(s.id); };
for (const t of ['wheel', 'pointerdown']) cv.addEventListener(t, () => { if (S.follow) stopFollow(); }, { passive: true });
KEY_HOOKS.push((e, c) => { if (S.follow && (e.key === 'Escape' || e.key.startsWith('Arrow'))){ stopFollow(); if (e.key === 'Escape'){ e.preventDefault(); return true; } } return false; });

const activityOf = p => {
  if (p.edit){ const el = current(p.edit); return el ? `editing ${(el.text || KIND(el)).slice(0, 24)}` : 'editing'; }
  if (Date.now() - p.t > 5000) return 'here';
  return { pen: 'drawing', eraser: 'erasing', note: 'adding notes', node: 'adding shapes', text: 'writing', comment: 'commenting', line: 'connecting' }[p.tool] || (p.sel.length ? 'selecting' : 'looking around');
};
function drawPeers(){
  if (!peers.size) return;
  const z = S.view.zoom;
  // what each person has selected or is editing: an outline in their colour with their name
  ctx.setTransform(dpr * z, 0, 0, dpr * z, -S.view.x * z * dpr, -S.view.y * z * dpr);
  for (const [id, p] of peers){
    const col = authorColor(id), cids = p.edit ? [p.edit] : p.sel;
    for (const c of cids){
      const el = current(c), b = el && visible(el) && box(el); if (!b) continue;
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2 / z; ctx.setLineDash(p.edit ? [5 / z, 4 / z] : []);
      ctx.strokeRect(b.x - 5 / z, b.y - 5 / z, b.w + 10 / z, b.h + 10 / z); ctx.restore();
    }
    if (cids.length){
      const el = current(cids[0]), b = el && box(el);
      if (b){ ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const s = toScreen(b.x, b.y), label = `${short(id)}${p.edit ? ' is editing' : ''}`;
        ctx.font = `600 11px ${FONTS.sans}`; const w = ctx.measureText(label).width + 12;
        rr(ctx, s.x - 5, s.y - 5 - 20, w, 18, 5); ctx.fillStyle = col; ctx.fill(); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, s.x + 1, s.y - 5 - 11); ctx.restore(); }
    }
  }
  // cursors with names
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const [id, p] of peers){
    if (!Number.isFinite(p.x)) continue;
    const s = toScreen(p.x, p.y), col = authorColor(id);
    if (s.x < -20 || s.y < -20 || s.x > innerWidth + 20 || s.y > innerHeight + 20) continue;
    ctx.save(); ctx.translate(s.x, s.y); ctx.globalAlpha = Date.now() - p.t > 10000 ? .5 : 1;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 16); ctx.lineTo(4.5, 12); ctx.lineTo(8, 19); ctx.lineTo(10.5, 18); ctx.lineTo(7.2, 11.2); ctx.lineTo(12.5, 11); ctx.closePath();
    ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = `600 12px ${FONTS.sans}`; const label = short(id), w = ctx.measureText(label).width + 14;
    rr(ctx, 12, 18, w, 20, 10); ctx.fillStyle = col; ctx.fill(); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, 19, 28.5);
    ctx.restore();
  }
}
setInterval(() => { let gone = false; for (const [id, p] of peers) if (Date.now() - p.t > 7000){ peers.delete(id); gone = true; if (S.follow === id) stopFollow(); } if (gone){ paintAuthors(); paintSession(); dirty = true; } }, 1500);
addEventListener('pagehide', () => sendPresence(true));

WIRE_HOOKS.presence = onPresence;
RENDER_HOOKS.overlay.push(drawPeers);
