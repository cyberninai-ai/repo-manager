'use strict';
// @module interaction/text-editor — Free text editor overlay (create and edit TEXT)
// @uses pointer
/* ---------- text ---------- */
const ta = document.getElementById('ta');
let taAt = null;
const taOpen = () => ta.style.display === 'block';
let editingCid = null;
function openText(w, orig = null){
  setPlacing(null);
  if (orig){ const b = box(orig); w = { x: b.x, y: b.y }; editingCid = orig.cid; dirty = true; }
  taAt = w; taOrig = orig; const s = toScreen(w.x, w.y), z = S.view.zoom;
  const fs = orig ? orig.fs : S.textSize, font = FONTS[orig ? orig.f.F : S.font] || FONTS.sans, col = colorOf(orig ? ecol(orig) : S.color);
  Object.assign(ta.style, { display: 'block', left: s.x + 'px', top: s.y + 'px', font: `${fs * z}px ${font}`, color: col, lineHeight: '1.25' });
  ta.value = orig ? orig.text : ''; sizeTa(); setTimeout(() => { ta.focus(); if (orig) ta.select(); }, 0);
  say(orig ? 'Editing your text. Enter signs the new version, Escape cancels.' : 'Type your text. Enter signs it, Shift+Enter adds a line, Escape cancels.');
}
let taOrig = null;
function editText(el){
  el = el && current(el.cid);
  if (!el || el.type !== 'TEXT') return false;
  if (el.author !== S.me.id){ toast('Only its author can edit this text. Add a comment instead (M).'); return true; }
  openText(null, el); return true;
}
function sizeTa(){ ta.style.width = '2ch'; ta.style.height = 'auto'; ta.style.width = (ta.scrollWidth + 8) + 'px'; ta.style.height = ta.scrollHeight + 'px'; }
function finishText(commit, then = null){
  if (!taOpen()) return;
  if (taNode) return finishNode(commit, then);
  const v = ta.value.replace(/\s+$/, ''), orig = taOrig; ta.style.display = 'none'; taOrig = null;
  editingCid = null; dirty = true;
  if (document.activeElement === ta) cv.focus({ preventScroll: true });
  if (commit && v.trim() && (!orig || v !== orig.text)) commitText(taAt, v, orig);
}
ta.addEventListener('input', () => { if (taNode){ placeNodeEditor(); dirty = true; } else sizeTa(); });
ta.addEventListener('keydown', e => {
  e.stopPropagation();
  if (taNode && e.key === 'Tab'){ e.preventDefault(); finishText(true, e.shiftKey ? null : 'child'); return; }
  if (taNode && e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); finishText(true, 'sibling'); return; }
  if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); finishText(true); }
  else if (e.key === 'Escape'){ e.preventDefault(); finishText(false); }
});
ta.addEventListener('blur', () => finishText(true));

