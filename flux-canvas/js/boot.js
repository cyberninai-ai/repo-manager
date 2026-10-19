'use strict';
// @module boot — Boot: identity, saved records, first render
// @uses everything
/* =====================================================================
   Boot
   ===================================================================== */
(async () => {
  resize();
  if (!crypto?.subtle){ toast('This page needs a secure context (https or file://) for WebCrypto signing.'); return; }
  S.me = await loadIdentity();
  let claim = null;
  if (freshCanvas){ const o = await ownedCanvasId(); claim = o.nonce; canvasId = o.id; setHash(canvasId); store.set('flux:lastCanvas', canvasId); openChannel(); }
  await loadCanvas(canvasId);
  if (claim) await claimCanvas(claim);
  derive(); paintAuthors(); paintAuth(); paintBar(); document.documentElement.style.setProperty('--barH', barH() + 'px'); dirty = true; loop();
})();
// a refused signature while viewing history is expected, not an error
addEventListener('unhandledrejection', e => { if (e.reason?.name === 'HistoryView' || e.reason?.name === 'NotPermitted') e.preventDefault(); });
