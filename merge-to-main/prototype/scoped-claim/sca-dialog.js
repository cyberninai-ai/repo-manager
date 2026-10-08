/*
 * Scoped Claim Authorization: the single signing surface.
 *
 * Stand-in for js/ark/authorization-dialog.js wrapping <flux-authorization-dialog>.
 * Every identity-bound action calls SCA.request(). There is no other way to
 * produce a signature, and no option that shows fewer fields.
 *
 *   SCA.request({
 *     title,
 *     requester:     { name, origin },
 *     network:       { name, id },
 *     authority:     { name, id },
 *     configuration: { label, pointer },
 *     scope, action,
 *     ttlSeconds,                       // or expiresAt: Date
 *     callsign:      { name, id },
 *     visibility:    { label, note, public },
 *     manifest,                         // plain object; canonicalized here
 *     stack:         [{ kind, subject, by, pending? }],
 *   }) → Promise<{ claimId, signature, signedAt, digest }>
 *
 * Rejects with an Error whose .code is SCA_REFUSED, SCA_EXPIRED,
 * SCA_MISSING_FIELD, SCA_DIGEST_MISMATCH or SCA_NO_CRYPTO.
 *
 * The second argument is for the review harness only (forcing a state to
 * look at it); it never changes which fields render.
 */
