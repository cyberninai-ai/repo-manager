'use strict';
// @module core/blobs — CID-addressed blobs: point arrays and images (sniff, decode, cache)
// @uses state
/* ---------- ingest: verify, address, union-merge ---------- */
async function addBlob(cid, bytes){
  if (S.blobs.has(cid)) return true;
  if (!bytes || bytes.length > MAX_BLOB){ S.why['blob over 2 MB'] = (S.why['blob over 2 MB'] || 0) + 1; return false; }   // audit S5
  if (await cidOf(bytes) !== cid) return false;
  S.blobs.set(cid, bytes); dirty = true;
  return true;
}
// Blobs are opaque bytes addressed by CID; what they mean depends on the record that cites them.
// Image format from the bytes themselves; file names and MIME types from hosts and messengers are often missing or wrong.
function sniffImage(b){
  const at = (i, ...v) => v.every((x, j) => b[i + j] === x), str = (i, n) => String.fromCharCode(...b.subarray(i, i + n));
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') return 'image/webp';
  if (at(0, 0x42, 0x4d)) return 'image/bmp';
  if (at(0, 0, 0, 1, 0)) return 'image/x-icon';
  if (str(4, 4) === 'ftyp'){ const brand = str(8, 4); if (/avi[fs]/.test(brand)) return 'image/avif'; if (/hei[cxms]|hev[cx]|mif1|msf1/.test(brand)) return 'image/heic'; }
  const head = new TextDecoder().decode(b.subarray(0, 512)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return '';
}
// Decode with createImageBitmap, falling back to an <img> element (SVG, and formats some browsers only decode that way).
async function decodeImage(blob){
  try { const bmp = await createImageBitmap(blob); if (bmp.width && bmp.height) return bmp; } catch {}
  const viaImg = async src => {
    const img = new Image(); img.decoding = 'async'; img.src = src;
    await img.decode();
    let w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h){ w = 800; h = 600; }   // SVG without intrinsic size
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c;
  };
  const url = URL.createObjectURL(blob);
  try { return await viaImg(url); } catch {} finally { URL.revokeObjectURL(url); }
  const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  return viaImg(data);
}
const typedBlob = (bytes, hint = '') => new Blob([bytes], { type: sniffImage(bytes) || hint });
function imageOf(cid){
  const c = S.imgs.get(cid);
  if (c !== undefined) return c === 'loading' || c === 'error' ? null : c;
  const b = S.blobs.get(cid); if (!b) return null;
  S.imgs.set(cid, 'loading');
  decodeImage(typedBlob(b)).then(bmp => { S.imgs.set(cid, bmp); dirty = true; }, () => { S.imgs.set(cid, 'error'); dirty = true; });
  return null;
}
