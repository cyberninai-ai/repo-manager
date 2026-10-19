'use strict';
// @module ui/hub — The Team button: every team feature, grouped by what you are trying to do, with live status
// (a silent round running, a decision due for review). Features add themselves with registerFeature (core/hooks).
// @uses ui/toolbar (menus), ui/palette
const HUB_GROUPS = [['meet', 'Run the session'], ['decide', 'Decide'], ['deliver', 'Deliver and get paid'], ['remember', 'Remember'], ['network', 'Network and identity']];
function hubItems(){
  const out = [];
  for (const [g, title] of HUB_GROUPS){
    const fs = FEATURES.filter(f => f.group === g && f.open); if (!fs.length) continue;
    out.push({ head: title });
    for (const f of fs){ let st = ''; try { st = f.status?.() || ''; } catch {} out.push({ label: f.name + (st ? ' · ' + st : ''), icon: f.icon, run: f.open }); }
  }
  return out;
}
$('hubBtn').onclick = () => $('menu').hidden ? openMenu($('hubBtn'), hubItems()) : closeMenu();
PALETTE_HOOKS.push(add => { for (const f of FEATURES) if (f.open) add('team', `${f.name}: ${f.blurb}`, f.open); });

/* the session strip under the title bar: what the room is doing right now. Features add a chip: STRIP.push(() => html);
   buttons inside carry data-strip="action" and STRIP_ACTIONS[action](button) handles them */
const STRIP = [], STRIP_ACTIONS = {};
const strip = document.createElement('div'); strip.id = 'strip'; strip.setAttribute('role', 'status'); strip.setAttribute('aria-live', 'off');
document.body.appendChild(strip);
let stripHTML = '';
function paintStrip(){
  const html = STRIP.map(f => { try { return f() || ''; } catch { return ''; } }).join('');
  if (html !== stripHTML){ const keep = document.activeElement?.closest?.('#strip [data-strip]')?.dataset.strip; stripHTML = html; strip.innerHTML = html; if (keep) strip.querySelector(`[data-strip="${keep}"]`)?.focus(); }
}
strip.addEventListener('click', e => { const b = e.target.closest('[data-strip]'); if (b) STRIP_ACTIONS[b.dataset.strip]?.(b); });
strip.addEventListener('pointerdown', e => e.stopPropagation());
setInterval(paintStrip, 1000);
CHANGE_HOOKS.push(paintStrip);
// m:ss for a countdown
const clock = ms => { const s = Math.max(0, Math.round(Math.abs(ms) / 1000)); return `${ms < 0 ? '−' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
