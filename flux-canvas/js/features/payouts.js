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
registerRecord('FUND', { parse(r, f){ if (!f.R || !unitOk(f.U)) throw Error('fund'); r.cents = Math.max(0, +f.A || 0); r.unit = f.U.toUpperCase(); r.note = decTxt(f.M || ''); }, inherit: false });
registerRecord('PAY', { parse(r, f){ if (!f.R || !unitOk(f.U) || !['even', 'credit', 'fixed'].includes(f.S)) throw Error('pay'); r.cents = Math.max(0, +f.A || 0); r.unit = f.U.toUpperCase(); r.split = f.S;
  r.fixed = f.P && f.P !== '0' ? new Map(f.P.split('_').map(p => p.split('~')).map(([k, n]) => [k, Math.max(0, +n || 0)])) : null; }, inherit: false });
registerRecord('SETTLE', { parse(r, f){ if (!f.R || !f.H || !f.L || !unitOk(f.U)) throw Error('settle'); r.lines = f.L.split('_').map(p => p.split('~')).map(([k, n]) => ({ to: k, cents: Math.max(0, +n || 0) })); r.unit = f.U.toUpperCase(); }, inherit: false });
Object.assign(PERM_OF, { FUND: 'comment', PAY: null, SETTLE: null });
const money = (c, u) => `${(c / 100).toLocaleString([], { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })} ${u}`;

// deterministic lines: royalties first, then the split; cents rounded down, the remainder to the largest share
function payoutLines(x, pay){
  const lines = [], add = (to, cents, why) => { const l = lines.find(l => l.to === to && l.why === why); if (l) l.cents += cents; else lines.push({ to, cents, why }); };
  let rest = pay.cents;
  for (const h of SETTLE_HOOKS) for (const r of h(x, pay.cents) || []){ const c = Math.floor(pay.cents * r.bp / 10000); if (c > 0 && c <= rest){ add(r.to, c, r.why); rest -= c; } }
  let shares;
  if (pay.split === 'fixed' && pay.fixed) shares = pay.fixed;
  else if (pay.split === 'credit') shares = contributionShares(x);
  else { const who = [...new Set([...S.records.values()].filter(r => r.z < x.d.z && r.neg === null && ELEMENT.has(r.type) && !S.D.hidden.has(r.cid)).map(r => personOf(r.author)))].sort(); shares = new Map(who.map(k => [k, 10000 / (who.length || 1)])); }
  const tot = [...shares.values()].reduce((a, v) => a + v, 0) || 1, parts = [...shares].map(([k, v]) => [k, Math.floor(rest * v / tot)]);
  let left = rest - parts.reduce((a, [, c]) => a + c, 0);
  parts.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)); for (const p of parts){ if (left <= 0) break; p[1]++; left--; }
  for (const [k, c] of parts) if (c > 0) add(k, c, 'work');
  return lines;
}
const sameLines = (a, b) => { const m = new Map(); for (const l of a) m.set(l.to, (m.get(l.to) || 0) + l.cents); const n = new Map(); for (const l of b) n.set(l.to, (n.get(l.to) || 0) + l.cents); return m.size === n.size && [...m].every(([k, v]) => n.get(k) === v); };
DERIVE_HOOKS.push((D, by) => {
  const pays = new Map(), settles = new Map();
  for (const x of D.deliveries || []){
    const p = (by.PAY || []).filter(r => r.f.R === x.d.cid && samePerson(r.author, x.d.author) && !D.hidden.has(r.cid)).at(-1);
    if (p) pays.set(x.d.cid, p);
    const s = (by.SETTLE || []).find(r => r.f.R === x.d.cid && r.f.H === x.d.root && samePerson(r.author, x.d.author) && !D.hidden.has(r.cid));
    if (s) settles.set(x.d.cid, s);
  }
  const pool = new Map(); for (const f of by.FUND || []) if (!D.hidden.has(f.cid) && f.f.R === canvasId){ const o = pool.get(f.unit) || { pledged: 0, paid: 0, backers: new Map() }; o.pledged += f.cents; o.backers.set(personOf(f.author), (o.backers.get(personOf(f.author)) || 0) + f.cents); pool.set(f.unit, o); }
  for (const s of settles.values()){ const o = pool.get(s.unit); if (o) o.paid += s.lines.reduce((a, l) => a + l.cents, 0); }
  D.pays = pays; D.settles = settles; D.pool = pool;
});
// a settlement counts only if its lines are what the terms give for the approved version (checked lazily: shares need derive)
const settleValid = (x, s) => { if (!s.valid){ const p = S.D.pays.get(x.d.cid); s.valid = !!p && p.unit === s.unit && sameLines(s.lines, payoutLines(x, p)); } return s.valid; };

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
  const lines = payoutLines(x, p);
  await publish(await signed('SETTLE', [['I', S.me.id], ['R', x.d.cid], ['H', x.d.root], ['L', lines.map(l => `${l.to}~${l.cents}`).join('_')], ['U', p.unit], ['Z', ++S.lamport], ['T', Date.now()]]));
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
  const ok = s && settleValid(x, s);
  return `<div class="row2"><span class="pill ${ok ? 'good' : 'acc'}">${ic('coin')}${money(p.cents, p.unit)} · ${{ credit: 'by contribution', even: 'evenly', fixed: 'fixed shares' }[p.split]}</span>
    ${s ? (ok ? `<small>Paid: ${s.lines.map(l => `${esc(whoName(l.to))} ${money(l.cents, s.unit)}`).join(' · ')}</small><button class="btn" data-manifest="${x.d.cid}">Manifest</button>` : '<span class="pill bad">Settlement doesn’t match the terms</span>')
      : x.done && mine ? `<button class="btn primary" data-release="${x.d.cid}">Release payment</button>` : '<small>Released when approved</small>'}</div>`;
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
registerFeature({ id: 'funding', name: 'Canvas-to-Cash', group: 'deliver', icon: 'coin', records: ['FUND', 'PAY', 'SETTLE'],
  blurb: 'Pledges to a pool, payment terms on deliveries, approval releases a signed settlement',
  status: () => { const p = [...(S.D.pool?.entries() || [])][0]; return p ? `${money(p[1].pledged - p[1].paid, p[0])} in pool` : ''; }, open: () => openPanel('funding') });
