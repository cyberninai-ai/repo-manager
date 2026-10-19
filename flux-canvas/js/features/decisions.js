'use strict';
// @module features/decisions — The decision ledger: a decision is a signed record that distils a discussion (what was decided,
// the evidence it rests on, whether it can be reversed, when to review it). The ledger lists every decision with the stances
// on it, flags decisions made over disagreement, and brings them back for review when their date comes.
// @uses records, derive, features/stances (consensus), ui/panels, ui/form
// DECISION-I-R-{nonce}-M-{text}-ON-{element|0}-E-{evidence cids _|0}-V-{1 reversible|0}-W-{review yyyymmdd|0}-P-{supersedes|0}-Z-T-SIG
// REVIEW-I-R-{decision}-S-{keep|reverse}-M-{note}-W-{next review yyyymmdd|0}-Z-T-SIG
const ymd = s => /^\d{8}$/.test(s || '') ? s : null;
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
const ymdText = d => d ? new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6)).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
registerRecord('DECISION', { parse(r, f){ must(f.R && f.M && (!f.ON || f.ON === '0' || isCid(f.ON)) && (!f.P || f.P === '0' || isCid(f.P)) && (!f.E || f.E === '0' || cidList(f.E)), 'decision'); r.text = decTxt(f.M); r.on = f.ON && f.ON !== '0' ? f.ON : null;
  r.evidence = f.E && f.E !== '0' ? f.E.split('_').filter(Boolean) : []; r.reversible = f.V !== '0'; r.review = ymd(f.W); r.supersedes = f.P && f.P !== '0' ? f.P : null; } });
registerRecord('REVIEW', { parse(r, f){ must(isCid(f.R) && ['keep', 'reverse'].includes(f.S), 'review'); r.keep = f.S === 'keep'; r.note = decTxt(f.M || ''); r.review = ymd(f.W); } });
Object.assign(PERM_OF, { DECISION: 'comment', REVIEW: 'comment' });

