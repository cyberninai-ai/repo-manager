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
// Audit S1: the private key is generated (or imported) non-extractable and kept as a CryptoKey in IndexedDB, so no script
// can read its bytes. Only where IndexedDB is missing (sandboxed frames) does it fall back to an extractable JWK.
async function newIdentity(extractable = false){
  let alg = 'ed', kp;
  try { kp = await crypto.subtle.generateKey(ALG.ed, extractable, ['sign', 'verify']); }
  catch { alg = 'ec'; kp = await crypto.subtle.generateKey(ALG.ec, extractable, ['sign', 'verify']); }
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));   // public keys are always exportable
  return { alg, id: alg + b58enc(raw), priv: kp.privateKey, jwk: extractable ? await crypto.subtle.exportKey('jwk', kp.privateKey) : null };
}
async function restoreIdentity(o){
  const priv = await crypto.subtle.importKey('jwk', o.jwk, ALG[o.alg], false, ['sign']);
  return { alg: o.alg, id: o.id, priv, jwk: null };
}
const keyRecord = me => ({ alg: me.alg, id: me.id, priv: me.priv });
async function keepIdentity(me, name){
  if (await dbPut('keys', keyRecord(me), name)) return true;
  return false;
}
async function loadIdentity(){
  // a separate identity for this tab ("New identity for this tab")
  const tab = store.get('flux:tabKey', true);
  if (tab){ const k = await dbGet('keys', tab); if (k?.priv) return k; }
  const sess = store.get('flux:identity', true);
  if (sess) try { return await restoreIdentity(JSON.parse(sess)); } catch {}
  const k = await dbGet('keys', 'me');
  if (k?.priv) return k;
  // migrate a key from older versions: import it non-extractable, then delete the readable copy
  const legacy = store.get('flux:identity');
  if (legacy) try {
    const me = await restoreIdentity(JSON.parse(legacy));
    if (await keepIdentity(me, 'me')) try { localStorage.removeItem('flux:identity'); } catch {}
    return me;
  } catch {}
  if (await dbReady){ const me = await newIdentity(false); await keepIdentity(me, 'me'); return me; }
  const me = await newIdentity(true);
  store.set('flux:identity', JSON.stringify({ alg: me.alg, id: me.id, jwk: me.jwk }));
  return me;
}
async function newTabIdentity(){
  if (await dbReady){
    const me = await newIdentity(false), name = 'tab:' + me.id.slice(2, 14);
    if (await keepIdentity(me, name)){ store.set('flux:tabKey', name, true); return me; }
  }
  const me = await newIdentity(true);
  store.set('flux:identity', JSON.stringify({ alg: me.alg, id: me.id, jwk: me.jwk }), true);
  return me;
}
const pubCache = new Map();
let edNative = null;   // does this browser's WebCrypto verify Ed25519? (null until first asked)
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
  const alg = id.slice(0, 2), msg = te.encode(payloadOf(node.raw));
  try {
    if (alg === 'ed' && (edNative === false || S.jsVerify)) return await ED.verify(b58dec(sig), msg, b58dec(id.slice(2)));
    const key = await pubKey(id);
    if (!key){
      if (alg !== 'ed') return false;
      edNative = false;   // audit S4: no Ed25519 in this WebCrypto; verify in JS instead of rejecting
      return await ED.verify(b58dec(sig), msg, b58dec(id.slice(2)));
    }
    if (alg === 'ed') edNative = true;
    return await crypto.subtle.verify(SIGALG[alg], key, b58dec(sig), msg);
  } catch { return false; }
}
const auth = { until: 0, count: 0 };
const AUTH_IDLE = 5000;
async function signed(action, pairs){
  if (S.histZ != null){ toast('Viewing history: go back to now to make changes.'); const e = new Error('history view'); e.name = 'HistoryView'; throw e; }
  checkMayDo(action, pairs);
  auth.until = Date.now() + AUTH_IDLE; auth.count++; paintAuth();
  const payload = build(action, pairs);
  const sig = new Uint8Array(await crypto.subtle.sign(SIGALG[S.me.alg], S.me.priv, te.encode(payload)));
  return payload + '-SIG-' + b58enc(sig);
}

