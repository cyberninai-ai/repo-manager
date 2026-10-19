'use strict';
// @module ui/chrome — $ helpers, announcer, toast, signing pill, authors, summary, selection toolbar
/* =====================================================================
   Chrome: auth pill, authors, inspector, ledger, palette, toast
   ===================================================================== */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastT = 0;
let sayT = 0;
function say(msg){ const n = $('sr'); n.textContent = ''; clearTimeout(sayT); sayT = setTimeout(() => { n.textContent = msg; }, 30); }
const KIND = el => el.type === 'NODE' ? (NODE_KINDS[el.ek || el.k]?.name || 'card') : el.type === 'SHAPE' ? (el.k === 'circle' ? 'circle' : el.k) : el.type === 'DRAW' ? 'stroke' : el.type.toLowerCase();
function describe(el){
  if (!el) return '';
  const who = el.author === S.me?.id ? 'you' : 'author ' + short(el.author);
  const what = el.type === 'NODE' ? `${KIND(el)} “${el.text.slice(0, 80)}”${el.parent && current(el.parent)?.text ? `, connected to “${current(el.parent).text.slice(0, 40)}”` : ''}` : el.type === 'TEXT' ? `text “${el.text.slice(0, 80)}”` : el.type === 'IMAGE' ? `image${el.alt ? ` “${el.alt}”` : ' without alt text'}` : KIND(el);
  return `${what} by ${who}${S.D.groupOf.has(el.cid) ? ', grouped' : ''}${S.D.hidden.has(el.cid) ? ', revoked' : ''}`;
}
function announceSel(){
  if (!S.sel.size){ say('Selection cleared'); return; }
  if (S.sel.size === 1) say('Selected ' + describe(S.records.get([...S.sel][0])) + '. Arrow keys move, Delete revokes.');
  else say(`${S.sel.size} elements selected. Arrow keys move, Delete revokes yours.`);
}
function toast(msg){ say(msg); const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
let authShown = '';
function paintAuth(){
  if (!S.me) return;
  const open = Date.now() < auth.until;
  const left = Math.ceil((auth.until - Date.now()) / 1000);
  const txt = `<b>${short(S.me.id)}</b><span class="m"> · ${open ? `unlocked ${left}s` : 'locked'} · ${S.records.size} rec</span>`;
  if (txt !== authShown){ authShown = txt; $('authTxt').innerHTML = txt; $('auth').classList.toggle('open', open); }
}
function paintAuthTick(){ paintAuth(); }
$('auth').onclick = () => toggleLedger();
function paintSummary(){
  const c = {}; let n = 0;
  for (const el of S.D.els) if (visible(el) && !S.D.hidden.has(el.cid)){ n++; const k = KIND(el); c[k] = (c[k] || 0) + 1; }
  const oc = [...S.D.threads.values()].filter(t => !S.D.hidden.has(t.root.cid) && !t.resolved).length;
  $('summary').textContent = (oc ? `${oc} open comment thread${oc > 1 ? 's' : ''}. ` : '') + (n ? `Canvas has ${n} element${n > 1 ? 's' : ''}: ` + Object.entries(c).map(([k, v]) => `${v} ${k}${v > 1 ? 's' : ''}`).join(', ') + '.' : 'Empty canvas.');
}
function paintAuthors(){
  paintSummary();
  const counts = new Map();
  for (const el of S.D.els) if (!S.D.hidden.has(el.cid)) counts.set(el.author, (counts.get(el.author) || 0) + 1);
  if (S.me && !counts.has(S.me.id)) counts.set(S.me.id, 0);
  const box = $('authors'); box.innerHTML = '';
  for (const id of peers.keys()) if (!counts.has(id)) counts.set(id, 0);
  for (const [id, n] of [...counts].sort((a, b) => (b[0] === S.me?.id) - (a[0] === S.me?.id) || b[1] - a[1]).slice(0, 8)){
    const b = document.createElement('button');
    b.style.background = `hsl(${authorHue(id)} 55% 30%)`;   // the author's hue, dark enough for white initials (WCAG AA) b.textContent = NAMES.has(id) ? NAMES.get(id).slice(0, 2) : id.slice(2, 4);
    b.setAttribute('aria-label', `${NAMES.has(id) ? NAMES.get(id).slice(0, 2) : id.slice(2, 4)}: ${id === S.me?.id ? 'you' : 'author ' + short(id)}, ${n} element${n === 1 ? '' : 's'}. Show only this author`);
    b.setAttribute('aria-pressed', S.filter ? String(S.filter.has(id)) : 'false');
    b.dataset.tip = `${id === S.me?.id ? 'You' : NAMES.get(id) || short(id)} · ${n} element${n === 1 ? '' : 's'} · click to show only theirs`;
    if (S.filter){ b.classList.toggle('off', !S.filter.has(id)); b.classList.toggle('solo', S.filter.has(id)); }
    b.classList.toggle('live', peers.has(id));
    b.onclick = e => {
      if (e.shiftKey){ S.filter = new Set(S.filter || counts.keys()); S.filter.has(id) ? S.filter.delete(id) : S.filter.add(id); if (!S.filter.size || S.filter.size === counts.size) S.filter = null; }
      else S.filter = S.filter && S.filter.size === 1 && S.filter.has(id) ? null : new Set([id]);
      S.sel.clear(); paintAuthors(); dirty = true;
      toast(S.filter ? `Showing ${S.filter.size} author${S.filter.size > 1 ? 's' : ''} · export from ⌘K gives this sub-canvas` : 'Showing all authors');
    };
    box.appendChild(b);
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
  const B = (a, icon, label, extra = '') => `<button data-a="${a}" aria-label="${label}" ${extra}>${face(icon)}</button>`;   // tooltips come from ui/tooltip
  const V = '<span class="vs" aria-hidden="true"></span>';
  let tb = '';
  if (one && (one.type === 'TEXT' || one.type === 'NODE') && one.author === S.me.id) tb += B('edit', 'edit', 'Edit (Enter)');
  if (one && one.type === 'ARROW' && one.author === S.me.id) tb += B('label', 'tag', 'Label this connector');
  if (rs.length === 2 && rs.every(r => r.type !== 'ARROW')) tb += B('connect', 'link', 'Connect first to second (C)');
  tb += B('comment', 'comment', 'Comment (M)') + B('dup', 'copy', 'Duplicate (⌘D)') + V;
  if (rs.length >= 2) tb += B('al-l', 'al-l', 'Align left') + B('al-c', 'al-c', 'Align centres') + B('al-r', 'al-r', 'Align right') + B('al-t', 'al-t', 'Align top') + B('al-m', 'al-m', 'Align middles') + B('al-b', 'al-b', 'Align bottom') + V;
  if (rs.length >= 3) tb += B('dist-h', 'dist-h', 'Distribute horizontally') + B('dist-v', 'dist-v', 'Distribute vertically') + V;
  if (mine.length) tb += B('front', 'front', 'Bring to front (⌘⇧↑)') + B('back', 'back', 'Send to back (⌘⇧↓)') + B('lock', allLocked ? 'unlock' : 'lock', allLocked ? 'Unlock (⌘⇧L)' : 'Lock (⌘⇧L)', `aria-pressed="${allLocked}"`);
  if (rs.length >= 2) tb += B('group', 'group', 'Group (⌘G)');
  if (rs.some(r => S.D.groupOf.has(r.cid))) tb += B('ungroup', 'ungroup', 'Ungroup (⌘⇧G)');
  for (const h of TOOLBAR_HOOKS){ try { tb += h(rs, one, B) || ''; } catch (err){ console.warn(err); } }   // feature buttons (core/hooks)
  tb += B('info', 'info', 'Details and signature', `aria-pressed="${inspInfo}"`);
  if (mine.length) tb += B(one && S.D.hidden.has(one.cid) ? 'restore' : 'revoke', one && S.D.hidden.has(one.cid) ? 'undo' : 'trash', one && S.D.hidden.has(one.cid) ? 'Restore' : 'Revoke (Delete)', 'class="danger"');
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
function inspDetails(){
  let html;
  if (S.sel.size === 1){
    const r = S.records.get([...S.sel][0]);
    const g = S.D.groupOf.get(r.cid);
    const kind = KIND(r);
    const pts = r.type === 'DRAW' ? strokeGeom(r.f.R)?.pts.length : null;
    html = `<div class="who"><span class="dot" style="background:${authorColor(r.author)}"></span><b>${esc(kind)}</b>
      by ${r.author === S.me.id ? 'you' : esc(short(r.author))} <span class="ok">✓ signed</span>${S.D.hidden.has(r.cid) ? ' <span class="bad">revoked</span>' : ''}</div>
      <div class="meta">z ${r.z} · ${new Date(r.t).toLocaleString()}${r.type === 'IMAGE' ? `<br>alt: ${r.alt ? '“' + esc(r.alt) + '”' : '<span class="bad">none</span>'}` : ''}<br>${recBytes(r)} B${r.type === 'IMAGE' ? ' · move: select mode (V) and drag, or arrow keys · resize: corner handle or +/−' : ''}${pts ? ` · ${pts} pts → ${S.blobs.get(r.f.R).length} B blob` : ''}${g ? ' · grouped' : ''}<br>${esc(r.cid.slice(0, 22))}…</div>
      <div class="acts"><button class="btn" data-a="copy">copy pattern</button><button class="btn" data-a="solo">only this author</button></div>`;
  } else {
    const rs = [...S.sel].map(c => S.records.get(c)), authors = new Set(rs.map(r => r.author)), mine = rs.filter(r => r.author === S.me.id).length;
    html = `<div class="who"><b>${rs.length} elements</b> · ${authors.size} author${authors.size > 1 ? 's' : ''}</div>
      <div class="meta">${mine} yours · drag to move · Alt-drag duplicates · Delete revokes yours</div>
      <div class="acts"><button class="btn" data-a="copy">copy patterns</button></div>`;
  }
  return html;
}
$('insp').addEventListener('pointerdown', e => e.stopPropagation());
$('insp').addEventListener('click', async e => {
  const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
  const rs = [...S.sel].map(c => S.records.get(c)).filter(Boolean);
  if (a === 'copy') copy(rs.map(r => r.raw).join('\n'), `${rs.length} signed pattern${rs.length > 1 ? 's' : ''} copied`);
  if (a === 'solo'){ S.filter = new Set([rs[0].author]); S.sel.clear(); paintAuthors(); }
  if (a === 'comment') commentOnSelection();
  if (a === 'edit') editAny(rs[0]);
  if (a === 'revoke') await revokeSelection();
  if (a === 'restore'){ await setNeg(rs[0].cid, false); }
  if (a === 'group') await groupSelection();
  if (a === 'ungroup') await ungroupSelection();
  if (a === 'info'){ inspInfo = !inspInfo; }
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