(function () {
  'use strict';

  const REQUIRED = [
    ['title'], ['requester', 'name'], ['requester', 'origin'], ['network', 'name'], ['network', 'id'],
    ['authority', 'name'], ['authority', 'id'], ['configuration', 'label'], ['configuration', 'pointer'],
    ['scope'], ['action'], ['callsign', 'name'], ['callsign', 'id'], ['visibility', 'label'],
    ['visibility', 'note'], ['manifest'], ['stack'],
  ];

  /* ---------- canonical bytes + digest ---------- */
  function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }
  const enc = new TextEncoder();
  async function sha256(bytes) {
    if (!globalThis.crypto || !crypto.subtle) return null; // no secure context → cannot verify
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function hex(bytes) {
    const out = [];
    for (let i = 0; i < bytes.length; i += 16) {
      const row = [...bytes.slice(i, i + 16)].map(b => b.toString(16).padStart(2, '0')).join(' ');
      out.push(i.toString(16).padStart(6, '0') + '  ' + row);
    }
    return out.join('\n');
  }
  const chunk = (s, n = 8) => s.match(new RegExp('.{1,' + n + '}', 'g')) || [];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const verbHTML = v => esc(v).replace(/\./g, '.<wbr>');
  const fmtTime = d => d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const get = (o, path) => path.reduce((x, k) => (x == null ? x : x[k]), o);
  const MISSING = '<span style="color:var(--danger)" class="mono">missing</span>';
  const v = x => (x === undefined || x === null || x === '' ? MISSING : esc(x));

  /* ---------- dom ---------- */
  let dlg, panel;
  function mount() {
    if (dlg) return;
    dlg = document.createElement('dialog');
    dlg.className = 'sca';
    dlg.setAttribute('aria-labelledby', 'sca-title');
    dlg.setAttribute('aria-describedby', 'sca-lede');
    dlg.innerHTML = '<div class="panel"></div>';
    document.body.appendChild(dlg);
    panel = dlg.firstChild;
    panel.addEventListener('click', onClick);
    dlg.addEventListener('cancel', onEsc);
  }

  let S = null;
  let tick = null;

  async function prepare(req, review) {
    const r = Object.assign({ requester: {}, network: {}, authority: {}, configuration: {}, callsign: {}, visibility: {}, stack: [] }, req);
    const missing = REQUIRED.filter(p => { const x = get(r, p); return x === undefined || x === null || x === ''; }).map(p => p.join('.'));
    const manifestBytes = enc.encode(canonical(r.manifest ?? null));
    const manifestDigest = await sha256(manifestBytes);
    const now = Date.now();
    const expiresAt = r.expiresAt || new Date(now + (r.ttlSeconds || 300) * 1000);
    const claimedDigest = review === 'error' ? (manifestDigest || '').replace(/^.{8}/, 'deadbeef') : (manifestDigest || '');
    const authorization = {
      action: r.action, authority: r.authority.id, callsign: r.callsign.id,
      configuration: r.configuration.pointer, expires: expiresAt.toISOString(),
      manifestDigest: 'sha256:' + claimedDigest, network: r.network.id,
      requester: r.requester.origin, scope: r.scope, visibility: r.visibility.label,
    };
    const authBytes = enc.encode(canonical(authorization));
    S = { r, missing, manifestBytes, manifestDigest, claimedDigest, authBytes, expiresAt,
          state: 'preview', layer: null, bytesView: 'utf8', receipt: null, errorCode: null };
    if (missing.length) fail('SCA_MISSING_FIELD');
    else if (manifestDigest === null) fail('SCA_NO_CRYPTO');
    else if (claimedDigest !== manifestDigest) fail('SCA_DIGEST_MISMATCH');
    else if (review === 'expired') { S.expiresAt = new Date(now - 4000); S.state = 'expired'; }
    else if (review === 'signed') { S.state = 'signed'; S.receipt = makeReceipt(); }
    else if (review === 'signing' || review === 'refused') S.state = review;
  }
  function fail(code) { S.state = 'error'; S.errorCode = code; }

  function makeReceipt() {
    const sig = [...crypto.getRandomValues(new Uint8Array(64))].map(b => b.toString(16).padStart(2, '0')).join('');
    return { signedAt: new Date(), signature: sig, claimId: 'claim:' + S.manifestDigest.slice(0, 16), digest: 'sha256:' + S.manifestDigest };
  }

  function secondsLeft() { return Math.round((S.expiresAt - Date.now()) / 1000); }
  function expiryText() {
    const s = secondsLeft();
    if (s <= 0) return { cls: 'gone', rel: 'expired' };
    const m = Math.floor(s / 60), sec = String(s % 60).padStart(2, '0');
    return { cls: s <= 60 ? 'soon' : '', rel: `in ${m}:${sec}` };
  }

  const PILL = { preview: 'Review before signing', signing: 'Signing', signed: 'Signed', expired: 'Expired', error: 'Cannot sign', refused: 'Not signed' };

  function render() {
    const { r, state } = S;
    panel.dataset.state = state;
    const exp = expiryText();
    const dg = S.claimedDigest;
    panel.innerHTML = `
      <header class="hd">
        <div class="hd-top">
          <span class="meta">Scoped claim authorization</span>
          <span class="pill ${state}" role="status">${PILL[state]}</span>
          <button class="close" data-act="cancel" aria-label="Close without signing">✕</button>
        </div>
        <h2 id="sca-title" tabindex="-1">${v(r.title)}</h2>
        <p class="lede" id="sca-lede"><b>${v(r.requester.name)}</b> is asking <b>${v(r.callsign.name)}</b> to sign
          <span class="verb">${r.action ? verbHTML(r.action) : MISSING}</span> in <span class="mono">${v(r.scope)}</span>
          under <b>${v(r.authority.name)}</b>.</p>
        <div class="pinned-digest"><span class="meta">Digest</span>
          <span class="mono">sha256:${esc(dg.slice(0, 16))}…${esc(dg.slice(-8))}</span>
          <span class="meta" style="margin-left:auto">Expires</span><span class="exp ${exp.cls}" data-exp>${exp.rel}</span></div>
      </header>
      <div class="bd">${S.layer ? layerHTML() : summaryHTML(exp)}</div>
      <footer class="ft">${footerHTML()}</footer>`;
  }

  function refusal(title, happened, needed, fix, code) {
    return `<div class="notice danger" role="alert"><h4>${title}</h4>
      <dl><dt>What happened</dt><dd>${happened}</dd><dt>What's needed</dt><dd>${needed}</dd>
      <dt>How to fix</dt><dd>${fix}</dd><dt>Code</dt><dd class="mono">${code}</dd></dl></div>`;
  }

  function stateNotice() {
    const s = S.state;
    if (s === 'signing') return `<div class="notice warning" role="status"><h4><span class="spinner" aria-hidden="true"></span>Waiting for your key</h4>
      <p>Your browser handle is signing the exact bytes below. Nothing has been broadcast yet. Don't close this tab.</p></div>`;
    if (s === 'signed') return `<div class="notice trust" role="status"><h4>Signed and broadcast</h4>
      <dl><dt>Claim</dt><dd class="mono">${esc(S.receipt.claimId)}</dd>
      <dt>Signed at</dt><dd class="mono">${fmtTime(S.receipt.signedAt)}</dd>
      <dt>Signature</dt><dd class="mono" style="overflow-wrap:anywhere">ed25519:${esc(S.receipt.signature)}</dd></dl>
      <p style="margin-top:8px">This claim can't be recalled. The fields below are exactly what you signed.</p></div>`;
    if (s === 'expired') return refusal('This authorization expired',
      `The request passed its expiry at <span class="mono">${fmtTime(S.expiresAt)}</span> before it was signed.`,
      'A fresh request with a new expiry.', `Close this and start the action again from ${esc(S.r.requester.origin)}.`, 'SCA_EXPIRED');
    if (s === 'error') {
      if (S.errorCode === 'SCA_MISSING_FIELD') return refusal('This request is incomplete',
        `It doesn't fill every field you need to read before signing. Missing: <span class="mono">${esc(S.missing.join(', '))}</span>.`,
        'A request with every field filled in.', 'Close this. The page that asked for it needs fixing; nothing you can enter here will help.', 'SCA_MISSING_FIELD');
      if (S.errorCode === 'SCA_NO_CRYPTO') return refusal('This browser can’t check the digest',
        'Your browser didn’t provide the hashing tool needed to check the manifest digest. This usually means the page isn’t on HTTPS.',
        'A secure (HTTPS) page.', 'Open defxn over HTTPS and try again.', 'SCA_NO_CRYPTO');
      return refusal('The content doesn’t match its digest',
        'The digest in this request doesn’t match the content it describes. What you would sign isn’t what you’re being shown.',
        'A request whose digest matches its manifest bytes.',
        'Don’t sign. Close this and report it. If it repeats, the requesting page may be compromised.', 'SCA_DIGEST_MISMATCH');
    }
    if (s === 'refused') return `<div class="notice" role="status"><h4>Nothing was signed</h4>
      <p>You closed the authorization. No signature was produced and nothing was broadcast. The request below is kept for reference only.</p></div>`;
    return '';
  }

  function summaryHTML(exp) {
    const r = S.r;
    const d = chunk(S.claimedDigest).map(c => `<span>${c}</span>`).join('');
    const sub = x => `<span class="sub mono">${v(x)}</span>`;
    return `<div class="layer">
      ${stateNotice()}
      <section class="group" aria-labelledby="g-what"><span class="meta" id="g-what">${S.state === 'signed' ? 'What you signed' : 'What you’re signing'}</span>
        <dl class="fields">
          <div><dt>Action</dt><dd>${r.action ? `<span class="verb">${verbHTML(r.action)}</span>` : MISSING}</dd></div>
          <div><dt>Scope</dt><dd class="mono">${v(r.scope)}</dd></div>
          <div><dt>Manifest digest</dt><dd><div class="digest" aria-label="sha256 ${esc(S.claimedDigest)}">sha256:<br>${d}</div></dd></div>
        </dl></section>
      <section class="group" aria-labelledby="g-who"><span class="meta" id="g-who">Who</span>
        <dl class="fields">
          <div><dt>Callsign</dt><dd><b>${v(r.callsign.name)}</b>${sub(r.callsign.id)}</dd></div>
          <div><dt>Requester</dt><dd>${v(r.requester.name)}${sub(r.requester.origin)}</dd></div>
          <div><dt>DAO authority</dt><dd>${v(r.authority.name)}${sub(r.authority.id)}</dd></div>
        </dl></section>
      <section class="group" aria-labelledby="g-where"><span class="meta" id="g-where">Where and limits</span>
        <dl class="fields">
          <div><dt>Network</dt><dd>${v(r.network.name)}${sub(r.network.id)}</dd></div>
          <div><dt>Configuration</dt><dd>${v(r.configuration.label)}${sub(r.configuration.pointer)}</dd></div>
          <div><dt>Visibility</dt><dd><span class="${r.visibility.public ? 'vis-public' : ''}">${v(r.visibility.label)}</span><span class="sub">${v(r.visibility.note)}</span></dd></div>
          <div><dt>Expires</dt><dd><span class="exp ${exp.cls}" data-exp>${exp.rel}</span><span class="sub mono">${fmtTime(S.expiresAt)}</span></dd></div>
        </dl></section>
      <div class="inspect" role="group" aria-label="Inspect">
        <button data-layer="stack"><span class="t"><b>Inspect claim stack</b><small>${r.stack.length} claims from your root identity to this request</small></span><span class="arrow">→</span></button>
        <button data-layer="manifest"><span class="t"><b>Inspect signing manifest</b><small>${S.manifestBytes.length} bytes · the content the digest covers</small></span><span class="arrow">→</span></button>
        <button data-layer="bytes"><span class="t"><b>Exact bytes to sign</b><small>${S.authBytes.length} bytes · what your key signs</small></span><span class="arrow">→</span></button>
      </div>
    </div>`;
  }

  function layerHTML() {
    const back = `<button class="back" data-act="back">← Back to summary</button>`;
    if (S.layer === 'stack') {
      const items = S.r.stack.map(c => `<li class="${c.pending ? 'pending' : ''}">
        <div class="k">${esc(c.kind)}</div><div class="a">${esc(c.subject)}</div><div class="sub" style="color:var(--text-muted);font-size:12px">${esc(c.by)}</div></li>`).join('');
      return `<div class="layer peel">${back}<h3>Claim stack</h3>
        <p class="note">Every claim that gives this request its authority, from your root identity down. Each one is signed by the party named under it.</p>
        <ol class="stack">${items}</ol></div>`;
    }
    if (S.layer === 'manifest') {
      return `<div class="layer peel">${back}<h3>Signing manifest</h3>
        <p class="note">The content the manifest digest covers, in canonical form (sorted keys, no whitespace), shown pretty-printed. The digest is SHA-256 over the canonical bytes.</p>
        <pre class="code">${esc(JSON.stringify(S.r.manifest, null, 2))}</pre>
        <p class="note" style="margin-top:10px">Recomputed digest: <span class="mono">sha256:${esc(S.manifestDigest || 'unavailable')}</span></p></div>`;
    }
    const utf = new TextDecoder().decode(S.authBytes);
    return `<div class="layer peel">${back}<h3>Exact bytes to sign</h3>
      <p class="note">Your key signs these bytes and nothing else. They bind every field on the summary, including the manifest digest.</p>
      <div class="tabs" role="tablist">
        <button role="tab" data-bytes="utf8" aria-selected="${S.bytesView === 'utf8'}">UTF-8</button>
        <button role="tab" data-bytes="hex" aria-selected="${S.bytesView === 'hex'}">Hex</button></div>
      <pre class="code" role="tabpanel">${esc(S.bytesView === 'hex' ? hex(S.authBytes) : utf)}</pre></div>`;
  }

  function footerHTML() {
    const s = S.state;
    let verify;
    if (S.errorCode === 'SCA_NO_CRYPTO') verify = `<div class="verify bad">✕ Digest not checked: hashing unavailable</div>`;
    else if (S.claimedDigest !== S.manifestDigest) verify = `<div class="verify bad">✕ Digest doesn't match manifest bytes</div>`;
    else verify = `<div class="verify ok">◆ Digest checked against manifest bytes in your browser</div>`;
    let actions;
    if (s === 'preview') actions = `<button class="btn" data-act="cancel">Cancel</button>
        <button class="btn primary" data-act="sign">Sign ${verbHTML(S.r.action)}</button>`;
    else if (s === 'signing') actions = `<button class="btn" disabled>Cancel</button><button class="btn primary" disabled><span class="spinner" aria-hidden="true"></span>Signing…</button>`;
    else if (s === 'signed') actions = `<button class="btn" data-act="copy">Copy claim ID</button><button class="btn primary" data-act="close">Done</button>`;
    else actions = `<button class="btn primary" data-act="close">Close</button>`;
    return `${verify}<div class="actions">${actions}</div>`;
  }

  /* ---------- events ---------- */
  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.layer) { S.layer = b.dataset.layer; render(); panel.querySelector('.back').focus(); return; }
    if (b.dataset.bytes) { S.bytesView = b.dataset.bytes; render(); return; }
    const act = b.dataset.act;
    if (act === 'back') { const from = S.layer; S.layer = null; render(); panel.querySelector(`[data-layer="${from}"]`)?.focus(); }
    else if (act === 'cancel') { if (S.state === 'preview') { S.state = 'refused'; S.layer = null; render(); } else finish(); }
    else if (act === 'close') finish();
    else if (act === 'copy') navigator.clipboard?.writeText(S.receipt.claimId);
    else if (act === 'sign') {
      if (secondsLeft() <= 0) { S.state = 'expired'; render(); return; }
      S.state = 'signing'; S.layer = null; render();
      setTimeout(() => {
        if (S.state !== 'signing') return;
        S.receipt = makeReceipt(); S.state = 'signed'; render();
        panel.querySelector('[data-act="close"]').focus();
      }, 1400);
    }
  }
  // Esc peels the open layer first, then cancels. It never cancels mid-signing.
  function onEsc(e) {
    e.preventDefault();
    if (S.layer) { panel.querySelector('[data-act="back"]').click(); return; }
    if (S.state === 'signing') return;
    if (S.state === 'preview') { S.state = 'refused'; render(); return; }
    finish();
  }

  let settle = null;
  let opener = null;
  function finish() {
    clearInterval(tick);
    dlg.close();
    opener?.focus?.();
    const { resolve, reject } = settle; settle = null;
    if (S.state === 'signed') resolve(S.receipt);
    else {
      const code = S.state === 'refused' ? 'SCA_REFUSED' : S.state === 'expired' ? 'SCA_EXPIRED' : S.errorCode || 'SCA_REFUSED';
      reject(Object.assign(new Error(code), { code }));
    }
  }

  function startTick() {
    clearInterval(tick);
    tick = setInterval(() => {
      if (S.state !== 'preview') return;
      if (secondsLeft() <= 0) { S.state = 'expired'; S.layer = null; render(); return; }
      const x = expiryText();
      panel.querySelectorAll('[data-exp]').forEach(el => { el.textContent = x.rel; el.className = 'exp ' + x.cls; });
    }, 1000);
  }

  async function request(req, review) {
    if (settle) throw Object.assign(new Error('SCA_BUSY'), { code: 'SCA_BUSY' });
    mount();
    opener = document.activeElement;
    await prepare(req, review);
    return new Promise((resolve, reject) => {
      settle = { resolve, reject };
      render();
      dlg.showModal();
      startTick();
      document.getElementById('sca-title').focus(); // focus the title, never the Sign button
    });
  }

  window.SCA = { request, canonical, sha256: async s => sha256(enc.encode(s)) };
})();
