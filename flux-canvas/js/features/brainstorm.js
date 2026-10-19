'use strict';
// @module features/brainstorm — Dot votes and reactions (REACT), a vote budget, a shared timer, and arranging ideas:
// grid, sort by votes, cluster into a titled frame. Brainstorm template and example.
// @uses hooks, builders, commands, diagrams
// REACT-I-{author}-R-{target}-E-{kind}-S-{1|0}-Z-T-SIG — per author, target and kind the latest wins; anyone may react

const REACTIONS = {
  vote: { icon: '●', name: 'vote' }, up: { icon: '👍', name: 'agree' }, idea: { icon: '💡', name: 'great idea' },
  love: { icon: '❤️', name: 'love it' }, q: { icon: '❓', name: 'question' }, risk: { icon: '⚠️', name: 'risk' },
};
registerRecord('REACT', { parse(r, f){ if (!f.R || !REACTIONS[f.E]) throw Error('react'); r.kind = f.E; r.on = f.S !== '0'; } });
DERIVE_HOOKS.push((D, by) => {
  const latest = new Map();
  for (const r of by.REACT || []) if (!D.hidden.has(r.cid)) latest.set(`${r.f.R}|${r.kind}|${r.author}`, r);
  const re = new Map(), keys = new Map();
  for (const r of latest.values()){
    if (!r.on) continue;
    const t = current(r.f.R); if (!t || D.hidden.has(t.cid)) continue;   // reactions follow edits of their element
    const m = re.get(t.cid) || {}; (m[r.kind] ||= new Set()).add(r.author); re.set(t.cid, m);
    const k = `${t.cid}|${r.kind}|${r.author}`; if (!keys.has(k)) keys.set(k, []); keys.get(k).push(r.f.R);
  }
  D.reactions = re; D.reactKeys = keys;
  paintVotes();
});
const reactsOf = cid => S.D.reactions?.get(cid) || {};
const reactCount = (cid, kind) => reactsOf(cid)[kind]?.size || 0;
const reacted = (cid, kind) => !!reactsOf(cid)[kind]?.has(S.me?.id);

