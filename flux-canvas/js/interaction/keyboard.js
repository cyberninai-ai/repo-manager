'use strict';
// @module interaction/keyboard — Global keyboard map
// @uses everything
/* keyboard */
addEventListener('keydown', e => {
  if (e.target === ta || e.target === $('palIn') || e.target.closest?.('#ask')) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  // canvas keys apply when the canvas (or nothing) has focus; buttons and ledger rows keep their own keys
  const onCanvas = e.target === cv || e.target === document.body;
  for (const h of KEY_HOOKS) if (h(e, { onCanvas, mod, k })) return;   // feature keys (core/hooks)
  if (onCanvas && e.altKey && !mod && e.key.startsWith('Arrow')){
    const n = soleNode();
    if (n){ e.preventDefault(); startChild(n, { ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up', ArrowDown: 'down' }[e.key]); return; }
  }
  if (onCanvas && mod && e.key === 'Enter'){ const n = soleNode(); if (n){ e.preventDefault(); startSibling(n); return; } }
  if (onCanvas && !mod){
    if (e.key === 'Tab'){ if (cycleSel(e.shiftKey ? -1 : 1)) e.preventDefault(); return; }
    if (e.key.startsWith('Arrow')){
      e.preventDefault();
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (pinMove && S.D.threads.has(pinMove)){ const st = (e.shiftKey ? 10 : 1) * Math.max(1, Math.round(1 / S.view.zoom)); kbMove(d[0] * st, d[1] * st, new Set([pinMove])); }
      else if (S.sel.size){ const st = (e.shiftKey ? 10 : 1) * Math.max(1, Math.round(1 / S.view.zoom)); kbMove(d[0] * st, d[1] * st); }
      else { S.view.x += d[0] * 60 / S.view.zoom; S.view.y += d[1] * 60 / S.view.zoom; dirty = true; }
      return;
    }
    if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_'){
      e.preventDefault(); const up = e.key === '+' || e.key === '=';
      kbResize(up ? 1.1 : 1 / 1.1).then(done => { if (!done){ const c = viewCenter(), z = clampZ(S.view.zoom * (up ? 1.2 : 1 / 1.2)); S.view = { zoom: z, x: c.x - innerWidth / 2 / z, y: c.y - innerHeight / 2 / z }; dirty = true; say(`Zoom ${Math.round(z * 100)} percent`); } });
      return;
    }
    if (!e.altKey){
      if (k === 'v'){ setErasing(false); setMode(true); return; }
      if (k === 'p'){ setErasing(false); setMode(false); return; }
      if (k === 'e'){ setErasing(!erasing); return; }
      if (k === 'r'){ kbInsert('rect'); return; }
      if (k === 'o'){ kbInsert('circle'); return; }
      if (k === 't'){ e.preventDefault(); if (S.sel.size === 1 && S.records.get([...S.sel][0])?.type === 'TEXT') editText(S.records.get([...S.sel][0])); else openText(viewCenter()); return; }
      if (k === 'i'){ $('imgFile').click(); return; }
      if (k === 'c'){ connectSel(); return; }
      if (pinMove && e.key === 'Enter'){ e.preventDefault(); endPinMove(); return; }
      if (k === 'm'){ e.preventDefault(); commentOnSelection(); return; }
      if (e.key === '[' || e.key === ']'){ e.preventDefault(); const lt = lineTargets(), cur = lt.length ? brushOf(lt[0]) : S.width, st = Math.max(1, Math.round(cur * 0.15)); setBrush(cur + (e.key === ']' ? st : -st), true); return; }
      if (e.key === '{' || e.key === '}'){ e.preventDefault(); const t = sizeTarget(), cur = t ? (t._previewFs || t.fs) : S.textSize, st = Math.max(4, Math.round(cur * 0.12)); setTextSize(cur + (e.key === '}' ? st : -st), true); return; }
      if ((e.key === 'Enter' || e.key === 'F2') && S.sel.size === 1){ const el = S.records.get([...S.sel][0]); if (el?.type === 'TEXT' || el?.type === 'NODE'){ e.preventDefault(); editAny(el); return; } }
      if (k === 'n'){ e.preventDefault(); setPlacing(placing === 'node' ? null : 'node'); return; }
      if (k === 'l'){ e.preventDefault(); const n = soleNode(); if (n) tidy(n); else toast('Select a node of the diagram to tidy.'); return; }
    }
  }
  if ((mod && k === 'k') || (!mod && e.key === '/')){ e.preventDefault(); openPalette(); return; }
  if (e.key === 'Escape'){
    if (placing){ setPlacing(null); say('Cancelled.'); return; }
    if (erasing){ setErasing(false); return; }
    if (pinMove){ endPinMove(); return; }
    if ($('help').style.display === 'block'){ toggleHelp(false); return; }
    if ($('comments').style.display === 'flex'){ toggleComments(false); return; }
    if (S.ledger){ toggleLedger(false); return; }
    commitKb(); if (S.sel.size){ S.sel.clear(); announceSel(); } dirty = true; return;
  }
  if (!onCanvas) return;
  if (e.key === ' ' && !spaceDown){ spaceDown = true; setCursor(); e.preventDefault(); return; }
  if (mod && k === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y'){ e.preventDefault(); redo(); return; }
  if (mod && k === 'a'){ e.preventDefault(); selectAll(); announceSel(); return; }
  if (mod && k === 'c' && S.sel.size && !window.getSelection()?.toString()){ e.preventDefault(); copySelection(); return; }
  if (mod && k === 'x' && S.sel.size){ e.preventDefault(); copySelection().then(() => revokeSelection()); return; }
  if (mod && k === 'd' && S.sel.size){ e.preventDefault(); duplicateSelection(); return; }
  if (mod && k === 'v' && clip && clip.internalOnly){ e.preventDefault(); pasteClip(); return; }
  if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')){ e.preventDefault(); reorder(e.key === 'ArrowUp'); return; }
  if (mod && e.shiftKey && k === 'l'){ e.preventDefault(); toggleLock(); return; }
  if (mod && k === 'g'){ e.preventDefault(); e.shiftKey ? ungroupSelection() : groupSelection(); return; }
  if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && S.sel.size){ e.preventDefault(); revokeSelection(); return; }
  if (!mod && e.key === '`'){ toggleLedger(); return; }
  if (!mod && e.key === '?'){ toggleHelp(); return; }
  if (!mod && e.key === '0'){ zoomFit(); dirty = true; return; }
  if (!mod && e.key === '1'){ zoomTo(1); return; }
});
addEventListener('keyup', e => { if (e.key === ' '){ spaceDown = false; setCursor(); } });
addEventListener('blur', () => { spaceDown = false; });
addEventListener('hashchange', () => { const m = location.hash.match(/^#([a-z0-9]{6,32})$/); if (m && m[1] !== canvasId) switchCanvas(m[1]); });
// Swap canvases in place: no reload, so it also works where the URL can't change.
switchCanvasTo = id => switchCanvas(id);   // core/rtc joins an invite's canvas through this
async function switchCanvas(id){
  await flushSave();   // the canvas being left keeps everything it had
  canvasId = id; setHash(id);
  try { localStorage.setItem('flux:lastCanvas', id); } catch {}
  Object.assign(S, { records: new Map(), blobs: new Map(), geom: new Map(), imgs: new Map(), lamport: 0, sel: new Set(), filter: null, hist: [], redo: [], ghosts: [], rejected: 0, why: {}, parked: new Map(),
    view: { x: -innerWidth / 2, y: -innerHeight / 2, zoom: 1 } });
  openChannel(); activeThread = null; draft = null;
  const n = await loadCanvas(id);
  rebuildHistory();
  derive(); paintAuthors(); paintLedger(); dirty = true;
  toast(`Canvas ${id}${n ? '' : ' · empty'}`);
}

