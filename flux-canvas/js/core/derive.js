'use strict';
// @module core/derive — Derived view of the record union: hidden, offsets, groups, edits, threads, styles, tree
// @uses records
/* ---------- derived view of the union ---------- */
function derive(){
  // the history scrubber replays the union as it stood at record order S.histZ
  const all = [...S.records.values()].filter(r => S.histZ == null || r.z <= S.histZ).sort(byZ);
  // permissions (core/permissions): records their author may not make on this canvas take no part in the view
  const P = S.P = policyOf(all), denied = new Set();
  const recs = P.owner ? all.filter(r => permitted(r, P) || !denied.add(r.cid)) : all;
  const byType = {};
  const skipMove = new Set();   // MOVEs summed into a compacted MOVE (features/compaction)
  for (const r of recs) if (r.type === 'MOVE' && r.supersedes) for (const c of r.supersedes) if (supersededBy(r, S.records.get(c))) skipMove.add(c);
  const els = [], negs = new Map(), off = new Map(), groups = [], comments = [], resolves = new Map(), styles = new Map();
  for (const r of recs){
    if (r.neg !== null){
      const t = S.records.get(r.f.R);
      if (t && t.author === r.author && t.type === r.type && t.neg === null) negs.set(t.cid, r.neg); // latest z wins; only the author's own
    } else if (r.type === 'MOVE'){
      if (skipMove.has(r.cid)) continue;
      const o = off.get(r.f.R) || { x: 0, y: 0, w: 0, h: 0 }; o.x += r.dx; o.y += r.dy; o.w += r.dw; o.h += r.dh; off.set(r.f.R, o);
    } else if (r.type === 'GROUP') groups.push(r);
    else if (r.type === 'COMMENT') comments.push(r);
    else if (RECORD_TYPES[r.type]) (byType[r.type] ||= []).push(r);
    else if (r.type === 'RESOLVE') resolves.set(r.f.R, r);   // latest z wins; anyone may resolve or reopen
    else if (r.type === 'STYLE'){
      // restyle: the author's own element only; latest z wins per property
      const t = S.records.get(r.f.R);
      if (t && t.author === r.author){ const o = styles.get(t.cid) || {}; if (r.sw2 != null) o.W = r.sw2; if (r.sc) o.C = r.sc; if (r.sk) o.K = r.sk; if (r.so != null) o.O = r.so; if (r.sl != null) o.L = r.sl; if (r.sm != null) o.M = r.sm; if (r.sy) o.Y = r.sy; if (r.sd) o.D = r.sd; styles.set(t.cid, o); }
    }
    else els.push(r);
  }
  const hidden = new Set(); for (const [k, v] of negs) if (v) hidden.add(k);
  for (const el of els){ const o = styles.get(el.cid) || {}; el.ew = o.W ?? (el.type === 'DRAW' ? el.w : el.sw); el.ec = o.C ?? el.f.C; if (el.type === 'NODE') el.ek = o.K || el.k || 'card';   // features/diagrams checks the kind exists
    el.ez = o.O ?? el.z; el.locked = !!o.L; el.elabel = o.M ?? el.label ?? ''; el.eshape = o.Y || null; el.edash = o.D || null; }
  els.sort((a, b) => a.ez - b.ez || (a.cid < b.cid ? -1 : a.cid > b.cid ? 1 : 0));   // layer order: STYLE O overrides z
  // text edits: an author's TEXT with -E-{cid} supersedes that earlier version (unless the edit itself is revoked)
  const next = new Map(), superseded = new Set();
  for (const r of els) if ((r.type === 'TEXT' || r.type === 'NODE') && r.edits && !hidden.has(r.cid)){
    const o = S.records.get(r.edits);
    if (o && o.type === r.type && o.author === r.author){ next.set(o.cid, r.cid); superseded.add(o.cid); }
  }
  // diagram tree: a NODE's P names its parent (followed through edits); the canvas draws the connector
  const cur = c => { let n = 0; while (next.has(c) && n++ < 1000) c = next.get(c); return c; };
  const kids = new Map();
  for (const r of els) if (r.type === 'NODE' && r.parent && !superseded.has(r.cid)){
    const p = cur(r.parent); if (p === r.cid) continue;
    if (!kids.has(p)) kids.set(p, []); kids.get(p).push(r.cid);
  }
  // comment threads: a root plus replies (RE), resolved state from the latest RESOLVE
  const threads = new Map();
  for (const c of comments) if (!c.re) threads.set(c.cid, { root: c, replies: [], resolved: !!resolves.get(c.cid)?.state, by: resolves.get(c.cid)?.author });
  for (const c of comments) if (c.re && threads.has(c.re)) threads.get(c.re).replies.push(c);
  const groupOf = new Map();
  for (const g of groups) if (!hidden.has(g.cid)) for (const m of g.members) groupOf.set(m, g.cid);
  S.D = { els, hidden, off, groupOf, groups, next, superseded, threads, kids, denied };
  runHooks(DERIVE_HOOKS, S.D, byType);
  for (const c of [...S.sel]) if (!S.records.has(c) || (hidden.has(c) && !S.showHidden)) S.sel.delete(c);
}
// a node's branch: every node below it in the tree (through P links), visible or not revoked
function descendants(cid){
  const out = [], seen = new Set([cid]), q = [cid];
  while (q.length){ for (const k of S.D.kids.get(q.shift()) || []){ if (seen.has(k)) continue; seen.add(k); const el = S.records.get(k); if (el && !S.D.hidden.has(k)){ out.push(k); q.push(k); } } }
  return out;
}
let derivePending = false;
// While a canvas or file loads (S.bulk > 0), derive once at the end instead of after every record (audit P1).
async function bulk(fn){ S.bulk = (S.bulk || 0) + 1; try { return await fn(); } finally { if (!--S.bulk) changed(); } }
function changed(){ if (S.bulk) return; if (!derivePending){ derivePending = true; queueMicrotask(() => { derivePending = false; derive(); runHooks(CHANGE_HOOKS); dirty = true; }); } }

