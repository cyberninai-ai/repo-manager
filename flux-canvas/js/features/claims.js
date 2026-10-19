'use strict';
// @module features/claims — Claim grounding: mark a note as a factual claim, attach the evidence for or against it (another item
// on the canvas, or a source link with the quote), and have people other than its author check it. Every claim shows its state
// on the canvas (grounded, evidence unchecked, asserted, contradicted), deliveries can require grounded claims, and the proof
// records what was believed and why at the moment of decision. An automatic grounder (a resolver or a model) plugs in through
// GROUNDERS and signs its checks with its own key, like any other reviewer.
// @uses records, derive, ui/panels, ui/form, features/work (proof)
// CLAIM-I-R-{element}-S-{1 claim|0 not}-Z-T-SIG                      latest per element wins
// EVIDENCE-I-R-{claim element}-E-{evidence element|0}-U-{source url|0}-S-{supports|refutes}-M-{quote or note}-Z-T-SIG
// CHECK-I-R-{claim element}-S-{ok|no|unsure}-M-{note}-Z-T-SIG          per reviewer the latest wins; the claim's author doesn't count
registerRecord('CLAIM', { parse(r, f){ must(isCid(f.R), 'claim'); r.on = f.S !== '0'; } });
registerRecord('EVIDENCE', { parse(r, f){ must(isCid(f.R) && ['supports', 'refutes'].includes(f.S) && (!f.E || f.E === '0' || isCid(f.E)), 'evidence'); r.ev = f.E && f.E !== '0' ? f.E : null; r.url = f.U && f.U !== '0' ? decTxt(f.U) : null; r.supports = f.S === 'supports'; r.note = decTxt(f.M || ''); if (!r.ev && !r.url) throw Error('evidence'); if (r.url && !/^https?:\/\//i.test(r.url)) throw Error('only web sources'); } });
registerRecord('CHECK', { parse(r, f){ must(isCid(f.R) && ['ok', 'no', 'unsure'].includes(f.S), 'check'); r.verdict = f.S; r.note = decTxt(f.M || ''); } });
Object.assign(PERM_OF, { CLAIM: 'comment', EVIDENCE: 'comment', CHECK: 'comment' });
const GROUNDERS = [];   // { name, run: async ({ text, evidence: [{ text, url, supports }] }) → a signed CHECK record (raw) from the grounder's key }
const CLAIM_STATE = { grounded: ['Grounded', 'good'], evidenced: ['Evidence, unchecked', 'acc'], asserted: ['Asserted, no evidence', 'warn'], contradicted: ['Contradicted', 'bad'] };

// claim state, from all records or only those in a delivered version (inV): the proof shows what was believed then.
// A claim can be unmarked only by whoever marked it, the element's author or the canvas owner; neither of the first two can
// ground it: checks count only from other people
function claimsAt(by, D, inV = null){
  const cur = c => { let n = 0; while (D.next.has(c) && n++ < 1000) c = D.next.get(c); return c; };
  const ok = r => !D.hidden.has(r.cid) && (!inV || inV(r));
  const marks = new Map();
  for (const r of by.CLAIM || []) if (ok(r)){ const t = cur(r.f.R), m = marks.get(t), el = S.records.get(t);
    if (!r.on && m?.on && ![m.by, el?.author, S.P?.owner].some(k => k && samePerson(k, r.author))) continue;
    marks.set(t, { on: r.on, by: r.on ? r.author : null }); }
  const out = new Map();
  for (const [t, m] of marks) if (m.on) out.set(t, { t, by: m.by, ev: [], checks: new Map() });
  for (const r of by.EVIDENCE || []) if (ok(r)) out.get(cur(r.f.R))?.ev.push(r);
  for (const r of by.CHECK || []) if (ok(r)){ const c = out.get(cur(r.f.R)); if (c) c.checks.set(personOf(r.author), r); }
  for (const c of out.values()){
    const author = S.records.get(c.t)?.author, indep = [...c.checks.values()].filter(r => !samePerson(r.author, author) && !samePerson(r.author, c.by));
    c.ok = indep.filter(r => r.verdict === 'ok').length; c.no = indep.filter(r => r.verdict === 'no').length;
    c.score = c.ok + c.no ? c.ok / (c.ok + c.no) : null;
    const sup = c.ev.filter(e => e.supports).length, ref = c.ev.length - sup;
    c.state = c.no > c.ok || ref && c.ok <= c.no ? 'contradicted' : sup && c.ok ? 'grounded' : sup ? 'evidenced' : 'asserted';
  }
  return out;
}
let claimBy = {};
DERIVE_HOOKS.push((D, by) => { claimBy = by; D.claims = claimsAt(by, D); });
const isClaim = cid => S.D.claims?.has(cid);
async function markClaim(cids, on = true){
  for (const c of cids) await publish(await signed('CLAIM', [['I', S.me.id], ['R', c], ['S', on ? '1' : '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
  say(on ? 'Marked as a claim. Add the evidence for it, and ask someone else to check it.' : 'No longer a claim.');
}
async function addEvidence(claim, { ev = null, url = null, supports = true, note = '' }){
  await publish(await signed('EVIDENCE', [['I', S.me.id], ['R', claim], ['E', ev || '0'], ['U', url ? encTxt(url) : '0'], ['S', supports ? 'supports' : 'refutes'], ['M', encTxt(note)], ['Z', ++S.lamport], ['T', Date.now()]]));
  toast(supports ? 'Evidence attached.' : 'Counter-evidence attached.');
}
async function checkClaim(claim, verdict, note = ''){
  if (samePerson(S.records.get(claim)?.author, S.me.id) || samePerson(S.D.claims?.get(claim)?.by, S.me.id)) toast('You wrote or marked this claim, so your own check doesn’t count toward grounding. Ask someone else to check it.');
  await publish(await signed('CHECK', [['I', S.me.id], ['R', claim], ['S', verdict], ['M', encTxt(note)], ['Z', ++S.lamport], ['T', Date.now()]]));
}
async function evidenceForm(claim, others){
  const v = await formDialog('Attach evidence', [
    { id: 'dir', label: 'This evidence', type: 'select', value: 'supports', options: [['supports', 'supports the claim'], ['refutes', 'refutes the claim']] },
    ...(others.length ? [{ id: 'ev', label: 'Item on the canvas', type: 'select', value: others[0], options: [['', 'None: a source link'], ...others.map(c => [c, elTitle(c)])] }] : []),
    { id: 'url', label: 'Source link', type: 'text', value: '', hint: 'A web page, document or record. Leave empty if the evidence is the item above.' },
    { id: 'note', label: 'The quote or the reason', type: 'textarea', value: '' },
  ], { ok: 'Attach and sign', why: `Claim: “${elTitle(claim)}”` });
  if (!v || !v.ev && !v.url.trim()) return;
  await addEvidence(claim, { ev: v.ev || null, url: v.url.trim() || null, supports: v.dir === 'supports', note: v.note.trim() });
}
// words worth matching between a claim and its evidence: numbers, amounts, years and capitalised names. A hint, not a verdict.
const factTerms = t => new Set((String(t).match(/\$?\d[\d,.]*\s?[%kKmMbB]?|\b[A-Z][a-zA-Z]{2,}\b/g) || []).map(s => s.replace(/[,\s]/g, '').toLowerCase()));
function matchHint(c){
  const want = factTerms(S.records.get(c.t)?.text || ''); if (!want.size) return '';
  const have = new Set(); for (const e of c.ev) if (e.supports) for (const w of factTerms(`${e.note} ${e.ev ? current(e.ev)?.text || '' : ''}`)) have.add(w);
  const hit = [...want].filter(w => have.has(w));
  return `${hit.length} of ${want.size} facts in the claim appear in its evidence${hit.length < want.size ? ` · missing: ${[...want].filter(w => !have.has(w)).slice(0, 4).join(', ')}` : ''}`;
}
function claimMenu(rs, anchor, at = null){
  const els = rs.filter(r => r.type !== 'ARROW' && r.type !== 'DRAW'), one = els.length === 1 ? els[0] : null, t = one && current(one.cid)?.cid;
  const others = els.filter(r => r.cid !== one?.cid).map(r => r.cid);
  if (!one || !isClaim(t)){
    if (els.length === 2 && isClaim(els[1].cid)) return openMenu(anchor, [{ label: 'Use the first as evidence for the second', icon: 'claim', run: () => addEvidence(els[1].cid, { ev: els[0].cid, note: '' }) }, { label: 'Mark both as claims', icon: 'claim', run: () => markClaim(els.map(r => r.cid)) }], at);
    return markClaim(els.map(r => r.cid));
  }
  const c = S.D.claims.get(t);
  openMenu(anchor, [
    { label: 'Attach evidence…', icon: 'link', run: () => evidenceForm(t, others) },
    '-', { label: 'Check: the evidence holds', icon: 'check', on: c.checks.get(personOf(S.me.id))?.verdict === 'ok', run: () => checkClaim(t, 'ok') },
    { label: 'Check: it doesn’t hold', icon: 'x', on: c.checks.get(personOf(S.me.id))?.verdict === 'no', run: async () => { const n = await ask('Why doesn’t it hold?', '', 'Your reason is signed with your check.'); if (n !== null) checkClaim(t, 'no', n.trim()); } },
    { label: 'Check: unsure', icon: 'help', run: () => checkClaim(t, 'unsure') },
    ...GROUNDERS.map(g => ({ label: `Ground automatically with ${g.name}`, icon: 'sparkle', run: () => autoGround(t, g) })),
    '-', { label: 'Claims panel', icon: 'claim', run: () => openPanel('claims') }, { label: 'Not a claim', icon: 'x', run: () => markClaim([t], false) },
  ], at);
}
async function autoGround(t, g){
  const c = S.D.claims.get(t); if (!c) return;
  try { const raw = await g.run({ text: S.records.get(t)?.text || '', evidence: c.ev.map(e => ({ text: e.note || (e.ev ? current(e.ev)?.text || '' : ''), url: e.url, supports: e.supports })) });
    if (raw && await ingest(raw)){ post({ raw, blobs: {} }); toast(`${g.name} signed its check.`); } else toast(`${g.name} returned nothing usable.`);
  } catch (err){ toast(`${g.name} failed: ${err.message}`); }
}
TOOLBAR_HOOKS.push((rs, one, B) => {
  const els = rs.filter(r => r.type !== 'ARROW' && r.type !== 'DRAW'); if (!els.length) return '';
  const c = one && S.D.claims?.get(current(one.cid)?.cid);
  return B('claim', 'claim', c ? `Claim: ${CLAIM_STATE[c.state][0]}` : 'Mark as a claim to ground', c ? 'data-primary aria-haspopup="menu" aria-pressed="true"' : 'aria-haspopup="menu"');
});
TOOLBAR_ACTIONS.claim = (rs, b) => claimMenu(rs, b);

/* on the canvas: the claim's state under its left edge; evidence links when the claim is selected */
RENDER_HOOKS.screen.push(() => {
  for (const [t, c] of S.D.claims || []){
    const sb = screenBox(S.records.get(t)); if (!sb) continue;
    const [name, tone] = CLAIM_STATE[c.state];
    drawBadge(sb.x, sb.y + sb.h + 5, `${c.state === 'grounded' ? '●' : c.state === 'contradicted' ? '✕' : '○'} ${name}${c.score != null && c.state !== 'asserted' ? ` ${c.score.toFixed(2)}` : ''}`, tone, () => { S.sel = new Set([t]); dirty = true; claimMenu([S.records.get(t)], cv, { x: sb.x, y: sb.y + sb.h + 28 }); });
    if (S.sel.has(t)) for (const e of c.ev){ const eb = e.ev && screenBox(current(e.ev)); if (!eb) continue;
      ctx.save(); ctx.strokeStyle = TONE[e.supports ? 'good' : 'bad'][1]; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath();
      ctx.moveTo(eb.x + eb.w / 2, eb.y + eb.h / 2); ctx.lineTo(sb.x + sb.w / 2, sb.y + sb.h / 2); ctx.stroke(); ctx.restore(); }
  }
});

/* the Claims panel */
registerPanel({
  id: 'claims', title: 'Claims', blurb: 'What the canvas asserts as fact, the evidence for and against, and who checked it. A claim is grounded when someone other than its author confirms its evidence.',
  paint(body){
    const all = [...(S.D.claims?.values() || [])].filter(c => S.records.has(c.t) && !S.D.hidden.has(c.t));
    const count = k => all.filter(c => c.state === k).length;
    const card = c => `<li class="card${c.state === 'contradicted' ? ' bad' : c.state === 'asserted' ? ' warn' : ''}"><div class="hd"><button class="link" data-go="${c.t}">${esc(elTitle(c.t))}</button><span class="pill ${CLAIM_STATE[c.state][1]}">${CLAIM_STATE[c.state][0]}${c.score != null ? ' ' + c.score.toFixed(2) : ''}</span></div>
      ${c.ev.map(e => `<div class="row2"><span class="pill ${e.supports ? 'good' : 'bad'}">${e.supports ? 'For' : 'Against'}</span>${e.ev ? `<button class="link" data-go="${e.ev}">${esc(elTitle(e.ev))}</button>` : `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.url.replace(/^https?:\/\//, '').slice(0, 60))}</a>`}<small>${e.note ? `“${esc(e.note)}” · ` : ''}${esc(whoName(e.author))}</small></div>`).join('')}
      ${c.ev.length ? `<small class="muted">${esc(matchHint(c))}</small>` : ''}
      ${c.checks.size ? `<small>Checked: ${[...c.checks.values()].map(r => `${esc(whoName(r.author))} ${r.verdict === 'ok' ? '✓' : r.verdict === 'no' ? '✕' : '?'}${r.note ? ` (${esc(r.note)})` : ''}`).join(', ')}</small>` : ''}
      <div class="acts"><button class="btn" data-ev="${c.t}">Attach evidence…</button><button class="btn" data-ok="${c.t}">✓ Holds</button><button class="btn" data-no="${c.t}">✕ Doesn’t</button></div></li>`;
    body.innerHTML = all.length ? `<div class="row2">${Object.entries(CLAIM_STATE).map(([k, [n, tone]]) => `<span class="pill ${tone}">${count(k)} ${n.toLowerCase()}</span>`).join('')}</div>
      ${['contradicted', 'asserted', 'evidenced', 'grounded'].map(k => count(k) ? `<h3>${CLAIM_STATE[k][0]} <span class="n">${count(k)}</span></h3><ul class="plain">${all.filter(c => c.state === k).map(card).join('')}</ul>` : '').join('')}
      <p class="muted">${GROUNDERS.length ? `Automatic grounding: ${GROUNDERS.map(g => esc(g.name)).join(', ')}.` : 'Automatic grounding: no grounder connected. A resolver or model can be added; its checks are signed with its own key and count like anyone else’s.'}</p>`
      : '<p class="empty">No claims yet. Select a note that states a fact (“Competitor raised $50M in 2024”) and choose “Mark as a claim to ground”.</p>';
  },
  async click(e, b){
    if (b.dataset.go) return goTo(b.dataset.go);
    if (b.dataset.ev) return evidenceForm(b.dataset.ev, [...S.sel].filter(c => c !== b.dataset.ev));
    if (b.dataset.ok) return checkClaim(b.dataset.ok, 'ok');
    if (b.dataset.no){ const n = await ask('Why doesn’t it hold?', '', 'Your reason is signed with your check.'); if (n !== null) checkClaim(b.dataset.no, 'no', n.trim()); }
  },
});
registerFeature({ id: 'claims', name: 'Claim grounding', group: 'decide', icon: 'claim', records: ['CLAIM', 'EVIDENCE', 'CHECK'],
  blurb: 'Mark facts as claims, attach evidence, have others check them; deliveries can require grounded claims',
  status: () => { const v = [...(S.D.claims?.values() || [])]; const bad = v.filter(c => c.state === 'contradicted' || c.state === 'asserted').length; return bad ? `${bad} unverified` : v.length ? 'all grounded' : ''; },
  open: () => openPanel('claims') });
FLOW_CONDITIONS.claims = { label: 'Every claim is grounded', test: () => { const n = [...(S.D.claims?.values() || [])].filter(c => S.records.has(c.t) && !S.D.hidden.has(c.t) && c.state !== 'grounded').length; return n ? `${plural(n, 'claim')} not grounded` : true; } };
// the proof records what was believed at the moment of delivery, and on what evidence
DELIVERY_HOOKS.proof.push((x, out) => {
  const v = versionOf(x.d), at = claimsAt(claimBy, S.D, v ? r => v.has(r.cid) : r => r.z < x.d.z); if (!at.size) return;
  out.push('', '## Claims at the time of delivery', '', ...[...at.values()].map(c => `- ${CLAIM_STATE[c.state][0]}${c.score != null ? ` (${c.score.toFixed(2)})` : ''}: “${elTitle(c.t)}” — ${c.ev.length} evidence, ${c.ok} independent check${c.ok === 1 ? '' : 's'} holding, ${c.no} not`));
});
