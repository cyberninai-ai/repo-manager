'use strict';
// @module features/feedback — Feedback boards (columns as frames) and the summary: every column's notes ranked by votes,
// with reactions and comment counts, as Markdown. Feedback template and a retro example.
// @uses hooks, builders, brainstorm (reactions), ui/dialogs (openReport)

const isFrame = el => el?.type === 'NODE' && el.ek === 'frame';
const textOf = el => el.type === 'IMAGE' ? `🖼 ${el.alt || 'image'}` : (el.text || '').replace(/\s+/g, ' ').trim();
function itemsIn(frame, pool){
  const fb = box(frame);
  return pool.filter(el => { const b = box(el); if (!b) return false; const c = center(b); return inside(c, fb); });
}
function reactLine(cid){
  const m = reactsOf(cid), bits = [];
  for (const [k, r] of Object.entries(REACTIONS)) if (m[k]?.size) bits.push(`${r.icon} ${m[k].size}`);
  const t = [...S.D.threads.values()].filter(t => t.root.on && current(t.root.on)?.cid === cid && !S.D.hidden.has(t.root.cid));
  const n = t.reduce((a, x) => a + 1 + x.replies.filter(c => !S.D.hidden.has(c.cid)).length, 0);
  if (n) bits.push(`💬 ${n}`);
  return bits.join(' · ');
}
function feedbackSummary(){
  const vis = S.D.els.filter(el => visible(el) && !S.D.hidden.has(el.cid) && el.type !== 'ARROW' && el.type !== 'DRAW' && el.type !== 'SHAPE');
  const frames = vis.filter(isFrame).sort((a, b) => box(a).x - box(b).x || box(a).y - box(b).y);
  const pool = vis.filter(el => !isFrame(el) && textOf(el)), placed = new Set();
  const rank = list => list.sort((a, b) => reactCount(b.cid, 'vote') - reactCount(a.cid, 'vote') || Object.keys(reactsOf(b.cid)).length - Object.keys(reactsOf(a.cid)).length);
  const line = el => `- ${textOf(el)}${reactLine(el.cid) ? ` — ${reactLine(el.cid)}` : ''}  _(${el.author === S.me.id ? 'you' : short(el.author)})_`;
  const authors = new Set(vis.map(e => e.author));
  const out = [`# ${canvasTitle()} — summary`, '', `${new Date().toLocaleString()} · ${pool.length} notes · ${authors.size} contributor${authors.size === 1 ? '' : 's'} · votes ${[...S.D.reactions?.values() || []].reduce((a, m) => a + (m.vote?.size || 0), 0)}`, ''];
  const top = rank(pool.filter(el => reactCount(el.cid, 'vote'))).slice(0, 5);
  if (top.length){ out.push('## Top voted', ''); top.forEach((el, i) => out.push(`${i + 1}. ${textOf(el)} — ● ${reactCount(el.cid, 'vote')}`)); out.push(''); }
  for (const f of frames){
    const items = rank(itemsIn(f, pool).filter(el => !placed.has(el.cid)));
    if (!items.length) continue;
    items.forEach(el => placed.add(el.cid));
    out.push(`## ${f.text}`, '', ...items.map(line), '');
  }
  const rest = rank(pool.filter(el => !placed.has(el.cid)));
  if (rest.length) out.push(frames.length ? '## Elsewhere on the canvas' : '## Notes', '', ...rest.map(line), '');
  const open = [...S.D.threads.values()].filter(t => !t.resolved && !S.D.hidden.has(t.root.cid));
  if (open.length){ out.push('## Open comment threads', ''); for (const t of open) out.push(`- ${t.root.text.replace(/\s+/g, ' ')} — on ${targetName(t.root)} (${1 + t.replies.length} message${t.replies.length ? 's' : ''})`); out.push(''); }
  out.push('---', `Every note, vote, reaction and comment above is a signed record on canvas \`${canvasId}\`.`);
  return out.join('\n');
}
function showSummary(){ openReport(`${canvasTitle()} — summary`, feedbackSummary(), `${canvasTitle().replace(/[^\w-]+/g, '-').toLowerCase() || 'canvas'}-summary.md`); }
PALETTE_HOOKS.push(add => add('feedback', 'Summary of notes, votes and comments (Markdown)…', showSummary, { k: 'S' }));
KEY_HOOKS.push((e, c) => { if (c.onCanvas && !c.mod && !e.altKey && e.key === 'S'){ e.preventDefault(); showSummary(); return true; } return false; });

const COLUMNS = [['What went well', 'green'], ['What to improve', 'orange'], ['Questions', 'blue'], ['Ideas', 'violet']];
async function feedbackBoard(c, fill = null){
  const ids = [];
  await mk('card', c.x - 650, c.y - 400, 'Add a note in any column (double-click), vote with D, then ⌘K → Summary.', { W: 640 });
  for (const [i, [title, col]] of COLUMNS.entries()){
    const x = c.x - 650 + i * 330, f = await mk('frame', x, c.y - 330, title, { W: 310, H: 640, color: col });
    ids.push(f);
    if (!fill) await mk('sticky', x + 24, c.y - 280, 'Add a note', { color: col });
  }
  return ids;
}
TEMPLATES.push({ id: 'feedback', name: 'Feedback board', icon: '☷', blurb: 'Columns for what works, what to improve, questions and ideas, plus a summary.', build: c => feedbackBoard(c) });
EXAMPLES.push({ id: 'retro', title: 'Sprint 42 retro — feedback board', icon: '☷', blurb: 'A retro with notes from three people, votes, reactions, comments and a ready summary.', build: async ([ana, ben, chen]) => {
  const c = center0();
  const frames = await by(ana, () => feedbackBoard(c, true));
  const notes = [
    [0, ana, 'Release went out on Thursday, no rollbacks'], [0, ben, 'Pairing on the sync bug saved us a week'], [0, chen, 'Design reviews were faster with the new canvas'],
    [1, ben, 'Flaky e2e tests blocked merges twice'], [1, chen, 'Too many meetings on Wednesday'], [1, ana, 'Specs changed after estimation'],
    [2, chen, 'Who owns the on-call rotation now?'], [2, ana, 'Are we keeping the beta flag after GA?'],
    [3, ben, 'Quarantine flaky tests automatically'], [3, chen, 'No-meeting Wednesdays'], [3, ana, 'Freeze scope 2 days before planning'],
  ];
  const at = [0, 0, 0, 0], ids = [];
  for (const [col, who, text] of notes){
    const fb = box(S.records.get(frames[col]) || { x: 0, y: 0, w: 0, h: 0 });
    await by(who, async () => ids.push(await mk('sticky', fb.x + 24 + (at[col] % 2) * 0, fb.y + 50 + at[col] * 160, text, { color: COLUMNS[col][1] })));
    at[col]++;
  }
  await tick();
  const vote = (who, picks) => by(who, async () => { for (const i of picks) await setReact(ids[i], 'vote', true); });
  await vote(ana, [3, 8, 9]); await vote(ben, [3, 8, 10, 4]); await vote(chen, [9, 4, 3]);
  await by(ben, async () => { await setReact(ids[1], 'love', true); await setReact(ids[6], 'q', true); });
  await by(chen, async () => { await setReact(ids[0], 'up', true); await setReact(ids[5], 'risk', true); });
  const t = await by(chen, () => noteOn(ids[3], 'Three of us hit this. Can we fix it before the next sprint?'));
  await by(ben, () => replyTo(t, 'Yes: quarantine first, then fix. Taking it.'));
} });
