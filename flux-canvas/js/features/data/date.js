'use strict';
// @module features/data/date — A date on the canvas: a launch, a deadline, a review. It counts down, turns amber three days
// before and grey once passed; formulas read it as days from today ([Beta launch] - 14)
// @uses features/data/core
// label:  Beta launch
//         2026-11-15 14:00
//         Invite the first 20 teams     (a note, optional)
function parseDate(text){
  const D = { title: '', y: null, mo: null, d: null, hh: null, mm: null, note: '' };
  for (const l of String(text).split('\n')){
    const t = l.trim(), m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
    if (m && D.y == null){ [D.y, D.mo, D.d] = [+m[1], +m[2], +m[3]]; if (m[4] != null){ D.hh = Math.min(23, +m[4]); D.mm = Math.min(59, +m[5]); } }
    else if (t && !D.title) D.title = t.slice(0, 120);
    else if (t && !D.note) D.note = t.slice(0, 200);
  }
  if (D.y != null && (D.mo < 1 || D.mo > 12 || D.d < 1 || D.d > 31)) D.y = null;
  return D;
}
const pad2 = n => String(n).padStart(2, '0');
const dateText = D => [D.title, ...(D.y != null ? [`${D.y}-${pad2(D.mo)}-${pad2(D.d)}${D.hh != null ? ` ${pad2(D.hh)}:${pad2(D.mm)}` : ''}`] : []), ...(D.note ? [D.note] : [])].join('\n');
const dateOf = D => D.y == null ? null : new Date(D.y, D.mo - 1, D.d, D.hh ?? 0, D.mm ?? 0);
// whole days from today to the date (negative once it has passed): local calendar days, not 24-hour blocks
function dateDays(el){ const D = parseDate(el.text); if (D.y == null) return null; const t = new Date(), a = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()), b = Date.UTC(D.y, D.mo - 1, D.d); return Math.round((b - a) / 864e5); }
const dateRel = n => n == null ? 'No date set' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n > 0 ? `In ${plural(n, 'day')}` : `${plural(-n, 'day')} ago`;
registerDataKind('date', {
  name: 'Date', icon: 'calendar', glyph: '▤', blurb: 'A launch or deadline that counts down; formulas read it as days away', min: [250, 88],
  label: dateText({ title: 'Date', y: new Date().getFullYear(), mo: new Date().getMonth() + 1, d: new Date().getDate() }),
  layout(text){ const D = parseDate(text); return { w: 270, h: D.note ? 104 : 88 }; },
  draw(b, L, { el, accent }){
    if (!el) return;
    const D = parseDate(el.text), n = dateDays(el), dt = dateOf(D);
    const tone = n == null ? TH.muted : n < 0 ? TH.faint || TH.muted : n === 0 ? TH.accent : n <= 3 ? TH.amber : accent || TH.accent;
    dataCard(b, accent);
    // the calendar leaf
    const cx = b.x + 12, cy = b.y + 14;
    ctx.save(); rr(ctx, cx, cy, 52, 60, 8); ctx.fillStyle = TH.panel2 || TH.paper; ctx.fill(); ctx.clip(); ctx.fillStyle = tone; ctx.fillRect(cx, cy, 52, 17); ctx.restore();
    rr(ctx, cx, cy, 52, 60, 8); ctx.strokeStyle = TH.line; ctx.lineWidth = 1; ctx.stroke();
    fitText(dt ? dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '—', cx + 26, cy + 9, 48, `700 10px ${FONTS.sans}`, '#fff', 'center');
    fitText(dt ? String(dt.getDate()) : '?', cx + 26, cy + 39, 48, `700 24px ${FONTS.sans}`, TH.ink, 'center');
    const tx = cx + 66, tw = b.w - (tx - b.x) - 12;
    fitText(D.title || 'Date', tx, b.y + 24, tw, `650 14px ${FONTS.sans}`, TH.ink);
    fitText(dateRel(n), tx, b.y + 45, tw, `650 13px ${FONTS.sans}`, tone);
    if (dt) fitText(dt.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: dt.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) + (D.hh != null ? ` · ${pad2(D.hh)}:${pad2(D.mm)}` : ''), tx, b.y + 64, tw, `500 12px ${FONTS.sans}`, TH.muted);
    if (D.note) fitText(D.note, b.x + 12, b.y + b.h - 15, b.w - 24, `400 12px ${FONTS.sans}`, TH.muted);
  },
  others: 'Only its author moves the date. Comment on it instead (M).',
  async form(el){
    const D = el ? parseDate(el.text) : null, t = new Date(Date.now() + 14 * 864e5);
    const v = await formDialog(el ? 'Edit date' : 'New date', [
      { id: 'title', label: 'What happens', type: 'text', value: D ? D.title : 'Beta launch' },
      { id: 'day', label: 'Day', type: 'date', value: D?.y != null ? `${D.y}-${pad2(D.mo)}-${pad2(D.d)}` : `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`, half: true },
      { id: 'time', label: 'Time (optional)', type: 'text', value: D?.hh != null ? `${pad2(D.hh)}:${pad2(D.mm)}` : '', half: true, hint: 'HH:MM, 24-hour' },
      { id: 'note', label: 'Note', type: 'text', value: D?.note || '' },
    ], { ok: el ? 'Sign the new version' : 'Add date', why: 'It counts down for everyone, and formulas can use it: [Beta launch] is the number of days left.' });
    if (!v) return null;
    const m = v.day.match(/^(\d{4})-(\d{2})-(\d{2})$/), tm = v.time.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m){ toast('Pick a day.'); return null; }
    if (v.time.trim() && !tm){ toast('Write the time as HH:MM.'); return null; }
    return dateText({ title: v.title.trim() || 'Date', y: +m[1], mo: +m[2], d: +m[3], hh: tm ? Math.min(23, +tm[1]) : null, mm: tm ? Math.min(59, +tm[2]) : null, note: v.note.trim() });
  },
  describe(el){ const D = parseDate(el.text), dt = dateOf(D); return dt ? `${dt.toDateString()}${D.hh != null ? ` at ${pad2(D.hh)}:${pad2(D.mm)}` : ''}, ${dateRel(dateDays(el)).toLowerCase()}` : 'no date set'; },
  lines(el){ const D = parseDate(el.text), dt = dateOf(D); return [dt ? dt.toDateString() : 'No date', dateRel(dateDays(el)), ...(D.note ? [D.note] : [])]; },
});
