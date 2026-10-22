'use strict';
// @module core/ed25519 — Ed25519 signature verification in plain JS (RFC 8032), for browsers whose WebCrypto lacks Ed25519
// @uses (none)
// Audit S4: without this, a peer on such a browser rejected every Ed25519 record and its canvas silently diverged.
// Verification only (no secrets are handled here), so constant time doesn't matter. Cofactorless check, as WebCrypto does.
const ED = (() => {
  const P = 2n ** 255n - 19n, L = 2n ** 252n + 27742317777372353535851937790883648493n;
  const mod = (a, m = P) => { const r = a % m; return r < 0n ? r + m : r; };
  const pow = (b, e, m = P) => { let r = 1n; b = mod(b, m); while (e > 0n){ if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };
  const inv = a => pow(a, P - 2n);
  const D = mod(-121665n * inv(121666n)), D2 = mod(2n * D), I = pow(2n, (P - 1n) / 4n);
  const B = [15112221349535400772501151409588531511454012693041857206046113283949847762202n, 46316835694926478169428394003475163141307993866256225615783033603165251855960n];
  const point = (x, y) => ({ X: x, Y: y, Z: 1n, T: mod(x * y) });
  const ZERO = point(0n, 1n), BASE = point(B[0], B[1]);
  function add(p, q){
    const a = mod((p.Y - p.X) * (q.Y - q.X)), b = mod((p.Y + p.X) * (q.Y + q.X)), c = mod(p.T * D2 * q.T), d = mod(p.Z * 2n * q.Z);
    const e = b - a, f = d - c, g = d + c, h = b + a;
    return { X: mod(e * f), Y: mod(g * h), Z: mod(f * g), T: mod(e * h) };
  }
  function mul(p, n){ let r = ZERO, q = p; while (n > 0n){ if (n & 1n) r = add(r, q); q = add(q, q); n >>= 1n; } return r; }
  const le = bytes => { let n = 0n; for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]); return n; };
  function decompress(bytes){
    if (bytes.length !== 32) return null;
    const last = bytes[31], sign = last >> 7, b = bytes.slice(); b[31] = last & 0x7f;
    const y = le(b); if (y >= P) return null;
    const y2 = mod(y * y), u = mod(y2 - 1n), v = mod(D * y2 + 1n);
    let x = mod(u * pow(v, 3n) * pow(u * pow(v, 7n), (P - 5n) / 8n));
    const vx2 = mod(v * x * x);
    if (vx2 === mod(-u)) x = mod(x * I); else if (vx2 !== u) return null;
    if (x === 0n && sign) return null;
    if (Number(x & 1n) !== sign) x = P - x;
    return point(x, y);
  }
  async function verify(sig, msg, pub){
    if (sig.length !== 64) return false;
    const A = decompress(pub), R = decompress(sig.slice(0, 32)), s = le(sig.slice(32));
    if (!A || !R || s >= L) return false;
    const h = new Uint8Array(await crypto.subtle.digest('SHA-512', new Uint8Array([...sig.slice(0, 32), ...pub, ...msg])));
    const k = mod(le(h), L);
    const left = mul(BASE, s), right = add(R, mul(A, k));
    return mod(left.X * right.Z - right.X * left.Z) === 0n && mod(left.Y * right.Z - right.Y * left.Z) === 0n;
  }
  return { verify };
})();
