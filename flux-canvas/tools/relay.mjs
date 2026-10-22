#!/usr/bin/env node
// Flux relay: serves the app and forwards signed records between browsers over WebSocket. No dependencies.
//   node tools/relay.mjs [--port 8787] [--host 0.0.0.0] [--data ./relay-data]
// The relay is untrusted by design: it can't sign, so it can't forge or alter records (every client verifies every record).
// It keeps each room's records so people needn't be online at the same time; with --data they survive restarts
// (one append-only .flux file per canvas, the same format as an export).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const PORT = +arg('port', process.env.PORT || 8787), HOST = arg('host', '0.0.0.0'), DATA = arg('data', '');
const here = path.dirname(fileURLToPath(import.meta.url)), APP = path.resolve(here, '../../flux-canvas.html');
const ROOM_RE = /^[a-z0-9]{6,32}$/, MAX_FRAME = 16 * 1024 * 1024, MAX_ROOM_BYTES = 128 * 1024 * 1024, MAX_ROOMS = 2000;

/* rooms: connected sockets plus every record seen (raw → blobs), in arrival order */
const rooms = new Map();
function room(id){
  let r = rooms.get(id);
  if (!r){
    if (rooms.size >= MAX_ROOMS) return null;
    r = { clients: new Set(), recs: new Map(), bytes: 0 };
    rooms.set(id, r);
    if (DATA) load(id, r);
  }
  return r;
}
function keep(id, r, raw, blobs){
  if (typeof raw !== 'string' || r.recs.has(raw) || raw.length > MAX_FRAME) return;
  const size = raw.length + Object.values(blobs || {}).reduce((s, b) => s + String(b).length, 0);
  if (r.bytes + size > MAX_ROOM_BYTES) return;
  r.recs.set(raw, blobs || null); r.bytes += size;
  if (DATA){
    const lines = [...Object.entries(blobs || {}).map(([c, b]) => `BLOB-R-${c}-B64-${b}`), raw];
    fs.appendFile(path.join(DATA, id + '.flux'), lines.join('\n') + '\n', () => {});
  }
}
function load(id, r){
  let text = ''; try { text = fs.readFileSync(path.join(DATA, id + '.flux'), 'utf8'); } catch { return; }
  const blobs = {};
  for (const l of text.split('\n')){
    if (!l) continue;
    const m = l.match(/^BLOB-R-([a-z2-7]+)-B64-(.+)$/);
    if (m){ blobs[m[1]] = m[2]; continue; }
    const want = (l.match(/-R-([a-z2-7]{20,})-/) || [])[1];
    r.recs.set(l, want && blobs[want] ? { [want]: blobs[want] } : null); r.bytes += l.length;
  }
}
const send = (sock, obj) => { try { sock.write(frame(JSON.stringify(obj))); } catch {} };
function broadcastPeers(id, r){ for (const c of r.clients) send(c, { room: id, peers: r.clients.size }); }
function onMessage(sock, text){
  let d; try { d = JSON.parse(text); } catch { return; }
  if (d && typeof d.join === 'string' && ROOM_RE.test(d.join)){
    if (sock.room){ const old = rooms.get(sock.room); old?.clients.delete(sock); if (old) broadcastPeers(sock.room, old); }
    const r = room(d.join); if (!r) return;
    sock.room = d.join; r.clients.add(sock); broadcastPeers(d.join, r);
    // hand the newcomer what the room has, in chunks of about 1 MB
    let chunk = [], size = 0;
    for (const [raw, blobs] of r.recs){ chunk.push(blobs ? { raw, blobs } : { raw }); size += raw.length; if (size > 1e6){ send(sock, { room: d.join, msg: { records: chunk } }); chunk = []; size = 0; } }
    if (chunk.length) send(sock, { room: d.join, msg: { records: chunk } });
    return;
  }
  if (!d || d.room !== sock.room || !d.msg) return;
  const r = rooms.get(sock.room); if (!r) return;
  if (typeof d.msg.raw === 'string') keep(sock.room, r, d.msg.raw, d.msg.blobs);
  if (Array.isArray(d.msg.records)) for (const it of d.msg.records) keep(sock.room, r, it?.raw, it?.blobs);
  const out = frame(text);
  for (const c of r.clients) if (c !== sock) try { c.write(out); } catch {}
}

/* WebSocket (RFC 6455): handshake, framing, ping/pong, close */
function frame(text, opcode = 1){
  const body = Buffer.from(text), n = body.length;
  const head = n < 126 ? Buffer.from([0x80 | opcode, n]) : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x80 | opcode, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
  return Buffer.concat([head, body]);
}
function accept(req, sock){
  const key = req.headers['sec-websocket-key'];
  if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket'){ sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
  const acceptKey = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey}\r\n\r\n`);
  sock.setNoDelay(true);
  let buf = Buffer.alloc(0), parts = [];
  sock.on('data', data => {
    buf = Buffer.concat([buf, data]);
    for (;;){
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80; let len = buf[1] & 0x7f, off = 2;
      if (len === 126){ if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127){ if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_FRAME){ sock.destroy(); return; }
      if (!masked){ sock.destroy(); return; }   // clients must mask
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4), payload = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op === 8){ try { sock.end(frame('', 8)); } catch {} return; }
      if (op === 9){ try { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch {} continue; }
      if (op === 10) continue;
      if (op === 1 || op === 0){ parts.push(payload); if (fin){ onMessage(sock, Buffer.concat(parts).toString('utf8')); parts = []; } }
    }
  });
  const gone = () => { const r = sock.room && rooms.get(sock.room); if (r){ r.clients.delete(sock); broadcastPeers(sock.room, r); } };
  sock.on('close', gone); sock.on('error', gone);
}

/* http: the app (with a marker that makes it connect back here), and a health check */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz'){ res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ rooms: rooms.size, clients: [...rooms.values()].reduce((s, r) => s + r.clients.size, 0) })); return; }
  if (url.pathname !== '/' && url.pathname !== '/index.html'){ res.writeHead(404).end(); return; }
  fs.readFile(APP, 'utf8', (err, html) => {
    if (err){ res.writeHead(500).end('Build the app first: npm run build'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }).end(html.replace('</head>', '<meta name="flux-relay" content="auto">\n</head>'));
  });
});
server.on('upgrade', accept);
if (DATA) fs.mkdirSync(DATA, { recursive: true });
server.listen(PORT, HOST, () => console.log(`flux relay listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${server.address().port}${DATA ? ` · data in ${DATA}` : ''}`));
