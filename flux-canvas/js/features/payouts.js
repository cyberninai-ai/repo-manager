'use strict';
// @module features/payouts — Canvas-to-Cash: the board is the contract. Backers pledge to a canvas's pool; a delivery carries
// payment terms (an amount, split evenly, by contribution, or by fixed shares, plus any template royalty); when its approvals are
// complete, its author signs a settlement whose lines every peer recomputes. The settlement is the payment instruction and its
// proof in one record; a payment connector (a chain, a bank, a service pool) executes it through PAYOUT_CONNECTORS.
// Without a connector Flux moves no money: it produces the signed instruction and a manifest to hand to whoever pays.
// @uses features/work (deliveries), features/contribution (shares), features/lineage (royalties via SETTLE_HOOKS), ui/panels, ui/form
// FUND-I-R-{canvas}-A-{amount, cents}-U-{unit}-M-{note}-Z-T-SIG                         a backer's signed pledge to the pool
// PAY-I-R-{delivery}-A-{amount, cents}-U-{unit}-S-{even|credit|fixed}-P-{person~bp _ …|0}-Z-T-SIG   the delivery author's terms
// SETTLE-I-R-{delivery}-H-{root}-L-{person~cents _ …}-U-{unit}-Z-T-SIG                  the release; valid only if the lines recompute
const PAYOUT_CONNECTORS = [];   // { name, run: async (manifest) → receipt text }  e.g. an FXN service-pool resolver or a payment API
const SETTLE_HOOKS = [];        // (x, amount) → [{ to, bp, why }] lines taken before the split (template royalties)
const unitOk = u => /^[A-Za-z0-9]{1,8}$/.test(u || '');
const shareList = v => new Map(String(v).split('_').map(p => p.split('~')).map(([k, n]) => { must(isKey(k), 'payee'); return [k, Math.max(0, Math.min(10000, +n || 0))]; }));
registerRecord('FUND', { parse(r, f){ must(isCanvas(f.R) && unitOk(f.U), 'fund'); r.cents = Math.max(0, Math.min(1e15, +f.A || 0)); r.unit = f.U.toUpperCase(); r.note = decTxt(f.M || ''); }, inherit: false });
registerRecord('PAY', { parse(r, f){ must(isCid(f.R) && unitOk(f.U) && ['even', 'credit', 'fixed'].includes(f.S), 'pay'); r.cents = Math.max(0, Math.min(1e15, +f.A || 0)); r.unit = f.U.toUpperCase(); r.split = f.S;
  r.fixed = f.P && f.P !== '0' ? shareList(f.P) : null; }, inherit: false });
registerRecord('SETTLE', { parse(r, f){ must(isCid(f.R) && isRoot(f.H) && f.L && isCid(f.K) && unitOk(f.U), 'settle'); r.terms = f.K;
  r.lines = f.L.split('_').map(p => p.split('~')).map(([k, n]) => { must(isKey(k), 'payee'); return { to: k, cents: Math.max(0, +n || 0) }; }); r.unit = f.U.toUpperCase(); }, inherit: false });
Object.assign(PERM_OF, { FUND: 'comment', PAY: null, SETTLE: null });
const money = (c, u) => `${(c / 100).toLocaleString([], { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })} ${u}`;

