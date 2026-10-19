'use strict';
// @module features/graph — The canvas graph: every record is typed and signed, so all the canvases this device holds can be
// asked questions together: every decision about pricing last quarter, who approves most, how often our retros close, which
// templates get forked, each person's record of work across canvases. A result can be signed as a manifest anyone with the same
// canvases can re-check. There is no central index: the graph is what you hold (and what peers have synced to you).
// @uses db (all canvases), records (parse, toRec), features/canvases (canvasList), ui/panels, ui/form
// RESULT-I-Q-{query}-H-{sha256 of the sorted result CIDs}-C-{rows}-K-{canvases}-Z-T-SIG      signed, never stored on a canvas
registerRecord('RESULT', { parse(r, f){ if (!f.Q || !f.H) throw Error('result'); r.query = decTxt(f.Q); r.n = +f.C || 0; }, inherit: false });
PERM_OF.RESULT = null;
const GQ = { kind: 'DECISION', who: '', text: '', days: 0, group: 'none', rows: null, busy: false, preset: '' };
// every canvas this browser holds, parsed: [{ canvas, title, recs: [rec] }]
async function graphLoad(){
  const list = await canvasList(), out = [];
  for (const c of list){
    let recs;
    if (c.id === canvasId) recs = [...S.records.values()];
    else { recs = []; for (const row of await dbAll('records', c.id)){ if (typeof row.raw !== 'string') continue; try { recs.push(toRec(parse(row.raw), row.cid)); } catch {} } }
    out.push({ canvas: c.id, title: c.title || 'Untitled canvas', recs });
  }
  return out;
}
const recText = r => r.text || r.title || r.name || r.note || r.prompt || (r.f.M ? decTxt(r.f.M) : '') || '';
const PRESETS = {
  decisions: { name: 'Decisions everywhere', run: all => { const rows = rowsOf(all, r => r.type === 'DECISION'); return { table: [['Canvas', 'Decision', 'Who', 'When']], body: rows.map(x => [x.title, x.r.text, whoName(personOf(x.r.author)), when(x.r.t)]), rows }; } },
  approvers: { name: 'Who approves most', run: all => countBy(rowsOf(all, r => r.type === 'APPROVE' && r.f.S !== '0'), x => whoName(personOf(x.r.author))) },
  work: { name: 'Record of work, per person', run: all => { const m = new Map(); for (const c of all) for (const r of c.recs) if (r.neg === null && r.type !== 'PROFILE'){ const p = personOf(r.author), o = m.get(p) || { n: 0, canvases: new Set(), credit: 0, credits: 0 }; o.n++; o.canvases.add(c.canvas); m.set(p, o); }
    for (const c of all) for (const r of c.recs) if (r.type === 'CREDIT') for (const [k, bp] of r.shares){ const o = m.get(personOf(k)); if (o){ o.credit += bp; o.credits++; } }
    return { table: [['Person', 'Signed records', 'Canvases', 'Credited deliveries', 'Average share']], body: [...m].sort((a, b) => b[1].n - a[1].n).map(([k, o]) => [whoName(k), o.n, o.canvases.size, o.credits, o.credits ? pct(Math.round(o.credit / o.credits)) : '–']) }; } },
  rituals: { name: 'How our rituals close', run: all => { const rows = []; for (const c of all){ const closes = c.recs.filter(r => r.type === 'CLOSE'); for (const r of c.recs.filter(r => r.type === 'RITUAL')){ const cl = closes.filter(x => x.f.R === r.cid).sort(byZ)[0]; rows.push([c.title, r.name, cl ? cl.outcome : 'open', when(r.t)]); } }
    const done = rows.filter(r => r[2] !== 'open'); return { table: [['Canvas', 'Ritual', 'Outcome', 'When']], body: rows, note: done.length ? `${done.filter(r => r[2] === 'success').length} of ${done.length} closed as a success` : '' }; } },
  forks: { name: 'Most forked canvases', run: all => countBy(rowsOf(all, r => r.type === 'FORKED'), x => x.title) },
  claims: { name: 'Claims and their checks', run: all => { const rows = []; for (const c of all){ const checks = c.recs.filter(r => r.type === 'CHECK'); for (const r of c.recs.filter(r => r.type === 'CLAIM' && r.on)){ const t = c.recs.find(x => x.cid === r.f.R), ch = checks.filter(x => x.f.R === r.f.R); rows.push([c.title, recText(t || r).slice(0, 80), `${ch.filter(x => x.verdict === 'ok').length} ✓ · ${ch.filter(x => x.verdict === 'no').length} ✕`]); } } return { table: [['Canvas', 'Claim', 'Checks']], body: rows }; } },
};
function rowsOf(all, f){ const out = []; for (const c of all) for (const r of c.recs) if (r.neg === null && f(r)) out.push({ canvas: c.canvas, title: c.title, r }); return out.sort((a, b) => b.r.t - a.r.t); }
function countBy(rows, key){ const m = new Map(); for (const x of rows){ const k = key(x); m.set(k, (m.get(k) || 0) + 1); } return { table: [['', 'Count']], body: [...m].sort((a, b) => b[1] - a[1]), rows }; }
async function runQuery(){
  GQ.busy = true; paintPanel();
  const all = await graphLoad();
  if (GQ.preset){ GQ.rows = { ...PRESETS[GQ.preset].run(all), all }; }
  else {
    const since = GQ.days ? Date.now() - GQ.days * 864e5 : 0, q = GQ.text.trim().toLowerCase();
    const rows = rowsOf(all, r => (GQ.kind === '*' || r.type === GQ.kind) && r.t >= since && (!GQ.who || samePerson(r.author, GQ.who)) && (!q || recText(r).toLowerCase().includes(q)));
    GQ.rows = GQ.group === 'none' ? { table: [['Canvas', 'Kind', 'Who', 'When', 'What']], body: rows.slice(0, 300).map(x => [x.title, x.r.type.toLowerCase(), whoName(personOf(x.r.author)), when(x.r.t), recText(x.r).slice(0, 90)]), rows, all }
      : { ...countBy(rows, x => GQ.group === 'author' ? whoName(personOf(x.r.author)) : GQ.group === 'canvas' ? x.title : GQ.group === 'type' ? x.r.type.toLowerCase() : new Date(x.r.t).toISOString().slice(0, 10)), all };
  }
  GQ.busy = false; paintPanel();
}
// sign what was found: anyone holding the same canvases can recompute the hash of the result's records
async function signResult(){
  const rows = GQ.rows?.rows || [], cids = rows.map(x => x.r.cid).sort();
  const h = b32(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(cids.join('\n')))));
  const query = GQ.preset ? `preset:${GQ.preset}` : JSON.stringify({ kind: GQ.kind, who: GQ.who, text: GQ.text, days: GQ.days, group: GQ.group });
  const raw = await signed('RESULT', [['I', S.me.id], ['Q', encTxt(query)], ['H', h], ['C', rows.length], ['K', GQ.rows.all.length], ['Z', S.lamport], ['T', Date.now()]]);
  downloadJSON('flux-query-result.json', JSON.stringify({ flux: 'result', v: 1, result: raw, query, canvases: GQ.rows.all.map(c => c.canvas), records: rows.map(x => ({ canvas: x.canvas, raw: x.r.raw })) }, null, 2));
  toast(`Signed result: ${plural(rows.length, 'record')} from ${plural(GQ.rows.all.length, 'canvas', 'canvases')}.`);
}
registerPanel({
  id: 'graph', title: 'Canvas graph', blurb: 'Ask questions across every canvas on this device: decisions, approvers, rituals, forks, records of work.', live: false,
  paint(body){
    const kinds = [...KNOWN].sort(), ppl = people();
    const t = GQ.rows;
    body.innerHTML = `<div class="acts">${Object.entries(PRESETS).map(([k, p]) => `<button class="btn" data-preset="${k}" aria-pressed="${GQ.preset === k}">${esc(p.name)}</button>`).join('')}</div>
      <details data-k="custom"${GQ.preset ? '' : ' open'}><summary>Your own question</summary><div class="fx-body" style="padding:8px 0">
        <div class="row2"><label class="sr" for="gqKind">Kind</label><select id="gqKind" data-k="kind"><option value="*">Any kind</option>${kinds.map(k => `<option value="${k}"${GQ.kind === k ? ' selected' : ''}>${k.toLowerCase()}</option>`).join('')}</select>
          <label class="sr" for="gqWho">Who</label><select id="gqWho" data-k="who"><option value="">Anyone</option>${ppl.map(p => `<option value="${p}"${GQ.who === p ? ' selected' : ''}>${esc(whoName(p))}</option>`).join('')}</select></div>
        <div class="row2"><input id="gqText" data-k="text" class="grow" placeholder="Containing… (e.g. pricing)" aria-label="Containing" value="${esc(GQ.text)}">
          <label class="sr" for="gqDays">When</label><select id="gqDays" data-k="days">${[[0, 'Any time'], [7, 'Last week'], [30, 'Last month'], [90, 'Last quarter']].map(([d, n]) => `<option value="${d}"${GQ.days === d ? ' selected' : ''}>${n}</option>`).join('')}</select>
          <label class="sr" for="gqGroup">Group by</label><select id="gqGroup" data-k="group">${[['none', 'List'], ['author', 'By person'], ['canvas', 'By canvas'], ['type', 'By kind'], ['day', 'By day']].map(([g, n]) => `<option value="${g}"${GQ.group === g ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="acts"><button class="btn primary" data-run data-autofocus>${ic('search')}Ask</button></div></div></details>
      ${GQ.busy ? '<p class="muted">Reading every canvas on this device…</p>' : t ? `<p><b>${plural(t.body.length, 'row')}</b> from ${plural(t.all.length, 'canvas', 'canvases')}${t.note ? ` · ${esc(t.note)}` : ''}</p>
        <div style="overflow:auto"><table><tr>${t.table[0].map(h => `<th>${esc(h)}</th>`).join('')}</tr>${t.body.slice(0, 200).map(r => `<tr>${r.map(c => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('')}</table></div>
        ${t.rows ? '<div class="acts"><button class="btn" data-sign>Sign this result…</button></div>' : ''}` : ''}
      <p class="muted">No central index: this is what this device holds, verified record by record when it arrived.</p>`;
  },
  click(e, b){
    if (b.dataset.preset){ GQ.preset = GQ.preset === b.dataset.preset ? '' : b.dataset.preset; if (GQ.preset) runQuery(); else { GQ.rows = null; paintPanel(); } return; }
    if (b.hasAttribute('data-run')){ GQ.preset = ''; GQ.text = $('gqText').value; runQuery(); }
    if (b.hasAttribute('data-sign')) signResult();
  },
  change(e){ const k = e.target.dataset.k; if (k === 'kind') GQ.kind = e.target.value; if (k === 'who') GQ.who = e.target.value; if (k === 'days') GQ.days = +e.target.value; if (k === 'group') GQ.group = e.target.value; if (k === 'text') GQ.text = e.target.value; },
});
registerFeature({ id: 'graph', name: 'Canvas graph', group: 'network', icon: 'graph', records: ['RESULT'],
  blurb: 'Questions across all your canvases: decisions, approvers, rituals, forks, records of work; signed results', open: () => openPanel('graph') });
