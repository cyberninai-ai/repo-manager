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
    case 'MOVE': r.dx = decInt(f.DX); r.dy = decInt(f.DY); r.dw = f.DW ? decInt(f.DW) : 0; r.dh = f.DH ? decInt(f.DH) : 0; if (!f.R) throw Error('move'); break;
    case 'IMAGE': if (!f.R) throw Error('image'); r.alt = decTxt(f.M || ''); r.x = decInt(f.X); r.y = decInt(f.Y); r.bw = Math.max(1, decInt(f.W)); r.bh = Math.max(1, decInt(f.H)); break;
    case 'GROUP': if (!Array.isArray(f.P)) throw Error('group'); break;
  }
  if (RECORD_TYPES[r.type]) RECORD_TYPES[r.type].parse(r, f);   // feature record types (core/hooks)
  return r;
}
async function ingest(raw, persist = true){
  let node;
  try { node = parse(raw); } catch { S.rejected++; return null; }
  if (!KNOWN.has(node.action)){ S.rejected++; return null; }
  const cid = await cidOf(te.encode(raw));
  if (S.records.has(cid)) return cid;
  if (!await verifyRaw(node)){ S.rejected++; return null; }
  let rec; try { rec = toRec(node, cid); } catch { S.rejected++; return null; }
  const fence = rec.type === 'GROUP' ? (a => ELEMENT.has(a)) : RECORD_TYPES[rec.type]?.fence ? (a => a === RECORD_TYPES[rec.type].fence) : null;
  if (fence && rec.neg === null && Array.isArray(node.fields.P)){   // every fenced child is verified and ingested on its own
    rec.members = [];
    for (const child of node.fields.P){
      if (!fence(child.action)){ S.rejected++; return null; }
      const c = await ingest(child.raw, false);
      if (!c){ S.rejected++; return null; }
      rec.members.push(c);
    }
  }
  S.records.set(cid, rec);
  if (rec.z > S.lamport) S.lamport = rec.z;
  if (persist) save();
  changed();
  return cid;
}
async function publish(raw, blobs = {}){
  for (const [c, b] of Object.entries(blobs)) await addBlob(c, b);
  const cid = await ingest(raw);
  if (cid && bc){
    const wire = {}; for (const [c, b] of Object.entries(blobs)) wire[c] = b64enc(b);
    bc.postMessage({ raw, blobs: wire });
  }
  return cid;
}
async function onWire({ data }){
  if (data && data.presence){ onPresence(data.presence); return; }
  for (const k of Object.keys(WIRE_HOOKS)) if (data && data[k] !== undefined){ WIRE_HOOKS[k](data[k]); return; }
  if (!data || typeof data.raw !== 'string') return;
  for (const [c, b] of Object.entries(data.blobs || {})) try { await addBlob(c, b64dec(b)); } catch {}
  await ingest(data.raw);
}
function openChannel(){
  try { bc?.close(); } catch {}
  channelName = `canvas.${canvasId}.strokes`;
  try { bc = new BroadcastChannel(channelName); bc.onmessage = onWire; } catch { bc = null; }
}
openChannel();

