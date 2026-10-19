'use strict';
// @module core/announce — DOM lookup, HTML escaping, the screen-reader announcer and toasts: what every layer may use to talk to people
// @uses (none)
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastT = 0;
let sayT = 0;
function say(msg){ const n = $('sr'); n.textContent = ''; clearTimeout(sayT); sayT = setTimeout(() => { n.textContent = msg; }, 30); }
function toast(msg){ say(msg); const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
