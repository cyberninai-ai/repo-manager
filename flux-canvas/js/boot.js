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
  const saved = store.get('flux:canvas:' + canvasId);
  if (saved) await importText(saved, false);
  derive(); paintAuthors(); paintAuth(); paintBar(); document.documentElement.style.setProperty('--barH', barH() + 'px'); dirty = true; loop();
  if (saved) setTimeout(() => { $('hint').classList.add('gone'); }, 2500);
})();
