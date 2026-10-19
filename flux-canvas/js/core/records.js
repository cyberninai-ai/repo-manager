'use strict';
// @module core/records — Record ingest: parse, verify, address, union-merge; publish; channel wire
// @uses blobs, grammar, identity
function toRec(node, cid){
  const f = node.fields, r = { cid, raw: node.raw, type: node.action, f, author: f.I, z: decInt(f.Z), t: f.T ? +f.T : 0, neg: null, size: node.raw.length };
  if ('N' in f){ if (f.N !== '0' && f.N !== '1' || !f.R) throw Error('neg'); r.neg = f.N === '1'; return r; }
  switch (r.type){
    case 'DRAW': if (!f.R || !f.C) throw Error('draw'); r.w = Math.max(1, decInt(f.W)); break;
    case 'SHAPE': r.k = f.K; r.x = decInt(f.X); r.y = decInt(f.Y); r.bw = decInt(f.W); r.bh = decInt(f.H); r.sw = Math.max(1, decInt(f.S)); break;
    case 'TEXT': r.x = decInt(f.X); r.y = decInt(f.Y); r.text = decTxt(f.M || ''); r.fs = Math.max(4, decInt(f.S)); r.edits = f.E || null; break;
    case 'COMMENT': r.on = f.ON && f.ON !== '0' ? f.ON : null; r.re = f.RE && f.RE !== '0' ? f.RE : null; r.x = decInt(f.X); r.y = decInt(f.Y); r.text = decTxt(f.M || ''); break;
    case 'RESOLVE': if (!f.R) throw Error('resolve'); r.state = f.S === '1'; break;
    case 'STYLE': if (!f.R) throw Error('style'); r.sw2 = f.W ? Math.max(1, decInt(f.W)) : null; r.sc = f.C || null; r.sk = f.K || null;
      r.so = f.O ? decInt(f.O) : null; r.sl = f.L ? f.L === '1' : null; r.sm = 'M' in f ? decTxt(f.M) : null;
      r.sy = ['curve', 'straight', 'elbow'].includes(f.Y) ? f.Y : null; r.sd = ['solid', 'dash', 'dot'].includes(f.D) ? f.D : null; break;
    case 'NODE': r.k = f.K || 'card'; r.x = decInt(f.X); r.y = decInt(f.Y); r.bw = Math.max(0, decInt(f.W || '0')); r.bh = Math.max(0, decInt(f.H || '0'));
      r.text = decTxt(f.M || ''); r.parent = f.P && f.P !== '0' ? f.P : null; r.edits = f.E || null; r.sw = 2; break;
    case 'ARROW': if (!f.FROM || !f.TO) throw Error('arrow'); r.sw = Math.max(1, decInt(f.S)); r.label = decTxt(f.M || ''); break;
    case 'MOVE': r.dx = decInt(f.DX); r.dy = decInt(f.DY); r.dw = f.DW ? decInt(f.DW) : 0; r.dh = f.DH ? decInt(f.DH) : 0; if (!f.R) throw Error('move');
      r.supersedes = f.X ? f.X.split('_').filter(Boolean) : null; break;   // compaction: this MOVE is the sum of the author's listed MOVEs
    case 'IMAGE': if (!f.R) throw Error('image'); r.alt = decTxt(f.M || ''); r.x = decInt(f.X); r.y = decInt(f.Y); r.bw = Math.max(1, decInt(f.W)); r.bh = Math.max(1, decInt(f.H)); break;
    case 'GROUP': if (Array.isArray(f.P)) break;   // older form: members copied into a fence
      if (!f.K) throw Error('group'); r.members = f.K.split('_').filter(Boolean); break;   // audit D2: members by CID
  }
  if (RECORD_TYPES[r.type]) RECORD_TYPES[r.type].parse(r, f);   // feature record types (core/hooks)
  return r;
}
// Why records were refused, for the ledger. "clock" records are parked, not dropped: they are retried as the canvas catches up.
const reject = why => { S.rejected++; S.why[why] = (S.why[why] || 0) + 1; return null; };
const Z_SLACK = 10000, T_SLACK = 60 * 60 * 1000;
async function ingest(raw, persist = true){
  let node;
  try { node = parse(raw); } catch { return reject('malformed'); }
  if (!KNOWN.has(node.action)) return reject('unknown type');
  const cid = await cidOf(te.encode(raw));
  if (S.records.has(cid)) return cid;
  if (!await verifyRaw(node)) return reject('bad signature');
  let rec; try { rec = toRec(node, cid); } catch { return reject('malformed'); }
  if (RECORD_TYPES[rec.type]?.check && !await RECORD_TYPES[rec.type].check(rec)) return reject('invalid claim');
  // audit S3: Z and T are chosen by the signer. A Z far past anything seen, or a T far in the future, would win every
  // "latest wins" rule and every layer order; such records wait until the canvas has caught up with them.
  if (rec.z > S.lamport + Z_SLACK || rec.t > Date.now() + T_SLACK){
    if (!S.parked.has(cid)){ S.parked.set(cid, { raw, persist, z: rec.z, t: rec.t }); S.why.clock = (S.why.clock || 0) + 1; }
    return null;
  }
  const fence = rec.type === 'GROUP' ? (a => ELEMENT.has(a)) : RECORD_TYPES[rec.type]?.fence ? (a => a === RECORD_TYPES[rec.type].fence) : null;
  if (fence && rec.neg === null && Array.isArray(node.fields.P)){   // every fenced child is verified and ingested on its own
    rec.members = [];
    for (const child of node.fields.P){
      if (!fence(child.action)) return reject('malformed');
      const c = await ingest(child.raw, false);
      if (!c) return reject('bad fenced child');
      rec.members.push(c);
    }
  }
  S.records.set(cid, rec);
  if (rec.supersedes) dropSuperseded(rec);
  if (rec.z > S.lamport){ S.lamport = rec.z; if (S.parked.size) setTimeout(unpark, 0); }
  if (persist) save(cid);
  changed();
  return cid;
}
// a compacted MOVE replaces the author's own MOVEs on the same target: their copies can go
const supersededBy = (r, t) => t && t.type === 'MOVE' && t.author === r.author && t.f.R === r.f.R && t.neg === null && t.cid !== r.cid;
function dropSuperseded(r){
  const gone = r.supersedes.filter(c => supersededBy(r, S.records.get(c)));
  for (const c of gone) S.records.delete(c);
  if (gone.length) dbDeleteRecords(canvasId, gone);
}
async function unpark(){
  for (const [cid, p] of [...S.parked]) if (p.z <= S.lamport + Z_SLACK && p.t <= Date.now() + T_SLACK){
    S.parked.delete(cid); S.why.clock = Math.max(0, (S.why.clock || 1) - 1); await ingest(p.raw, p.persist);
  }
}
async function publish(raw, blobs = {}){
  for (const [c, b] of Object.entries(blobs)) await addBlob(c, b);
  const cid = await ingest(raw);
  if (cid){
    const wire = {}; for (const [c, b] of Object.entries(blobs)) wire[c] = b64enc(b);
    post({ raw, blobs: wire });
  }
  return cid;
}
// Every transport (this browser's BroadcastChannel, a network relay in core/net) delivers here; everything is verified on ingest.
async function onWire({ data }, from = null){
  if (data && data.presence){ onPresence(data.presence); return; }
  if (data && (data.hello || data.records) && from){ onSync(data, from); return; }
  for (const k of Object.keys(WIRE_HOOKS)) if (data && data[k] !== undefined){ WIRE_HOOKS[k](data[k]); return; }
  if (!data || typeof data.raw !== 'string') return;
  for (const [c, b] of Object.entries(data.blobs || {})) try { await addBlob(c, b64dec(b)); } catch {}
  await ingest(data.raw);
}
// post to every open transport: other tabs here, and the network relay when connected
function post(msg){ try { bc?.postMessage(msg); } catch {} netSend(msg); }
function openChannel(){
  try { bc?.close(); } catch {}
  channelName = `canvas.${canvasId}.strokes`;
  try { bc = new BroadcastChannel(channelName); bc.onmessage = onWire; } catch { bc = null; }
  netJoin();
}
openChannel();

