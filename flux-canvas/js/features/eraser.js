'use strict';
// @module features/eraser — Eraser tool
// @uses pointer
/* ---------- eraser ---------- */
function setErasing(on){
  erasing = on; if (on){ setPlacing(null); S.sel.clear(); S.shapeTool = null; S.handTool = false; }
  setCursor(); dirty = true; paintTools();
  say(on ? 'Eraser: drag across your own elements to revoke them. Escape or P returns to the pen.' : 'Eraser off.');
}
function eraseAt(p){
  const el = hitTest(p, 10); if (!el || G.hit.has(el.cid)) return;
  if (el.author !== S.me.id){ G.othersSeen = G.othersSeen || new Set(); if (!G.othersSeen.has(el.cid)){ G.othersSeen.add(el.cid); G.others++; } return; }
  G.hit.add(el.cid); dirty = true;
}
$('eraseBtn').onclick = () => setErasing(!erasing);

