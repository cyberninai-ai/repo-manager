'use strict';
// @module features/rounds — Silent-first rounds (brainwriting, nominal group technique): for a few minutes everyone writes
// without seeing anyone else's ideas; at the end every idea opens at the same moment. While a round runs, the notes you add are
// sealed (features/seal), so nobody can read them early: not the round's starter, not the relay, not a curious participant.
// A blind stance round does the same for stances on one item. Sealing is the primitive; the round is the ritual around it.
// @uses features/seal, features/stances, records, ui/hub (strip), ui/form
// ROUND-I-R-{nonce}-M-{prompt}-E-{ends at, ms}-A-{participants _|all}-K-{ideas|stances}-ON-{item for a stance round|0}[-P-{the round}]-Z-T-SIG
//   a round is its first record (seals name its CID); only its starter can change its end, with a ROUND whose P names it
registerRecord('ROUND', { parse(r, f){ must(f.R && /^\d{1,16}$/.test(f.E || '') && ['ideas', 'stances'].includes(f.K), 'round'); r.prompt = decTxt(f.M || ''); r.end = +f.E;
  r.of = f.P && f.P !== '0' ? f.P : null; must(!r.of || isCid(r.of), 'round ref'); must(!f.A || f.A === 'all' || keyList(f.A), 'participants'); must(!f.ON || f.ON === '0' || isCid(f.ON), 'round item');
  r.who = f.A && f.A !== 'all' ? f.A.split('_').filter(Boolean) : null; r.mode = f.K; r.on = f.ON && f.ON !== '0' ? f.ON : null; } });
PERM_OF.ROUND = 'draw';

DERIVE_HOOKS.push((D, by) => {
  const rounds = new Map();
  const rs = (by.ROUND || []).filter(r => r.neg === null && !D.hidden.has(r.cid));
  for (const r of rs) if (!r.of) rounds.set(r.cid, { first: r, cur: r, id: r.cid });
  for (const r of rs) if (r.of){ const o = rounds.get(r.of); if (o && samePerson(r.author, o.first.author) && byZ(o.cur, r) < 0) o.cur = r; }   // only the starter moves its end
  D.rounds = rounds;
});
// a sealed idea opens when its round ends, wherever the round's end moved to
SEAL_CLOCKS.push(s => { if (!s.round) return undefined; const o = S.D.rounds?.get(s.round); return o ? o.cur.end : undefined; });
const inRound = (o, id = S.me?.id) => !o.cur.who || o.cur.who.some(k => samePerson(k, id));
function activeRound(){ for (const o of S.D.rounds?.values() || []) if (Date.now() < o.cur.end && inRound(o)) return o; return null; }
const lastRound = () => [...(S.D.rounds?.values() || [])].sort((a, b) => b.first.z - a.first.z)[0] || null;
function roundSeals(nonce){ return [...(S.D.seals?.values() || [])].filter(x => x.s.round === nonce); }

async function startRound({ prompt, minutes = 5, who = null, mode = 'ideas', on = null }){
  const R = b32(crypto.getRandomValues(new Uint8Array(8))), end = Date.now() + Math.max(.05, minutes) * 6e4;
  const cid = await publish(await signed('ROUND', [['I', S.me.id], ['R', R], ['M', encTxt(prompt)], ['E', Math.round(end)], ['A', who?.length ? who.join('_') : 'all'], ['K', mode], ['ON', on || '0'], ['Z', ++S.lamport], ['T', Date.now()]]));
  post({ roundStart: { R } });
  return cid;
}
async function endRound(o){
  const c = o.cur;
  await publish(await signed('ROUND', [['I', S.me.id], ['R', c.f.R], ['M', c.f.M || ''], ['E', Date.now()], ['A', c.f.A], ['K', c.mode], ['ON', c.f.ON || '0'], ['P', o.id], ['Z', ++S.lamport], ['T', Date.now()]]));
}
WIRE_HOOKS.roundStart = () => setTimeout(() => { const o = activeRound(); if (o) toast(`Silent round: ${o.cur.prompt || 'write your ideas'} · what you add stays sealed until it ends`); }, 400);

const toldRounds = new Set();
// while a round runs, a note you create is sealed instead of published; edits and everything else go through as usual
PUBLISH_FILTERS.push(async (raw, blobs) => {
  const o = activeRound(); if (!o || o.cur.mode !== 'ideas' || !/^(NODE|TEXT)-/.test(raw) || Object.keys(blobs).length) return undefined;
  const node = parse(raw); if (node.fields.E || !samePerson(node.fields.I, S.me.id)) return undefined;
  const cid = await sealRecord(raw, { kind: 'note', round: o.id, at: o.cur.end, x: decInt(node.fields.X), y: decInt(node.fields.Y) });
  if (!toldRounds.has(o.id)){ toldRounds.add(o.id); toast('Sealed until the round ends. Nobody can read it before then.'); }
  return cid;
});
// a blind stance: sealed until the round ends, then every stance opens together
async function blindStance(o, stance){
  const raw = await signed('STANCE', [['I', S.me.id], ['R', o.cur.on], ['S', stance], ['M', ''], ['Z', ++S.lamport], ['T', Date.now()]]);
  await sealRecord(raw, { kind: 'stance', round: o.id, at: o.cur.end });
  toast(`${STANCES[stance].name}: sealed until the round ends.`);
}

