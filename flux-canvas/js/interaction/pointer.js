'use strict';
// @module interaction/pointer — Cursor, pointer gestures (draw, shapes, arrows, lasso, move, pinch, pan), wheel
// @uses selection, tools
function setCursor(){
  cv.style.cursor = erasing ? 'cell' : G?.kind === 'grow' ? 'crosshair' : hoverGrow ? 'copy' : placing === 'node' ? 'cell' : G?.kind === 'pin' ? (G.moved ? 'grabbing' : 'grab') : hoverPin ? 'grab' : placing === 'text' ? 'text' : placing === 'comment' ? 'copy'
    : spaceDown || G?.kind === 'pan' ? (G ? 'grabbing' : 'grab') : G?.kind === 'resize' || hoverHandle ? 'nwse-resize' : G?.kind === 'move' ? 'move'
    : S.lassoMode ? (hoverSel || hoverPick ? 'move' : 'default') : hoverEdge ? 'alias' : hoverSel ? 'move' : 'crosshair';
}
let hoverSel = false, hoverHandle = false, hoverPick = false, hoverPin = false, lastPick = null, lastPointer = null, erasing = false;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (taOpen()){ finishText(true); return; }
  commitKb();
  cv.focus({ preventScroll: true });
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  document.getElementById('hint').classList.add('gone');
  if (pointers.size === 2){
    const [p, q] = [...pointers.values()];
    G = { kind: 'pinch', d0: Math.hypot(p.x - q.x, p.y - q.y) || 1, m0: toWorld((p.x + q.x) / 2, (p.y + q.y) / 2), z0: S.view.zoom };
    dirty = true; return;
  }
  if (pointers.size > 2) return;
  const w = toWorld(e.clientX, e.clientY);
  if (e.button === 0 && pointers.size === 1){
    const pid = pinAt(e.clientX, e.clientY);
    if (pid){ G = { kind: 'pin', id: pid, targets: new Set([pid]), start: w, dx: 0, dy: 0, sx: e.clientX, sy: e.clientY, moved: false }; setCursor(); return; }
    if (placing === 'text'){ G = { kind: 'none' }; const t = hitTest(w); if (!(t && t.type === 'TEXT' && editText(t))) openText(w); return; }
    if (erasing){ G = { kind: 'erase', pts: [w], hit: new Set(), others: 0 }; eraseAt(w); dirty = true; return; }
    if (placing === 'node'){ G = { kind: 'none' }; setPlacing(null); startNode({ kind: S.nodeKind, anchor: { x: w.x, y: w.y, ax: .5, ay: .5 } }); return; }
    const gh = growAt(w);
    if (gh){ G = { kind: 'grow', from: gh.el, dir: gh.dir, start: w, cur: w, moved: false, sx: e.clientX, sy: e.clientY }; dirty = true; return; }
    if (placing === 'comment'){ G = { kind: 'none' }; startComment(w, hitTest(w)); setPlacing(null); return; }
  }
  if (e.button === 1 || e.button === 2 || spaceDown){ G = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y }; setCursor(); return; }
  if (e.button !== 0) return;
  if (S.lassoMode && !e.ctrlKey && !e.metaKey && !onHandle(w)){
    const hit = hitTest(w);
    if (hit){
      const now = Date.now();
      if (!e.shiftKey && lastPick && lastPick.cid === hit.cid && now - lastPick.t < 350 && (hit.type === 'NODE' || hit.type === 'TEXT')){ lastPick = null; G = { kind: 'none' }; editAny(hit); return; }
      lastPick = { cid: hit.cid, t: now };
      if (e.shiftKey){ S.sel.has(hit.cid) ? S.sel.delete(hit.cid) : S.sel.add(hit.cid); expandSel(); dirty = true; announceSel(); G = { kind: 'none' }; return; }
      if (!S.sel.has(hit.cid)){ S.sel = new Set([hit.cid]); expandSel(); announceSel(); }
      G = startMoveG(w, e.altKey); dirty = true; setCursor(); return;
    }
    const sb = S.sel.size && selBox();
    if (sb && !e.shiftKey && inside(w, grow(sb, 10 / S.view.zoom))){ G = startMoveG(w, e.altKey); setCursor(); return; }
    if (!e.shiftKey && S.sel.size){ S.sel.clear(); announceSel(); }
    G = { kind: 'lasso', pts: [w] }; dirty = true; return;
  }
  if (S.sel.size){
    if (S.lassoMode){
      const hd = onHandle(w);
      if (hd){ const b = box(hd.el); G = { kind: 'resize', target: hd.el.cid, start: w, aspect: b.w / b.h, dw: 0, dh: 0, node: hd.el.type === 'NODE', w0: b.w, h0: b.h }; setCursor(); return; }
    } else if (e.ctrlKey || e.metaKey){   // pen mode: ⌘/Ctrl is a temporary select key, so ⌘-drag inside the selection moves it
      const sb = selBox();
      if (sb && inside(w, grow(sb, 10 / S.view.zoom))){ G = startMoveG(w, e.altKey); setCursor(); return; }
    } else { S.sel.clear(); announceSel(); dirty = true; }   // pen mode: the pen always draws, even over a selection
  }
  if (e.ctrlKey || e.metaKey || S.lassoMode){ G = { kind: 'lasso', pts: [w] }; return; }
  if (e.shiftKey){ G = { kind: 'rect', a: w, b: w }; return; }
  if (e.altKey){ G = { kind: 'circle', a: w, b: w }; return; }
  const p0 = performance.now(), pt = { x: w.x, y: w.y, t: 0 };
  const src = edgeHit(e.clientX, e.clientY);
  G = src ? { kind: 'arrow', from: src, pts: [pt], cur: w, p0, t0: Date.now(), sx: e.clientX, sy: e.clientY }
          : { kind: 'stroke', pts: [pt], p0, t0: Date.now(), sx: e.clientX, sy: e.clientY, far: 0 };
  dirty = true;
});
cv.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  lastPointer = toWorld(e.clientX, e.clientY); sendPresence();
  if (!G){
    const h = taOpen() || S.lassoMode ? null : edgeHit(e.clientX, e.clientY);
    const hg = !!growAt(toWorld(e.clientX, e.clientY)); if (hg !== hoverGrow){ hoverGrow = hg; setCursor(); }
    const pid = pinAt(e.clientX, e.clientY), hpin = !!pid;
    if (hpin !== hoverPin){ hoverPin = hpin; setCursor(); }
    if (pid !== hoverThread && pid !== 'draft'){ hoverThread = pid; paintPreviews(); }
    const hp = S.lassoMode && !!hitTest(toWorld(e.clientX, e.clientY));
    if (hp !== hoverPick){ hoverPick = hp; setCursor(); }
    const wp = toWorld(e.clientX, e.clientY), sb = S.sel.size && selBox(), hs = !!(S.lassoMode && sb && inside(wp, grow(sb, 10 / S.view.zoom))), hh = S.lassoMode && !!onHandle(wp);
    if (h !== hoverEdge || hs !== hoverSel || hh !== hoverHandle){ hoverEdge = hs || hh ? null : h; hoverSel = hs; hoverHandle = hh; dirty = true; setCursor(); }
    return;
  }
  if (G.keyboard) return;
  const w = toWorld(e.clientX, e.clientY);
  switch (G.kind){
    case 'pinch': {
      const [p, q] = [...pointers.values()]; if (!q) return;
      const d = Math.hypot(p.x - q.x, p.y - q.y), z = clampZ(G.z0 * d / G.d0), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      S.view = { zoom: z, x: G.m0.x - mx / z, y: G.m0.y - my / z }; break;
    }
    case 'pan': S.view.x = G.vx - (e.clientX - G.sx) / S.view.zoom; S.view.y = G.vy - (e.clientY - G.sy) / S.view.zoom; break;
    case 'move': G.dx = Math.round(w.x - G.start.x); G.dy = Math.round(w.y - G.start.y); if (!G.keyboard) snapMove(e.ctrlKey || e.metaKey); break;
    case 'erase': for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])){ const p = toWorld(ev.clientX, ev.clientY); G.pts.push(p); eraseAt(p); } break;
    case 'grow':
      G.cur = w; if (Math.hypot(e.clientX - G.sx, e.clientY - G.sy) > 6) G.moved = true;
      G.target = G.moved ? hitTest(w) : null; if (G.target === G.from || G.target?.type === 'ARROW') G.target = null;
      break;
    case 'pin':
      if (!G.moved && Math.hypot(e.clientX - G.sx, e.clientY - G.sy) < 4) break;
      G.moved = true; G.dx = Math.round(w.x - G.start.x); G.dy = Math.round(w.y - G.start.y);
      if (G.id === 'draft'){ draft.px += G.dx; draft.py += G.dy; draft.x += G.dx; draft.y += G.dy; G.start = w; G.dx = G.dy = 0; }
      break;
    case 'resize': {   // proportional, from the bottom-right corner (nodes: free, but never smaller than their label)
      if (G.node){ G.dw = Math.round(w.x - G.start.x); G.dh = Math.round(w.y - G.start.y); break; }
      const el = S.records.get(G.target), base = el.bw + (S.D.off.get(el.cid)?.w || 0);
      const dw = Math.max(w.x - G.start.x, (w.y - G.start.y) * G.aspect, 16 - base);
      G.dw = Math.round(dw); G.dh = Math.round(dw / G.aspect); break;
    }
    case 'rect': case 'circle': G.b = w; break;
    case 'lasso': G.pts.push(w); break;
    case 'stroke': case 'arrow': {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      const minD = 0.75 / S.view.zoom;
      for (const ev of evs.length ? evs : [e]){
        const p = toWorld(ev.clientX, ev.clientY), last = G.pts[G.pts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) < minD) continue;
        G.pts.push({ x: p.x, y: p.y, t: performance.now() - G.p0 });
      }
      G.far = Math.max(G.far || 0, Math.hypot(e.clientX - G.sx, e.clientY - G.sy));
      if (G.kind === 'arrow'){ G.cur = w; G.target = elementAt(w, G.from); }
      break;
    }
  }
  dirty = true;
});
function endPointer(e, cancelled){
  pointers.delete(e.pointerId);
  const g = G;
  if (!g || g.keyboard) return;
  if (g.kind === 'pinch'){ if (pointers.size === 0) G = null; return; }
  G = null; dirty = true; setCursor();
  if (cancelled) return;
  const w = toWorld(e.clientX, e.clientY);
  switch (g.kind){
    case 'stroke': {
      const tap = (g.far || 0) < 4 && performance.now() - g.p0 < 300;
      if (tap){
        const now = Date.now();
        if (lastTap && now - lastTap.time < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 24){
          clearTimeout(lastTap.timer); lastTap.cancel(); lastTap = null;
          const t = hitTest(g.pts[0]); if (!(t && editAny(t))) openText(g.pts[0]); return;
        }
        const pts = g.pts.slice(0, 1), t0 = g.t0, color = S.color, width = S.width;
        const cancel = ghost({ pts, color, width });
        lastTap = { time: now, x: e.clientX, y: e.clientY, cancel, timer: setTimeout(() => { cancel(); lastTap = null; commitStroke(pts, t0, color, width); }, 350) };
        return;
      }
      commitStroke(g.pts, g.t0); return;
    }
    case 'arrow': {
      const to = elementAt(w, g.from);
      if (to) commitArrow(g.from, to); else if (g.pts.length > 1) commitStroke(g.pts, g.t0);   // released on empty paper: it was a stroke
      return;
    }
    case 'rect': commitShape('rect', g.a, g.b); return;
    case 'circle': commitShape('circle', g.a, g.b); return;
    case 'lasso': {
      if (g.pts.length < 3) return;
      for (const el of S.D.els){
        if (!visible(el) || el.locked) continue; const b = box(el);
        if (b && pointInPoly(center(b), g.pts)) S.sel.add(el.cid);
      }
      expandSel(); dirty = true; announceSel(); return;
    }
    case 'grow': {
      if (!g.moved){ startChild(g.from, g.dir); return; }
      const t = g.target && current(g.target.cid);
      if (t){ commitArrow(g.from, t).then(c => c && say(`Connected “${g.from.text.slice(0, 40)}” to ${describe(t)}. Signed.`)); return; }
      startNode({ kind: g.from.ek, parent: g.from.cid, color: ecol(g.from), anchor: { x: w.x, y: w.y, ax: .5, ay: .5 } });
      return;
    }
    case 'pin': {
      if (!g.moved){ if (g.id === 'draft') toggleComments(true); else openThread(g.id); return; }
      if (g.id === 'draft' || (!g.dx && !g.dy)) return;
      (async () => { await commitMove(g.id, g.dx, g.dy); S.hist.push({ kind: 'move', targets: [g.id], dx: g.dx, dy: g.dy }); S.redo = []; })();
      say('Comment pin moved. Signed.');
      return;
    }
    case 'resize': {
      if (!g.dw && !g.dh) return;
      if (g.node){
        const el = S.records.get(g.target), o = S.D.off.get(el.cid) || { w: 0, h: 0 }, L = nodeLayout(el.ek, el.text);
        const tw = Math.max(L.w, Math.round(g.w0 + g.dw)), th = Math.max(L.h, Math.round(g.h0 + g.dh));
        const dw = tw - (el.bw + (o.w || 0)), dh = th - (el.bh + (o.h || 0));
        if (dw || dh) (async () => { await commitMove(el.cid, 0, 0, dw, dh); S.hist.push({ kind: 'move', targets: [el.cid], dx: 0, dy: 0, dw, dh }); S.redo = []; })();
        say(`Resized to ${tw} by ${th}.`); return;
      }
      (async () => { await commitMove(g.target, 0, 0, g.dw, g.dh); S.hist.push({ kind: 'move', targets: [g.target], dx: 0, dy: 0, dw: g.dw, dh: g.dh }); S.redo = []; })();
      return;
    }
    case 'erase': {
      if (!g.hit.size){ if (g.others) toast(`Only your own elements erase; ${g.others} by other authors stayed.`); return; }
      (async () => {
        const cids = [...g.hit]; for (const c of cids) await setNeg(c, true);
        S.hist.push({ kind: 'revoke', cids }); S.redo = [];
        say(`Erased ${cids.length} element${cids.length > 1 ? 's' : ''}. Each is a signed revoke; undo brings them back.`);
        if (g.others) toast(`Erased ${cids.length}. ${g.others} by other authors stayed.`);
      })();
      return;
    }
    case 'move': {
      if (!g.dx && !g.dy) return;
      if (g.dup){ (async () => { const made = await duplicateEls([...S.sel].map(c => S.records.get(c)), g.dx, g.dy); if (made.length){ S.sel = new Set(made); say(`Duplicated ${made.length} element${made.length > 1 ? 's' : ''}. Signed.`); } })(); return; }
      (async () => {
        for (const t of g.targets) await commitMove(t, g.dx, g.dy);
        S.hist.push({ kind: 'move', targets: [...g.targets], dx: g.dx, dy: g.dy }); S.redo = [];
      })();
      return;
    }
  }
}
cv.addEventListener('pointerup', e => endPointer(e, false));
cv.addEventListener('pointercancel', e => endPointer(e, true));
const clampZ = z => Math.min(8, Math.max(0.1, z));
cv.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey){
    const before = toWorld(e.clientX, e.clientY), z = clampZ(S.view.zoom * Math.exp(-e.deltaY * 0.01));
    S.view = { zoom: z, x: before.x - e.clientX / z, y: before.y - e.clientY / z };
  } else { S.view.x += e.deltaX / S.view.zoom; S.view.y += e.deltaY / S.view.zoom; }
  dirty = true;
}, { passive: false });

