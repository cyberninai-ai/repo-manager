'use strict';
// @module core/rtc — Direct peer-to-peer connections (WebRTC data channels), no server needed: two people swap a short code
// @uses state, records (onWire), net (sendHello)
// One person creates an invite code (an SDP offer), the other pastes it and gets an answer code back to paste. After that,
// records, presence and sync flow browser to browser. Codes are compressed; STUN finds a route across networks when online.
const RTC = { chans: new Set(), pending: null };
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
function rtcSend(msg){
  if (!RTC.chans.size) return;
  const s = JSON.stringify({ room: canvasId, msg });
  for (const ch of RTC.chans) if (ch.readyState === 'open') try { ch.send(s); } catch {}
}
function rtcWire(ch){
  ch.onopen = () => { RTC.chans.add(ch); sendHello(false); runHooks(SYNC_HOOKS); toast('Connected directly, peer to peer'); };
  ch.onclose = () => { RTC.chans.delete(ch); runHooks(SYNC_HOOKS); };
  ch.onmessage = e => { let d; try { d = JSON.parse(e.data); } catch { return; } if (d && d.room === canvasId && d.msg) onWire({ data: d.msg }, 'direct'); };
}
function iceDone(pc){
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 3000);   // offline or no STUN: go with the candidates we have (same network still works)
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete'){ clearTimeout(t); res(); } });
  });
}
// codes: JSON → deflate (when the browser can) → base64url, prefixed so a pasted code can be recognised
async function packCode(obj){
  let bytes = te.encode(JSON.stringify(obj)), z = 'j';
  if (typeof CompressionStream === 'function') try { bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); z = 'z'; } catch {}
  return 'flux' + z + '.' + b64enc(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpackCode(code){
  const m = String(code || '').trim().match(/^flux([jz])\.([A-Za-z0-9_-]+)$/); if (!m) throw Error('not a Flux code');
  let bytes = b64dec(m[2].replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((m[2].length + 3) % 4));
  if (m[1] === 'z') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(bytes));
}
// host: make an invite code and wait for the answer
async function rtcInvite(){
  const pc = new RTCPeerConnection({ iceServers: ICE });
  rtcWire(pc.createDataChannel('flux'));
  await pc.setLocalDescription(await pc.createOffer()); await iceDone(pc);
  RTC.pending = pc;
  return packCode({ t: 'offer', room: canvasId, sdp: pc.localDescription.sdp, from: S.me.id });
}
// guest: answer an invite code (switching to its canvas), return the code to send back
async function rtcJoin(code){
  const o = await unpackCode(code); if (o.t !== 'offer' || typeof o.sdp !== 'string') throw Error('not an invite code');
  if (o.room && o.room !== canvasId && /^[a-z0-9]{6,32}$/.test(o.room)) await switchCanvasTo(o.room);
  const pc = new RTCPeerConnection({ iceServers: ICE });
  pc.ondatachannel = e => rtcWire(e.channel);
  await pc.setRemoteDescription({ type: 'offer', sdp: o.sdp });
  await pc.setLocalDescription(await pc.createAnswer()); await iceDone(pc);
  return packCode({ t: 'answer', room: canvasId, sdp: pc.localDescription.sdp, from: S.me.id });
}
// host: finish with the guest's answer code
async function rtcAccept(code){
  const a = await unpackCode(code); if (a.t !== 'answer' || !RTC.pending) throw Error('not an answer code');
  await RTC.pending.setRemoteDescription({ type: 'answer', sdp: a.sdp }); RTC.pending = null;
}
// switching canvas is an app-level action (interaction/keyboard); core reaches it through a hook set at load
let switchCanvasTo = async () => {};
