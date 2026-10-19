'use strict';
// @module core/net — Network transport (audit C1): a WebSocket relay that forwards signed records between browsers, plus sync
// @uses state, records (onWire, ingest), persistence (blobOf), derive (bulk)
// The relay (tools/relay.mjs) is untrusted: it only forwards and keeps a copy. Every record is verified on arrival like any other.
// Sync on join: each side sends HELLO with the CIDs it has; the other answers with the records missing from that list.
const NET = { ws: null, url: '', state: 'off', peers: 0, retry: 0, timer: 0 };
const RELAY_AUTO = !!document.querySelector('meta[name="flux-relay"]');   // the relay injects this when it serves the app
function relayDefault(){
  if (RELAY_AUTO) return location.origin.replace(/^http/, 'ws');
  return store.get('flux:relay') || '';
}
function netConnect(url){
  url = String(url || '').trim(); if (!url) return;
  if (!/^wss?:\/\//.test(url)) url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + url.replace(/^\w+:\/\//, '');
  netClose(); NET.url = url; NET.retry = 0; if (!RELAY_AUTO) store.set('flux:relay', url);
  netOpen();
}
function netClose(forget = false){
  clearTimeout(NET.timer);
  if (NET.ws){ NET.ws.onclose = null; try { NET.ws.close(); } catch {} }
  NET.ws = null; NET.state = 'off'; NET.peers = 0;
  if (forget){ NET.url = ''; try { localStorage.removeItem('flux:relay'); } catch {} }
  paintNet();
}
function netOpen(){
  let ws; try { ws = new WebSocket(NET.url); } catch { NET.state = 'error'; paintNet(); return; }
  NET.ws = ws; NET.state = 'connecting'; paintNet();
  ws.onopen = () => { NET.state = 'live'; NET.retry = 0; paintNet(); netJoin(); };
  ws.onmessage = e => {
    let d; try { d = JSON.parse(e.data); } catch { return; }
    if (!d || d.room !== canvasId) return;
    if (typeof d.peers === 'number'){ NET.peers = d.peers; paintNet(); return; }
    if (d.msg) onWire({ data: d.msg }, 'net');
  };
  ws.onclose = () => {   // reconnect with backoff: 1 s, 2 s, 4 s … 30 s
    NET.ws = null; NET.state = 'connecting'; NET.peers = 0; paintNet();
    NET.timer = setTimeout(netOpen, Math.min(30000, 1000 * 2 ** NET.retry++));
  };
}
function netSend(msg){
  if (NET.ws?.readyState !== 1) return false;
  try { NET.ws.send(JSON.stringify({ room: canvasId, msg })); return true; } catch { return false; }
}
function netJoin(){
  if (NET.ws?.readyState !== 1) return;
  NET.ws.send(JSON.stringify({ join: canvasId }));
  sendHello(false);
}
const sendHello = reply => post({ hello: { have: [...S.records.keys()], reply } });   // to every transport: tabs, relay, direct peers
// answer a HELLO with what the other side lacks, in chunks of about 1 MB
function sendMissing(have){
  const missing = [...S.records.values()].filter(r => !have.has(r.cid)).sort(byZ);
  let chunk = [], size = 0;
  const flush = () => { if (chunk.length) post({ records: chunk }); chunk = []; size = 0; };
  for (const r of missing){
    const it = { raw: r.raw }, b = blobOf(r);
    if (b && S.blobs.has(b)) it.blobs = { [b]: b64enc(S.blobs.get(b)) };
    chunk.push(it); size += r.raw.length + (it.blobs ? it.blobs[b].length : 0);
    if (size > 2e5) flush();
  }
  flush();
  return missing.length;
}
async function onSync(data){
  if (data.hello){
    sendMissing(new Set(Array.isArray(data.hello.have) ? data.hello.have : []));
    if (!data.hello.reply) sendHello(true);
  }
  if (Array.isArray(data.records) && data.records.length) await bulk(async () => {
    const before = new Set(S.records.keys());
    for (const it of data.records){
      if (!it || typeof it.raw !== 'string') continue;
      for (const [c, b] of Object.entries(it.blobs || {})) try { await addBlob(c, b64dec(b)); } catch {}
      await ingest(it.raw);
    }
    if (data.records.length > 2) noteArrivals(before);
  });
}
function paintNet(){ runHooks(SYNC_HOOKS);
  const el = document.getElementById('netChip'); if (!el) return;
  el.hidden = NET.state === 'off';
  el.dataset.state = NET.state;
  const txt = NET.state === 'live' ? `Live${NET.peers > 1 ? ` · ${NET.peers}` : ''}` : NET.state === 'connecting' ? 'Reconnecting…' : 'Relay error';
  el.querySelector('span').textContent = txt;
  el.setAttribute('aria-label', NET.state === 'live' ? `Connected to the relay${NET.peers > 1 ? `, ${NET.peers} people on this canvas` : ''}. Open sync options` : `${txt} Open sync options`);
}

/* state root (audit W5): one short hash of every record CID this browser holds. Peers compare roots in their presence:
   equal roots mean they see exactly the same canvas; different roots trigger a sync. */
S.root = '';
let rootT = 0;
function scheduleRoot(){
  clearTimeout(rootT);
  rootT = setTimeout(async () => {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode([...S.records.keys()].sort().join('\n'))));
    S.root = b32(h).slice(0, 12); runHooks(SYNC_HOOKS);
  }, 250);
}
CHANGE_HOOKS.push(scheduleRoot);
// what arrived while you were away: counted per author after a sync batch, so people see who moved the work forward
let caughtUp = null;
function noteArrivals(before){
  const fresh = [...S.records.values()].filter(r => !before.has(r.cid) && r.author !== S.me?.id && r.type !== 'PROFILE');
  if (!fresh.length) return;
  const by = new Map(); for (const r of fresh) by.set(r.author, (by.get(r.author) || 0) + 1);
  clearTimeout(caughtUp); caughtUp = setTimeout(() => toast(`Caught up · ${fresh.length} change${fresh.length > 1 ? 's' : ''} from ${[...by.keys()].map(a => NAMES.get(a) || a.slice(2, 8)).join(', ')}`), 600);
}
