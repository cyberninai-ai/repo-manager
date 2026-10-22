'use strict';
// @module features/replay — Time-travel replay: the canvas plays back how it was made, in its real rhythm, compressed. Every
// record is signed, ordered and kept, so the session is its own recording: notes appear in order, comments attach, votes and
// stances land, decisions are taken, and a marker shows who did each step. Replay all of it or only what you care about
// (decisions and approvals, one person, the last hour), jump between work sessions and to the moments decisions were made.
// Read-only while it runs (identity refuses to sign during history).
// @uses ui/ledger (activityText), ui/panels (badges), derive (S.histZ)
const RP = { recs: null, i: 0, timer: 0, playing: false, speed: 'fit', scope: 'all', who: null, cur: null };
const RP_SCOPES = { all: 'Everything', decisions: 'Decisions, approvals, stances', person: 'One person', hour: 'The last hour' };
const RP_MOMENTS = new Set(['DECISION', 'APPROVE', 'DELIVER', 'REVEAL', 'CLOSE', 'SETTLE', 'SIGNOFF', 'CHECK']);
const inScope = r => RP.scope === 'all' || RP.scope === 'decisions' && (RP_MOMENTS.has(r.type) || r.type === 'STANCE') || RP.scope === 'person' && samePerson(r.author, RP.who) || RP.scope === 'hour' && r.t > Date.now() - 36e5;
// work sessions: runs of records without a gap longer than 20 minutes
function sessionsOf(recs){ const out = []; let cur = null; for (const [i, r] of recs.entries()){ if (!cur || r.t - recs[i - 1].t > 20 * 6e4){ cur = { from: i, to: i, people: new Set() }; out.push(cur); } cur.to = i; cur.people.add(personOf(r.author)); } return out; }
function openHistory(){
  RP.recs = [...S.records.values()].filter(r => !r.raw.startsWith('PROFILE')).sort(byZ);
  if (!RP.recs.length){ toast('Nothing to replay yet.'); return; }
  closePanel(false);
  const h = $('history'), sess = sessionsOf(RP.recs), ppl = [...new Set(RP.recs.map(r => personOf(r.author)))];
  h.innerHTML = `<b>Replay</b> <span class="ro">read-only</span>
    <button class="ibtn" id="histPlay" aria-label="Play or pause the replay">${ic('play')}</button>
    <input type="range" id="histRange" min="0" max="${RP.recs.length}" step="1" value="${RP.recs.length}" aria-label="Replay position">
    <span id="histLabel"></span>
    <label class="sr" for="rpScope">Replay what</label><select id="rpScope">${Object.entries(RP_SCOPES).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
    <label class="sr" for="rpWho">Whose work</label><select id="rpWho" hidden>${ppl.map(p => `<option value="${esc(p)}">${esc(whoName(p))}</option>`).join('')}</select>
    <label class="sr" for="rpSpeed">Speed</label><select id="rpSpeed"><option value="fit">Each session in 30 s</option><option value="4">4×</option><option value="16">16×</option><option value="60">60×</option><option value="step">One step a second</option></select>
    <button class="btn" id="histNow">Back to now</button>
    <div class="rp-marks" role="group" aria-label="Sessions and moments">${sess.length > 1 ? sess.map((s, i) => `<button class="pill" data-jump="${s.from}">Session ${i + 1} · ${when(RP.recs[s.from].t)} · ${plural(s.to - s.from + 1, 'change')}</button>`).join('') : ''}
      ${RP.recs.map((r, i) => RP_MOMENTS.has(r.type) && r.neg === null && r.type !== 'CHECK' ? `<button class="pill acc" data-jump="${i}">${{ DECISION: '⚑', APPROVE: '✓', DELIVER: '↗', REVEAL: '🔓', CLOSE: '◎', SETTLE: '💰', SIGNOFF: '✓' }[r.type]} ${esc(r.type === 'DECISION' ? r.text.slice(0, 28) : activityText(r).slice(0, 28))}</button>` : '').join('')}</div>`;
  $('histRange').addEventListener('input', e => { stopPlay(); setHist(+e.target.value); });
  h.hidden = false; document.body.classList.add('history');
  setHist(RP.recs.length); setTimeout(() => $('histRange').focus(), 0);
  say('Replay. Press play to watch the canvas being made, or move the slider. Nothing can change until you go back to now.');
}
function setHist(i){
  i = Math.max(0, Math.min(RP.recs.length, i)); RP.i = i;
  S.histZ = i >= RP.recs.length ? null : i === 0 ? -1e15 : RP.recs[i - 1].z;
  const r = RP.cur = i > 0 ? RP.recs[i - 1] : null;
  $('histRange').value = i;
  $('histLabel').textContent = i >= RP.recs.length ? `now · ${plural(RP.recs.length, 'change')}` : r ? `${i}/${RP.recs.length} · ${whoName(r.author)} ${activityText(r)} · ${new Date(r.t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'before the first change';
  $('histRange').setAttribute('aria-valuetext', $('histLabel').textContent);
  S.sel.clear(); changed();
}
function stopPlay(){ clearTimeout(RP.timer); RP.playing = false; const b = $('histPlay'); if (b) b.innerHTML = ic('play'); }
// the next step in scope, and how long to wait for it: real gaps, compressed by the speed (long pauses capped)
function nextInScope(i){ for (let j = i; j < RP.recs.length; j++) if (inScope(RP.recs[j])) return j + 1; return RP.recs.length; }
function delayTo(a, b){
  if (RP.speed === 'step') return 1000;
  const gap = Math.max(0, (RP.recs[b - 1]?.t || 0) - (RP.recs[a - 1]?.t || RP.recs[b - 1]?.t || 0));
  const s = sessionsOf(RP.recs).find(s => s.from <= b - 1 && b - 1 <= s.to), span = s ? RP.recs[s.to].t - RP.recs[s.from].t : 0;
  const k = RP.speed === 'fit' ? Math.max(1, span / 30000) : +RP.speed;
  return Math.max(40, Math.min(1500, gap / k));
}
function play(){
  if (RP.playing) return stopPlay();
  if (RP.i >= RP.recs.length) setHist(0);
  RP.playing = true; $('histPlay').innerHTML = '<span class="gl">❚❚</span>';
  const step = () => { const n = nextInScope(RP.i); if (n >= RP.recs.length && RP.i >= RP.recs.length){ stopPlay(); return; } const wait = delayTo(RP.i, n); RP.timer = setTimeout(() => { setHist(n); if (n >= RP.recs.length) stopPlay(); else step(); }, wait); };
  step();
}
function closeHistory(){ stopPlay(); S.histZ = null; RP.recs = null; RP.cur = null; $('history').hidden = true; document.body.classList.remove('history'); changed(); cv.focus({ preventScroll: true }); say('Back to now.'); }
$('history').addEventListener('change', e => {
  if (e.target.id === 'rpScope'){ RP.scope = e.target.value; $('rpWho').hidden = RP.scope !== 'person'; if (RP.scope === 'person') RP.who = $('rpWho').value; }
  if (e.target.id === 'rpWho') RP.who = e.target.value;
  if (e.target.id === 'rpSpeed') RP.speed = e.target.value;
});
$('history').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'histPlay') return play();
  if (b.id === 'histNow') return closeHistory();
  if (b.dataset.jump){ stopPlay(); setHist(+b.dataset.jump + 1); const el = RP.cur && (S.records.get(RP.cur.f.R) || RP.cur); if (el && box(el)) ensureVisible(el); }
});
$('history').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') closeHistory();
  if (e.key === ' ' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT'){ e.preventDefault(); play(); }
});
// the step being replayed: a marker in its author's colour on what they touched, with what they did
RENDER_HOOKS.screen.push(() => {
  const r = RP.cur; if (!r || S.histZ == null) return;
  const el = r.type === 'MOVE' || r.type === 'STYLE' || r.type === 'STANCE' || r.type === 'TASK' || r.type === 'CLAIM' || r.type === 'EVIDENCE' || r.type === 'CHECK' || r.neg !== null ? current(r.f.R) : ELEMENT.has(r.type) ? r : r.on ? current(r.on) : null;
  const sb = el && screenBox(el); if (!sb) return;
  ctx.save(); ctx.strokeStyle = authorColor(r.author); ctx.lineWidth = 3; rr(ctx, sb.x - 6, sb.y - 6, sb.w + 12, sb.h + 12, 10); ctx.stroke(); ctx.restore();
  drawBadge(sb.x - 6, sb.y - 30, `${whoName(r.author)} ${activityText(r)}`.slice(0, 60), 'ink');
});
KEY_HOOKS.push((e, c) => { if (c.onCanvas && !c.mod && !e.altKey && e.key === 'H' && e.shiftKey){ e.preventDefault(); openHistory(); return true; } return false; });
PALETTE_HOOKS.push(add => add('team', 'Replay: watch how the canvas was made', openHistory, { k: '⇧H' }));
registerFeature({ id: 'replay', name: 'Replay', group: 'remember', icon: 'play', records: [],
  blurb: 'Watch the canvas being made, in its rhythm: whole sessions, one person, or just the decisions', open: openHistory });
