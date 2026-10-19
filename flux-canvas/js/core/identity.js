'use strict';
// @module core/identity — Keys (Ed25519, ECDSA fallback), storage helper, signature verify, Auth Kit signing
// @uses encoding, grammar
/* =====================================================================
   Identity · Auth Kit
   ===================================================================== */
const ALG = { ed: { name: 'Ed25519' }, ec: { name: 'ECDSA', namedCurve: 'P-256' } };
const SIGALG = { ed: { name: 'Ed25519' }, ec: { name: 'ECDSA', hash: 'SHA-256' } };
const store = {
  get(k, s){ try { return (s ? sessionStorage : localStorage).getItem(k); } catch { return null; } },
  set(k, v, s){ try { (s ? sessionStorage : localStorage).setItem(k, v); return true; } catch { return false; } },
};
async function newIdentity(){
  let alg = 'ed', kp;
  try { kp = await crypto.subtle.generateKey(ALG.ed, true, ['sign', 'verify']); }
  catch { alg = 'ec'; kp = await crypto.subtle.generateKey(ALG.ec, true, ['sign', 'verify']); }
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { alg, id: alg + b58enc(raw), priv: kp.privateKey, jwk };
}
async function restoreIdentity(o){
  const priv = await crypto.subtle.importKey('jwk', o.jwk, ALG[o.alg], false, ['sign']);
  return { alg: o.alg, id: o.id, priv, jwk: o.jwk };
}
async function loadIdentity(){
  for (const sess of [true, false]){
    const s = store.get('flux:identity', sess);
    if (s) try { return await restoreIdentity(JSON.parse(s)); } catch {}
  }
  const me = await newIdentity();
  store.set('flux:identity', JSON.stringify({ alg: me.alg, id: me.id, jwk: me.jwk }));
  return me;
}
const pubCache = new Map();
function pubKey(id){
  if (!pubCache.has(id)){
    const alg = id.slice(0, 2);
    pubCache.set(id, ALG[alg] ? crypto.subtle.importKey('raw', b58dec(id.slice(2)), ALG[alg], false, ['verify']).catch(() => null) : Promise.resolve(null));
  }
  return pubCache.get(id);
}
async function verifyRaw(node){
  const id = node.fields.I, sig = node.fields.SIG;
  if (typeof id !== 'string' || typeof sig !== 'string' || node.order[node.order.length - 1] !== 'SIG') return false;
  try {
    const key = await pubKey(id); if (!key) return false;
    return await crypto.subtle.verify(SIGALG[id.slice(0, 2)], key, b58dec(sig), te.encode(payloadOf(node.raw)));
  } catch { return false; }
}
const auth = { until: 0, count: 0 };
const AUTH_IDLE = 5000;
async function signed(action, pairs){
  if (S.histZ != null){ toast('Viewing history: go back to now to make changes.'); const e = new Error('history view'); e.name = 'HistoryView'; throw e; }
  auth.until = Date.now() + AUTH_IDLE; auth.count++; paintAuth();
  const payload = build(action, pairs);
  const sig = new Uint8Array(await crypto.subtle.sign(SIGALG[S.me.alg], S.me.priv, te.encode(payload)));
  return payload + '-SIG-' + b58enc(sig);
}