/* the strip: the prompt, the time left, how many ideas are sealed (never whose content) */
STRIP.push(() => {
  const o = activeRound() || (() => { const l = lastRound(); return l && Date.now() - l.cur.end < 90000 ? l : null; })(); if (!o) return '';
  const seals = roundSeals(o.id), mine = seals.filter(x => samePerson(x.s.author, S.me.id)).length, left = o.cur.end - Date.now();
  if (left > 0){
    const who = new Set(seals.map(x => personOf(x.s.author))).size;
    return `<span class="sp sealed">${ic('lock')}<b>Silent round</b><span>${esc(o.cur.prompt.slice(0, 48))}</span><span class="t">${clock(left)}</span><span>${o.cur.mode === 'stances' ? `${seals.length} sealed stance${seals.length === 1 ? '' : 's'}` : `you ${mine} · room ${seals.length} from ${who}`}</span>
      ${o.cur.mode === 'stances' ? Object.entries(STANCES).slice(0, 4).map(([k, s]) => `<button class="btn" data-strip="bs-${k}" aria-label="${s.name}, sealed">${s.mark}</button>`).join('') : '<button class="btn" data-strip="idea">Add idea</button>'}
      ${samePerson(o.first.author, S.me.id) ? '<button class="btn" data-strip="endround">End now</button>' : ''}</span>`;
  }
  const open = seals.filter(sealOpen).length, owed = [...new Set(seals.filter(x => !sealOpen(x)).map(x => personOf(x.s.author)))];
  return `<span class="sp">${ic('sparkle')}<b>Round revealed</b><span>${open} of ${seals.length} opened together${owed.length ? ` · waiting for ${owed.map(whoName).join(', ')} to reveal` : ''}</span></span>`;
});
STRIP_ACTIONS.idea = async () => {
  const o = activeRound(); if (!o) return;
  const text = await ask(o.cur.prompt || 'Your idea', '', 'Sealed until the round ends: nobody sees it before then, and you can’t change it after.');
  if (!text?.trim()) return;
  const n = roundSeals(o.id).filter(x => samePerson(x.s.author, S.me.id)).length, c = { x: S.view.x + innerWidth / 2 / S.view.zoom, y: S.view.y + innerHeight / 2 / S.view.zoom };
  await commitNode({ kind: 'sticky', x: c.x - 300 + (n % 4) * 170, y: c.y - 120 + Math.floor(n / 4) * 170, label: text.trim() });
};
STRIP_ACTIONS.endround = () => { const o = activeRound(); if (o) endRound(o); };
for (const k of Object.keys(STANCES)) STRIP_ACTIONS['bs-' + k] = () => { const o = activeRound(); if (o?.cur.mode === 'stances') blindStance(o, k); };

async function roundForm(){
  const sel = [...S.sel].map(c => S.records.get(c)).find(r => r && r.type !== 'DRAW' && r.type !== 'ARROW');
  const v = await formDialog('Start a silent round', [
    { id: 'mode', label: 'Kind of round', type: 'select', value: 'ideas', options: [['ideas', 'Ideas: everyone writes, then all ideas open together'], ...(sel ? [['stances', `Blind stances on “${elTitle(sel.cid).slice(0, 40)}”`]] : [])] },
    { id: 'prompt', label: 'The question', type: 'text', value: sel ? `Where do you stand on: ${elTitle(sel.cid)}` : 'How might we…' },
    { id: 'min', label: 'Minutes', type: 'number', value: 5, min: 1, max: 60 },
    { id: 'who', label: 'Who takes part', type: 'people', value: people(), options: people(), hint: 'Everyone checked writes in silence; the round ends for all at once.' },
  ], { ok: 'Start the round', why: 'Nobody sees anyone else’s ideas until the time is up. It stops the first idea or the loudest voice from steering the rest.' });
  if (!v || !v.prompt.trim()) return;
  const all = v.who.length >= people().length;
  await startRound({ prompt: v.prompt.trim(), minutes: v.min || 5, who: all ? null : v.who, mode: v.mode, on: v.mode === 'stances' ? sel.cid : null });
  toast('Round started. Notes you add now are sealed.');
}
registerFeature({ id: 'rounds', name: 'Silent round', group: 'meet', icon: 'lock', records: ['ROUND'],
  blurb: 'Everyone writes without seeing the others; all ideas open at the same moment',
  status: () => { const o = activeRound(); return o ? `${clock(o.cur.end - Date.now())} left` : ''; },
  open: () => { const o = activeRound(); if (o){ toast(`A round is running: ${clock(o.cur.end - Date.now())} left`); return; } roundForm(); } });
