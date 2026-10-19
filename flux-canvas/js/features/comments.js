'use strict';
// @module features/comments — Comments panel: threads, replies, resolve, pin moving
// @uses comment-pins
/* comments */
let activeThread = null, draft = null, pinMove = null;
S.cmShowDone = false;
const drafts = {};   // unsent reply text per thread, kept across re-renders
function toggleComments(force){
  const on = force ?? $('comments').style.display !== 'flex';
  $('comments').style.display = on ? 'flex' : 'none';
  if (on && S.ledger) toggleLedger(false);
  if (on && ST.on) toggleStructure(false);
  if (on) paintComments(); else { activeThread = null; draft = null; dirty = true; cv.focus({ preventScroll: true }); }
  $('cmtList').setAttribute('aria-expanded', String(on));
  document.body.classList.toggle('drawer', on || S.ledger);
}
function targetName(c){
  if (!c.on) return 'the canvas';
  const t = current(c.on);
  return t ? describe(t) : 'an element not loaded here';
}
function endPinMove(){
  const id = pinMove; pinMove = null; commitKb();
  say('Done moving the pin.');
  setTimeout(() => document.querySelector(`#cmList textarea[data-k="${id}"]`)?.focus(), 0);
}
function startComment(w, target){
  target = target && target.type !== 'ARROW' ? current(target.cid) : null;
  const b = target && box(target);
  draft = target && b ? { on: target.cid, x: w.x - b.x, y: w.y - b.y, px: w.x, py: w.y } : { on: null, x: w.x, y: w.y, px: w.x, py: w.y };
  activeThread = null; dirty = true;
  toggleComments(true);
  setTimeout(() => $('cmNew')?.focus(), 0);
}
function commentOnSelection(){
  const el = S.sel.size ? S.records.get([...S.sel][0]) : null, b = el && box(el);
  if (b) startComment({ x: b.x + b.w, y: b.y }, el); else startComment(viewCenter(), null);
}
function openThread(id){
  activeThread = id; draft = null;
  const t = S.D.threads.get(id);
  if (t && t.resolved && !S.cmShowDone){ S.cmShowDone = true; $('cmShowDone').checked = true; }
  toggleComments(true);
  if (t){
    const p = pinPos(t.root), s = toScreen(p.x, p.y);
    if (s.x < 0 || s.y < 0 || s.x > innerWidth - 420 || s.y > innerHeight){ S.view.x = p.x - (innerWidth - 400) / 2 / S.view.zoom; S.view.y = p.y - innerHeight / 2 / S.view.zoom; }
    say(`Comment thread on ${targetName(t.root)}, ${1 + t.replies.length} message${t.replies.length ? 's' : ''}${t.resolved ? ', resolved' : ''}.`);
  }
  dirty = true;
  setTimeout(() => { const el = document.querySelector(`.thread[data-id="${id}"]`); el?.scrollIntoView({ block: 'nearest' }); el?.querySelector('textarea')?.focus(); }, 0);
}
function msgHtml(c){
  const mine = c.author === S.me?.id;
  return `<div class="msg"><div class="by"><span class="dot" style="background:${authorColor(c.author)}" aria-hidden="true"></span><b>${mine ? 'you' : esc(short(c.author))}</b>
    <span>${new Date(c.t).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span><span class="ok" title="signature verified">✓</span>
    ${mine ? `<button class="btn x" data-a="del" data-c="${c.cid}" aria-label="Delete your comment">delete</button>` : ''}</div>
    <div class="tx">${esc(c.text)}</div></div>`;
}
function paintComments(){
  const open = [...S.D.threads.values()].filter(t => !S.D.hidden.has(t.root.cid) && !t.resolved).length;
  $('cmtN').textContent = open || '';
  if ($('comments').style.display !== 'flex') return;
  // keep what's being typed (and the caret) when records arrive while someone writes
  const ae = document.activeElement, keep = ae && ae.dataset && ae.dataset.k ? { k: ae.dataset.k, a: ae.selectionStart, b: ae.selectionEnd } : null;
  document.querySelectorAll('#cmList textarea').forEach(t => { drafts[t.dataset.k] = t.value; });
  const list = [...S.D.threads.entries()].filter(([, t]) => !S.D.hidden.has(t.root.cid) && (!t.resolved || S.cmShowDone))
    .sort((a, b) => (a[1].resolved - b[1].resolved) || b[1].root.z - a[1].root.z);
  let html = '';
  if (draft) html += `<div class="compose" role="group" aria-label="New comment"><label for="cmNew">New comment on ${esc(draft.on ? targetName(draft) : 'the canvas')}</label>
    <textarea id="cmNew" data-k="new" placeholder="Write a comment… (Enter posts, Shift+Enter new line)">${esc(drafts.new || '')}</textarea>
    <div class="row2"><button class="btn" data-a="cancel">cancel</button><button class="btn" data-a="post">post</button></div></div>`;
  html += list.map(([id, t]) => {
    const msgs = [t.root, ...t.replies].filter(c => !S.D.hidden.has(c.cid));
    return `<article class="thread${id === activeThread ? ' active' : ''}${t.resolved ? ' done' : ''}" data-id="${id}" aria-label="Thread on ${esc(targetName(t.root))}">
      <div class="on"><span>on ${esc(targetName(t.root))}</span><span class="st ${t.resolved ? 'ok' : ''}">${t.resolved ? 'resolved' : 'open'}</span></div>
      <canvas class="thumb" data-thumb="${id}" aria-hidden="true" title="Show on canvas"></canvas>
      ${msgs.map(msgHtml).join('')}
      <textarea data-k="${id}" aria-label="Reply" placeholder="Reply… (Enter posts)">${esc(drafts[id] || '')}</textarea>
      <div class="row2"><button class="btn" data-a="show" data-id="${id}">show on canvas</button>
        <button class="btn" data-a="movepin" data-id="${id}">move pin</button>
        <button class="btn" data-a="${t.resolved ? 'reopen' : 'resolve'}" data-id="${id}">${t.resolved ? 'reopen' : 'resolve'}</button>
        <button class="btn" data-a="reply" data-id="${id}">reply</button></div></article>`;
  }).join('');
  if (!html) html = '<div class="empty">No comments yet. Pick the Comment tool (M), then click an element or a spot.</div>';
  $('cmList').innerHTML = html;
  if (keep){ const t = document.querySelector(`#cmList textarea[data-k="${keep.k}"]`); if (t){ t.focus(); t.setSelectionRange(keep.a, keep.b); } }
  document.querySelectorAll('#cmList canvas[data-thumb]').forEach(cnv => { const t = S.D.threads.get(cnv.dataset.thumb); if (t) drawThumb(cnv, t); });
}
async function postFrom(k){
  const ta2 = document.querySelector(`#cmList textarea[data-k="${k}"]`), text = (ta2?.value || '').trim();
  if (!text){ ta2?.focus(); return; }
  delete drafts[k]; ta2.value = '';
  if (k === 'new'){
    const d = draft; draft = null;
    const cid = await commitComment({ on: d.on, x: d.x, y: d.y, text });
    if (cid){ activeThread = cid; say(`Comment posted on ${d.on ? targetName(d) : 'the canvas'}. Signed.`); }
  } else {
    const t = S.D.threads.get(k);
    const cid = await commitComment({ on: t.root.on, x: t.root.x, y: t.root.y, text, re: k });
    if (cid) say('Reply posted. Signed.');
    activeThread = k;
  }
  paintComments(); dirty = true;
  setTimeout(() => document.querySelector(`#cmList textarea[data-k="${activeThread}"]`)?.focus(), 0);
}
$('cmList').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.target.tagName === 'TEXTAREA' && e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); postFrom(e.target.dataset.k); }
  if (e.key === 'Escape'){ e.preventDefault(); if (draft){ draft = null; delete drafts.new; paintComments(); dirty = true; } else toggleComments(false); }
});
$('cmList').addEventListener('focusin', e => { const th = e.target.closest('.thread'); if (th && th.dataset.id !== activeThread){ activeThread = th.dataset.id; dirty = true; document.querySelectorAll('.thread.active').forEach(x => x.classList.remove('active')); th.classList.add('active'); } });
$('cmList').addEventListener('click', async e => {
  const th = e.target.closest('canvas[data-thumb]'); if (th){ $('cmList').querySelector(`button[data-a="show"][data-id="${th.dataset.thumb}"]`)?.click(); return; }
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.a, id = b.dataset.id;
  if (a === 'post') postFrom('new');
  if (a === 'reply') postFrom(id);
  if (a === 'cancel'){ draft = null; delete drafts.new; paintComments(); dirty = true; }
  if (a === 'resolve' || a === 'reopen'){ await commitResolve(id, a === 'resolve'); say(a === 'resolve' ? 'Thread resolved.' : 'Thread reopened.'); }
  if (a === 'movepin'){
    pinMove = id; activeThread = id; S.sel.clear(); dirty = true; cv.focus({ preventScroll: true });
    say('Moving the comment pin. Arrow keys move it, Shift for bigger steps, Enter or Escape when done. You can also drag the pin.');
    toast('Arrow keys move the pin · Enter or Esc when done');
    return;
  }
  if (a === 'show'){ openThread(id); const t = S.D.threads.get(id); if (t?.root.on){ const el = current(t.root.on); if (el && visible(el)){ S.sel = new Set([el.cid]); dirty = true; } } }
  if (a === 'del'){ if (await setNeg(b.dataset.c, true)) say('Your comment was revoked. It stays in the ledger as a signed record.'); }
});
$('cmShowDone').addEventListener('change', e => { S.cmShowDone = e.target.checked; paintComments(); dirty = true; });
$('cmPrev').addEventListener('change', e => { S.cmPrev = e.target.checked; try { localStorage.setItem('flux:cmPrev', S.cmPrev ? '1' : '0'); } catch {} dirty = true; });
try { if (localStorage.getItem('flux:cmPrev') === '0'){ S.cmPrev = false; $('cmPrev').checked = false; } } catch {}
$('cmClose').onclick = () => toggleComments(false);
$('cmtList').onclick = () => toggleComments();
$('textBtn').onclick = () => setPlacing(placing === 'text' ? null : 'text');
cv.addEventListener('pointerdown', () => { if (pinMove){ pinMove = null; commitKb(); } }, true);
$('cmtBtn').onclick = () => setPlacing(placing === 'comment' ? null : 'comment');

CHANGE_HOOKS.push(paintComments);
