'use strict';
// @module interaction/pointer — Cursor, pointer gestures (draw, shapes, arrows, lasso, move, pinch, pan), wheel
// @uses selection, tools
function setCursor(){
  cv.style.cursor = erasing ? 'cell' : G?.kind === 'grow' ? 'crosshair' : hoverGrow ? 'copy' : placing === 'node' ? 'cell' : G?.kind === 'pin' ? (G.moved ? 'grabbing' : 'grab') : hoverPin ? 'grab' : placing === 'text' ? 'text' : placing === 'comment' ? 'copy'
    : spaceDown || S.handTool || G?.kind === 'pan' ? (G ? 'grabbing' : 'grab') : G?.kind === 'resize' ? HANDLE_CURSOR[G.h] : hoverHandle ? HANDLE_CURSOR[hoverHandle] : G?.kind === 'move' ? 'move'
    : S.lassoMode ? (hoverSel || hoverPick ? 'move' : 'default') : S.shapeTool ? 'crosshair' : hoverEdge ? 'alias' : hoverSel ? 'move' : 'crosshair';
}
let lastEmpty = null;
let hoverSel = false, hoverHandle = false, hoverPick = false, hoverPin = false, lastPick = null, lastPointer = null, erasing = false;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (taOpen()){ finishText(true); return; }
  commitKb();
  cv.focus({ preventScroll: true });
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
    for (const h of POINTER_HOOKS) if (h(e, w)){ G = { kind: 'none' }; dirty = true; return; }   // feature hit targets (core/hooks)
    if (placing === 'text'){ G = { kind: 'none' }; const t = hitTest(w); if (!(t && t.type === 'TEXT' && editText(t))) openText(w); return; }
    if (erasing){ G = { kind: 'erase', pts: [w], hit: new Set(), others: 0 }; eraseAt(w); dirty = true; return; }
    if (placing === 'node'){ G = { kind: 'place', a: w, b: w, sx: e.clientX, sy: e.clientY }; dirty = true; return; }   // click to place, or drag to size
    const gh = growAt(w);
    if (gh){ G = { kind: 'grow', from: gh.el, dir: gh.dir, start: w, cur: w, moved: false, sx: e.clientX, sy: e.clientY }; dirty = true; return; }
    if (placing === 'comment'){ G = { kind: 'none' }; startComment(w, hitTest(w)); setPlacing(null); return; }
  }
  if (e.button === 1 || e.button === 2 || spaceDown || S.handTool){ G = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y, button: e.button, at: w }; setCursor(); return; }
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
    // double-click on empty space drops a sticky note: the quickest way to add a thought
    const now = Date.now();
    if (!e.shiftKey && lastEmpty && now - lastEmpty.t < 350 && Math.hypot(e.clientX - lastEmpty.x, e.clientY - lastEmpty.y) < 8){
      lastEmpty = null; G = { kind: 'none' }; startNode({ kind: 'sticky', anchor: { x: w.x, y: w.y, ax: .5, ay: .5 } }); return;
    }
    lastEmpty = { t: now, x: e.clientX, y: e.clientY };
    G = { kind: 'marquee', a: w, b: w, add: e.shiftKey, base: new Set(S.sel) }; dirty = true; return;   // a rectangle, as in every design tool
  }
  if (S.sel.size){
    if (S.lassoMode){
      const hd = onHandle(w);
      if (hd){ const b = box(hd.el); G = { kind: 'resize', target: hd.el.cid, h: hd.h, start: w, b0: { ...b }, nb: { ...b }, el: hd.el }; setCursor(); return; }
    } else if (e.ctrlKey || e.metaKey){   // pen mode: ⌘/Ctrl is a temporary select key, so ⌘-drag inside the selection moves it
      const sb = selBox();
      if (sb && inside(w, grow(sb, 10 / S.view.zoom))){ G = startMoveG(w, e.altKey); setCursor(); return; }
    } else { S.sel.clear(); announceSel(); dirty = true; }   // pen mode: the pen always draws, even over a selection
  }
  if (e.ctrlKey || e.metaKey || S.lassoMode){ G = { kind: 'lasso', pts: [w] }; return; }
  if (S.shapeTool === 'rect'){ G = { kind: 'rect', a: w, b: w, viaTool: true }; return; }
  if (S.shapeTool === 'ellipse'){ G = { kind: 'circle', a: w, b: w, viaTool: true }; return; }
  if (S.shapeTool === 'line'){ G = { kind: 'line', a: w, b: w, from: elementAt(w), viaTool: true }; dirty = true; return; }
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
  if (S.sel.size === 1) dirty = true;   // + handles follow the pointer's distance
  if (!G){
    const h = taOpen() || S.lassoMode ? null : edgeHit(e.clientX, e.clientY);
    const hg = !!growAt(toWorld(e.clientX, e.clientY)); if (hg !== hoverGrow){ hoverGrow = hg; setCursor(); }
    const pid = pinAt(e.clientX, e.clientY), hpin = !!pid;
    if (hpin !== hoverPin){ hoverPin = hpin; setCursor(); }
    if (pid !== hoverThread && pid !== 'draft'){ hoverThread = pid; paintPreviews(); }
    const he = S.lassoMode && !placing ? hitTest(toWorld(e.clientX, e.clientY)) : null, hp = !!he;
    if ((he?.cid || null) !== hoverCid){ hoverCid = he?.cid || null; dirty = true; }
    if (hp !== hoverPick){ hoverPick = hp; setCursor(); }
    const wp = toWorld(e.clientX, e.clientY), sb = S.sel.size && selBox(), hs = !!(S.lassoMode && sb && inside(wp, grow(sb, 10 / S.view.zoom))), hh = S.lassoMode && (onHandle(wp)?.h || false);
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
    case 'resize': G.nb = resizedBox(G, w, e.shiftKey, e.altKey); G.at = w; break;
    case 'rect': case 'circle': case 'place': G.b = w; break;
    case 'marquee': {   // live: what the rectangle touches is selected as you drag
      G.b = w; const r = norm(G.a, G.b), next = new Set(G.add ? G.base : []);
      for (const i of S.D.els.keys()){ const el = S.D.els[i]; if (!visible(el) || el.locked || S.D.hidden.has(el.cid)) continue; const b = box(el); if (b && b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y) next.add(el.cid); }
      S.sel = next; expandSel(); break;
    }
    case 'line': {   // Shift snaps to 45°
      G.b = e.shiftKey ? snap45(G.a, w) : w;
      G.target = G.from ? elementAt(w, G.from) : null;
      break;
    }
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
    case 'place': {
      const kind = S.nodeKind; setPlacing(null);
      const dragged = Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8;
      if (SHAPE_SIZE[kind]){ const d = SHAPE_SIZE[kind]; placeShape(kind, dragged ? norm(g.a, g.b) : { x: Math.round(w.x - d[0] / 2), y: Math.round(w.y - d[1] / 2), w: d[0], h: d[1] }); return; }
      if (dragged){ const n = norm(g.a, g.b); startNode({ kind, anchor: { x: n.x, y: n.y, ax: 0, ay: 0 }, size: { W: Math.round(n.w), H: Math.round(n.h) } }); }
      else startNode({ kind, anchor: { x: w.x, y: w.y, ax: .5, ay: .5 } });
      return;
    }
    case 'pan':   // a right-click that didn't drag opens the context menu
      if (g.button === 2 && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 5) canvasMenu({ x: e.clientX, y: e.clientY }, g.at);
      return;
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
    case 'rect': commitShape('rect', g.a, g.b).then(c => afterToolCreate(g, c)); return;
    case 'circle': commitShape('circle', g.a, g.b).then(c => afterToolCreate(g, c)); return;
    case 'line': {
      const to = elementAt(w, g.from);
      if (g.from && to){ commitArrow(g.from, to).then(c => { afterToolCreate(g, c); if (c) say(`Connected ${describe(g.from)} to ${describe(to)}.`); }); return; }
      if (Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) * S.view.zoom < 4) return;
      commitStroke([{ x: g.a.x, y: g.a.y, t: 0 }, { x: g.b.x, y: g.b.y, t: 1 }], Date.now()); return;
    }
    case 'marquee': if (S.sel.size) announceSel(); return;
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
      if (t){ commitArrow(g.from, t).then(c => c && say(`Connected “${g.from.text.slice(0, 40)}” to ${describe(t)}.`)); return; }
      startNode({ kind: g.from.ek, parent: g.from.cid, color: ecol(g.from), anchor: { x: w.x, y: w.y, ax: .5, ay: .5 } });
      return;
    }
    case 'pin': {
      if (!g.moved){ if (g.id === 'draft') toggleComments(true); else openThread(g.id); return; }
      if (g.id === 'draft' || (!g.dx && !g.dy)) return;
      (async () => { await commitMove(g.id, g.dx, g.dy); S.hist.push({ kind: 'move', targets: [g.id], dx: g.dx, dy: g.dy }); S.redo = []; })();
      say('Comment pin moved.');
      return;
    }
    case 'resize': {
      // sizes are stored as the element's own W/H plus resize offsets (for a node, W/H is a minimum where 0 means "fit the label")
      const { dx, dy, dw, dh } = resizeDelta(S.records.get(g.target), g.b0, g.nb);
      if (!dx && !dy && !dw && !dh) return;
      (async () => { await commitMove(g.target, dx, dy, dw, dh); S.hist.push({ kind: 'move', targets: [g.target], dx, dy, dw, dh }); S.redo = []; })();
      say(`Resized to ${Math.round(g.nb.w)} by ${Math.round(g.nb.h)}.`);
      return;
    }
    case 'erase': {
      if (!g.hit.size){ if (g.others) toast(`You can only erase your own work; ${g.others} made by others stayed.`); return; }
      (async () => {
        const cids = [...g.hit]; for (const c of cids) await setNeg(c, true);
        S.hist.push({ kind: 'revoke', cids }); S.redo = [];
        say(`Erased ${cids.length} element${cids.length > 1 ? 's' : ''}. Undo brings them back.`);
        if (g.others) toast(`Erased ${cids.length}. ${g.others} made by others stayed.`);
      })();
      return;
    }
    case 'move': {
      if (!g.dx && !g.dy) return;
      if (g.dup){ (async () => { const made = await duplicateEls([...S.sel].map(c => S.records.get(c)), g.dx, g.dy); if (made.length){ S.sel = new Set(made); say(`Duplicated ${made.length} element${made.length > 1 ? 's' : ''}.`); } })(); return; }
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
// the box a resize handle gives: the opposite edge stays put; Shift keeps proportions (images keep them unless Shift);
// a node never gets smaller than its label needs
// Shift scales from the centre, keeping the proportions: the opposite ends move together. Without it the opposite edge stays
// put; a corner keeps an image's proportions, and Alt frees them.
function resizedBox(g, w, shift, alt = false){
  const b = g.b0, h = g.h, right = b.x + b.w, bottom = b.y + b.h;
  if (shift){
    const c = center(b), sx = /[ew]/.test(h) ? Math.abs(w.x - c.x) * 2 / b.w : 0, sy = /[ns]/.test(h) ? Math.abs(w.y - c.y) * 2 / b.h : 0;
    return scaleCentred(b, Math.max(sx, sy, minScale(g.el, b)));
  }
  let x0 = b.x, y0 = b.y, x1 = right, y1 = bottom;
  if (h.includes('w')) x0 = Math.min(w.x, right - 8); if (h.includes('e')) x1 = Math.max(w.x, b.x + 8);
  if (h.includes('n')) y0 = Math.min(w.y, bottom - 8); if (h.includes('s')) y1 = Math.max(w.y, b.y + 8);
  let nw = x1 - x0, nh = y1 - y0;
  const keep = g.el.type === 'IMAGE' && !alt;
  if (keep && h.length === 2){   // corner: follow the larger change, keep the aspect
    const a = b.w / b.h; if (nw / a > nh) nh = nw / a; else nw = nh * a;
    if (h.includes('w')) x0 = right - nw; if (h.includes('n')) y0 = bottom - nh;
  }
  if (g.el.type === 'NODE'){ const L = nodeLayout(g.el.ek, g.el.text, 0, 0, g.el.esize); if (nw < L.w){ if (h.includes('w')) x0 = right - L.w; nw = L.w; } if (nh < L.h){ if (h.includes('n')) y0 = bottom - L.h; nh = L.h; } }
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(nw), h: Math.round(nh) };
}
function snap45(a, b){
  const d = Math.hypot(b.x - a.x, b.y - a.y), t = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * Math.PI / 4;
  return { x: a.x + d * Math.cos(t), y: a.y + d * Math.sin(t) };
}
const clampZ = z => Math.min(8, Math.max(0.1, z));
cv.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey){
    const before = toWorld(e.clientX, e.clientY), z = clampZ(S.view.zoom * Math.exp(-e.deltaY * 0.01));
    S.view = { zoom: z, x: before.x - e.clientX / z, y: before.y - e.clientY / z };
  } else { S.view.x += e.deltaX / S.view.zoom; S.view.y += e.deltaY / S.view.zoom; }
  dirty = true;
}, { passive: false });

// pressing or letting go of Shift (or Alt) mid-resize switches at once, without waiting for the pointer to move
for (const t of ['keydown', 'keyup']) addEventListener(t, e => { if (G?.kind === 'resize' && G.at && (e.key === 'Shift' || e.key === 'Alt')){ G.nb = resizedBox(G, G.at, e.shiftKey, e.altKey); dirty = true; } });
