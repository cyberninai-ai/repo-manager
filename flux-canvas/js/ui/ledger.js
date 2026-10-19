'use strict';
// @module ui/ledger — Ledger panel: every signed record
// @uses chrome
/* ledger */
function toggleLedger(force){ S.ledger = force ?? !S.ledger; if (S.ledger) closePanel(false); if (S.ledger && $('comments').style.display === 'flex') toggleComments(false); if (S.ledger && ST.on) toggleStructure(false); if (S.ledger && WK.on) toggleWork(false); $('ledger').style.display = S.ledger ? 'flex' : 'none'; document.body.classList.toggle('drawer', S.ledger || $('comments').style.display === 'flex'); paintLedger(); if (S.ledger) $('ledgerClose').focus(); else cv.focus({ preventScroll: true }); }
$('ledgerClose').onclick = () => toggleLedger(false);
// what a record did, in words: the activity feed reads like a log of the work, the raw record is one click away
const quote = t => t ? ` “${String(t).replace(/\s+/g, ' ').slice(0, 48)}${String(t).length > 48 ? '…' : ''}”` : '';
function activityText(r){
  if (r.neg !== null) return r.neg ? 'deleted something' : 'restored something';
  const t = S.records.get(r.f.R);
  switch (r.type){
    case 'DRAW': return 'drew a stroke';
    case 'SHAPE': return `drew ${r.k === 'circle' ? 'an ellipse' : r.k === 'line' ? 'a line' : 'a rectangle'}`;
    case 'TEXT': return (r.edits ? 'edited text' : 'wrote') + quote(r.text);
    case 'NODE': return (r.edits ? 'edited' : 'added') + ` ${NODE_KINDS[r.k]?.name === 'sticky note' ? 'a sticky note' : 'a ' + (NODE_KINDS[r.k]?.name || 'card')}${quote(r.text)}`;
    case 'ARROW': return 'connected two things' + (r.label ? quote(r.label) : '');
    case 'IMAGE': return 'added an image' + quote(r.alt);
    case 'MOVE': return r.dw || r.dh ? 'resized' + quote(t?.text) : 'moved' + quote(t?.text);
    case 'STYLE': return 'restyled' + quote(t?.text);
    case 'GROUP': return 'grouped elements';
    case 'COMMENT': return (r.re ? 'replied' : 'commented') + quote(r.text);
    case 'RESOLVE': return r.state ? 'resolved a thread' : 'reopened a thread';
    case 'REACT': return `${r.on ? '' : 'took back '}${r.kind === 'vote' ? 'a vote' : 'a reaction'} on${quote(t?.text) || ' something'}`;
    case 'AUDIT': return `gave “${r.f.V}” on${quote(t?.text) || ' a step'}`;
    case 'SIGNOFF': return 'signed off the audit';
    case 'META': return 'named the canvas' + quote(r.title);
    case 'OWNER': return 'created this canvas (owner)';
    case 'GRANT': return `changed what ${r.who === 'all' ? 'everyone' : short(r.who)} may do`;
    case 'PROFILE': return 'joined as' + quote(r.name);
    case 'TASK': return r.status === 'x' ? 'removed a task' : `set${quote(t?.text) || ' a task'} to ${{ todo: 'To do', doing: 'Doing', done: 'Done' }[r.status]}${r.owner ? ` for ${short(r.owner)}` : ''}`;
    case 'DELIVER': return 'asked for approval of' + quote(r.title);
    case 'APPROVE': return r.ok ? 'approved a delivery' : 'requested changes' + quote(r.note);
  }
  return r.type.toLowerCase();
}
function paintLedger(){
  if (!S.ledger) return;
  const recs = [...S.records.values()].sort((a, b) => byZ(b, a));
  const bytes = recs.reduce((s, r) => s + recBytes(r), 0);
  const authors = new Set(recs.map(r => r.author));
  $('ledgerStats').innerHTML = `<b>${recs.length} changes by ${authors.size} ${authors.size === 1 ? 'person' : 'people'}</b> · every one signed and verified · ${(bytes / 1024).toFixed(1)} KB
    ${S.rejected ? ` · <span class="bad">${S.rejected} rejected (${Object.entries(S.why).filter(([k, v]) => v && k !== 'clock').map(([k, v]) => `${v} ${k}`).join(', ')})</span>` : ''}
    ${S.parked.size ? ` · <span class="bad">${S.parked.size} waiting: clock ahead of this canvas</span>` : ''}
    ${edNative === false ? ' · Ed25519 verified in JS' : ''}
    ${(() => { const n = compactionPlan().saves; return n >= 10 ? `<br><button class="btn" id="ledgerCompact">Compact my history · ${n} fewer records</button>` : ''; })()}<br>canvas ${esc(canvasId)} · channel <span class="kbd">${esc(channelName)}</span>${bc ? '' : ' (unavailable)'}`;
  $('ledgerList').innerHTML = recs.slice(0, 500).map(r => {
    const tag = r.neg !== null ? `<span class="tag t-neg">${r.type} N-${r.neg ? 1 : 0}</span>` : `<span class="tag t-${r.type}">${r.type}</span>`;
    const deny = S.D.denied?.has(r.cid) ? '<span class="tag t-neg">not permitted</span>' : '';
    const target = r.neg !== null || r.type === 'MOVE' || r.type === 'STYLE' || r.type === 'TASK' || r.type === 'REACT' ? r.f.R : r.cid;
    return `<div class="row${S.sel.has(target) ? ' sel' : ''}" data-t="${esc(target)}" role="button" tabindex="0">
      <div class="top"><span class="av" style="background:hsl(${authorHue(r.author)} 55% 30%)" aria-hidden="true">${esc(initials(r.author))}</span>
      <span class="what"><b>${r.author === S.me?.id ? 'You' : esc(short(r.author))}</b> ${esc(activityText(r))}${deny}</span>
      <span class="meta">${ago(r.t)} · <span class="ok" title="">✓</span></span></div><div class="raw">${tag} z ${r.z} · ${recBytes(r)} B · ${esc(r.raw)}</div></div>`;
  }).join('') + (recs.length > 500 ? `<div class="row meta">… ${recs.length - 500} older records</div>` : '') +
  (recs.length ? '' : '<div class="row meta">No records yet. Draw something.</div>');
}
$('ledgerList').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('row')){ e.preventDefault(); e.target.click(); } });
$('ledgerList').addEventListener('click', e => {
  const row = e.target.closest('.row'); if (!row || !row.dataset.t) return;
  row.classList.toggle('x');
  const r = S.records.get(row.dataset.t);
  if (r && r.type === 'COMMENT'){ openThread(r.re || r.cid); return; }
  if (r && ELEMENT.has(r.type)){ S.sel = new Set([r.cid]); expandSel(); announceSel(); const b = box(r); if (b){ const c = center(b); S.view.x = c.x - innerWidth / 2 / S.view.zoom; S.view.y = c.y - innerHeight / 2 / S.view.zoom; } dirty = true; }
});

$('ledgerStats').addEventListener('click', e => { if (e.target.id === 'ledgerCompact') compactHistory(); });
CHANGE_HOOKS.push(paintLedger);
