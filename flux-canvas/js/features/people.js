'use strict';
// @module features/people — People and permissions dialog: who is on the canvas, the owner, and GRANT checkboxes
// @uses permissions, chrome, dialogs, canvases
let peopleBack = null;
function peopleRows(){
  const P = S.P || { owner: null, grants: new Map(), can: () => true }, ids = new Set();
  for (const r of S.records.values()) if (r.author) ids.add(r.author);
  for (const id of peers.keys()) ids.add(id);
  if (S.me) ids.add(S.me.id);
  for (const k of P.grants.keys()) if (k !== 'all') ids.add(k);
  const name = id => id === S.me?.id ? 'You' : NAMES.get(id) || short(id);
  const list = [...ids].sort((a, b) => (b === P.owner) - (a === P.owner) || (b === S.me?.id) - (a === S.me?.id) || name(a).localeCompare(name(b)));
  return { P, rows: [{ id: 'all', label: 'Everyone else', sub: 'Anyone who opens this canvas' }, ...list.map(id => ({ id, label: name(id), sub: id === P.owner ? 'Owner' : P.grants.has(id) ? 'Own permissions' : 'Follows “Everyone else”' }))] };
}
function paintPeople(){
  const { P, rows } = peopleRows(), mine = P.owner && P.owner === S.me?.id;
  $('peopleSub').textContent = !P.owner ? 'This canvas has no owner, so everyone may do everything. It was made before permissions or opened by id. Make an owned copy to choose who can do what.'
    : mine ? 'You own this canvas. Each change is a signed GRANT record; it applies to everything that person has signed here, earlier work included.'
    : `Owned by ${P.owner === S.me?.id ? 'you' : NAMES.get(P.owner) || short(P.owner)}. Only the owner can change permissions.`;
  const head = `<tr><th scope="col">Person</th>${PERMS.map(p => `<th scope="col">${PERM_NAMES[p]}</th>`).join('')}</tr>`;
  $('peopleTable').innerHTML = head + rows.map(r => {
    const owner = r.id === P.owner;
    return `<tr${owner ? ' class="own"' : ''}><th scope="row"><span class="av" style="background:${r.id === 'all' ? 'var(--muted)' : `hsl(${authorHue(r.id)} 55% 30%)`}" aria-hidden="true">${r.id === 'all' ? '∗' : esc(r.label.slice(0, 2))}</span><span><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></span></th>`
      + PERMS.map(p => `<td><input type="checkbox" data-who="${esc(r.id)}" data-p="${p}" aria-label="${esc(r.label)}: ${PERM_NAMES[p]}"${(owner || P.can(r.id === 'all' ? '\u0000' : r.id, p)) ? ' checked' : ''}${!mine || owner ? ' disabled' : ''}></td>`).join('') + '</tr>';
  }).join('');
  $('peopleActs').innerHTML = P.owner ? '' : '<button class="btn primary" id="peopleCopy">Make an owned copy</button>';
}
function openPeople(){ peopleBack = document.activeElement; $('people').hidden = false; paintPeople(); setTimeout(() => ($('people').querySelector('input:not([disabled]), #peopleCopy') || $('peopleClose')).focus(), 0); say('People and permissions.'); }
function closePeople(){ $('people').hidden = true; (peopleBack && document.contains(peopleBack) ? peopleBack : cv).focus({ preventScroll: true }); }
$('peopleClose').onclick = closePeople;
$('people').addEventListener('keydown', e => { e.stopPropagation(); trapTab(e, $('people')); if (e.key === 'Escape') closePeople(); });
$('people').addEventListener('change', async e => {
  const who = e.target.dataset.who; if (!who) return;
  const perms = [...$('people').querySelectorAll(`input[data-who="${CSS.escape(who)}"]`)].filter(i => i.checked).map(i => i.dataset.p);
  try { await grant(who, perms); } catch { return; }
  await tick(); paintPeople(); $('people').querySelector(`input[data-who="${CSS.escape(who)}"][data-p="${e.target.dataset.p}"]`)?.focus();
  say(`${who === 'all' ? 'Everyone else' : NAMES.get(who) || short(who)}: ${perms.length ? perms.map(p => PERM_NAMES[p]).join(', ') : 'view only'}. Signed.`);
});
$('people').addEventListener('click', async e => {
  if (e.target.id !== 'peopleCopy') return;
  const raws = [...S.records.values()].filter(r => r.type !== 'OWNER' && r.type !== 'GRANT').sort(byZ).map(r => r.raw), blobs = new Map(S.blobs), title = S.D.meta?.title || '';
  closePeople(); await createOwnedCanvas();
  for (const [c, b] of blobs) await addBlob(c, b);
  for (const raw of raws) await ingest(raw);
  if (title) await setTitle(title);
  zoomFit(); toast('Owned copy ready. Share → People and permissions to choose who can do what.');
});
PALETTE_HOOKS.push(add => add('share', 'People and permissions…', openPeople));
