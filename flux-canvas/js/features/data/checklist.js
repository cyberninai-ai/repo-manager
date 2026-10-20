'use strict';
// @module features/data/checklist — A checklist: items in its label, ticked by anyone (TICK, signed, so it shows who ticked
// what and when), items anyone can add (ROW), and progress at the top
// @uses features/data/core
// label:  Launch checklist
//         - [x] Pricing page live
//         - [ ] Docs updated
const CL = { row: 28, top: 14, foot: 28, max: 100 };
function parseChecklist(text){
  let title = ''; const items = [];
  for (const l of String(text).split('\n')){
    const t = l.trim(); if (!t) continue;
    const m = t.match(/^(?:[-*]\s*)?\[( |x|X)\]\s*(.*)$/) || t.match(/^[-*]\s+()(.*)$/);
    if (m && m[2].trim()) items.push({ text: m[2].trim().slice(0, 300), done: /x/i.test(m[1]) });
    else if (!m && !title && !items.length) title = t.slice(0, 120);
  }
  return { title, items: items.slice(0, CL.max) };
}
const checklistText = (title, items) => [title, ...items.map(i => `- [${i.done ? 'x' : ' '}] ${i.text.replace(/\n/g, ' ')}`)].filter(Boolean).join('\n');
function checklistView(el){
  return dataMemo(el, 'cl', () => {
    const C = parseChecklist(el.text), root = dataRoot(el), items = C.items.map(i => ({ ...i, by: null, row: null }));
    for (const r of DATA.rows.get(root) || []) if (items.length < CL.max) items.push({ text: r.vals[0].slice(0, 300), done: false, by: null, row: r });
    const keys = keyed(items.map(i => i.text)), ticks = DATA.ticks.get(root);
    if (ticks) items.forEach((it, i) => { const t = ticks.get(keys[i].toLowerCase()); if (t){ it.done = t.done; it.by = t; } });
    return { ...C, items, keys, done: items.filter(i => i.done).length };
  });
}
function checklistGeom(el, b){ const V = checklistView(el), y0 = b.y + 36 + CL.top; return { V, y0, rowY: i => y0 + i * CL.row, footY: y0 + V.items.length * CL.row + 4 }; }
registerDataKind('checklist', {
  name: 'Checklist', icon: 'checklist', glyph: '☑', blurb: 'Items anyone can tick; each tick is signed', min: [240, 110],
  label: checklistText('Checklist', [{ text: 'First thing', done: false }]),
  layout(text){ const C = parseChecklist(text); mctx.font = `400 13px ${FONTS.sans}`; return { w: Math.min(420, Math.max(260, ...C.items.map(i => mctx.measureText(i.text).width + 76))), h: 36 + CL.top + C.items.length * CL.row + 4 + CL.foot }; },
  fit(el){ const V = checklistView(el); return { w: 0, h: 36 + CL.top + V.items.length * CL.row + 4 + CL.foot }; },
  draw(b, L, { el, accent }){
    if (!el) return;
    const g = checklistGeom(el, b), V = g.V, n = V.items.length;
    dataCard(b, accent); dataHead(b, V.title || 'Checklist', 'CHECKLIST', `${V.done}/${n}`);
    // progress
    const px = b.x + 12, pw = b.w - 24, py = b.y + 36 + 6;
    rr(ctx, px, py, pw, 4, 2); ctx.fillStyle = TH.line2 || TH.line; ctx.fill();
    if (V.done){ rr(ctx, px, py, Math.max(4, pw * V.done / Math.max(1, n)), 4, 2); ctx.fillStyle = V.done === n ? TH.green : TH.accent; ctx.fill(); }
    V.items.forEach((it, i) => {
      const y = g.rowY(i) + CL.row / 2, bx = b.x + 12;
      rr(ctx, bx, y - 8, 16, 16, 4);
      if (it.done){ ctx.fillStyle = TH.accent; ctx.fill(); ctx.beginPath(); ctx.moveTo(bx + 4, y); ctx.lineTo(bx + 7, y + 3.5); ctx.lineTo(bx + 12.5, y - 3.5); ctx.strokeStyle = TH.panel; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
      else { ctx.lineWidth = 1.5; ctx.strokeStyle = TH.muted; ctx.stroke(); }
      const right = it.done && it.by ? 26 : 0, tw = fitText(it.text, bx + 26, y, b.w - 50 - right, `400 13px ${FONTS.sans}`, it.done ? TH.muted : TH.ink);
      if (it.done){ ctx.beginPath(); ctx.moveTo(bx + 26, y + 1); ctx.lineTo(bx + 26 + tw, y + 1); ctx.strokeStyle = TH.muted; ctx.lineWidth = 1; ctx.stroke(); }
      if (it.done && it.by) dataAvatar(it.by.author, b.x + b.w - 20, y, 8);
      if (it.row && it.row.author !== el.author){ ctx.fillStyle = `hsl(${authorHue(personOf(it.row.author))} 55% 45%)`; ctx.fillRect(b.x + 1, y - 8, 2, 16); }
    });
    dataFoot(b, 'Add item', g.footY);
  },
  hit(el, w, b){
    const g = checklistGeom(el, b);
    if (w.y >= g.footY && w.y <= b.y + b.h) return { act: 'add', press: true };
    const i = Math.floor((w.y - g.y0) / CL.row);
    if (i < 0 || i >= g.V.items.length || w.y < g.y0) return null;
    return w.x <= b.x + 40 ? { act: 'tick', i, press: true } : { act: 'item', i };
  },
  async press(el, h){
    const g = checklistGeom(el, box(el)), V = g.V;
    if (h.act === 'tick'){ const it = V.items[h.i]; await setTick(el, V.keys[h.i], !it.done); say(`${it.done ? 'Unticked' : 'Ticked'} “${it.text}”.`); return; }
    dataField({ el, rect: { x: b0(el).x + 34, y: g.footY + 3, w: Math.min(260, b0(el).w - 46), h: CL.foot - 6 }, value: '', placeholder: 'New item', label: 'New checklist item',
      commit: async v => { if (v){ await addRow(el, [v]); say(`Item “${v}” added.`); } } });
  },
  edit(el, h){ if (h.act !== 'item' && h.act !== 'tick') return false; const V = checklistView(el), it = V.items[h.i]; setTick(el, V.keys[h.i], !it.done); return true; },
  others: 'Tick items with their box, or add one at the bottom. Only its author changes the list itself.',
  async form(el){
    const V = el ? checklistView(el) : null, base = V ? V.items.filter(i => !i.row) : null;
    const v = await formDialog(el ? 'Edit checklist' : 'New checklist', [
      { id: 'title', label: 'Title', type: 'text', value: V ? V.title : 'Launch checklist' },
      { id: 'items', label: 'Items', type: 'textarea', rows: 8, value: base ? base.map(i => `[${i.done ? 'x' : ' '}] ${i.text}`).join('\n') : '[ ] Pricing page live\n[ ] Docs updated\n[ ] Announcement drafted',
        hint: `One per line; start a line with [x] for done.${V && V.items.length > base.length ? ` ${plural(V.items.length - base.length, 'item')} added by others stay.` : ''}` },
    ], { ok: el ? 'Sign the new version' : 'Add checklist', why: 'Anyone who can draw here can tick an item or add one; each tick is signed, so the list shows who did what.' });
    if (!v) return null;
    const items = parseChecklist('x\n' + v.items.split('\n').map(l => /^\s*(?:[-*]\s*)?\[/.test(l) ? l : l.trim() ? `- [ ] ${l.trim()}` : '').join('\n')).items;
    if (el){   // a box ticked or unticked in the form is signed as a tick, so it wins over older ticks
      const keys = keyed(items.map(i => i.text)), was = new Map(V.keys.map((k, i) => [k.toLowerCase(), V.items[i]]));
      const todo = items.map((it, i) => [keys[i], it.done, was.get(keys[i].toLowerCase())]).filter(([, d, o]) => o && !o.row && o.done !== d);
      setTimeout(async () => { for (const [k, d] of todo) await setTick(current(el.cid) || el, k, d, false); }, 0);
    }
    return checklistText(v.title.trim(), items);
  },
  title: text => parseChecklist(text).title,
  describe(el){ const V = checklistView(el); return `${V.done} of ${V.items.length} done${V.items.length ? `; ${V.items.map(i => `${i.done ? 'done' : 'open'}: ${i.text}`).join('; ')}` : ''}`; },
  lines(el){ const V = checklistView(el); return V.items.map(i => `${i.done ? '☑' : '☐'} ${i.text}`); },
});
const b0 = el => box(current(el.cid) || el);