// deterministic lines: royalties first, then the split; cents rounded down, the remainder to the largest share.
// Nobody to pay (no work, zero weights): everything goes to the delivery's author, so the lines always add up to the amount
function payoutLines(x, pay){
  const lines = [], add = (to, cents, why) => { const l = lines.find(l => l.to === to && l.why === why); if (l) l.cents += cents; else lines.push({ to, cents, why }); };
  let rest = pay.cents;
  for (const h of SETTLE_HOOKS) for (const r of h(x, pay.cents) || []){ const c = Math.floor(pay.cents * r.bp / 10000); if (c > 0 && c <= rest){ add(r.to, c, r.why); rest -= c; } }
  let shares;
  if (pay.split === 'fixed' && pay.fixed) shares = pay.fixed;
  else if (pay.split === 'credit') shares = contributionShares(x);
  else { const who = [...new Set(versionRecs(x.d).filter(r => r.neg === null && ELEMENT.has(r.type) && inView(r)).map(r => personOf(r.author)))].sort(); shares = new Map(who.map(k => [k, 1])); }
  const tot = [...shares.values()].reduce((a, v) => a + v, 0);
  if (!tot){ if (rest > 0) add(personOf(x.d.author), rest, 'work'); return lines; }
  const parts = [...shares].map(([k, v]) => [k, Math.floor(rest * v / tot)]);
  let left = rest - parts.reduce((a, [, c]) => a + c, 0);
  parts.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)); for (const p of parts){ if (left <= 0) break; p[1]++; left--; }
  for (const [k, c] of parts) if (c > 0) add(k, c, 'work');
  return lines;
}
const sameLines = (a, b) => { const m = new Map(); for (const l of a) m.set(l.to, (m.get(l.to) || 0) + l.cents); const n = new Map(); for (const l of b) n.set(l.to, (n.get(l.to) || 0) + l.cents); return m.size === n.size && [...m].every(([k, v]) => n.get(k) === v); };
// approvals cover the terms: each approval names the PAY it was signed with (features/work), so terms changed afterwards
// need approving again before anything can be released
const termsApproved = (x, pay) => !!pay && x.ok.length > 0 && x.ok.every(a => a.terms === pay.cid);
// judged after the deliveries and credits (DERIVE_FINAL), recomputed every time: nothing cached on the records
DERIVE_FINAL.push((D, by) => {
  const pays = new Map(), settles = new Map();
  for (const x of D.deliveries || []){
    const own = r => r.f.R === x.d.cid && r.neg === null && samePerson(r.author, x.d.author) && inView(r);
    const p = (by.PAY || []).filter(own).at(-1); if (p) pays.set(x.d.cid, p);
    for (const st of (by.SETTLE || []).filter(own)){
      try {
        const terms = S.records.get(st.terms);
        if (!x.done || st.f.H !== x.d.root || !terms || terms.type !== 'PAY' || !own(terms) || terms.unit !== st.unit || !termsApproved(x, terms)) continue;
        if (sameLines(st.lines, payoutLines(x, terms))){ settles.set(x.d.cid, st); break; }   // the first valid release
      } catch {}
    }
  }
  // the pool pays only what someone with a stake in it approved: the canvas owner or a backer of that unit
  const pool = new Map(); for (const f of by.FUND || []) if (f.neg === null && inView(f) && f.f.R === canvasId){ const o = pool.get(f.unit) || { pledged: 0, paid: 0, backers: new Map() }; o.pledged += f.cents; o.backers.set(personOf(f.author), (o.backers.get(personOf(f.author)) || 0) + f.cents); pool.set(f.unit, o); }
  const fromPool = new Set();
  for (const x of D.deliveries || []){ const st = settles.get(x.d.cid), o = st && pool.get(st.unit); if (o && x.ok.some(a => samePerson(a.author, S.P?.owner) || o.backers.has(personOf(a.author)))){ o.paid += st.lines.reduce((a, l) => a + l.cents, 0); fromPool.add(x.d.cid); } }
  D.pays = pays; D.settles = settles; D.pool = pool; D.fromPool = fromPool;
});
const settleValid = (x, s) => S.D.settles?.get(x.d.cid) === s;
// payment terms can go on in the Deliver dialog itself, before anyone approves
DELIVERY_HOOKS.compose.push({
  fields: () => [{ id: 'pay', label: 'Payment on approval (0 for none)', type: 'number', value: 0, min: 0 }, { id: 'unit', label: 'Unit', type: 'text', value: [...(S.D.pool?.keys() || [])][0] || 'FXN' },
    { id: 'split', label: 'Split the payment', type: 'select', value: 'credit', options: [['credit', 'By contribution (the signed records)'], ['even', 'Evenly among contributors']] }],
  after: async (v, cid) => { if (!(v.pay > 0) || !unitOk(v.unit)) return; await publish(await signed('PAY', [['I', S.me.id], ['R', cid], ['A', Math.round(v.pay * 100)], ['U', v.unit.toUpperCase()], ['S', v.split], ['P', '0'], ['Z', ++S.lamport], ['T', Date.now()]])); },
});
async function attachPay(x){
  const v = await formDialog('Payment for this delivery', [
    { id: 'amt', label: 'Amount', type: 'number', value: 1000, min: 0 }, { id: 'unit', label: 'Unit (FXN, USD, EUR…)', type: 'text', value: [...S.D.pool.keys()][0] || 'FXN' },
    { id: 'split', label: 'Split', type: 'select', value: 'credit', options: [['credit', 'By contribution (the signed records)'], ['even', 'Evenly among contributors'], ['fixed', 'Fixed shares (below)']] },
    { id: 'fixed', label: 'Fixed shares: one per line, name or key, then a percent', type: 'textarea', value: people().map(id => `${short(id)} ${Math.floor(100 / people().length)}`).join('\n'), hint: 'Only used for fixed shares.' },
  ], { ok: 'Sign the terms', why: `When “${x.d.title}” is approved, you release the payment; the lines are computed from these terms, so everyone can check them.` });
  if (!v || !unitOk(v.unit)) return;
  const fixed = v.split === 'fixed' ? v.fixed.split('\n').map(l => l.trim().match(/^(.+?)\s+([\d.]+)%?$/)).filter(Boolean).map(([, who, p]) => [people().find(id => short(id).toLowerCase() === who.toLowerCase() || id === who), Math.round(+p * 100)]).filter(([k]) => k) : [];
  await publish(await signed('PAY', [['I', S.me.id], ['R', x.d.cid], ['A', Math.round(v.amt * 100)], ['U', v.unit.toUpperCase()], ['S', v.split], ['P', fixed.length ? fixed.map(([k, b]) => `${k}~${b}`).join('_') : '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
}
async function release(x){
  const p = S.D.pays.get(x.d.cid); if (!p || !x.done) return;
  if (!termsApproved(x, p)){ toast('These terms changed after the approvals: ask the approvers to approve again first.'); return; }
  const lines = payoutLines(x, p);
  await publish(await signed('SETTLE', [['I', S.me.id], ['R', x.d.cid], ['H', x.d.root], ['L', lines.map(l => `${l.to}~${l.cents}`).join('_')], ['K', p.cid], ['U', p.unit], ['Z', ++S.lamport], ['T', Date.now()]]));
  toast(`Payment released: ${money(p.cents, p.unit)} in ${plural(lines.length, 'line')}.${PAYOUT_CONNECTORS.length ? '' : ' Hand the manifest to whoever pays.'}`);
  for (const c of PAYOUT_CONNECTORS) try { toast(`${c.name}: ${await c.run(manifest(x))}`); } catch (err){ toast(`${c.name} failed: ${err.message}`); }
}
function manifest(x){
  const s = S.D.settles.get(x.d.cid), p = S.D.pays.get(x.d.cid);
  return { flux: 'payout', v: 1, canvas: canvasId, title: canvasTitle(), delivery: { cid: x.d.cid, title: x.d.title, root: x.d.root, raw: x.d.raw }, approvals: x.ok.map(a => a.raw),
    terms: p?.raw, settlement: s?.raw, unit: p?.unit, lines: (s?.lines || []).map(l => ({ to: l.to, name: short(l.to), amount: l.cents / 100 })), pool: Object.fromEntries([...S.D.pool].map(([u, o]) => [u, { pledged: o.pledged / 100, paid: o.paid / 100 }])) };
}
function downloadJSON(name, text){ const a = document.createElement('a'); a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(text); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
function payRow(x){
  const p = S.D.pays?.get(x.d.cid), s = S.D.settles?.get(x.d.cid), mine = samePerson(x.d.author, S.me.id);
  if (!p) return mine ? `<div class="acts"><button class="btn" data-pay="${x.d.cid}">${ic('coin')}Attach payment…</button></div>` : '';
  const bound = termsApproved(x, p), pooled = S.D.fromPool?.has(x.d.cid);
  return `<div class="row2"><span class="pill ${s ? 'good' : 'acc'}">${ic('coin')}${money(p.cents, p.unit)} · ${{ credit: 'by contribution', even: 'evenly', fixed: 'fixed shares' }[p.split]}</span>
    ${s ? `<small>Paid${pooled ? ' from the pool' : ''}: ${s.lines.map(l => `${esc(whoName(l.to))} ${money(l.cents, s.unit)}`).join(' · ')}</small><button class="btn" data-manifest="${x.d.cid}">Manifest</button>`
      : !x.done ? '<small>Released when approved</small>' : !bound ? '<span class="pill warn">Terms changed after approval: approvers must approve again</span>'
      : mine ? `<button class="btn primary" data-release="${x.d.cid}">Release payment</button>` : '<small>Waiting for the release</small>'}</div>`;
}
DELIVERY_HOOKS.row.push(payRow);
DELIVERY_HOOKS.proof.push((x, out) => {
  const p = S.D.pays.get(x.d.cid), s = S.D.settles.get(x.d.cid); if (!p) return;
  out.push('', '## Payment', '', `- **Terms:** ${money(p.cents, p.unit)}, split ${p.split} (\`${p.cid}\`)`, ...(s ? [`- **Released:** ${new Date(s.t).toLocaleString()} (\`${s.cid}\`)${settleValid(x, s) ? ' · recomputes ✓' : ' · does not recompute ✕'}`, ...s.lines.map(l => `  - ${short(l.to)}: ${money(l.cents, s.unit)}`)] : ['- Not released yet']));
});
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-pay],[data-release],[data-manifest]'); if (!b) return;
  const x = S.D.deliveries.find(v => v.d.cid === (b.dataset.pay || b.dataset.release || b.dataset.manifest)); if (!x) return;
  if (b.dataset.pay) attachPay(x); else if (b.dataset.release) release(x); else downloadJSON(`payout-${x.d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, JSON.stringify(manifest(x), null, 2));
});
async function pledge(){
  const v = await formDialog('Back this canvas', [{ id: 'amt', label: 'Amount', type: 'number', value: 500, min: 0 }, { id: 'unit', label: 'Unit', type: 'text', value: [...S.D.pool.keys()][0] || 'FXN' }, { id: 'note', label: 'Note', type: 'text', value: '' }],
    { ok: 'Sign the pledge', why: 'A pledge is a signed promise to fund deliveries on this canvas. It moves no money by itself; a payment connector does.' });
  if (!v || !unitOk(v.unit) || !(v.amt > 0)) return;
  await publish(await signed('FUND', [['I', S.me.id], ['R', canvasId], ['A', Math.round(v.amt * 100)], ['U', v.unit.toUpperCase()], ['M', encTxt(v.note)], ['Z', ++S.lamport], ['T', Date.now()]]));
}
registerPanel({
  id: 'funding', title: 'Funding and payouts', blurb: 'The canvas as a contract: backers pledge, deliveries carry terms, approval releases the payment.',
  paint(body){
    const pool = [...(S.D.pool || new Map())], dl = S.D.deliveries || [];
    body.innerHTML = `${pool.length ? pool.map(([u, o]) => `<div class="card"><div class="hd"><b>Pool · ${money(o.pledged, u)} pledged</b><span class="pill ${o.pledged - o.paid >= 0 ? 'good' : 'bad'}">${money(o.pledged - o.paid, u)} left</span></div>
        <div class="bar"><i style="width:${Math.min(100, o.paid / (o.pledged || 1) * 100)}%;background:var(--cyan)"></i></div><small>${money(o.paid, u)} paid out</small>
        ${[...o.backers].map(([k, c]) => `<div class="row2">${avatar(k)}<span class="grow">${esc(whoName(k))}</span><small>${money(c, u)} · ${pct(Math.round(c / o.pledged * 10000))} of the pool</small></div>`).join('')}</div>`).join('') : '<p class="empty">No pledges yet. Backers can pledge to fund the deliveries made on this canvas.</p>'}
      <div class="acts"><button class="btn" data-pledge data-autofocus>${ic('coin')}Pledge to this canvas…</button></div>
      <h3>Deliveries</h3>${dl.length ? `<ul class="plain">${dl.map(x => `<li class="card"><div class="hd"><b>${esc(x.d.title)}</b><span class="pill ${x.done ? 'good' : ''}">${x.done ? 'Approved' : 'Waiting'}</span></div>${payRow(x)}</li>`).join('')}</ul>` : '<p class="empty">No deliveries yet (Work → Deliver this work).</p>'}
      <p class="muted">${PAYOUT_CONNECTORS.length ? `Connected: ${PAYOUT_CONNECTORS.map(c => esc(c.name)).join(', ')}.` : 'No payment connector here: Flux signs the instruction and its proof, and gives you a manifest. A chain or payment service executes it.'}</p>`;
  },
  click(e, b){ if (b.hasAttribute('data-pledge')) pledge(); },
});
registerFeature({ id: 'funding',
  needs: () => (S.D.deliveries || []).filter(x => x.done && samePerson(x.d.author, S.me.id) && S.D.pays?.get(x.d.cid) && !S.D.settles?.get(x.d.cid) && termsApproved(x, S.D.pays.get(x.d.cid))).map(x => ({ label: `Release the payment for “${x.d.title}”`, run: () => toggleWork(true) })), name: 'Canvas-to-Cash', group: 'deliver', icon: 'coin', records: ['FUND', 'PAY', 'SETTLE'],
  blurb: 'Pledges to a pool, payment terms on deliveries, approval releases a signed settlement',
  status: () => { const p = [...(S.D.pool?.entries() || [])][0]; return p ? `${money(p[1].pledged - p[1].paid, p[0])} in pool` : ''; }, open: () => openPanel('funding') });
