'use strict';
// @module features/images — Insert an image: decode, ask for alt text, re-encode under the blob cap, sign
// @uses commands, blobs, ui/ask-dialog
// Images are re-encoded (max 1600px, WebP or JPEG) so a photo stays a reasonable blob to sign, sync and store.
const IMG_MAX = 1600;
async function insertImage(file, at){
  if (!S.me) return;
  let raw0, typed, bmp;
  try { raw0 = new Uint8Array(await file.arrayBuffer()); } catch { toast('Could not read that file.'); return; }
  typed = typedBlob(raw0, file.type);
  try { bmp = await decodeImage(typed); }
  catch {
    const t = typed.type || file.type || 'unknown type';
    toast(/heic|heif/.test(t) ? 'HEIC photos only decode in Safari. Export it as JPEG or PNG and try again.'
      : `This browser cannot read that image (${t}). Try a PNG, JPEG, WebP or GIF.`);
    return;
  }
  // a name that is just a hash or a generic camera/clipboard name makes poor alt text
  const base = (file.name || '').replace(/\.[a-z0-9]+$/i, '');
  const guess = /^[0-9a-f]{16,}$/i.test(base) || /^(image|img|photo|screenshot|pasted|dsc|pxl)[\s_-]*[\d_-]*$/i.test(base) ? '' : base.replace(/[-_]+/g, ' ').trim();
  const alt = await ask('Describe this image', guess,
    'Alt text is signed into the record so screen readers can describe it. Leave it empty only if the image is decorative.', bmp);
  if (alt === null) return;
  file = typed;
  const k = Math.min(1, IMG_MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const enc = t => new Promise(res => c.toBlob(res, t, 0.85));
  let out = await enc('image/webp'); if (!out || out.type !== 'image/webp') out = await enc('image/jpeg');
  if (/png|gif|svg/.test(file.type) && out && out.size > file.size && file.size < MAX_BLOB && k === 1) out = file;   // keep a small original when it's already smaller
  for (let q = 0.7; out && out.size > MAX_BLOB && q > 0.2; q -= 0.15) out = await new Promise(res => c.toBlob(res, 'image/jpeg', q));   // stay under the blob cap
  if (!out || out.size > MAX_BLOB){ toast('That image is too large to sign and share, even re-encoded.'); return; }
  const bytes = new Uint8Array(await out.arrayBuffer()), R = await cidOf(bytes);
  // place it at a comfortable on-screen size, centred on the drop point
  const fit = Math.min(1, (Math.min(innerWidth, innerHeight) * 0.6 / S.view.zoom) / Math.max(c.width, c.height));
  const w = Math.max(8, Math.round(c.width * fit)), h = Math.max(8, Math.round(c.height * fit));
  const p = at || toWorld(innerWidth / 2, innerHeight / 2), x = Math.round(p.x - w / 2), y = Math.round(p.y - h / 2);
  S.imgs.set(R, bmp.width === c.width ? bmp : await createImageBitmap(c));
  const raw = await signed('IMAGE', [['I', S.me.id], ['R', R], ['X', encInt(x)], ['Y', encInt(y)], ['W', w], ['H', h], ['M', encTxt(alt.trim())], ['Z', ++S.lamport], ['T', Date.now()]]);
  const cid = await publish(raw, { [R]: bytes });
  recordCreate(cid);
  dirty = true;
  toast(`Image signed · ${(bytes.length / 1024).toFixed(0)} KB blob · draw on it now · select mode (V) to move or resize it`);
}