S.voteBudget = 5;
try { const v = +localStorage.getItem('flux:voteBudget'); if (v >= 0 && localStorage.getItem('flux:voteBudget') !== null) S.voteBudget = v; } catch {}
function myVotes(){ let n = 0; for (const [cid, m] of S.D.reactions || []) if (m.vote?.has(S.me?.id) && visible(S.records.get(cid))) n++; return n; }
function anyVotes(){ for (const m of (S.D.reactions || new Map()).values()) if (m.vote?.size) return true; return false; }
function paintVotes(){
  const el = $('votes'); if (!el) return;
  const show = anyVotes();
  el.hidden = !show; if (!show) return;
  const left = S.voteBudget ? Math.max(0, S.voteBudget - myVotes()) : '∞';
  el.textContent = `● ${left} vote${left === 1 ? '' : 's'} left`;
  el.title = `${left} of ${S.voteBudget || 'unlimited'} votes left · click to change the budget`;
}
async function setReact(cid, kind, on){
  const rs = on ? [cid] : (S.D.reactKeys?.get(`${cid}|${kind}|${S.me.id}`) || [cid]);   // switch off every version I voted on
  for (const R of rs) await publish(await signed('REACT', [['I', S.me.id], ['R', R], ['E', kind], ['S', on ? '1' : '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
}
async function toggleReact(kind, list){
  const els = list.map(e => e && current(e.cid)).filter(e => e && ELEMENT.has(e.type) && e.type !== 'ARROW' && visible(e));
  if (!els.length){ toast('Select a note or element to react to.'); return; }
  const on = !els.every(e => reacted(e.cid, kind));
  const ids = els.filter(e => reacted(e.cid, kind) !== on).map(e => e.cid);
  if (on && kind === 'vote' && S.voteBudget && myVotes() + ids.length > S.voteBudget){
    toast(`Out of votes: ${S.voteBudget} per person on this canvas. Take one back first.`); return;
  }
  const before = myVotes();
  for (const c of ids) await setReact(c, kind, on);
  S.hist.push({ kind: 'fn', undo: async () => { for (const c of ids) await setReact(c, kind, !on); }, redo: async () => { for (const c of ids) await setReact(c, kind, on); } }); S.redo = [];
  const r = REACTIONS[kind];
  const left = S.voteBudget ? Math.max(0, S.voteBudget - before - (on ? ids.length : -ids.length)) : null;
  say(kind === 'vote' ? `${on ? 'Voted' : 'Vote removed'}${ids.length > 1 ? ` on ${ids.length}` : ''}.${left !== null ? ` ${left} left.` : ''}` : `${on ? 'Reacted' : 'Removed'} ${r.name}.`);
}

/* reaction chips under each element; click one to add or take back your own */
let chips = [];
RENDER_HOOKS.screen.push(() => {
  chips = [];
  if (!S.D.reactions?.size) return;
  ctx.font = `600 11px ${FONTS.sans}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (const [cid, m] of S.D.reactions){
    const el = S.records.get(cid); if (!el || !visible(el)) continue;
    const b = box(el); if (!b) continue;
    const s = toScreen(b.x, b.y + b.h); if (s.x > innerWidth || s.y > innerHeight + 30 || s.y < -30 || s.x < -300) continue;
    let x = s.x, y = s.y + 5;
    for (const kind of Object.keys(REACTIONS)){
      const set = m[kind]; if (!set?.size) continue;
      const label = `${REACTIONS[kind].icon} ${set.size}`, w = ctx.measureText(label).width + 14, mine = set.has(S.me.id), vote = kind === 'vote';
      rr(ctx, x, y, w, 20, 10); ctx.fillStyle = vote ? TH.accent : TH.panel; ctx.fill();
      ctx.lineWidth = mine ? 2 : 1; ctx.strokeStyle = mine ? TH.ink : TH.line; ctx.stroke();
      ctx.fillStyle = vote ? TH.paper : TH.ink; ctx.fillText(label, x + 7, y + 10.5);
      chips.push({ x, y, w, h: 20, cid, kind }); x += w + 4;
    }
  }
});
POINTER_HOOKS.push(e => {
  const c = chips.find(c => e.clientX >= c.x && e.clientX <= c.x + c.w && e.clientY >= c.y && e.clientY <= c.y + c.h);
  if (!c) return false;
  toggleReact(c.kind, [S.records.get(c.cid)]); return true;
});

/* shared timer for time-boxed rounds: ephemeral, synced over the canvas channel */
let timerEnd = 0, timerDone = true;
function startTimer(min, remote = false){
  timerEnd = Date.now() + min * 60000; timerDone = false;
  if (!remote) try { bc?.postMessage({ timer: { end: timerEnd } }); } catch {}
  paintTimer(); say(`${remote ? 'A collaborator started a' : 'Timer started:'} ${min} minute${min === 1 ? '' : 's'}${remote ? ' timer' : ''}.`);
}
function stopTimer(remote = false){
  timerEnd = 0; timerDone = true; if (!remote) try { bc?.postMessage({ timer: { end: 0 } }); } catch {}
  paintTimer(); say('Timer stopped.');
}
WIRE_HOOKS.timer = t => { if (t && t.end > Date.now()) startTimer((t.end - Date.now()) / 60000, true); else if (timerEnd) stopTimer(true); };
function paintTimer(){
  const el = $('timer'); if (!el) return;
  if (!timerEnd){ el.hidden = true; return; }
  const left = Math.max(0, timerEnd - Date.now()), m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
  el.hidden = false; el.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('alarm', left === 0);
  el.title = left ? 'Shared timer · click to stop' : 'Time is up · click to dismiss';
  if (!left && !timerDone){ timerDone = true; toast('⏱ Time’s up!'); }
}
setInterval(paintTimer, 500);

/* arranging ideas */
async function moveItems(items, msg){
  items = items.filter(i => i.dx || i.dy);
  for (const it of items) await commitMove(it.t, it.dx, it.dy);
  if (items.length){ S.hist.push({ kind: 'moves', items }); S.redo = []; }
  say(items.length ? `${msg}. Signed.` : 'Already in place.');
}
const arrangeable = rs => rs.map(e => e && current(e.cid)).filter(e => e && e.type !== 'ARROW' && !e.locked && !(e.type === 'NODE' && e.ek === 'frame') && visible(e));
async function arrangeGrid(rs){
  const bs = arrangeable(rs).map(e => ({ e, b: box(e) })).sort((a, b) => a.b.y - b.b.y || a.b.x - b.b.x); if (bs.length < 2) return;
  const cols = Math.ceil(Math.sqrt(bs.length)), cw = Math.max(...bs.map(x => x.b.w)), ch = Math.max(...bs.map(x => x.b.h)), gap = 24;
  const ox = Math.min(...bs.map(x => x.b.x)), oy = Math.min(...bs.map(x => x.b.y));
  await moveItems(bs.map((x, i) => ({ t: x.e.cid, dx: Math.round(ox + (i % cols) * (cw + gap) - x.b.x), dy: Math.round(oy + Math.floor(i / cols) * (ch + gap) - x.b.y) })), `Arranged ${bs.length} in a grid`);
}
async function sortByVotes(rs){
  const bs = arrangeable(rs).map(e => ({ e, b: box(e), v: reactCount(e.cid, 'vote') })).sort((a, b) => b.v - a.v || a.b.y - b.b.y); if (bs.length < 2) return;
  const ox = Math.min(...bs.map(x => x.b.x)); let y = Math.min(...bs.map(x => x.b.y));
  const items = bs.map(x => { const it = { t: x.e.cid, dx: Math.round(ox - x.b.x), dy: Math.round(y - x.b.y) }; y += x.b.h + 16; return it; });
  await moveItems(items, `Sorted ${bs.length} by votes, most voted on top`);
}
async function clusterSel(rs){
  const els = arrangeable(rs); if (els.length < 2){ toast('Select two or more notes to cluster.'); return; }
  const name = await ask('Name this cluster', 'Cluster', 'A titled frame is drawn around the notes and grouped with them.');
  if (name === null) return;
  const bs = els.map(box), x = Math.min(...bs.map(b => b.x)) - 28, y = Math.min(...bs.map(b => b.y)) - 52;
  const W = Math.max(...bs.map(b => b.x + b.w)) + 28 - x, H = Math.max(...bs.map(b => b.y + b.h)) + 28 - y;
  const f = await commitNode({ kind: 'frame', x, y, W, H, label: name.trim() || 'Cluster' });
  await tick(); S.sel = new Set([f, ...els.map(e => e.cid)]); await groupSelection(); S.sel = new Set([f]); dirty = true;
  say(`Clustered ${els.length} notes into “${name.trim() || 'Cluster'}”. Signed.`);
}

/* toolbar, palette, keys */
let reactRow = false;
TOOLBAR_HOOKS.push((rs, one, B) => {
  const els = rs.filter(r => r.type !== 'ARROW'); if (!els.length) return '';
  const allVoted = els.every(e => reacted(e.cid, 'vote'));
  let h = B('vote', '●', `Dot vote (D)${S.voteBudget ? ` · ${Math.max(0, S.voteBudget - myVotes())} left` : ''}`, `aria-pressed="${allVoted}"`)
    + B('react', '☺', 'React', `aria-pressed="${reactRow}"`);
  if (reactRow) h += Object.entries(REACTIONS).filter(([k]) => k !== 'vote').map(([k, r]) => B('re:' + k, r.icon, r.name[0].toUpperCase() + r.name.slice(1), `aria-pressed="${els.every(e => reacted(e.cid, k))}"`)).join('');
  if (els.length >= 2) h += '<span class="vs" aria-hidden="true"></span>' + B('grid', '▦', 'Arrange in a grid') + B('sortv', '⇅', 'Sort by votes') + B('cluster', '⬚', 'Cluster into a frame');
  return h;
});
TOOLBAR_ACTIONS.vote = rs => toggleReact('vote', rs);
TOOLBAR_ACTIONS.react = () => { reactRow = !reactRow; };
for (const k of Object.keys(REACTIONS)) TOOLBAR_ACTIONS['re:' + k] = rs => toggleReact(k, rs);
TOOLBAR_ACTIONS.grid = rs => arrangeGrid(rs);
TOOLBAR_ACTIONS.sortv = rs => sortByVotes(rs);
TOOLBAR_ACTIONS.cluster = rs => clusterSel(rs);
const selected = () => [...S.sel].map(c => S.records.get(c)).filter(Boolean);
PALETTE_HOOKS.push(add => {
  add('brainstorm', 'Dot vote on selection', () => toggleReact('vote', selected()), { k: 'D' });
  for (const [k, r] of Object.entries(REACTIONS)) if (k !== 'vote') add('brainstorm', `React · ${r.icon} ${r.name}`, () => toggleReact(k, selected()));
  for (const n of [3, 5, 10, 0]) add('brainstorm', `Votes per person · ${n || 'unlimited'}`, () => { S.voteBudget = n; try { localStorage.setItem('flux:voteBudget', String(n)); } catch {} paintVotes(); say(`Vote budget ${n || 'unlimited'}.`); }, { on: S.voteBudget === n });
  for (const m of [1, 3, 5, 10, 15]) add('brainstorm', `Start timer · ${m} min`, () => startTimer(m));
  if (timerEnd) add('brainstorm', 'Stop timer', () => stopTimer());
  add('brainstorm', 'Arrange selection in a grid', () => arrangeGrid(selected()));
  add('brainstorm', 'Sort selection by votes', () => sortByVotes(selected()));
  add('brainstorm', 'Cluster selection into a frame…', () => clusterSel(selected()));
});
KEY_HOOKS.push((e, c) => { if (c.onCanvas && !c.mod && !e.altKey && c.k === 'd' && S.sel.size){ e.preventDefault(); toggleReact('vote', selected()); return true; } return false; });
$('timer').onclick = () => stopTimer();
$('votes').onclick = async () => {
  const v = await ask('Votes per person', String(S.voteBudget || 0), 'How many dot votes each person gets on this canvas. 0 means unlimited.');
  if (v === null) return; const n = Math.max(0, Math.min(99, parseInt(v, 10) || 0));
  S.voteBudget = n; try { localStorage.setItem('flux:voteBudget', String(n)); } catch {} paintVotes();
};

/* template and example */
TEMPLATES.push({ id: 'brainstorm', name: 'Brainstorm', icon: '✸', blurb: 'A question, sticky notes, dot voting and a timer.', build: async c => {
  const f = await mk('frame', c.x - 480, c.y - 300, 'Brainstorm', { W: 960, H: 600 });
  const q = await mk('card', c.x - 460, c.y - 250, 'How might we …?  (double-click to edit the question)', { W: 420, color: 'violet' });
  const tip = await mk('card', c.x + 20, c.y - 250, 'Double-click empty space for a note · D votes · ⌘K → Start timer', { W: 420 });
  const ns = [];
  for (const [i, col] of ['orange', 'blue', 'green'].entries()) ns.push(await mk('sticky', c.x - 440 + i * 190, c.y - 120, 'Your idea', { color: col }));
  await groupAll([f, q, tip, ...ns]);
} });
EXAMPLES.push({ id: 'offsite', title: 'Team offsite — brainstorm and vote', icon: '✸', blurb: 'Ideas from three people, dot votes, reactions, a cluster and a comment thread.', build: async ([ana, ben, chen]) => {
  const c = center0();
  await by(ana, async () => {
    await mk('frame', c.x - 560, c.y - 330, 'Offsite 2027 · where and what?', { W: 1120, H: 660 });
    await mk('card', c.x - 540, c.y - 280, 'How might we make the offsite restful AND useful for planning next year?', { W: 520, color: 'violet' });
  });
  const ideas = [[ana, 'Cabin by a lake, no laptops before noon', 'green'], [ben, 'City hotel with a good meeting room', 'blue'], [chen, 'Hike + planning walks in pairs', 'green'],
    [ana, 'Cook dinner together on night one', 'orange'], [ben, 'Invite two customers for a morning', 'pink'], [chen, 'Pre-read: 1-page bets from each team', 'blue'],
    [ben, 'Workshop: what to stop doing', 'orange'], [chen, 'Evening: lightning talks, 5 min each', 'pink'], [ana, 'Swim before breakfast (optional!)', 'green']];
  const ids = [];
  for (const [i, [who, text, col]] of ideas.entries()) await by(who, async () => ids.push(await mk('sticky', c.x - 520 + (i % 5) * 200, c.y - 170 + Math.floor(i / 5) * 190, text, { color: col })));
  await tick();
  const vote = async (who, picks) => by(who, async () => { for (const i of picks) await setReact(ids[i], 'vote', true); });
  await vote(ana, [0, 5, 6]); await vote(ben, [1, 5, 4, 6]); await vote(chen, [2, 5, 7, 0]);
  await by(ben, async () => { await setReact(ids[0], 'love', true); await setReact(ids[8], 'q', true); });
  await by(chen, async () => { await setReact(ids[4], 'idea', true); await setReact(ids[1], 'risk', true); });
  await by(ana, async () => {
    const t = await noteOn(ids[5], 'Everyone voted for this one. Who drafts the template?');
    await by(ben, () => replyTo(t, 'I will. One page, three bets, one risk each.'));
  });
} });
