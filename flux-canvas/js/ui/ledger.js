'use strict';
// @module ui/ledger — Ledger panel: every signed record
// @uses chrome
/* ledger */
function toggleLedger(force){ S.ledger = force ?? !S.ledger; if (S.ledger && $('comments').style.display === 'flex') toggleComments(false); $('ledger').style.display = S.ledger ? 'flex' : 'none'; document.body.classList.toggle('drawer', S.ledger || $('comments').style.display === 'flex'); paintLedger(); if (S.ledger) $('ledgerClose').focus(); else cv.focus({ preventScroll: true }); }
$('ledgerClose').onclick = () => toggleLedger(false);
function paintLedger(){
  if (!S.ledger) return;
  const recs = [...S.records.values()].sort((a, b) => byZ(b, a));
  const bytes = recs.reduce((s, r) => s + recBytes(r), 0);
  const authors = new Set(recs.map(r => r.author));
  $('ledgerStats').innerHTML = `${recs.length} records · ${authors.size} author${authors.size === 1 ? '' : 's'} · ${(bytes / 1024).toFixed(1)} KB
    ${S.rejected ? ` · <span class="bad">${S.rejected} rejected (${Object.entries(S.why).filter(([k, v]) => v && k !== 'clock').map(([k, v]) => `${v} ${k}`).join(', ')})</span>` : ''}
    ${S.parked.size ? ` · <span class="bad">${S.parked.size} waiting: clock ahead of this canvas</span>` : ''}
    ${edNative === false ? ' · Ed25519 verified in JS' : ''}<br>canvas ${esc(canvasId)} · channel <span class="kbd">${esc(channelName)}</span>${bc ? '' : ' (unavailable)'}`;
  $('ledgerList').innerHTML = recs.slice(0, 500).map(r => {
    const tag = r.neg !== null ? `<span class="tag t-neg">${r.type} N-${r.neg ? 1 : 0}</span>` : `<span class="tag t-${r.type}">${r.type}</span>`;
    const deny = S.D.denied?.has(r.cid) ? '<span class="tag t-neg">not permitted</span>' : '';
    const target = r.neg !== null || r.type === 'MOVE' ? r.f.R : r.cid;
    return `<div class="row${S.sel.has(target) ? ' sel' : ''}" data-t="${esc(target)}" role="button" tabindex="0">
      <div class="top">${tag}${deny}<span class="dot" style="background:${authorColor(r.author)}"></span>${r.author === S.me?.id ? 'you' : esc(short(r.author))}
      <span class="meta">z ${r.z} · ${recBytes(r)} B · <span class="ok">✓</span></span></div><div class="raw">${esc(r.raw)}</div></div>`;
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

