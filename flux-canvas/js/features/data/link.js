'use strict';
// @module features/data/link — A link card: a web address with its title, site and a note, opened with one click. Only
// http and https open; anything else (javascript:, data:, file:) is shown as text and never followed.
// @uses features/data/core
// label:  Competitor pricing
//         https://example.com/pricing
//         They dropped the free tier in March     (a note, optional)
function parseLink(text){
  const K = { title: '', url: '', note: '' };
  for (const l of String(text).split('\n')){
    const t = l.trim(); if (!t) continue;
    if (!K.url && /^[a-z][a-z0-9+.-]*:\S+$/i.test(t)) K.url = t.slice(0, 2000);
    else if (!K.title) K.title = t.slice(0, 160);
    else if (!K.note) K.note = t.slice(0, 300);
  }
  return K;
}
// a link that may be followed: http(s) only, parsed by the browser
function safeUrl(u){ try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x : null; } catch { return null; } }
const linkText = K => [K.title, K.url, ...(K.note ? [K.note] : [])].filter(Boolean).join('\n');
function linkCardGeom(b){ return { open: { x: b.x + b.w - 70, y: b.y + 12, w: 58, h: 24 } }; }
registerDataKind('link', {
  name: 'Link', icon: 'link', glyph: '↗', blurb: 'A web page with its title, site and a note; opens in one click', min: [260, 76],
  label: linkText({ title: 'Link', url: 'https://example.com' }),
  layout(text){ const K = parseLink(text); return { w: 320, h: K.note ? 100 : 76 }; },
  draw(b, L, { el, accent }){
    if (!el) return;
    const K = parseLink(el.text), u = safeUrl(K.url), host = u ? u.hostname.replace(/^www\./, '') : K.url || 'no address', g = linkCardGeom(b);
    dataCard(b, accent);
    // the site's letter, in a colour of its own
    const hue = authorHue(host); rr(ctx, b.x + 12, b.y + 14, 36, 36, 9); ctx.fillStyle = u ? `hsl(${hue} 60% 92%)` : TH.panel2 || TH.paper; ctx.fill();
    fitText((host.match(/[a-z0-9]/i)?.[0] || '?').toUpperCase(), b.x + 30, b.y + 32, 30, `700 17px ${FONTS.sans}`, u ? `hsl(${hue} 55% 32%)` : TH.muted, 'center');
    const tx = b.x + 60, tw = g.open.x - tx - 8;
    fitText(K.title || host, tx, b.y + 24, tw, `650 14px ${FONTS.sans}`, TH.ink);
    fitText(u ? host + (u.pathname.length > 1 ? u.pathname : '') : `Not a web address: ${K.url || 'none'}`, tx, b.y + 43, tw, `500 12px ${FONTS.sans}`, u ? TH.muted : TH.red);
    if (K.note) fitText(K.note, b.x + 12, b.y + 74, b.w - 24, `400 12.5px ${FONTS.sans}`, TH.ink);
    if (u){ rr(ctx, g.open.x, g.open.y, g.open.w, g.open.h, 12); ctx.fillStyle = TH.accentWeak || TH.panel2; ctx.fill(); fitText('Open ↗', g.open.x + g.open.w / 2, g.open.y + 12, g.open.w - 6, `600 11.5px ${FONTS.sans}`, TH.accent, 'center'); }
  },
  hit(el, w, b){ return inRect(w, linkCardGeom(b).open) && safeUrl(parseLink(el.text).url) ? { act: 'open', press: true } : null; },
  press(el){ linkOpen(el); },
  others: 'Only its author changes the address. Open it with the button, or comment on it (M).',
  async form(el){
    const K = el ? parseLink(el.text) : null;
    const v = await formDialog(el ? 'Edit link' : 'New link', [
      { id: 'url', label: 'Address', type: 'text', value: K ? K.url : 'https://', hint: 'http or https' },
      { id: 'title', label: 'Title', type: 'text', value: K ? K.title : '' },
      { id: 'note', label: 'Why it matters', type: 'text', value: K?.note || '' },
    ], { ok: el ? 'Sign the new version' : 'Add link', why: 'The card shows the site, so people see where a link goes before they open it.' });
    if (!v) return null;
    const u = safeUrl(v.url.trim()); if (!u){ toast('That isn’t an http or https address.'); return null; }
    return linkText({ title: v.title.trim() || u.hostname.replace(/^www\./, ''), url: u.href, note: v.note.trim() });
  },
  describe(el){ const K = parseLink(el.text), u = safeUrl(K.url); return u ? `a link to ${u.hostname}${K.note ? `: ${K.note}` : ''}` : 'an address that isn’t a web link'; },
  lines(el){ const K = parseLink(el.text); return [K.url, ...(K.note ? [K.note] : [])]; },
});
function linkOpen(el){
  const u = safeUrl(parseLink(el.text).url); if (!u){ toast('Only http and https links open.'); return; }
  const w = window.open(u.href, '_blank', 'noopener,noreferrer'); if (!w) toast(`Your browser blocked the new tab. The address is ${u.href}`);
}
