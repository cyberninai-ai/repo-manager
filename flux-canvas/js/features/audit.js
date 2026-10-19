'use strict';
// @module features/audit — Audit flows: verdicts on steps (AUDIT), a guided walk along a flow, a report, a signed sign-off
// that fences every verdict it attests (SIGNOFF), and a history scrubber that replays the canvas record by record.
// @uses hooks, builders, diagrams, ui/dialogs
// AUDIT-I-{author}-R-{step}-V-{pass|fail|info}-M-{note}-Z-T-SIG — latest per auditor and step wins; revocable by its author
// SIGNOFF-I-{author}-R-{canvasId}-M-{summary}-P-.{AUDIT…}.-Z-T-SIG — every fenced verdict is verified on its own

const VERDICTS = { pass: { icon: '✓', name: 'pass', css: '--green' }, fail: { icon: '✗', name: 'fail', css: '--red' }, info: { icon: '?', name: 'needs info', css: '--amber' } };
const RANK = { pass: 1, info: 2, fail: 3 };
registerRecord('AUDIT', { parse(r, f){ if (!f.R || !VERDICTS[f.V]) throw Error('audit'); r.verdict = f.V; r.note = decTxt(f.M || ''); } });
registerRecord('SIGNOFF', { fence: 'AUDIT', parse(r, f){ if (!f.R) throw Error('signoff'); r.summary = decTxt(f.M || ''); } });
DERIVE_HOOKS.push((D, by) => {
  const v = new Map();   // current step cid → Map(auditor → latest AUDIT)
  for (const r of by.AUDIT || []){
    if (D.hidden.has(r.cid)) continue;
    const t = current(r.f.R); if (!t) continue;
    if (!v.has(t.cid)) v.set(t.cid, new Map()); v.get(t.cid).set(r.author, r);
  }
  D.audits = v;
  D.signoffs = (by.SIGNOFF || []).filter(r => r.f.R === canvasId && !D.hidden.has(r.cid));
  if (walk) paintAudit();
});
const verdictsOn = cid => S.D.audits?.get(cid) || new Map();
const worstOf = m => { let w = null; for (const r of m.values()) if (!w || RANK[r.verdict] > RANK[w]) w = r.verdict; return w; };
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* verdict badges: top-right of each audited element */
RENDER_HOOKS.screen.push(() => {
  if (!S.D.audits?.size) return;
  for (const [cid, m] of S.D.audits){
    const el = S.records.get(cid); if (!el || !visible(el) || !m.size) continue;
    const b = box(el); if (!b) continue;
    const s = toScreen(b.x + b.w, b.y), w = worstOf(m), V = VERDICTS[w];
    ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, Math.PI * 2); ctx.fillStyle = cssVar(V.css); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = TH.paper; ctx.stroke();
    ctx.fillStyle = TH.paper; ctx.font = `700 12px ${FONTS.sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(V.icon, s.x, s.y + .5);
    if (m.size > 1){ ctx.font = `600 9px ${FONTS.mono}`; ctx.fillStyle = TH.ink; ctx.textAlign = 'left'; ctx.fillText('×' + m.size, s.x + 12, s.y - 6); }
  }
});

/* the walk: steps follow tree links, then outgoing arrows, breadth first */
let walk = null;   // { start, steps: [cid], i }
function flowFrom(start){
  const out = [], seen = new Set([start]), q = [start];
  while (q.length){
    const c = q.shift(); out.push(c);
    const nb = [...(S.D.kids.get(c) || [])];
    for (const el of S.D.els) if (el.type === 'ARROW' && visible(el) && current(el.f.FROM)?.cid === c){ const t = current(el.f.TO); if (t) nb.push(t.cid); }
    nb.map(id => S.records.get(id)).filter(e => e && visible(e) && !S.D.hidden.has(e.cid) && e.type !== 'ARROW')
      .sort((a, b) => box(a).y - box(b).y || box(a).x - box(b).x)
      .forEach(e => { if (!seen.has(e.cid)){ seen.add(e.cid); q.push(e.cid); } });
  }
  return out;
}
function startAudit(){
  const el = S.sel.size === 1 && current([...S.sel][0]);
  if (!el || el.type === 'ARROW'){ toast('Select the first step of the flow, then start the audit (A).'); return; }
  walk = { start: el.cid, steps: flowFrom(el.cid), i: 0 };
  $('audit').style.display = 'flex'; document.body.classList.add('drawer');
  if ($('comments').style.display === 'flex') toggleComments(false);
  if (S.ledger) toggleLedger(false);
  showStep(0);
  say(`Audit started from “${(el.text || describe(el)).slice(0, 60)}”: ${walk.steps.length} steps. 1 pass, 2 fail, 3 needs info.`);
}
function closeAudit(){ walk = null; $('audit').style.display = 'none'; document.body.classList.toggle('drawer', S.ledger || $('comments').style.display === 'flex'); cv.focus({ preventScroll: true }); }
function showStep(i){
  if (!walk) return;
  walk.i = Math.max(0, Math.min(walk.steps.length - 1, i));
  const el = S.records.get(walk.steps[walk.i]);
  if (el){ S.sel = new Set([el.cid]); ensureVisible(el); dirty = true; }
  paintAudit();
  setTimeout(() => $('audit').querySelector('[data-v][aria-pressed="true"], [data-v="pass"]')?.focus(), 0);
}
const who = id => id === S.me?.id ? 'you' : short(id);
function paintAudit(){
  if (!walk) return;
  const steps = walk.steps.map(c => S.records.get(c)).filter(Boolean), el = steps[walk.i]; if (!el) return;
  const m = verdictsOn(el.cid), mine = m.get(S.me.id);
  const done = steps.filter(s => verdictsOn(s.cid).size).length;
  const nexts = flowFrom(el.cid).slice(1).filter(c => (S.D.kids.get(el.cid) || []).includes(c) || S.D.els.some(a => a.type === 'ARROW' && visible(a) && current(a.f.FROM)?.cid === el.cid && current(a.f.TO)?.cid === c)).map(c => S.records.get(c)?.text || '…');
  const keep = document.activeElement?.id === 'auNote' ? $('auNote').value : (mine?.note || '');
  $('auditBody').innerHTML = `
    <div class="au-prog" aria-label="Step ${walk.i + 1} of ${steps.length}, ${done} reviewed"><span>Step ${walk.i + 1} of ${steps.length}</span><span>${done} reviewed</span>
      <i style="width:${Math.round(done / steps.length * 100)}%"></i></div>
    <div class="au-step"><div class="k">${esc(KIND(el))}</div><h3>${esc(el.text || describe(el))}</h3>
      ${nexts.length ? `<div class="k">next: ${nexts.map(esc).join(' · ')}</div>` : '<div class="k">end of this branch</div>'}</div>
    <div class="au-v" role="group" aria-label="Your verdict">${Object.entries(VERDICTS).map(([k, V], n) => `<button class="btn v-${k}" data-v="${k}" aria-pressed="${mine?.verdict === k}">${V.icon} ${V.name} <kbd>${n + 1}</kbd></button>`).join('')}</div>
    <label for="auNote">Note (optional)</label>
    <textarea id="auNote" placeholder="What did you check? What is missing?">${esc(keep)}</textarea>
    ${m.size ? `<ul class="au-others">${[...m.values()].map(r => `<li><b class="v-${r.verdict}">${VERDICTS[r.verdict].icon} ${VERDICTS[r.verdict].name}</b> · ${esc(who(r.author))}${r.note ? ` — ${esc(r.note)}` : ''}</li>`).join('')}</ul>` : '<p class="k">No verdicts on this step yet.</p>'}
    <div class="row2"><button class="btn" data-a="prev">‹ previous</button><button class="btn" data-a="next">next ›</button>
      <button class="btn" data-a="report">report</button><button class="btn" data-a="signoff">sign off</button></div>
    ${S.D.signoffs?.length ? `<h4>Signed off</h4><ul class="au-others">${S.D.signoffs.map(s => `<li>✍ ${esc(who(s.author))} · ${new Date(s.t).toLocaleString()} — ${esc(s.summary)}</li>`).join('')}</ul>` : ''}`;
}
async function giveVerdict(v){
  if (!walk) return;
  const el = S.records.get(walk.steps[walk.i]), note = $('auNote')?.value.trim() || '';
  const cid = await publish(await signed('AUDIT', [['I', S.me.id], ['R', el.cid], ['V', v], ['M', encTxt(note)], ['Z', ++S.lamport], ['T', Date.now()]]));
  if (cid){ S.hist.push({ kind: 'fn', undo: () => setNeg(cid, true), redo: () => setNeg(cid, false) }); S.redo = []; }
  say(`${VERDICTS[v].name} on “${(el.text || '').slice(0, 50)}”.`);
  await tick();
  if (walk.i < walk.steps.length - 1) showStep(walk.i + 1);
  else { paintAudit(); say('That was the last step. Open the report or sign off.'); }
}
function auditReport(){
  const steps = (walk ? walk.steps : [...(S.D.audits?.keys() || [])]).map(c => S.records.get(c)).filter(Boolean);
  const auditors = new Set(); steps.forEach(s => verdictsOn(s.cid).forEach((r, a) => auditors.add(a)));
  const tally = { pass: 0, fail: 0, info: 0, none: 0 };
  const rows = steps.map((s, i) => {
    const m = verdictsOn(s.cid), w = worstOf(m); tally[w || 'none']++;
    const detail = m.size ? [...m.values()].map(r => `${VERDICTS[r.verdict].icon} ${short(r.author)}${r.note ? `: ${r.note.replace(/\|/g, '/')}` : ''}`).join('<br>') : '—';
    return `| ${i + 1} | ${(s.text || KIND(s)).replace(/\|/g, '/').replace(/\s+/g, ' ')} | ${w ? `${VERDICTS[w].icon} ${VERDICTS[w].name}` : 'not reviewed'} | ${detail} |`;
  });
  const start = walk ? S.records.get(walk.start) : null;
  const out = [`# Audit report — ${canvasTitle()}`, '', `${start ? `Flow from “${start.text}” · ` : ''}${steps.length} steps · auditors: ${[...auditors].map(short).join(', ') || 'none yet'} · ${new Date().toLocaleString()}`, '',
    `**Result:** ✓ ${tally.pass} pass · ✗ ${tally.fail} fail · ? ${tally.info} need info · ${tally.none} not reviewed`, '',
    '| # | Step | Verdict (worst) | Verdicts and notes |', '|---|---|---|---|', ...rows, ''];
  const open = steps.filter(s => ['fail', 'info'].includes(worstOf(verdictsOn(s.cid))));
  if (open.length){ out.push('## Failing and open steps', ''); for (const s of open) for (const r of verdictsOn(s.cid).values()) if (r.verdict !== 'pass') out.push(`- ${VERDICTS[r.verdict].icon} **${s.text}** — ${short(r.author)}${r.note ? `: ${r.note}` : ''}`); out.push(''); }
  if (S.D.signoffs?.length){ out.push('## Sign-offs', ''); for (const so of S.D.signoffs) out.push(`- ✍ ${short(so.author)} · ${new Date(so.t).toLocaleString()} · ${so.members?.length || 0} verdicts · \`${so.cid}\`${so.summary ? ` — ${so.summary}` : ''}`); out.push(''); }
  out.push('---', `Each verdict and sign-off is a signed record on canvas \`${canvasId}\`; verify them with ⌘K → Verify every signature.`);
  return out.join('\n');
}
async function signOff(){
  const steps = walk ? walk.steps : [...(S.D.audits?.keys() || [])];
  const mine = steps.map(c => verdictsOn(c).get(S.me.id)).filter(Boolean);
  if (!mine.length){ toast('Give at least one verdict before signing off.'); return; }
  const t = { pass: 0, fail: 0, info: 0 }; mine.forEach(r => t[r.verdict]++);
  const summary = `${mine.length} of ${steps.length} steps: ${t.pass} pass, ${t.fail} fail, ${t.info} need info`;
  const v = await ask('Sign off this audit', summary, 'Your signature covers every verdict listed here, fenced inside one SIGNOFF record. Edit the summary if you like.');
  if (v === null) return;
  const cid = await publish(await signed('SIGNOFF', [['I', S.me.id], ['R', canvasId], ['M', encTxt(v.trim() || summary)], ['P', mine.map(r => r.raw)], ['Z', ++S.lamport], ['T', Date.now()]]));
  if (cid){ S.hist.push({ kind: 'fn', undo: () => setNeg(cid, true), redo: () => setNeg(cid, false) }); S.redo = []; }
  say(`Signed off ${mine.length} verdicts.`);
}
$('audit').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'auditClose') return closeAudit();
  if (b.dataset.v) return giveVerdict(b.dataset.v);
  const a = b.dataset.a;
  if (a === 'prev') showStep(walk.i - 1);
  if (a === 'next') showStep(walk.i + 1);
  if (a === 'report') openReport(`Audit report — ${canvasTitle()}`, auditReport(), 'audit-report.md');
  if (a === 'signoff') signOff();
});
$('audit').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape'){ closeAudit(); return; }
  if (e.target.tagName === 'TEXTAREA') return;
  const v = { 1: 'pass', 2: 'fail', 3: 'info' }[e.key]; if (v){ e.preventDefault(); giveVerdict(v); }
  if (e.key === 'ArrowRight'){ e.preventDefault(); showStep(walk.i + 1); } if (e.key === 'ArrowLeft'){ e.preventDefault(); showStep(walk.i - 1); }
});

