'use strict';
// @module ui/chrome — Signing pill, authors, summary, selection toolbar
// @uses core/announce, render, features (selection toolbar actions)
const KIND = el => el.type === 'NODE' ? (NODE_KINDS[el.ek || el.k]?.name || 'card') : el.type === 'SHAPE' ? (el.k === 'circle' ? 'circle' : el.k) : el.type === 'DRAW' ? 'stroke' : el.type.toLowerCase();
function describe(el){
  if (!el) return '';
  const who = el.author === S.me?.id ? 'you' : 'author ' + short(el.author);
  const what = el.type === 'NODE' && NODE_KINDS[el.ek]?.describe ? NODE_KINDS[el.ek].describe(el) : el.type === 'NODE' ? `${KIND(el)} “${el.text.slice(0, 80)}”${el.parent && current(el.parent)?.text ? `, connected to “${current(el.parent).text.slice(0, 40)}”` : ''}` : el.type === 'TEXT' ? `text “${el.text.slice(0, 80)}”` : el.type === 'IMAGE' ? `image${el.alt ? ` “${el.alt}”` : ' without alt text'}` : KIND(el);
  return `${what} by ${who}${S.D.groupOf.has(el.cid) ? ', grouped' : ''}${S.D.hidden.has(el.cid) ? ', deleted' : ''}`;
}
function announceSel(){
  if (!S.sel.size){ say('Selection cleared'); return; }
  if (S.sel.size === 1) say('Selected ' + describe(S.records.get([...S.sel][0])) + '. Arrow keys move, Delete removes.');
  else say(`${S.sel.size} elements selected. Arrow keys move, Delete removes yours.`);
}
let authShown = '';
function paintAuth(){
  if (!S.me || !$('auth')) return;   // the signing pill now lives in the activity log only
  const open = Date.now() < auth.until;
  const left = Math.ceil((auth.until - Date.now()) / 1000);
  const txt = `<b>${short(S.me.id)}</b><span class="m"> · ${open ? `unlocked ${left}s` : 'locked'} · ${S.records.size} rec</span>`;
  if (txt !== authShown){ authShown = txt; $('authTxt').innerHTML = txt; $('auth').classList.toggle('open', open); }
}
function paintAuthTick(){ paintAuth(); }
FRAME_HOOKS.push(paintAuthTick);
function paintSummary(){
  const c = {}; let n = 0;
  for (const el of S.D.els) if (visible(el) && !S.D.hidden.has(el.cid)){ n++; const k = KIND(el); c[k] = (c[k] || 0) + 1; }
  const oc = [...S.D.threads.values()].filter(t => !S.D.hidden.has(t.root.cid) && !t.resolved).length;
  $('summary').textContent = (oc ? `${oc} open comment thread${oc > 1 ? 's' : ''}. ` : '') + (n ? `Canvas has ${n} element${n > 1 ? 's' : ''}: ` + Object.entries(c).map(([k, v]) => `${v} ${k}${v > 1 ? 's' : ''}`).join(', ') + '.' : 'Empty canvas.');
}
const initials = id => NAMES.has(id) ? NAMES.get(id).slice(0, 2) : id.slice(2, 4);
function paintAuthors(){
  paintSummary();
  const counts = new Map();
  for (const el of S.D.els) if (!S.D.hidden.has(el.cid)) counts.set(el.author, (counts.get(el.author) || 0) + 1);
  if (S.me && !counts.has(S.me.id)) counts.set(S.me.id, 0);
  const box = $('authors'); box.innerHTML = '';
  for (const id of peers.keys()) if (!counts.has(id)) counts.set(id, 0);
  for (const [id, n] of [...counts].sort((a, b) => (b[0] === S.me?.id) - (a[0] === S.me?.id) || b[1] - a[1]).slice(0, counts.size > 4 ? 3 : 4)){
    const b = document.createElement('button');
    b.style.background = `hsl(${authorHue(id)} 55% 30%)`;   // the author's hue, dark enough for white initials (WCAG AA)
    b.textContent = initials(id);
    b.setAttribute('aria-label', `${NAMES.has(id) ? NAMES.get(id).slice(0, 2) : id.slice(2, 4)}: ${id === S.me?.id ? 'you' : 'author ' + short(id)}, ${n} element${n === 1 ? '' : 's'}. Show only this author`);
    b.setAttribute('aria-pressed', S.filter ? String(S.filter.has(id)) : 'false');
    b.dataset.tip = `${id === S.me?.id ? 'You' : NAMES.get(id) || short(id)} · ${n} element${n === 1 ? '' : 's'} · click to show only theirs`;
    if (S.filter){ b.classList.toggle('off', !S.filter.has(id)); b.classList.toggle('solo', S.filter.has(id)); }
    b.classList.toggle('live', peers.has(id)); b.classList.toggle('me', id === S.me?.id);
    b.onclick = e => {
      if (e.shiftKey){ S.filter = new Set(S.filter || counts.keys()); S.filter.has(id) ? S.filter.delete(id) : S.filter.add(id); if (!S.filter.size || S.filter.size === counts.size) S.filter = null; }
      else S.filter = S.filter && S.filter.size === 1 && S.filter.has(id) ? null : new Set([id]);
      S.sel.clear(); paintAuthors(); dirty = true;
      toast(S.filter ? `Showing ${S.filter.size} author${S.filter.size > 1 ? 's' : ''} · export from ⌘K gives this sub-canvas` : 'Showing all authors');
    };
    box.appendChild(b);
  }
  if (counts.size > 4){   // more people than fit: the rest are one click away
    const more = document.createElement('button'); more.className = 'more'; more.textContent = `+${counts.size - 3}`;
    more.setAttribute('aria-label', `${counts.size - 3} more people. People and permissions`); more.dataset.tip = 'Everyone on this canvas';
    more.onclick = () => openPeople(); box.appendChild(more);
  }
}
function recBytes(r){ return r.size + ((r.type === 'DRAW' || r.type === 'IMAGE') && r.neg === null && S.blobs.has(r.f.R) ? S.blobs.get(r.f.R).length : 0); }
let inspInfo = false;
function paintInspector(){
  const el = $('insp');
  if (!S.sel.size || G?.kind === 'move' || G?.kind === 'resize' || taOpen()){ el.style.display = 'none'; return; }
  const sb = selBox(); if (!sb){ el.style.display = 'none'; return; }
  const rs = [...S.sel].map(c => S.records.get(c)).filter(Boolean), one = rs.length === 1 ? rs[0] : null;
  const mine = rs.filter(r => r.author === S.me.id), anyLocked = rs.some(r => r.locked), allLocked = rs.every(r => r.locked);
  const B = (a, icon, label, extra = '') => `<button data-a="${a}" aria-label="${label}" ${extra}>${face(icon)}</button>`;   // tooltips come from ui/toolbar
  const V = '<span class="vs" aria-hidden="true"></span>';
  // Only what people reach for every time sits on the toolbar; everything else is one click away under More, with words.
  let tb = '';
  if (one && (one.type === 'TEXT' || one.type === 'NODE') && one.author === S.me.id) tb += B('edit', 'edit', 'Edit text (Enter)');
  if (one && one.type === 'ARROW' && one.author === S.me.id) tb += B('label', 'tag', 'Label this connector');
  if (rs.length === 2 && rs.every(r => r.type !== 'ARROW')) tb += B('connect', 'link', 'Connect them (C)');
  tb += B('comment', 'comment', 'Comment (M)');
  for (const h of TOOLBAR_HOOKS){ try { tb += primaryOnly(h(rs, one, B) || ''); } catch (err){ console.warn(err); } }   // feature buttons marked data-primary
  if (rs.length >= 2) tb += B('align', 'al-l', 'Align and distribute', 'aria-haspopup="menu"');
  tb += B('dup', 'copy', 'Duplicate (⌘D)');
  if (mine.length) tb += B(one && S.D.hidden.has(one.cid) ? 'restore' : 'revoke', one && S.D.hidden.has(one.cid) ? 'undo' : 'trash', one && S.D.hidden.has(one.cid) ? 'Restore' : 'Delete (⌫)', 'class="danger"');
  tb += V + B('more', 'more', 'More actions', 'aria-haspopup="menu"');
  let html = `<div class="tb" role="toolbar" aria-label="Selection actions">${tb}</div>`;
  if (inspInfo) html += `<div class="info">${inspDetails()}</div>`;
  void anyLocked;
  if (el.dataset.h !== html){ el.innerHTML = html; el.dataset.h = html; }
  el.style.display = 'block';
  // sit above the selection (clear of a node's top “+” handle); drop below if there's no room
  const top = toScreen(sb.x + sb.w / 2, sb.y), bot = toScreen(sb.x, sb.y + sb.h), lift = soleNode() ? 34 : 12;
  let y = top.y - el.offsetHeight - lift;
  if (y < 64) y = Math.min(bot.y + (soleNode() ? 40 : 14), innerHeight - el.offsetHeight - 8 - barH());
  y = Math.min(y, innerHeight - barH() - el.offsetHeight - 8);
  const x = Math.min(Math.max(8, top.x - el.offsetWidth / 2), innerWidth - el.offsetWidth - 8);
  el.style.left = x + 'px'; el.style.top = Math.max(8, y) + 'px';
}
// feature hook HTML: keep the buttons marked data-primary for the toolbar; the rest go to the More menu
function primaryOnly(html){
  const t = document.createElement('template'); t.innerHTML = html;
  return [...t.content.querySelectorAll('button')].filter(b => b.hasAttribute('data-primary')).map(b => b.outerHTML).join('');
}
function moreItems(rs, one){
  const mine = rs.filter(r => r.author === S.me.id), allLocked = rs.every(r => r.locked), items = [];
  const t = document.createElement('template');
  const B = (a, icon, label, extra = '') => `<button data-a="${a}" aria-label="${label}" data-icon="${icon}" ${extra}>${face(icon)}</button>`;
  for (const h of TOOLBAR_HOOKS){ try { t.innerHTML += h(rs, one, B) || ''; } catch (err){ console.warn(err); } }
  for (const b of t.content.querySelectorAll('button:not([data-primary])')){
    const a = b.dataset.a, label = (b.getAttribute('aria-label') || b.textContent).replace(/\s*\(.*\)$/, '');
    items.push({ label: label[0].toUpperCase() + label.slice(1), icon: b.dataset.icon || b.querySelector('use')?.getAttribute('href')?.slice(3) || 'blank', on: b.getAttribute('aria-pressed') === 'true', run: () => TOOLBAR_ACTIONS[a]?.(rs, b) });
  }
  if (items.length) items.push('-');
  if (mine.length) items.push({ label: 'Bring to front', icon: 'front', key: '⌘⇧↑', run: () => reorder(true) }, { label: 'Send to back', icon: 'back', key: '⌘⇧↓', run: () => reorder(false) },
    { label: allLocked ? 'Unlock' : 'Lock in place', icon: allLocked ? 'unlock' : 'lock', key: '⌘⇧L', run: toggleLock });
  if (rs.length >= 2) items.push({ label: 'Group', icon: 'group', key: '⌘G', run: groupSelection });
  if (rs.some(r => S.D.groupOf.has(r.cid))) items.push({ label: 'Ungroup', icon: 'ungroup', key: '⌘⇧G', run: ungroupSelection });
  items.push({ label: 'Copy', icon: 'copy', key: '⌘C', run: copySelection });
  items.push('-', { label: inspInfo ? 'Hide details' : 'Details: who made it, when', icon: 'info', run: () => { inspInfo = !inspInfo; inspShown = ''; dirty = true; } });
  return items;
}
const ALIGN_ITEMS = [['al-l', 'Align left'], ['al-c', 'Align centres'], ['al-r', 'Align right'], ['al-t', 'Align top'], ['al-m', 'Align middles'], ['al-b', 'Align bottom']];
let inspShown = '';
function inspDetails(){
  let html;
  if (S.sel.size === 1){
    const r = S.records.get([...S.sel][0]);
    const g = S.D.groupOf.get(r.cid);
    const kind = KIND(r);
    const pts = r.type === 'DRAW' ? strokeGeom(r.f.R)?.pts.length : null;
    html = `<div class="who"><span class="dot" style="background:${authorColor(r.author)}"></span><b>${esc(kind)}</b>
      by ${r.author === S.me.id ? 'you' : esc(short(r.author))} <span class="ok">✓ verified</span>${S.D.hidden.has(r.cid) ? ' <span class="bad">deleted</span>' : ''}</div>
      <div class="meta">z ${r.z} · ${new Date(r.t).toLocaleString()}${r.type === 'IMAGE' ? `<br>alt: ${r.alt ? '“' + esc(r.alt) + '”' : '<span class="bad">none</span>'}` : ''}<br>${recBytes(r)} B${r.type === 'IMAGE' ? ' · move: select mode (V) and drag, or arrow keys · resize: corner handle or +/−' : ''}${pts ? ` · ${pts} pts → ${S.blobs.get(r.f.R).length} B blob` : ''}${g ? ' · grouped' : ''}<br>${esc(r.cid.slice(0, 22))}…</div>
      <div class="acts"><button class="btn" data-a="solo">Show only their work</button><button class="btn" data-a="copy">Copy signed record</button></div>`;
  } else {
    const rs = [...S.sel].map(c => S.records.get(c)), authors = new Set(rs.map(r => r.author)), mine = rs.filter(r => r.author === S.me.id).length;
    html = `<div class="who"><b>${rs.length} elements</b> · ${authors.size} author${authors.size > 1 ? 's' : ''}</div>
      <div class="meta">${mine} yours · drag to move · Alt-drag duplicates · Delete removes yours</div>
      <div class="acts"><button class="btn" data-a="copy">Copy signed records</button></div>`;
  }
  return html;
}
$('insp').addEventListener('pointerdown', e => e.stopPropagation());
$('insp').addEventListener('click', async e => {
  const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
  const rs = [...S.sel].map(c => S.records.get(c)).filter(Boolean);
  if (a === 'copy') copy(rs.map(r => r.raw).join('\n'), `${rs.length} signed record${rs.length > 1 ? 's' : ''} copied`);
  if (a === 'solo'){ S.filter = new Set([rs[0].author]); S.sel.clear(); paintAuthors(); }
  if (a === 'comment') commentOnSelection();
  if (a === 'edit') editAny(rs[0]);
  if (a === 'revoke') await revokeSelection();
  if (a === 'restore'){ await setNeg(rs[0].cid, false); }
  if (a === 'group') await groupSelection();
  if (a === 'ungroup') await ungroupSelection();
  if (a === 'info'){ inspInfo = !inspInfo; }
  if (a === 'more'){ openMenu(e.target.closest('[data-a]'), moreItems(rs, rs.length === 1 ? rs[0] : null)); return; }
  if (a === 'align'){ openMenu(e.target.closest('[data-a]'), [...ALIGN_ITEMS.map(([k, l]) => ({ label: l, icon: k, run: () => alignSel(k) })),
    ...(rs.length >= 3 ? ['-', { label: 'Distribute horizontally', icon: 'dist-h', run: () => alignSel('dist-h') }, { label: 'Distribute vertically', icon: 'dist-v', run: () => alignSel('dist-v') }] : [])]); return; }
  if (a === 'dup') await duplicateSelection();
  if (a === 'connect') await connectSel();
  if (a === 'front' || a === 'back') await reorder(a === 'front');
  if (a === 'lock') await toggleLock();
  if (a === 'label') await labelArrow(rs[0]);
  if (a.startsWith('al-') || a.startsWith('dist-')) await alignSel(a);
  if (TOOLBAR_ACTIONS[a]) await TOOLBAR_ACTIONS[a](rs, e.target.closest('[data-a]'));
  dirty = true;
});
async function copy(text, msg){ try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('Clipboard blocked by the browser.'); } }

CHANGE_HOOKS.push(paintAuthors);
RENDER_HOOKS.dom.push(paintInspector);   // after the style bar (registered first): the toolbar keeps clear of it
