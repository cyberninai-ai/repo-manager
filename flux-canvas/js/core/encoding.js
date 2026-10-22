'use strict';
// @module core/encoding — base58 / base32 / base64, CIDv1, ints and text escaping, point-array codec, RDP simplification
/* =====================================================================
   Encoding: base58 (keys, sigs), base32 (CIDv1), varints (points)
   ===================================================================== */
const te = new TextEncoder();
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58enc(bytes){
  let zeros = 0; while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const d = [];
  for (let i = zeros; i < bytes.length; i++){
    let carry = bytes[i];
    for (let j = 0; j < d.length; j++){ carry += d[j] << 8; d[j] = carry % 58; carry = (carry / 58) | 0; }
    while (carry){ d.push(carry % 58); carry = (carry / 58) | 0; }
  }
  return '1'.repeat(zeros) + d.reverse().map(x => B58[x]).join('');
}
function b58dec(s){
  const b = [];
  for (const ch of s){
    let carry = B58.indexOf(ch); if (carry < 0) throw Error('bad base58');
    for (let j = 0; j < b.length; j++){ carry += b[j] * 58; b[j] = carry & 255; carry >>= 8; }
    while (carry){ b.push(carry & 255); carry >>= 8; }
  }
  let zeros = 0; while (zeros < s.length && s[zeros] === '1') zeros++;
  return new Uint8Array([...new Array(zeros).fill(0), ...b.reverse()]);
}
function b32(bytes){
  const A = 'abcdefghijklmnopqrstuvwxyz234567'; let bits = 0, val = 0, out = '';
  for (const x of bytes){ val = ((val << 8) | x) & 0xffff; bits += 8; while (bits >= 5){ out += A[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += A[(val << (5 - bits)) & 31];
  return out;
}
// CIDv1 · raw codec (0x55) · sha2-256 multihash · base32 multibase → "bafkrei…"
async function cidOf(bytes){
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const m = new Uint8Array(36); m.set([0x01, 0x55, 0x12, 0x20]); m.set(d, 4);
  return 'b' + b32(m);
}
function b64enc(bytes){ let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function b64dec(s){ const b = atob(s), o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
const encInt = n => n < 0 ? 'n' + (-n) : String(n);
const decInt = s => { const v = s && s[0] === 'n' ? -parseInt(s.slice(1), 10) : parseInt(s, 10); if (!Number.isFinite(v)) throw Error('int'); return v; };
const encTxt = s => encodeURIComponent(s).replace(/[-.!~*'()_]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const decTxt = s => { try { return decodeURIComponent(s); } catch { return s; } };

/* Point array: quantize to a 0.5-unit grid, delta-encode, zigzag varints. t is ms since pen-down. */
const Q = 2;
const zig = v => v >= 0 ? v * 2 : -v * 2 - 1, unzig = n => n % 2 ? -(n + 1) / 2 : n / 2;
function pushVar(o, n){ while (n >= 128){ o.push((n % 128) | 128); n = Math.floor(n / 128); } o.push(n); }
function encodePoints(pts){
  const o = []; pushVar(o, pts.length); let px = 0, py = 0, pt = 0;
  for (const p of pts){
    const x = Math.round(p.x * Q), y = Math.round(p.y * Q), t = Math.max(pt, Math.round(p.t));
    pushVar(o, zig(x - px)); pushVar(o, zig(y - py)); pushVar(o, t - pt); px = x; py = y; pt = t;
  }
  return new Uint8Array(o);
}
function decodePoints(b){
  let i = 0;
  const rd = () => { let n = 0, m = 1, c; do { if (i >= b.length) throw Error('truncated'); c = b[i++]; n += (c & 127) * m; m *= 128; } while (c & 128); return n; };
  const len = rd(); if (len < 1 || len > 200000) throw Error('length');
  const pts = []; let x = 0, y = 0, t = 0;
  for (let k = 0; k < len; k++){ x += unzig(rd()); y += unzig(rd()); t += rd(); pts.push({ x: x / Q, y: y / Q, t }); }
  if (i !== b.length) throw Error('trailing');
  return pts;
}
function rdp(pts, eps){
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length){
    const [a, b] = st.pop(), A = pts[a], B = pts[b], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++){
      const d = L < 1e-6 ? Math.hypot(pts[i].x - A.x, pts[i].y - A.y) : Math.abs(dy * (pts[i].x - A.x) - dx * (pts[i].y - A.y)) / L;
      if (d > md){ md = d; mi = i; }
    }
    if (md > eps){ keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