DERIVE_HOOKS.push((D, by) => {
  const list = [], byCid = new Map();
  for (const d of by.DECISION || []){ if (D.hidden.has(d.cid)) continue; const x = { d, status: 'active', reviews: [], review: d.review, by: null }; list.push(x); byCid.set(d.cid, x); }
  // only a decision's author or the canvas owner can replace it, keep it or reverse it; a one-way door can't be reversed
  const may = (r, d) => samePerson(r.author, d.author) || S.P?.owner && samePerson(r.author, S.P.owner);
  for (const x of list) if (x.d.supersedes && byCid.has(x.d.supersedes)){ const o = byCid.get(x.d.supersedes); if (!may(x.d, o.d)) continue; o.status = 'superseded'; o.by = x.d.cid; }
  for (const r of by.REVIEW || []){ const x = byCid.get(r.f.R); if (!x || r.neg !== null || D.hidden.has(r.cid) || !may(r, x.d)) continue; if (!r.keep && !x.d.reversible) continue; x.reviews.push(r); if (r.keep) x.review = r.review; else if (x.status === 'active') x.status = 'reversed'; }
  D.decisions = list; D.decisionOf = new Map(list.filter(x => x.d.on && x.status === 'active').map(x => [x.d.on, x]));
});
const reviewDue = x => x.status === 'active' && x.review && x.review <= today();
async function recordDecision({ text, on = null, evidence = [], reversible = true, review = null, supersedes = null }){
  const cid = await publish(await signed('DECISION', [['I', S.me.id], ['R', b32(crypto.getRandomValues(new Uint8Array(8)))], ['M', encTxt(text)], ['ON', on || '0'],
    ['E', evidence.length ? evidence.join('_') : '0'], ['V', reversible ? '1' : '0'], ['W', review || '0'], ['P', supersedes || '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
  say('Decision recorded and signed. It is in the decision ledger.'); return cid;
}
async function decideFrom(rs, supersedes = null){
  const els = rs.filter(r => r.type !== 'ARROW' && r.type !== 'DRAW'), first = els[0];
  const prev = supersedes && S.D.decisions.find(x => x.d.cid === supersedes)?.d;
  const v = await formDialog(supersedes ? 'Replace a decision' : 'Record a decision', [
    { id: 'text', label: 'What did you decide?', type: 'textarea', value: prev?.text || (first?.text || '').trim() },
    { id: 'rev', label: 'Can it be reversed?', type: 'select', value: prev && !prev.reversible ? 'no' : 'yes', options: [['yes', 'Yes, it can be revisited'], ['no', 'No, it is a one-way door']] },
    { id: 'review', label: 'Review it on', type: 'date', value: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10), hint: 'The ledger brings it back on this date: is it still right? Leave empty for no review.' },
    { id: 'info', type: 'info', label: els.length ? `Evidence: the ${plural(els.length, 'selected item')} (${els.slice(0, 3).map(r => elTitle(r.cid)).join(', ')}${els.length > 3 ? '…' : ''}).` : 'Tip: select the notes the decision rests on first; they become its evidence.' },
  ], { ok: 'Sign the decision', why: 'A decision distils the discussion: people find it in the ledger, see the stances on it, and review it later.' });
  if (!v || !v.text.trim()) return null;
  return recordDecision({ text: v.text.trim(), on: first?.cid || null, evidence: els.map(r => r.cid), reversible: v.rev === 'yes', review: v.review ? v.review.replace(/-/g, '') : null, supersedes });
}
async function reviewDecision(cid, keep){
  const note = await ask(keep ? 'Still right: why?' : 'Reverse it: why?', '', 'Your review is signed and stays in the ledger with the decision.');
  if (note === null) return;
  const next = keep ? await ask('Next review', new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10), 'Year-month-day. Leave empty for none.') : '';
  await publish(await signed('REVIEW', [['I', S.me.id], ['R', cid], ['S', keep ? 'keep' : 'reverse'], ['M', encTxt(note.trim())], ['W', next ? next.replace(/-/g, '') : '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
  toast(keep ? 'Reviewed: kept.' : 'Reviewed: reversed.');
}
TOOLBAR_HOOKS.push((rs, one, B) => rs.some(r => r.type !== 'ARROW' && r.type !== 'DRAW') ? B('decide', 'flag', 'Record a decision…') : '');
TOOLBAR_ACTIONS.decide = rs => decideFrom(rs);

/* on the canvas: a "Decided" flag above the element a decision is about */
RENDER_HOOKS.screen.push(() => {
  for (const [on, x] of S.D.decisionOf || []){
    const sb = screenBox(current(on)); if (!sb) continue;
    const c = typeof consensus === 'function' ? consensus(x.d.cid) : null;
    drawBadge(sb.x, sb.y - 24, `⚑ Decided${reviewDue(x) ? ' · review due' : c?.level === 'split' ? ' · split' : ''}`, reviewDue(x) || c?.level === 'split' ? 'warn' : 'ink', () => { DEC.focus = x.d.cid; openPanel('decisions'); });
  }
});

/* the ledger */
const DEC = { q: '', all: false, focus: null };
registerPanel({
  id: 'decisions', title: 'Decisions', blurb: 'Every decision on this canvas, why it was made, where people stand, and when to look at it again.',
  paint(body){
    const q = DEC.q.toLowerCase(), list = (S.D.decisions || []).filter(x => (DEC.all || x.status === 'active') && (!q || x.d.text.toLowerCase().includes(q))).slice().reverse();
    const due = (S.D.decisions || []).filter(reviewDue);
    const card = x => {
      const c = consensus(x.d.cid), dis = Math.round(c.disagree * 100);
      return `<li class="card${DEC.focus === x.d.cid ? ' hot' : ''}${reviewDue(x) ? ' warn' : ''}" id="dec-${x.d.cid.slice(-8)}"><div class="hd"><b>${esc(x.d.text)}</b>${x.status !== 'active' ? `<span class="pill ${x.status === 'reversed' ? 'bad' : ''}">${x.status === 'reversed' ? 'Reversed' : 'Replaced'}</span>` : x.d.reversible ? '' : '<span class="pill warn">One-way</span>'}</div>
        <small>${avatar(x.d.author)} ${esc(whoName(x.d.author))} · ${when(x.d.t)}${x.review ? ` · review ${ymdText(x.review)}` : ''}${x.d.supersedes ? ' · replaces an earlier decision' : ''}</small>
        ${x.d.evidence.length ? `<div class="row2"><small>Rests on:</small>${x.d.evidence.slice(0, 6).map(e => `<button class="link" data-go="${e}">${esc(elTitle(e))}</button>`).join(' · ')}</div>` : ''}
        ${c.n ? `<div class="row2"><span class="pill ${LEVEL[c.level][1] || ''}">${LEVEL[c.level][0]}</span><small>${c.c.agree} agree · ${c.c.disagree} disagree · ${c.c.unsure + c.c.alt} unsure or other${c.level === 'split' ? ` · made over ${dis}% disagreement: review it soon` : ''}</small></div>` : '<small>No stances yet.</small>'}
        ${x.reviews.map(r => `<small>${r.keep ? 'Kept' : 'Reversed'} by ${esc(whoName(r.author))} · ${when(r.t)}${r.note ? `: ${esc(r.note)}` : ''}</small>`).join('')}
        <div class="acts">${Object.entries(STANCES).slice(0, 4).map(([k, s]) => `<button class="btn" data-st="${k}" data-t="${x.d.cid}" aria-pressed="${c.mine === k}" aria-label="${s.name}">${s.mark}</button>`).join('')}
          ${x.status === 'active' ? `<button class="btn" data-keep="${x.d.cid}">Still right</button><button class="btn" data-rev="${x.d.cid}">Reverse</button><button class="btn" data-sup="${x.d.cid}">Replace…</button>` : ''}
          ${x.d.on ? `<button class="btn" data-go="${x.d.on}">Show</button>` : ''}</div></li>`;
    };
    body.innerHTML = `<div class="row2"><input data-k="q" class="grow" placeholder="Search decisions" aria-label="Search decisions" value="${esc(DEC.q)}"><label class="muted"><input type="checkbox" data-k="all"${DEC.all ? ' checked' : ''}> Show replaced</label></div>
      ${due.length ? `<p class="pill warn">${plural(due.length, 'decision')} due for review</p>` : ''}
      ${list.length ? `<ul class="plain">${list.map(card).join('')}</ul>` : `<p class="empty">${q ? 'No decision matches.' : 'No decisions yet. Select the notes a decision rests on and choose “Record a decision…”.'}</p>`}
      <div class="acts"><button class="btn" data-new>${ic('flag')}Record a decision…</button><button class="btn" data-log>${ic('doc')}Decision log</button></div>`;
    if (DEC.focus){ const el = body.querySelector('.card.hot'); el?.scrollIntoView({ block: 'nearest' }); }
  },
  click(e, b){
    if (b.dataset.go) return goTo(b.dataset.go);
    if (b.dataset.st) return takeStance([b.dataset.t], b.dataset.st);
    if (b.dataset.keep) return reviewDecision(b.dataset.keep, true);
    if (b.dataset.rev) return reviewDecision(b.dataset.rev, false);
    if (b.dataset.sup) return decideFrom([...S.sel].map(c => S.records.get(c)).filter(Boolean), b.dataset.sup);
    if (b.hasAttribute('data-new')) return decideFrom([...S.sel].map(c => S.records.get(c)).filter(Boolean));
    if (b.hasAttribute('data-log')) return openReport(`Decision log — ${canvasTitle()}`, decisionLog(), 'decision-log.md');
  },
  change(e){ if (e.target.dataset.k === 'all'){ DEC.all = e.target.checked; paintPanel(); } },
  onClose(){ DEC.focus = null; },
});
document.addEventListener('input', e => { if (e.target.closest?.('#px-decisions') && e.target.dataset.k === 'q'){ DEC.q = e.target.value; paintPanel('decisions'); } });
function decisionLog(){
  const out = [`# Decision log — ${canvasTitle()}`, ''];
  for (const x of (S.D.decisions || []).slice().reverse()){
    const c = consensus(x.d.cid);
    out.push(`## ${x.d.text}`, '', `- **Status:** ${x.status}${x.d.reversible ? '' : ' · one-way door'}`, `- **Decided by:** ${short(x.d.author)} · ${new Date(x.d.t).toLocaleString()}`,
      ...(x.review ? [`- **Review:** ${ymdText(x.review)}`] : []), ...(x.d.evidence.length ? [`- **Evidence:** ${x.d.evidence.map(elTitle).join('; ')}`] : []),
      ...(c.n ? [`- **Stances:** ${c.c.agree} agree, ${c.c.disagree} disagree, ${c.c.unsure} unsure, ${c.c.alt} alternative (${LEVEL[c.level][0].toLowerCase()})`] : []),
      ...x.reviews.map(r => `- **${r.keep ? 'Kept' : 'Reversed'}** by ${short(r.author)} ${new Date(r.t).toLocaleDateString()}${r.note ? `: ${r.note}` : ''}`),
      `- **Signed record:** \`${x.d.cid}\``, '');
  }
  return out.join('\n');
}
registerFeature({ id: 'decisions', name: 'Decision ledger', group: 'decide', icon: 'flag', records: ['DECISION', 'REVIEW'],
  blurb: 'Decisions as signed records with their evidence, stances and review dates',
  status: () => { const n = (S.D.decisions || []).filter(reviewDue).length; return n ? `${n} to review` : ''; },
  open: () => openPanel('decisions') });
FLOW_CONDITIONS.decisions = { label: 'No decision is due for review', test: () => { const n = (S.D.decisions || []).filter(reviewDue).length; return n ? `${plural(n, 'decision')} due for review` : true; } };
let reviewNagged = false;
CHANGE_HOOKS.push(() => { if (reviewNagged || !S.me) return; const n = (S.D.decisions || []).filter(reviewDue).length; if (n){ reviewNagged = true; setTimeout(() => toast(`${plural(n, 'decision')} due for review · Team → Decision ledger`), 1500); } });
