/*
 * defxn platform prototype.
 *
 * Every identity-bound action on every page goes through sign() below, which
 * calls the one Scoped Claim Authorization dialog (SCA.request). ACTIONS is
 * the entry-point matrix from SPEC.md §5 expressed as data: one row per
 * signing entry point, each filling all 13 fields.
 *
 * Data is mocked and kept in this browser (localStorage) so the flows hold
 * together across reloads. "Reset demo data" in the sidebar clears it.
 */
(function () {
  'use strict';

  /* ================================================================ *
   * constants                                                         *
   * ================================================================ */
  const NETWORK = { name: 'Flux mesh · mainnet', id: 'flux-mainnet', peers: 412 };
  const DAO = { name: 'Flux DAO', id: 'did:flux:dao:7Qm3…k2Fa' };
  const EDITORIAL = { name: 'defxn Editorial (Flux DAO)', id: 'did:flux:dao:7Qm3…k2Fa/editorial' };
  const FOUNDING = { name: 'Flux DAO · Founding', id: 'did:flux:dao:7Qm3…k2Fa/founding' };
  const POOL = { name: 'Flux DAO deposit pool', id: 'did:flux:dao:7Qm3…k2Fa/deposits' };
  const MEMBERS = [
    { callsign: 'HERON-2', id: 'did:flux:id:3bLe…Qa90' },
    { callsign: 'OSPREY-4', id: 'did:flux:id:Vt71…c0Rk' },
    { callsign: 'WREN-1', id: 'did:flux:id:p0Zw…8sTn' },
    { callsign: 'MERLIN-9', id: 'did:flux:id:Hh4q…Ue3D' },
  ];
  const PUBLIC_LEDGER = { label: 'Public ledger', note: 'Anyone on the network can read this transfer.', public: true };
  const CREDITS_PER_FXN = 10;

  const ROLE = {
    member: { kind: 'DAO membership', subject: 'founding member of Flux DAO', by: 'signed by Flux DAO quorum 3/5 · 2025-11-09' },
    treasury: { kind: 'Role grant', subject: 'treasury.operator', by: 'signed by Flux DAO quorum 3/5 · expires 2027-01-01' },
    editorial: { kind: 'Role grant', subject: 'editorial.publisher', by: 'signed by defxn Editorial · expires 2026-12-31' },
    deployer: { kind: 'Role grant', subject: 'site.deployer', by: 'signed by defxn Editorial · expires 2026-12-31' },
  };

  // The entry-point matrix. Each key is one place in the product that signs.
  const ACTIONS = {
    'account.transfer': {
      page: 'Account', action: 'transfer', scope: 'fxn.account.transfers', authority: DAO,
      configuration: { label: 'account transfer policy v6', pointer: 'cfg://flux-dao/accounts@6' },
      visibility: PUBLIC_LEDGER, roles: [],
    },
    'treasury.transfer': {
      page: 'Treasury', action: 'transfer', scope: 'fxn.treasury.transfers', authority: DAO,
      configuration: { label: 'treasury policy v14', pointer: 'cfg://flux-dao/treasury@14' },
      visibility: PUBLIC_LEDGER, roles: ['treasury'],
    },
    'deposit.create': {
      page: 'Deposits', action: 'transfer', scope: 'fxn.deposits', authority: DAO,
      configuration: { label: 'deposit pool v3', pointer: 'cfg://flux-dao/deposits@3' },
      visibility: PUBLIC_LEDGER, roles: [],
    },
    'deposit.withdraw': {
      page: 'Deposits', action: 'transfer', scope: 'fxn.deposits.withdrawals', authority: DAO,
      configuration: { label: 'deposit pool v3', pointer: 'cfg://flux-dao/deposits@3' },
      visibility: PUBLIC_LEDGER, roles: [],
    },
    'content.publish': {
      page: 'Content', action: 'publish', scope: 'defxn.site.content', authority: EDITORIAL,
      configuration: { label: 'site content config r208', pointer: 'cfg://defxn/site@208' },
      visibility: { label: 'Public', note: 'Published pages are served to every visitor.', public: true }, roles: ['editorial'],
    },
    'site.deploy': {
      page: 'Deploy', action: 'publish', scope: 'defxn.site.deploy', authority: EDITORIAL,
      configuration: { label: 'deploy policy v2', pointer: 'cfg://defxn/deploy@2' },
      visibility: { label: 'Public', note: 'Every visitor gets this build as soon as it is signed.', public: true }, roles: ['deployer'],
    },
    'directory.publish': {
      page: 'Directory', action: 'founding.directory.publish', scope: 'founding.directory', authority: FOUNDING,
      configuration: { label: 'directory schema v3', pointer: 'cfg://flux-dao/directory@3' },
      visibility: { label: 'Mesh directory · all peers', note: 'Every peer on the network can look you up by callsign.', public: true }, roles: [],
    },
    'directory.unpublish': {
      page: 'Directory', action: 'founding.directory.unpublish', scope: 'founding.directory', authority: FOUNDING,
      configuration: { label: 'directory schema v3', pointer: 'cfg://flux-dao/directory@3' },
      visibility: { label: 'Mesh directory · all peers', note: 'Peers stop finding you by callsign. Copies they already fetched may remain.', public: true }, roles: [],
    },
  };

  /* ================================================================ *
   * state                                                             *
   * ================================================================ */
  const SEED = () => ({
    me: {
      callsign: 'KESTREL-7', displayName: 'Kestrel', did: 'did:flux:id:9cXv…mE1q', since: '2025-11-02',
      devices: [{ key: 'ed25519:7bF2…Lk0', label: 'This browser', added: '2025-11-02' }, { key: 'ed25519:Q91c…z3e', label: 'Phone', added: '2026-02-17' }],
    },
    balances: { FXN: 1840.25, Credits: 12500 },
    treasury: { FXN: 482310.5, Credits: 2000000, dailyCap: 5000, usedToday: 750 },
    directory: { listed: false, displayName: 'Kestrel', bio: 'Builds signing surfaces for Flux mesh.', links: 'https://defxn.example/@kestrel', claimId: null, at: null },
    accountLedger: [
      { at: '2026-10-05T16:20:00Z', asset: 'FXN', amount: 40, to: 'WREN-1', memo: 'Relay split', claimId: 'claim:6c1e9a03d2f4b871' },
    ],
    treasuryLedger: [
      { at: '2026-10-08T07:02:00Z', asset: 'FXN', amount: 750, to: 'HERON-2', memo: 'Q3 grant tranche 1', by: 'KESTREL-7', claimId: 'claim:3f9a01c2b7e4d518' },
      { at: '2026-10-03T11:45:00Z', asset: 'Credits', amount: 20000, to: 'OSPREY-4', memo: 'Relay hosting, October', by: 'WREN-1', claimId: 'claim:a7d24e10c95b3f62' },
      { at: '2026-09-28T19:10:00Z', asset: 'FXN', amount: 3200, to: 'MERLIN-9', memo: 'Audit retainer', by: 'OSPREY-4', claimId: 'claim:0be5c7d913a2f480' },
    ],
    deposits: [
      { id: 'dep-0207', amount: 250, credits: 2500, at: '2026-09-12T10:00:00Z', status: 'active' },
      { id: 'dep-0193', amount: 500, credits: 5000, at: '2026-08-14T10:00:00Z', status: 'active' },
      { id: 'dep-0151', amount: 120, credits: 1200, at: '2026-05-02T10:00:00Z', status: 'withdrawn' },
    ],
    pages: [
      { slug: 'mesh-directory-launch', draft: { title: 'The mesh directory is open', body: 'Founding members can now publish their callsign to the Flux mesh directory.\n\nYour entry is a signed claim. Peers can look you up by callsign and check that the entry really came from you.\n\nPublish yours from Account → Directory.' }, published: null, history: [] },
      { slug: 'treasury-report-q3', draft: { title: 'Treasury report, Q3', body: 'The treasury closed Q3 at 482,310 FXN.\n\nGrants paid: 4 tranches. Relay hosting is now paid in Credits.\n\nAll transfers are on the public ledger.' },
        published: { title: 'Treasury report, Q3', body: 'The treasury closed Q3 at 482,310 FXN.\n\nGrants paid: 3 tranches.\n\nAll transfers are on the public ledger.', rev: 3, at: '2026-10-01T09:00:00Z', claimId: 'claim:91f0b3c8e2a74d05' },
        history: [{ rev: 3, at: '2026-10-01T09:00:00Z', claimId: 'claim:91f0b3c8e2a74d05' }, { rev: 2, at: '2026-09-30T18:12:00Z', claimId: 'claim:4d7a2c90e1b85f36' }] },
      { slug: 'about', draft: { title: 'About defxn', body: 'defxn is the web home of Flux DAO.\n\nEverything that acts in your name here is signed by a key that never leaves your browser.' },
        published: { title: 'About defxn', body: 'defxn is the web home of Flux DAO.\n\nEverything that acts in your name here is signed by a key that never leaves your browser.', rev: 12, at: '2026-07-19T12:30:00Z', claimId: 'claim:c3e81f07a92d6b44' },
        history: [{ rev: 12, at: '2026-07-19T12:30:00Z', claimId: 'claim:c3e81f07a92d6b44' }] },
    ],
    deploys: [
      { rev: 'r208', at: '2026-10-06T09:40:00Z', by: 'KESTREL-7', files: 14, size: '1.8 MB', digest: 'sha256:a1c94e07b2d3f518c6e09a7b44d2e1f3', status: 'live', claimId: 'claim:e58a2d1c07f94b36' },
      { rev: 'r207', at: '2026-09-29T15:05:00Z', by: 'WREN-1', files: 14, size: '1.7 MB', digest: 'sha256:7f02b9c1e48a6d3305b7c2e9a1f04d68', status: 'superseded', claimId: 'claim:2b9e04f7c1a8d653' },
      { rev: 'r206', at: '2026-09-21T08:30:00Z', by: 'KESTREL-7', files: 13, size: '1.7 MB', digest: 'sha256:c90d1e7a3b52f8046e1d9b7a0c3f2e85', status: 'superseded', claimId: 'claim:8a4f1c0e9d27b563' },
    ],
    staged: { rev: 'r209', builtAt: '2026-10-08T08:15:00Z', size: '1.8 MB', changes: [
      { path: 'index.html', change: 'modified', bytes: 9214 },
      { path: 'js/ark/authorization-dialog.js', change: 'modified', bytes: 21877 },
      { path: 'js/routes/directory.js', change: 'added', bytes: 6410 },
      { path: 'assets/directory-hero.webp', change: 'added', bytes: 120458 },
    ] },
    claims: [
      { claimId: 'claim:3f9a01c2b7e4d518', action: 'transfer', scope: 'fxn.treasury.transfers', at: '2026-10-08T07:02:00Z', summary: '750 FXN to HERON-2 from treasury', digest: 'sha256:3f9a01c2b7e4d5189c0e7a12f4b6d38e', origin: 'defxn #/treasury' },
      { claimId: 'claim:e58a2d1c07f94b36', action: 'publish', scope: 'defxn.site.deploy', at: '2026-10-06T09:40:00Z', summary: 'Deployed build r208', digest: 'sha256:e58a2d1c07f94b36a1c94e07b2d3f518', origin: 'defxn #/deploy' },
      { claimId: 'claim:6c1e9a03d2f4b871', action: 'transfer', scope: 'fxn.account.transfers', at: '2026-10-05T16:20:00Z', summary: '40 FXN to WREN-1', digest: 'sha256:6c1e9a03d2f4b871e0d4c9b2a7f13e65', origin: 'defxn #/account' },
      { claimId: 'claim:91f0b3c8e2a74d05', action: 'publish', scope: 'defxn.site.content', at: '2026-10-01T09:00:00Z', summary: 'Published “Treasury report, Q3” rev 3', digest: 'sha256:91f0b3c8e2a74d05f6b1e3c9d0a7284b', origin: 'defxn #/content/treasury-report-q3' },
    ],
  });

  const KEY = 'defxn-proto-v1';
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || SEED(); } catch (e) { S = SEED(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode: in-memory only */ } }

  /* ================================================================ *
   * helpers                                                           *
   * ================================================================ */
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n, dp = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dp });
  const utc = iso => iso.replace('T', ' ').slice(0, 16) + ' UTC';
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
    return iso.slice(0, 10);
  }
  const short = id => id ? id.slice(0, 14) + '…' : '';
  const member = cs => MEMBERS.find(m => m.callsign === cs);
  const pageStatus = p => !p.published ? 'draft' : (p.published.title === p.draft.title && p.published.body === p.draft.body ? 'published' : 'changed');
  const STATUS_CHIP = { draft: '<span class="chip warn">Draft</span>', changed: '<span class="chip warn">Unpublished changes</span>', published: '<span class="chip ok">Published</span>' };

  const I = {
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    vault: '<rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="M12 9.5V8M7 20v1M17 20v1"/>',
    down: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8 13h8M8 17h6"/>',
    cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;

  function toast(title, text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `<b>${esc(title)}</b>${esc(text)}`;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 5200);
  }

  /* ================================================================ *
   * the one signing path                                              *
   * ================================================================ */
  async function sign(key, title, manifest, summary) {
    const a = ACTIONS[key];
    const req = {
      title,
      requester: { name: 'defxn ' + a.page, origin: 'defxn #' + (location.hash.slice(1) || '/') },
      network: { name: NETWORK.name, id: NETWORK.id },
      authority: a.authority,
      configuration: a.configuration,
      scope: a.scope,
      action: a.action,
      ttlSeconds: 300,
      callsign: { name: S.me.callsign, id: S.me.did },
      visibility: a.visibility,
      manifest,
      stack: [
        { kind: 'Root identity', subject: S.me.did, by: 'self-signed · ' + S.me.since },
        ROLE.member,
        ...a.roles.map(r => ROLE[r]),
        { kind: 'This request', subject: `${a.action} in ${a.scope}`, by: 'awaiting your signature', pending: true },
      ],
    };
    try {
      const rc = await SCA.request(req);
      S.claims.unshift({ claimId: rc.claimId, action: a.action, scope: a.scope, at: rc.signedAt.toISOString(), summary,
        digest: rc.digest, signature: rc.signature, origin: req.requester.origin });
      save();
      toast('Signed ' + a.action, summary + ' · ' + rc.claimId);
      return rc;
    } catch (e) {
      if (e.code === 'SCA_REFUSED') toast('Nothing signed', 'You closed the review. Nothing changed.', 'neutral');
      else toast('Not signed', 'The review ended with ' + e.code + '. Nothing changed.', 'bad');
      return null;
    }
  }

  /* ================================================================ *
   * shell                                                             *
   * ================================================================ */
  const NAV = [
    ['You', [['/', 'Overview', 'home'], ['/account', 'Account', 'user'], ['/account/directory', 'Directory', 'globe']]],
    ['Flux DAO', [['/treasury', 'Treasury', 'vault'], ['/deposits', 'Deposits', 'down']]],
    ['Site', [['/content', 'Content', 'file'], ['/deploy', 'Deploy', 'cube']]],
    ['Record', [['/activity', 'Signed claims', 'list']]],
  ];
  function badges() {
    return {
      '/account/directory': S.directory.listed ? 0 : 1,
      '/content': S.pages.filter(p => pageStatus(p) !== 'published').length,
      '/deploy': S.staged ? 1 : 0,
    };
  }
  function renderShell(path) {
    const b = badges();
    const section = path.startsWith('/content') ? '/content' : path;
    $('#nav').innerHTML = NAV.map(([g, items]) => `<span class="meta">${g}</span>` + items.map(([href, label, ic]) =>
      `<a href="#${href}" ${section === href ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${b[href] ? `<span class="badge" title="Waiting on you">${b[href]}</span>` : ''}</a>`).join('')).join('') +
      `<div class="legend"><span class="sg">◇</span> on a button means it opens the signing review. Nothing is signed until you press Sign there.
       <br><br><a href="#" data-do="reset">Reset demo data</a></div>`;
    $('#idchip').innerHTML = `<span class="av">${esc(S.me.callsign.slice(0, 2))}</span><span><b>${esc(S.me.callsign)}</b><small>◆ key in this browser</small></span>`;
    $('#peers').textContent = ' · ' + NETWORK.peers + ' peers';
    const dark = document.documentElement.dataset.theme !== 'light';
    $('#theme').innerHTML = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${dark ? I.sun : I.moon}</svg>`;
    $('#theme').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  const ph = (crumbs, title, sub, actions = '') => `<header class="ph"><div class="t">
      <div class="crumbs">${crumbs}</div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions}</header>`;
  const signnote = (who, extra = '') => `<div class="signnote"><span class="sg">◇</span><span>You'll see the full signing review before anything happens: you'll be signing as
     <b class="mono">${esc(S.me.callsign)}</b> under ${who}.${extra}</span></div>`;
  const memberOptions = sel => MEMBERS.map(m => `<option value="${m.callsign}" ${m.callsign === sel ? 'selected' : ''}>${m.callsign} · ${m.id}</option>`).join('');

  /* ================================================================ *
   * views                                                             *
   * ================================================================ */
  function waiting() {
    const out = [];
    if (S.staged) out.push({ href: '#/deploy', t: `Build ${S.staged.rev} is staged but not live`, s: `${S.staged.changes.length} changed files · built ${ago(S.staged.builtAt)}`, chip: 'Needs your signature' });
    for (const p of S.pages) {
      const st = pageStatus(p);
      if (st !== 'published') out.push({ href: '#/content/' + p.slug, t: `“${p.draft.title}” ${st === 'draft' ? 'has never been published' : 'has unpublished changes'}`, s: '/' + p.slug, chip: 'Draft' });
    }
    if (!S.directory.listed) out.push({ href: '#/account/directory', t: 'Peers can’t find you in the mesh directory yet', s: 'Publish your callsign so members can look you up', chip: 'Optional' });
    return out;
  }

  function claimRow(c) {
    return `<li><div class="grow"><b>${esc(c.summary)}</b>
      <div class="s" style="margin-top:4px"><span class="verb">${esc(c.action)}</span> <span class="mono">${esc(c.scope)}</span> · ${ago(c.at)}</div></div></li>`;
  }

  function vHome() {
    const t = S.treasury;
    const w = waiting();
    const d = S.directory;
    return ph('Overview', `Welcome back, <span class="mono">${esc(S.me.callsign)}</span>`, 'Your balances, what’s waiting on you, and what you’ve signed lately.') + `
    <div class="tiles">
      <div class="card tile"><span class="meta">Your FXN</span><div class="n">${fmt(S.balances.FXN)}<small>FXN</small></div><div class="s">Spendable from <a href="#/account">Account</a></div></div>
      <div class="card tile"><span class="meta">Your Credits</span><div class="n">${fmt(S.balances.Credits, 0)}<small>CR</small></div><div class="s">Issued by your <a href="#/deposits">deposits</a></div></div>
      <div class="card tile"><span class="meta">DAO treasury</span><div class="n">${fmt(t.FXN)}<small>FXN</small></div>
        <div class="s">${fmt(t.dailyCap - t.usedToday, 0)} of ${fmt(t.dailyCap, 0)} FXN left in today’s cap</div><div class="bar"><i style="width:${(t.usedToday / t.dailyCap) * 100}%"></i></div></div>
      <div class="card tile"><span class="meta">Mesh directory</span><div class="n" style="font-size:20px;margin-top:12px">${d.listed ? '<span class="chip ok">Listed</span>' : '<span class="chip">Not listed</span>'}</div>
        <div class="s"><a href="#/account/directory">${d.listed ? 'View your entry' : 'Publish your callsign'}</a></div></div>
    </div>
    <div class="split">
      <section class="card" aria-labelledby="h-wait"><div class="ch"><h2 id="h-wait">Waiting on you</h2><span class="meta">${w.length}</span></div>
        ${w.length ? `<ul class="rows">${w.map(x => `<li><a class="rowlink grow" href="${x.href}"><b>${esc(x.t)}</b><div class="s">${esc(x.s)}</div></a><span class="chip ${x.chip === 'Optional' ? '' : 'warn'}">${x.chip}</span></li>`).join('')}</ul>`
          : '<div class="empty">Nothing is waiting on your signature.</div>'}</section>
      <section class="card" aria-labelledby="h-recent"><div class="ch"><h2 id="h-recent">Recently signed</h2><a class="meta" href="#/activity">All →</a></div>
        <ul class="rows">${S.claims.slice(0, 5).map(claimRow).join('')}</ul></section>
    </div>`;
  }

  function transferForm(id, balances, opts = {}) {
    return `<form class="form" data-form="${id}" novalidate>
      <div class="f"><label for="${id}-to">Recipient</label><select class="in mono" id="${id}-to" name="to">${memberOptions()}</select></div>
      <div class="f"><label for="${id}-amt">Amount</label>
        <div class="amount"><input class="in" id="${id}-amt" name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-describedby="${id}-hint ${id}-err">
        <select class="in" name="asset" aria-label="Asset"><option>FXN</option><option>Credits</option></select></div>
        <span class="hint" id="${id}-hint">Available: ${fmt(balances.FXN)} FXN · ${fmt(balances.Credits, 0)} Credits${opts.capHint || ''}</span>
        <span class="err" id="${id}-err" role="alert"></span></div>
      <div class="f"><label for="${id}-memo">Memo <span class="muted">(public)</span></label><input class="in" id="${id}-memo" name="memo" maxlength="80" placeholder="What it’s for"></div>
      ${signnote(opts.who, ' The transfer is public on the ledger.')}
      <div><button class="btn primary signs" type="submit">Review and sign transfer</button></div>
    </form>`;
  }

  function vAccount() {
    const me = S.me;
    const d = S.directory;
    return ph('You', `<span class="mono">${esc(me.callsign)}</span>`, `${esc(me.displayName)} · <span class="mono">${esc(me.did)}</span>`) + `
    <div class="split">
      <div class="vstack">
        <section class="card"><div class="ch"><h2>Balances</h2></div>
          <div class="cb"><div class="tiles" style="margin:0">
            <div><span class="meta">FXN</span><div class="tile" style="padding:0"><div class="n">${fmt(S.balances.FXN)}<small>FXN</small></div></div></div>
            <div><span class="meta">Credits</span><div class="tile" style="padding:0"><div class="n">${fmt(S.balances.Credits, 0)}<small>CR</small></div></div></div>
          </div></div></section>
        <section class="card" aria-labelledby="h-send"><div class="ch"><h2 id="h-send">Send FXN or Credits</h2><span class="verb">transfer</span></div>
          <div class="cb">${transferForm('acct', S.balances, { who: '<b>Flux DAO</b>' })}</div></section>
        <section class="card"><div class="ch"><h2>Sent from your account</h2></div>
          ${S.accountLedger.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>To</th><th class="num">Amount</th><th class="hide-sm">Claim</th></tr></thead><tbody>
          ${S.accountLedger.map(l => `<tr><td>${ago(l.at)}</td><td class="mono">${esc(l.to)}<div class="muted" style="font-size:12px;font-family:var(--font-sans)">${esc(l.memo)}</div></td><td class="num">${fmt(l.amount)} ${l.asset === 'FXN' ? 'FXN' : 'CR'}</td><td class="claimid hide-sm">${short(l.claimId)}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="empty">Nothing sent yet.</div>'}</section>
      </div>
      <div class="vstack">
        <section class="card"><div class="ch"><h2>Identity</h2></div><div class="cb">
          <dl class="kv">
            <dt>Callsign</dt><dd class="mono"><b>${esc(me.callsign)}</b></dd>
            <dt>Identity</dt><dd class="mono">${esc(me.did)}</dd>
            <dt>Root key</dt><dd>In this browser’s handle. defxn’s servers never receive it.</dd>
            <dt>Since</dt><dd class="mono">${esc(me.since)}</dd>
          </dl></div>
          <div class="cf"><span class="meta" style="flex:1">Device keys</span></div>
          <ul class="rows">${me.devices.map(dv => `<li><span class="grow"><b>${esc(dv.label)}</b><div class="s mono">${esc(dv.key)}</div></span><span class="muted mono" style="font-size:12px">${esc(dv.added)}</span></li>`).join('')}</ul></section>
        <section class="card"><div class="ch"><h2>Your authority</h2></div><div class="cb">
          <p class="muted" style="margin:0 0 14px;font-size:13px">These signed claims are why you can act here. The signing review shows the ones each request relies on.</p>
          <ol class="chain">
            <li><div class="k">Root identity</div><div class="a">${esc(me.did)}</div><div class="b">self-signed · ${esc(me.since)}</div></li>
            ${Object.values(ROLE).map(r => `<li><div class="k">${esc(r.kind)}</div><div class="a">${esc(r.subject)}</div><div class="b">${esc(r.by)}</div></li>`).join('')}
          </ol></div></section>
        <section class="card"><div class="ch"><h2>Mesh directory</h2>${d.listed ? '<span class="chip ok">Listed</span>' : '<span class="chip">Not listed</span>'}</div>
          <div class="cb"><p style="margin:0 0 12px" class="muted">${d.listed ? 'Peers can look you up by callsign.' : 'Peers can’t look you up by callsign yet.'}</p>
          <a class="btn" href="#/account/directory">${d.listed ? 'Manage your entry' : 'Set up your entry'} ${icon('arrow')}</a></div></section>
      </div>
    </div>`;
  }

  function dirCard(d) {
    const links = d.links.split('\n').map(s => s.trim()).filter(Boolean);
    return `<div class="dircard" id="dircard">
      <div class="head"><span class="av">${esc(S.me.callsign.slice(0, 2))}</span><div><div class="cs">${esc(S.me.callsign)}</div><div class="dn">${esc(d.displayName) || '<span class="muted">No display name</span>'}</div></div></div>
      ${d.bio ? `<div>${esc(d.bio)}</div>` : ''}
      <dl class="kv" style="font-size:13px"><dt>Identity</dt><dd class="mono">${esc(S.me.did)}</dd>
        <dt>Keys</dt><dd class="mono">${S.me.devices.map(x => esc(x.key)).join('<br>')}</dd>
        ${links.length ? `<dt>Links</dt><dd>${links.map(l => esc(l)).join('<br>')}</dd>` : ''}
        <dt>Authority</dt><dd>${esc(FOUNDING.name)}</dd></dl>
    </div>`;
  }

  function vDirectory() {
    const d = S.directory;
    return ph('<a href="#/account">You</a> / Directory', 'Mesh directory',
      'Let other members find you by callsign. Your entry is a signed claim that every peer on Flux mesh can read and check.',
      d.listed ? '<span class="chip ok">Listed</span>' : '<span class="chip">Not listed</span>') + `
    <div class="split">
      <section class="card" aria-labelledby="h-entry"><div class="ch"><h2 id="h-entry">Your entry</h2><span class="verb">founding.directory.publish</span></div>
        <form class="cb form" data-form="directory" novalidate>
          <div class="f"><label for="dn">Display name</label><input class="in" id="dn" name="displayName" maxlength="40" value="${esc(d.displayName)}"></div>
          <div class="f"><label for="bio">Short bio</label><input class="in" id="bio" name="bio" maxlength="120" value="${esc(d.bio)}"><span class="hint">One line. Optional.</span></div>
          <div class="f"><label for="links">Links</label><textarea class="in mono" id="links" name="links" style="min-height:80px" aria-describedby="links-h">${esc(d.links)}</textarea><span class="hint" id="links-h">One per line. Optional.</span></div>
          <div class="f"><span class="meta">Published with your entry</span><span class="hint">Your callsign, identity and device keys are always part of the entry so peers can check your signatures. Change devices from Account.</span></div>
          ${signnote('<b>Flux DAO · Founding</b>', ' The entry is visible to every peer on the network.')}
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn primary signs" type="submit">${d.listed ? 'Review and sign update' : 'Review and sign publish'}</button>
            ${d.listed ? '<button class="btn danger signs" type="button" data-do="unlist">Remove listing</button>' : ''}
          </div>
        </form></section>
      <div class="vstack">
        <section class="card" aria-labelledby="h-peers"><div class="ch"><h2 id="h-peers">What peers will see</h2></div>
          <div class="cb">${dirCard(d)}<p class="muted" style="font-size:12px;margin:10px 0 0">This is the whole entry. Nothing else about you is published.</p></div></section>
        ${d.listed ? `<section class="card"><div class="ch"><h2>Current listing</h2></div><div class="cb"><dl class="kv">
          <dt>Claim</dt><dd class="claimid">${esc(d.claimId)}</dd><dt>Signed</dt><dd class="mono">${utc(d.at)}</dd><dt>Visible to</dt><dd>All peers on ${NETWORK.name}</dd></dl></div></section>` : ''}
      </div>
    </div>`;
  }

  function vTreasury() {
    const t = S.treasury;
    const left = t.dailyCap - t.usedToday;
    return ph('Flux DAO', 'Treasury', 'Flux DAO’s shared funds. As <span class="mono">treasury.operator</span> you can send from it up to the daily cap. Every transfer is public.') + `
    <div class="tiles">
      <div class="card tile"><span class="meta">FXN</span><div class="n">${fmt(t.FXN)}<small>FXN</small></div></div>
      <div class="card tile"><span class="meta">Credits</span><div class="n">${fmt(t.Credits, 0)}<small>CR</small></div></div>
      <div class="card tile"><span class="meta">Today’s cap</span><div class="n">${fmt(left, 0)}<small>FXN left</small></div><div class="bar"><i style="width:${(t.usedToday / t.dailyCap) * 100}%"></i></div><div class="s">${fmt(t.usedToday, 0)} of ${fmt(t.dailyCap, 0)} used · resets 00:00 UTC</div></div>
    </div>
    <div class="split">
      <section class="card" aria-labelledby="h-tsend"><div class="ch"><h2 id="h-tsend">Send from treasury</h2><span class="verb">transfer</span></div>
        <div class="cb">${transferForm('treas', t, { who: '<b>Flux DAO</b> as <span class="mono">treasury.operator</span>', capHint: ` · cap left ${fmt(left, 0)} FXN` })}</div></section>
      <section class="card"><div class="ch"><h2>Policy</h2></div><div class="cb"><dl class="kv">
        <dt>Configuration</dt><dd>treasury policy v14<div class="mono muted" style="font-size:12px">cfg://flux-dao/treasury@14</div></dd>
        <dt>Your role</dt><dd class="mono">treasury.operator</dd>
        <dt>Daily cap</dt><dd>${fmt(t.dailyCap, 0)} FXN per day. Credits are not capped.</dd>
        <dt>Operators</dt><dd class="mono">KESTREL-7, WREN-1, OSPREY-4</dd>
        <dt>Visibility</dt><dd>Public ledger</dd></dl></div></section>
    </div>
    <section class="card" style="margin-top:16px" aria-labelledby="h-led"><div class="ch"><h2 id="h-led">Ledger</h2></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>To</th><th class="num">Amount</th><th>Signed by</th><th class="hide-sm">Claim</th></tr></thead><tbody>
      ${S.treasuryLedger.map(l => `<tr><td>${ago(l.at)}</td><td class="mono">${esc(l.to)}<div class="muted" style="font-size:12px;font-family:var(--font-sans)">${esc(l.memo)}</div></td>
        <td class="num">${fmt(l.amount)} ${l.asset === 'FXN' ? 'FXN' : 'CR'}</td><td class="mono">${esc(l.by)}</td><td class="claimid hide-sm">${short(l.claimId)}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  function vDeposits() {
    const active = S.deposits.filter(x => x.status === 'active');
    const total = active.reduce((a, x) => a + x.amount, 0);
    return ph('Flux DAO', 'Deposits', `FXN you’ve put into the Flux DAO deposit pool. Each deposit issues ${CREDITS_PER_FXN} Credits per FXN. Withdrawing returns the FXN; Credits already issued stay yours.`) + `
    <div class="tiles">
      <div class="card tile"><span class="meta">In the pool</span><div class="n">${fmt(total)}<small>FXN</small></div><div class="s">${active.length} active deposit${active.length === 1 ? '' : 's'}</div></div>
      <div class="card tile"><span class="meta">Credits issued</span><div class="n">${fmt(active.reduce((a, x) => a + x.credits, 0), 0)}<small>CR</small></div></div>
      <div class="card tile"><span class="meta">Available to deposit</span><div class="n">${fmt(S.balances.FXN)}<small>FXN</small></div></div>
    </div>
    <div class="split">
      <section class="card" aria-labelledby="h-deps"><div class="ch"><h2 id="h-deps">Your deposits</h2></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Deposit</th><th class="num">FXN</th><th class="num hide-sm">Credits</th><th>Status</th><th></th></tr></thead><tbody>
        ${S.deposits.map(x => `<tr><td class="mono">${x.id}<div class="muted" style="font-size:12px">${x.at.slice(0, 10)}</div></td><td class="num">${fmt(x.amount)}</td><td class="num hide-sm">${fmt(x.credits, 0)}</td>
          <td>${x.status === 'active' ? '<span class="chip ok">Active</span>' : '<span class="chip">Withdrawn</span>'}</td>
          <td style="text-align:right">${x.status === 'active' ? `<button class="btn sm signs" data-do="withdraw" data-id="${x.id}">Withdraw</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div></section>
      <section class="card" aria-labelledby="h-newdep"><div class="ch"><h2 id="h-newdep">New deposit</h2><span class="verb">transfer</span></div>
        <form class="cb form" data-form="deposit" novalidate>
          <div class="f"><label for="dep-amt">Amount</label><div class="amount"><input class="in" id="dep-amt" name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-describedby="dep-hint dep-err"><span class="in" style="width:auto" aria-hidden="true">FXN</span></div>
            <span class="hint" id="dep-hint">You’ll receive <span id="dep-cr">0</span> Credits.</span><span class="err" id="dep-err" role="alert"></span></div>
          ${signnote('<b>Flux DAO</b>', ' The deposit is public on the ledger.')}
          <div><button class="btn primary signs" type="submit">Review and sign deposit</button></div>
        </form></section>
    </div>`;
  }

  function vContent() {
    return ph('Site', 'Content', 'Pages on defxn. Drafts stay in this browser until you sign a publish; a signed publish is what visitors see.',
      '<button class="btn" data-do="newpage">New page</button>') + `
    <section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Page</th><th class="hide-sm">Route</th><th>Status</th><th class="hide-sm">Live version</th></tr></thead><tbody>
      ${S.pages.map(p => `<tr><td><a href="#/content/${p.slug}"><b>${esc(p.draft.title || 'Untitled')}</b></a></td><td class="mono hide-sm">/${esc(p.slug)}</td><td>${STATUS_CHIP[pageStatus(p)]}</td>
        <td class="hide-sm">${p.published ? `<span class="mono">rev ${p.published.rev}</span> <span class="muted">· ${ago(p.published.at)}</span>` : '<span class="muted">Not live</span>'}</td></tr>`).join('')}
    </tbody></table></div></section>`;
  }

  const paras = body => body.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean).map(x => `<p>${esc(x)}</p>`).join('');

  function vEditor(slug) {
    const p = S.pages.find(x => x.slug === slug);
    if (!p) return vNotFound();
    const st = pageStatus(p);
    return ph('<a href="#/content">Site / Content</a>', esc(p.draft.title || 'Untitled'), `<span class="mono">/${esc(p.slug)}</span> · ${p.published ? `live: rev ${p.published.rev}, ${ago(p.published.at)}` : 'never published'}`,
      STATUS_CHIP[st]) + `
    <form data-form="page" data-slug="${esc(p.slug)}" novalidate>
      <div class="editor">
        <section class="card" aria-labelledby="h-ed"><div class="ch"><h2 id="h-ed">Edit</h2><span class="meta">Draft · this browser</span></div>
          <div class="cb form">
            <div class="f"><label for="pt">Title</label><input class="in" id="pt" name="title" value="${esc(p.draft.title)}" maxlength="90"></div>
            <div class="f"><label for="pb">Body</label><textarea class="in" id="pb" name="body" aria-describedby="pb-h">${esc(p.draft.body)}</textarea><span class="hint" id="pb-h">Blank line between paragraphs.</span></div>
          </div></section>
        <section class="card" aria-labelledby="h-pv"><div class="ch"><h2 id="h-pv">Preview</h2><span class="meta">What visitors will see</span></div>
          <div class="pagepreview" id="pv"><h1>${esc(p.draft.title)}</h1>${paras(p.draft.body)}</div></section>
      </div>
      <div class="card" style="margin-top:16px"><div class="cb vstack">
        ${signnote('<b>defxn Editorial</b> as <span class="mono">editorial.publisher</span>', ' Saving a draft signs nothing.')}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" type="button" data-do="savedraft">Save draft</button>
          ${st === 'changed' ? '<button class="btn ghost" type="button" data-do="discard">Discard changes</button>' : ''}
          <span style="flex:1"></span>
          <button class="btn primary signs" type="submit">Review and sign publish</button>
        </div></div></div>
    </form>
    <section class="card" style="margin-top:16px"><div class="ch"><h2>Publish history</h2><span class="verb">publish</span></div>
      ${p.history.length ? `<ul class="rows">${p.history.map(h => `<li><span class="mono">rev ${h.rev}</span><span class="grow muted">${utc(h.at)}</span><span class="claimid">${short(h.claimId)}</span></li>`).join('')}</ul>` : '<div class="empty">Not published yet.</div>'}</section>`;
  }

  function vDeploy() {
    const live = S.deploys.find(x => x.status === 'live');
    const st = S.staged;
    return ph('Site', 'Deploy', 'A build goes live only when a <span class="mono">site.deployer</span> signs it. Rolling back is a new signed deploy of an older build, so the history stays complete.') + `
    <div class="cols">
      <section class="card"><div class="ch"><h2>Live</h2><span class="chip ok">Live</span></div><div class="cb"><dl class="kv">
        <dt>Build</dt><dd class="mono"><b>${live.rev}</b></dd><dt>Deployed</dt><dd>${utc(live.at)} by <span class="mono">${esc(live.by)}</span></dd>
        <dt>Size</dt><dd>${live.files} files · ${live.size}</dd><dt>Digest</dt><dd class="mono" style="font-size:12px">${esc(live.digest)}…</dd><dt>Claim</dt><dd class="claimid">${esc(live.claimId)}</dd></dl></div></section>
      <section class="card"><div class="ch"><h2>Staged</h2>${st ? '<span class="chip warn">Needs your signature</span>' : ''}</div>
        ${st ? `<div class="cb"><dl class="kv"><dt>Build</dt><dd class="mono"><b>${st.rev}</b></dd><dt>Built</dt><dd>${utc(st.builtAt)}</dd><dt>Replaces</dt><dd class="mono">${live.rev}</dd></dl></div>
          <ul class="rows">${st.changes.map(c => `<li><span class="chip ${c.change === 'added' ? 'info' : ''}" style="min-width:76px;justify-content:center">${c.change}</span><span class="grow mono" style="font-size:13px;overflow-wrap:anywhere">${esc(c.path)}</span><span class="muted mono hide-sm" style="font-size:12px">${fmt(c.bytes / 1024, 1)} KB</span></li>`).join('')}</ul>
          <div class="cf"><button class="btn primary signs" data-do="deploy">Review and sign deploy</button></div>`
          : '<div class="empty">No build is staged. New builds appear here after CI finishes.</div>'}</section>
    </div>
    <section class="card" style="margin-top:16px"><div class="ch"><h2>History</h2></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Build</th><th>Deployed</th><th class="hide-sm">Signed by</th><th>Status</th><th></th></tr></thead><tbody>
      ${S.deploys.map(x => `<tr><td class="mono"><b>${x.rev}</b>${x.rollbackOf ? `<div class="muted" style="font-size:12px">rollback</div>` : ''}</td><td>${ago(x.at)}</td><td class="mono hide-sm">${esc(x.by)}</td>
        <td>${x.status === 'live' ? '<span class="chip ok">Live</span>' : '<span class="chip">Superseded</span>'}</td>
        <td style="text-align:right">${x.status !== 'live' ? `<button class="btn sm signs" data-do="rollback" data-rev="${x.rev}">Roll back to this</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  let filter = 'all';
  function vActivity() {
    const fam = c => c.action === 'transfer' ? 'transfer' : c.action.startsWith('founding.directory') ? 'directory' : 'publish';
    const list = S.claims.filter(c => filter === 'all' || fam(c) === filter);
    return ph('Record', 'Signed claims', 'Everything you’ve signed from defxn, newest first. Each claim is permanent, and visible to whoever its visibility named when you signed it.') + `
    <div class="filters" role="group" aria-label="Filter" style="margin-bottom:12px">
      ${[['all', 'All'], ['transfer', 'Transfers'], ['publish', 'Publishes'], ['directory', 'Directory']].map(([k, l]) => `<button data-do="filter" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join('')}
    </div>
    <section class="card">${list.length ? list.map(c => `<details class="claim"><summary><span class="verb">${esc(c.action)}</span>
        <span class="grow" style="flex:1;min-width:0"><b>${esc(c.summary)}</b><div class="muted" style="font-size:12px"><span class="mono">${esc(c.scope)}</span> · ${ago(c.at)}</div></span>
        <span class="claimid hide-sm">${short(c.claimId)}</span></summary>
        <div class="body"><dl class="kv">
          <dt>Claim</dt><dd class="mono">${esc(c.claimId)}</dd><dt>Action</dt><dd class="mono">${esc(c.action)}</dd><dt>Scope</dt><dd class="mono">${esc(c.scope)}</dd>
          <dt>Signed at</dt><dd class="mono">${utc(c.at)}</dd><dt>From</dt><dd class="mono">${esc(c.origin)}</dd>
          <dt>Manifest digest</dt><dd class="mono" style="font-size:12px">${esc(c.digest)}</dd>
          ${c.signature ? `<dt>Signature</dt><dd class="mono" style="font-size:12px">ed25519:${esc(c.signature.slice(0, 48))}…</dd>` : ''}
        </dl></div></details>`).join('') : '<div class="empty">No claims match.</div>'}</section>`;
  }

  function vNotFound() {
    return ph('defxn', 'Not found', 'There’s no page at this address.') + '<a class="btn" href="#/">Go to overview</a>';
  }

  /* ================================================================ *
   * router                                                            *
   * ================================================================ */
  function route() {
    const path = location.hash.slice(1) || '/';
    if (path === '/') return [path, vHome];
    if (path === '/account') return [path, vAccount];
    if (path === '/account/directory') return [path, vDirectory];
    if (path === '/treasury') return [path, vTreasury];
    if (path === '/deposits') return [path, vDeposits];
    if (path === '/content') return [path, vContent];
    if (path.startsWith('/content/')) return [path, () => vEditor(decodeURIComponent(path.slice(9)))];
    if (path === '/deploy') return [path, vDeploy];
    if (path === '/activity') return [path, vActivity];
    return [path, vNotFound];
  }
  function render(focus) {
    const [path, view] = route();
    renderShell(path);
    $('#view').innerHTML = view();
    const h1 = $('#view h1');
    document.title = (h1 ? h1.textContent.trim() + ' · ' : '') + 'defxn';
    if (focus) { window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); }
  }
  window.addEventListener('hashchange', () => render(true));

  /* ================================================================ *
   * actions                                                           *
   * ================================================================ */
  function readAmount(form, errId, max, maxLabel) {
    const raw = form.amount.value.trim().replace(/,/g, '');
    const n = Number(raw);
    let msg = '';
    if (!raw) msg = 'Enter an amount.';
    else if (!/^\d+(\.\d{1,6})?$/.test(raw) || n <= 0) msg = 'Use a positive number with up to 6 decimals.';
    else if (n > max) msg = `That’s more than ${maxLabel}.`;
    document.getElementById(errId).textContent = msg;
    if (msg) { form.amount.focus(); return null; }
    return n;
  }

  async function onSubmit(e) {
    const form = e.target.closest('form[data-form]'); if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;

    if (kind === 'acct' || kind === 'treas') {
      const asset = form.asset.value;
      const pool = kind === 'acct' ? S.balances : S.treasury;
      let max = pool[asset], label = `the ${fmt(max)} ${asset} available`;
      if (kind === 'treas' && asset === 'FXN') {
        const left = S.treasury.dailyCap - S.treasury.usedToday;
        if (left < max) { max = left; label = `today’s remaining cap of ${fmt(left, 0)} FXN`; }
      }
      const amount = readAmount(form, kind + '-err', max, label);
      if (amount === null) return;
      const to = member(form.to.value);
      const memo = form.memo.value.trim();
      const amountStr = amount.toFixed(6);
      const summary = `${fmt(amount)} ${asset} to ${to.callsign}${kind === 'treas' ? ' from treasury' : ''}`;
      const rc = await sign(kind === 'acct' ? 'account.transfer' : 'treasury.transfer',
        kind === 'acct' ? `Send ${fmt(amount)} ${asset} to ${to.callsign}` : `Send ${fmt(amount)} ${asset} from the treasury`,
        { kind: 'transfer', asset, amount: amountStr, from: kind === 'acct' ? S.me.did : DAO.id + '/treasury', to: `${to.callsign} (${to.id})`, memo }, summary);
      if (!rc) return;
      pool[asset] -= amount;
      const row = { at: rc.signedAt.toISOString(), asset, amount, to: to.callsign, memo, claimId: rc.claimId, by: S.me.callsign };
      if (kind === 'acct') S.accountLedger.unshift(row);
      else { S.treasuryLedger.unshift(row); if (asset === 'FXN') S.treasury.usedToday += amount; }
      save(); render();
    }

    if (kind === 'deposit') {
      const amount = readAmount(form, 'dep-err', S.balances.FXN, `your ${fmt(S.balances.FXN)} FXN`);
      if (amount === null) return;
      const id = 'dep-' + String(208 + S.deposits.length).padStart(4, '0');
      const rc = await sign('deposit.create', `Deposit ${fmt(amount)} FXN into the pool`,
        { kind: 'deposit', deposit: id, asset: 'FXN', amount: amount.toFixed(6), from: S.me.did, to: `${POOL.name} (${POOL.id})`, creditsIssued: String(amount * CREDITS_PER_FXN) },
        `Deposited ${fmt(amount)} FXN (${id})`);
      if (!rc) return;
      S.balances.FXN -= amount; S.balances.Credits += amount * CREDITS_PER_FXN;
      S.deposits.unshift({ id, amount, credits: amount * CREDITS_PER_FXN, at: rc.signedAt.toISOString(), status: 'active' });
      save(); render();
    }

    if (kind === 'directory') {
      const d = { displayName: form.displayName.value.trim(), bio: form.bio.value.trim(), links: form.links.value.trim() };
      const links = d.links.split('\n').map(s => s.trim()).filter(Boolean);
      const rc = await sign('directory.publish', S.directory.listed ? 'Update your mesh directory entry' : 'Publish your identity to the mesh directory',
        { kind: 'directory.entry', callsign: S.me.callsign, identity: S.me.did, deviceKeys: S.me.devices.map(x => x.key),
          profile: { displayName: d.displayName, bio: d.bio, links }, replaces: S.directory.claimId },
        S.directory.listed ? 'Updated directory entry' : `Listed ${S.me.callsign} in the mesh directory`);
      if (!rc) return;
      Object.assign(S.directory, d, { listed: true, claimId: rc.claimId, at: rc.signedAt.toISOString() });
      save(); render();
    }

    if (kind === 'page') {
      const p = S.pages.find(x => x.slug === form.dataset.slug);
      p.draft = { title: form.title.value.trim(), body: form.body.value };
      save();
      if (!p.draft.title) { toast('Add a title first', 'A page needs a title before it can be published.', 'bad'); form.title.focus(); return; }
      const rev = p.published ? p.published.rev + 1 : 1;
      const rc = await sign('content.publish', `Publish “${p.draft.title}”`,
        { kind: 'site.publish', route: '/' + p.slug, rev, title: p.draft.title, bodySha256: await SCA.sha256(p.draft.body),
          bytes: new TextEncoder().encode(p.draft.body).length, replaces: p.published ? 'rev ' + p.published.rev : null },
        `Published “${p.draft.title}” rev ${rev}`);
      if (!rc) { render(); return; }
      p.published = { ...p.draft, rev, at: rc.signedAt.toISOString(), claimId: rc.claimId };
      p.history.unshift({ rev, at: p.published.at, claimId: rc.claimId });
      save(); render();
    }
  }

  async function onClick(e) {
    const b = e.target.closest('[data-do]'); if (!b) return;
    const what = b.dataset.do;
    if (what === 'reset') { e.preventDefault(); S = SEED(); save(); toast('Demo data reset', 'Everything is back to the starting state.', 'neutral'); render(); return; }
    if (what === 'filter') { filter = b.dataset.f; render(); return; }

    if (what === 'withdraw') {
      const dep = S.deposits.find(x => x.id === b.dataset.id);
      const rc = await sign('deposit.withdraw', `Withdraw ${fmt(dep.amount)} FXN from ${dep.id}`,
        { kind: 'withdrawal', deposit: dep.id, asset: 'FXN', amount: dep.amount.toFixed(6), from: `${POOL.name} (${POOL.id})`, to: S.me.did },
        `Withdrew ${fmt(dep.amount)} FXN (${dep.id})`);
      if (!rc) return;
      dep.status = 'withdrawn'; S.balances.FXN += dep.amount; save(); render();
    }

    if (what === 'unlist') {
      const rc = await sign('directory.unpublish', 'Remove your mesh directory entry',
        { kind: 'directory.removal', callsign: S.me.callsign, identity: S.me.did, removes: S.directory.claimId }, 'Removed directory entry');
      if (!rc) return;
      Object.assign(S.directory, { listed: false, claimId: null, at: null }); save(); render();
    }

    if (what === 'deploy' || what === 'rollback') {
      const live = S.deploys.find(x => x.status === 'live');
      let manifest, rev, summary, title;
      if (what === 'deploy') {
        const st = S.staged; rev = st.rev;
        manifest = { kind: 'site.deploy', build: rev, replaces: live.rev, changes: st.changes.map(c => ({ path: c.path, change: c.change, bytes: c.bytes })) };
        title = `Deploy build ${rev}`; summary = `Deployed build ${rev}`;
      } else {
        const old = S.deploys.find(x => x.rev === b.dataset.rev); rev = old.rev;
        manifest = { kind: 'site.deploy', build: rev, buildDigest: old.digest, replaces: live.rev, reason: 'rollback' };
        title = `Roll back to build ${rev}`; summary = `Rolled back to build ${rev}`;
      }
      const rc = await sign('site.deploy', title, manifest, summary);
      if (!rc) return;
      live.status = 'superseded';
      if (what === 'deploy') { S.deploys.unshift({ rev, at: rc.signedAt.toISOString(), by: S.me.callsign, files: 16, size: S.staged.size, digest: rc.digest.slice(0, 39), status: 'live', claimId: rc.claimId }); S.staged = null; }
      else { const old = S.deploys.find(x => x.rev === rev); S.deploys.unshift({ ...old, at: rc.signedAt.toISOString(), by: S.me.callsign, status: 'live', claimId: rc.claimId, rollbackOf: live.rev }); }
      save(); render();
    }

    if (what === 'newpage') {
      let n = 1; while (S.pages.some(p => p.slug === 'untitled-' + n)) n++;
      S.pages.unshift({ slug: 'untitled-' + n, draft: { title: '', body: '' }, published: null, history: [] });
      save(); location.hash = '#/content/untitled-' + n;
    }

    if (what === 'savedraft' || what === 'discard') {
      const form = b.closest('form');
      const p = S.pages.find(x => x.slug === form.dataset.slug);
      if (what === 'savedraft') { p.draft = { title: form.title.value.trim(), body: form.body.value }; toast('Draft saved', 'Saved in this browser. Nothing was signed or published.', 'neutral'); }
      else { p.draft = { title: p.published.title, body: p.published.body }; toast('Changes discarded', `Back to the live version, rev ${p.published.rev}.`, 'neutral'); }
      save(); render();
    }
  }

  // Live previews: directory card, content preview, credits estimate.
  function onInput(e) {
    const form = e.target.closest('form[data-form]'); if (!form) return;
    if (form.dataset.form === 'directory') {
      $('#dircard').outerHTML = dirCard({ displayName: form.displayName.value, bio: form.bio.value, links: form.links.value });
    }
    if (form.dataset.form === 'page') {
      $('#pv').innerHTML = `<h1>${esc(form.title.value)}</h1>${paras(form.body.value)}`;
    }
    if (form.dataset.form === 'deposit') {
      const n = Number(form.amount.value.replace(/,/g, ''));
      $('#dep-cr').textContent = fmt(n > 0 ? n * CREDITS_PER_FXN : 0, 0);
    }
  }

  document.addEventListener('submit', onSubmit);
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  $('#theme').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('defxn-theme', t); } catch (e) { /* ignore */ }
    renderShell(route()[0]);
  });

  render();
})();
