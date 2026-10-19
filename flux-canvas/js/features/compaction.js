'use strict';
// @module features/compaction — Compact your own history (audit D1) and rebuild undo after a reload (audit D3)
// @uses records (dropSuperseded), commands, db
// What can go, without changing what anyone sees:
//   · your MOVEs on one element → one signed MOVE with their sum and X = the CIDs it replaces (peers drop those too)
//   · your STYLE records whose every field a later STYLE of yours overrides (latest wins, so they no longer count)
//   · your revoke/restore records on an element, except the latest
// The history scrubber can no longer replay the steps that were folded together.
const STYLE_FIELDS = { W: 'sw2', C: 'sc', K: 'sk', O: 'so', L: 'sl', M: 'sm', Y: 'sy', D: 'sd' };
function compactionPlan(){
  const mine = [...S.records.values()].filter(r => r.author === S.me?.id).sort(byZ);
  const moves = new Map(), lastField = new Map(), lastNeg = new Map();
  for (const r of mine){
    if (r.neg !== null) lastNeg.set(r.f.R + r.type, r.cid);
    else if (r.type === 'MOVE') (moves.get(r.f.R) || moves.set(r.f.R, []).get(r.f.R)).push(r);
    else if (r.type === 'STYLE') for (const [k, p] of Object.entries(STYLE_FIELDS)) if (r[p] != null) lastField.set(r.f.R + '|' + k, r.cid);
  }
  const drop = [];
  for (const r of mine){
    if (r.neg !== null && lastNeg.get(r.f.R + r.type) !== r.cid) drop.push(r.cid);
    if (r.type === 'STYLE' && Object.entries(STYLE_FIELDS).every(([k, p]) => r[p] == null || lastField.get(r.f.R + '|' + k) !== r.cid)) drop.push(r.cid);
  }
  const fold = [...moves].filter(([, l]) => l.length > 1);
  return { drop, fold, saves: drop.length + fold.reduce((s, [, l]) => s + l.length - 1, 0) };
}
async function compactHistory(){
  const { drop, fold, saves } = compactionPlan();
  if (!saves){ toast('Nothing to compact: your history is already as small as it gets.'); return 0; }
  for (const [target, list] of fold){
    const sum = k => list.reduce((s, m) => s + m[k], 0), dw = sum('dw'), dh = sum('dh');
    await publish(await signed('MOVE', [['I', S.me.id], ['R', target], ['DX', encInt(sum('dx'))], ['DY', encInt(sum('dy'))],
      ...(dw || dh ? [['DW', encInt(dw)], ['DH', encInt(dh)]] : []), ['X', list.map(m => m.cid).join('_')], ['Z', ++S.lamport], ['T', Date.now()]]));
  }
  for (const c of drop) S.records.delete(c);
  await dbDeleteRecords(canvasId, drop);
  if (!DB.ok) save();
  changed(); paintLedger();
  toast(`Tidied up your history (${saves} fewer steps). Nothing on the canvas changed.`);
  return saves;
}
PALETTE_HOOKS.push(add => add('canvas', 'Compact my history', compactHistory));

// Undo after a reload: rebuild the stack from your own records (newest last), so ⌘Z keeps working across sessions.
function rebuildHistory(limit = 200){
  if (!S.me) return;
  const mine = [...S.records.values()].filter(r => r.author === S.me.id).sort(byZ), hist = [], style = new Map();
  const base = el => el ? { W: el.type === 'DRAW' ? el.w : el.sw, C: el.f.C, K: el.k, O: el.z, L: false, M: el.label ?? '', Y: 'curve', D: 'solid' } : {};
  for (const r of mine){
    if (r.neg !== null){ hist.push(r.neg ? { kind: 'revoke', cids: [r.f.R] } : { kind: 'create', cid: r.f.R }); continue; }
    if (ELEMENT.has(r.type) || r.type === 'GROUP'){ hist.push({ kind: 'create', cid: r.cid }); continue; }
    if (r.type === 'MOVE'){
      const prev = hist[hist.length - 1];
      if (prev?.kind === 'move' && prev.t === r.t && prev.dx === r.dx && prev.dy === r.dy && !(prev.dw || prev.dh || r.dw || r.dh)) prev.targets.push(r.f.R);   // one drag of several elements
      else hist.push({ kind: 'move', targets: [r.f.R], dx: r.dx, dy: r.dy, dw: r.dw, dh: r.dh, t: r.t });
      continue;
    }
    if (r.type === 'STYLE'){
      const cur = style.get(r.f.R) || base(S.records.get(r.f.R)), before = {}, after = {};
      for (const [k, p] of Object.entries(STYLE_FIELDS)) if (r[p] != null){ before[k] = cur[k]; after[k] = r[p]; cur[k] = r[p]; }
      style.set(r.f.R, cur); hist.push({ kind: 'style', items: [{ cid: r.f.R, before, after }] });
    }
  }
  S.hist = hist.slice(-limit); S.redo = [];
}
