'use strict';
// @module features/structure — Outline panel (audit X2): the canvas as a navigable tree — frames, what sits in them,
// how things connect, votes and comments — so the spatial structure is available without seeing it
// @uses chrome (describe), brainstorm (reactions), comments, derive
const ST = { on: false, closed: new Set(), focus: null };   // frames start expanded
const isFrameEl = el => el.type === 'NODE' && el.ek === 'frame';
const labelOf = el => {
  const t = (el.text || el.alt || el.elabel || '').replace(/\s+/g, ' ').trim();
  return t ? `${KIND(el)} “${t.slice(0, 70)}${t.length > 70 ? '…' : ''}”` : KIND(el);
};
// reading order: rows top to bottom (a row is anything within 40 units), then left to right
const reading = (a, b) => { const A = box(a), B = box(b); return Math.abs(A.y - B.y) > 40 ? A.y - B.y : A.x - B.x; };
function structure(){
  const els = S.D.els.filter(el => visible(el) && !S.D.hidden.has(el.cid) && !S.D.superseded.has(el.cid) && el.type !== 'ARROW' && box(el));
  const frames = els.filter(isFrameEl), parentOf = new Map();
  for (const el of els){
    const c = center(box(el)); let best = null;
    for (const f of frames) if (f !== el){ const b = box(f); if (inside(c, b) && (!best || b.w * b.h < box(best).w * box(best).h)) best = f; }   // innermost frame
    parentOf.set(el.cid, best ? best.cid : 'root');
  }
  const kids = new Map([['root', []]]);
  for (const el of els){ const p = parentOf.get(el.cid); if (!kids.has(p)) kids.set(p, []); kids.get(p).push(el); }
  for (const l of kids.values()) l.sort(reading);
  // connections: arrows (with their meaning) and diagram tree links
  const links = new Map(), add = (cid, s) => { if (!links.has(cid)) links.set(cid, []); links.get(cid).push(s); };
  for (const a of S.D.els) if (a.type === 'ARROW' && visible(a) && !S.D.hidden.has(a.cid)){
    const f = current(a.f.FROM), t = current(a.f.TO); if (!f || !t) continue;
    const rel = a.elabel ? ` (${a.elabel})` : '';
    add(f.cid, `→ ${labelOf(t)}${rel}`); add(t.cid, `← ${labelOf(f)}${rel}`);
  }
  for (const el of els) if (el.type === 'NODE' && el.parent){ const p = current(el.parent); if (p && p !== el){ add(el.cid, `child of ${labelOf(p)}`); } }
  return { kids, links };
}
function stMeta(el){
  const bits = [], re = S.D.reactions?.get(el.cid);
  if (re?.vote?.size) bits.push(`${re.vote.size} vote${re.vote.size > 1 ? 's' : ''}`);
  const others = re ? Object.entries(re).filter(([k, s]) => k !== 'vote' && s.size).map(([k, s]) => `${REACTIONS[k]?.name || k} ${s.size}`) : [];
  bits.push(...others);
  const cm = [...S.D.threads.values()].filter(t => t.root.on && current(t.root.on)?.cid === el.cid && !S.D.hidden.has(t.root.cid));
  if (cm.length) bits.push(`${cm.length} comment${cm.length > 1 ? 's' : ''}${cm.some(t => !t.resolved) ? ' (open)' : ''}`);
  if (el.author !== S.me?.id) bits.push(`by ${NAMES.get(el.author) || short(el.author)}`);
  return bits.join(' · ');
}
function paintStructure(){
  if (!ST.on) return;
  const { kids, links } = structure(), out = [];
  let n = 0;
  const walk = (list, level) => {
    for (const el of list){
      n++;
      const sub = kids.get(el.cid) || [], open = !ST.closed.has(el.cid), ls = links.get(el.cid) || [], meta = stMeta(el);
      out.push(`<li role="treeitem" aria-level="${level}" data-c="${el.cid}" tabindex="-1"${sub.length ? ` aria-expanded="${open}"` : ''}${S.sel.has(el.cid) ? ' aria-selected="true"' : ''}>
        <div class="st-row">${sub.length ? `<span class="tw" aria-hidden="true">${ic(open ? 'chev-down' : 'chev-right')}</span>` : '<span class="tw"></span>'}<span class="st-l">${esc(labelOf(el))}</span>${sub.length ? `<span class="st-n">${sub.length}</span>` : ''}</div>
        ${meta || ls.length ? `<div class="st-m">${esc([meta, ...ls].filter(Boolean).join(' · '))}</div>` : ''}</li>`);
      if (sub.length && open) walk(sub, level + 1);
    }
  };
  walk(kids.get('root'), 1);
  const frames = [...kids.keys()].filter(k => k !== 'root').length;
  $('stStats').textContent = n ? `${n} element${n > 1 ? 's' : ''} · ${frames} frame${frames === 1 ? '' : 's'} · in reading order. Enter selects and shows one on the canvas.` : '';
  const prev = document.activeElement?.closest?.('#stTree [data-c]')?.dataset.c;
  $('stTree').innerHTML = out.join('') || '<li class="empty" role="none">Nothing on the canvas yet.</li>';
  const items = [...$('stTree').querySelectorAll('[data-c]')];
  const keep = items.find(li => li.dataset.c === (prev || ST.focus)) || items[0];
  if (keep){ keep.tabIndex = 0; if (prev) keep.focus(); }
}
function toggleStructure(force){
  ST.on = force ?? !ST.on;
  if (ST.on){ if (S.ledger) toggleLedger(false); if ($('comments').style.display === 'flex') toggleComments(false); if (WK.on) toggleWork(false); }
  $('structure').style.display = ST.on ? 'flex' : 'none'; 
  paintStructure();
  if (ST.on) ($('stTree').querySelector('[tabindex="0"]') || $('stClose')).focus(); else cv.focus({ preventScroll: true });
  say(ST.on ? 'Outline. Arrow keys move through the canvas, Enter shows an element.' : 'Outline closed.');
}
function showOnCanvas(cid){
  const el = S.records.get(cid); if (!el) return;
  S.sel = new Set([cid]); expandSel(); ensureVisible(el); dirty = true; announceSel(); ST.focus = cid;
}
$('stClose').onclick = () => toggleStructure(false);
$('stTree').addEventListener('click', e => {
  const li = e.target.closest('[data-c]'); if (!li) return;
  if (e.target.closest('.tw') && li.hasAttribute('aria-expanded')){ const c = li.dataset.c; ST.closed.has(c) ? ST.closed.delete(c) : ST.closed.add(c); ST.focus = c; paintStructure(); return; }
  showOnCanvas(li.dataset.c); paintStructure();
});
$('stTree').addEventListener('keydown', e => {
  const items = [...$('stTree').querySelectorAll('[data-c]')], li = e.target.closest('[data-c]'), i = items.indexOf(li); if (i < 0) return;
  const go = j => { const n = items[Math.max(0, Math.min(items.length - 1, j))]; for (const x of items) x.tabIndex = -1; n.tabIndex = 0; n.focus(); ST.focus = n.dataset.c; };
  const c = li.dataset.c, exp = li.getAttribute('aria-expanded');
  if (e.key === 'ArrowDown') go(i + 1);
  else if (e.key === 'ArrowUp') go(i - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(items.length - 1);
  else if (e.key === 'ArrowRight' && exp === 'false'){ ST.closed.delete(c); ST.focus = c; paintStructure(); $('stTree').querySelector(`[data-c="${c}"]`)?.focus(); }
  else if (e.key === 'ArrowLeft' && exp === 'true'){ ST.closed.add(c); ST.focus = c; paintStructure(); $('stTree').querySelector(`[data-c="${c}"]`)?.focus(); }
  else if (e.key === 'ArrowLeft'){ const lv = +li.getAttribute('aria-level'); for (let j = i - 1; j >= 0; j--) if (+items[j].getAttribute('aria-level') < lv){ go(j); break; } }
  else if (e.key === 'Enter' || e.key === ' '){ showOnCanvas(c); paintStructure(); }
  else if (e.key === 'Escape') toggleStructure(false);
  else return;
  e.preventDefault(); e.stopPropagation();
});
CHANGE_HOOKS.push(paintStructure);
KEY_HOOKS.push((e, c) => { if (c.onCanvas && e.key === 'O' && e.shiftKey && !c.mod){ e.preventDefault(); toggleStructure(); return true; } return false; });
PALETTE_HOOKS.push(add => add('view', 'Outline of the canvas', () => toggleStructure(true), { k: '⇧O' }));