PALETTE_HOOKS.push(add => {
  add('audit', 'Start audit from the selected step', startAudit, { k: 'A' });
  add('audit', 'Audit report (Markdown)…', () => openReport(`Audit report — ${canvasTitle()}`, auditReport(), 'audit-report.md'));
});
KEY_HOOKS.push((e, c) => {
  if (!c.onCanvas || c.mod || e.altKey) return false;
  if (c.k === 'a' && !e.shiftKey){ e.preventDefault(); startAudit(); return true; }
  return false;
});
$('auditClose').onclick = closeAudit;

TEMPLATES.push({ id: 'audit', name: 'Audit flow', icon: '✓', blurb: 'A process flow to walk step by step: pass, fail or needs info, then sign off.', build: async c => {
  await insertTemplate('flow');
  await mk('card', c.x + 260, c.y - 260, 'Select “Start”, press A to audit each step (1 pass · 2 fail · 3 needs info), then sign off.', { W: 300, color: 'green' });
} });
EXAMPLES.push({ id: 'expense', title: 'Expense approval — audited flow', icon: '✓', blurb: 'A real process audited by two people, with notes, an open issue and a signed sign-off.', build: async ([ana, ben, chen]) => {
  const c = center0(), X = c.x - 90;
  const ids = await by(chen, async () => {
    const s = await mk('ellipse', X, c.y - 380, 'Submit expense', { color: 'blue' });
    const r = await mk('rect', X - 10, c.y - 260, 'Attach receipt', { parent: s });
    const d = await mk('diamond', X - 20, c.y - 150, 'Over $1,000?', { parent: r });
    const m = await mk('rect', X - 270, c.y + 10, 'Manager approves', { parent: d });
    const f = await mk('rect', X + 230, c.y + 10, 'Finance approves', { parent: d });
    const p = await mk('ellipse', X, c.y + 160, 'Paid out', { parent: m, color: 'green' });
    await link(f, p);
    return { s, r, d, m, f, p };
  });
  await tick();
  const verdict = (step, v, note) => publish0('AUDIT', [['R', step], ['V', v], ['M', encTxt(note)]]);
  async function publish0(action, pairs){ return publish(await signed(action, [['I', S.me.id], ...pairs, ['Z', ++S.lamport], ['T', Date.now()]])); }
  await by(ana, async () => {
    await verdict(ids.s, 'pass', 'Form validates amount and currency.');
    await verdict(ids.r, 'fail', 'Receipts over 90 days old are accepted. Policy says 60.');
    await verdict(ids.d, 'pass', '');
    await verdict(ids.m, 'pass', 'Delegation works when the manager is away.');
    await verdict(ids.f, 'info', 'Who approves when Finance is the submitter?');
    await verdict(ids.p, 'pass', '');
  });
  await by(ben, async () => { await verdict(ids.r, 'fail', 'Confirmed on 3 sample claims.'); await verdict(ids.f, 'pass', 'Separation of duties is configured.'); });
  await tick();
  await by(ana, async () => {
    const mine = Object.values(ids).map(c2 => verdictsOn(c2).get(S.me.id)).filter(Boolean);
    await publish0('SIGNOFF', [['R', canvasId], ['M', encTxt('Q3 controls review: 1 failing control (receipt age), 1 open question.')], ['P', mine.map(r => r.raw)]]);
  });
  const t = await by(ben, () => noteOn(ids.r, 'Fix: set the age limit to 60 days and re-test.'));
  await by(chen, () => replyTo(t, 'Shipping the config change today.'));
} });
