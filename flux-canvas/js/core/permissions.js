'use strict';
// @module core/permissions — Owned canvases and GRANT permissions (audit S2), enforced in derive() and before signing
// @uses hooks, encoding, state
// OWNER-I-{owner}-R-{canvas}-K-{nonce}-Z-T-SIG   valid only if canvas = ownedId(owner, nonce): the id commits to the key
// GRANT-I-{owner}-R-{canvas}-A-{author|all}-P-{draw_comment_move_audit|none}-Z-T-SIG   owner only; latest z per A wins
// A canvas without an OWNER record (older canvases, ids typed by hand) stays open: everyone may do everything.
// Grants apply to everything an author signed, not only later records: Z is signer-chosen, so "before the grant" can't be trusted.
const PERMS = ['draw', 'comment', 'move', 'audit'];
const PERM_NAMES = { draw: 'Draw and write', comment: 'Comment, vote, react', move: 'Move others’ work', audit: 'Audit and sign off' };
async function ownedId(owner, nonce){
  return 'o' + b32(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(`flux-canvas:${owner}:${nonce}`)))).slice(0, 15);
}
registerRecord('OWNER', {
  parse(r, f){ if (!f.R || !f.K) throw Error('owner'); r.nonce = f.K; },
  check: async r => r.f.R === await ownedId(r.author, r.nonce),
});
registerRecord('GRANT', {
  parse(r, f){ if (!f.R || !f.A || !f.P) throw Error('grant'); r.who = f.A; r.perms = new Set(f.P === 'none' ? [] : f.P.split('_').filter(p => PERMS.includes(p))); },
});
// what a record needs: by type, plus moving someone else's element needs "move"
const PERM_OF = { COMMENT: 'comment', RESOLVE: 'comment', REACT: 'comment', AUDIT: 'audit', SIGNOFF: 'audit', OWNER: null, GRANT: null };
function permFor(type, author, target){
  if (type === 'MOVE'){ const t = target && S.records.get(target); return t && t.author !== author ? 'move' : 'draw'; }
  return type in PERM_OF ? PERM_OF[type] : 'draw';
}
function policyOf(recs){
  let owner = null; const grants = new Map();
  for (const r of recs) if (r.type === 'OWNER' && r.f.R === canvasId && r.neg === null){ owner = r.author; break; }
  if (owner) for (const r of recs) if (r.type === 'GRANT' && r.author === owner && r.f.R === canvasId && r.neg === null) grants.set(r.who, r);   // z order: latest wins
  const can = (author, perm) => {
    if (!owner || author === owner || perm === null) return true;
    if (perm === 'owner') return false;
    const g = grants.get(author) || grants.get('all');
    return !g || g.perms.has(perm);
  };
  return { owner, grants, can };
}
function permitted(r, P){
  if (!P.owner) return true;
  if (r.neg !== null){ const t = S.records.get(r.f.R); return !!t && t.author === r.author; }   // you may always take back your own work
  return P.can(r.author, permFor(r.type, r.author, r.f.R));
}
// refuse to sign what the canvas would not show, instead of signing it and silently hiding it
function checkMayDo(action, pairs){
  const P = S.P; if (!P?.owner || !S.me) return;
  const f = Object.fromEntries(pairs), perm = 'N' in f ? null : permFor(action, S.me.id, f.R);
  if (P.can(S.me.id, perm)) return;
  toast(perm === 'owner' ? 'Only the canvas owner can do that.' : `The owner hasn’t given you “${PERM_NAMES[perm] || perm}” on this canvas.`);
  const e = new Error('not permitted'); e.name = 'NotPermitted'; throw e;
}
// A new canvas you own: its id is derived from your key and a nonce, and the OWNER record proves it.
async function ownedCanvasId(){
  const nonce = b32(crypto.getRandomValues(new Uint8Array(10)));
  return { nonce, id: await ownedId(S.me.id, nonce) };
}
async function claimCanvas(nonce){
  return publish(await signed('OWNER', [['I', S.me.id], ['R', canvasId], ['K', nonce], ['Z', ++S.lamport], ['T', Date.now()]]));
}
async function grant(who, perms){
  return publish(await signed('GRANT', [['I', S.me.id], ['R', canvasId], ['A', who], ['P', perms.length ? perms.join('_') : 'none'], ['Z', ++S.lamport], ['T', Date.now()]]));
}
