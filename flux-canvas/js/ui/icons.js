'use strict';
// @module ui/icons — The icon set (an SVG sprite in index.html, one stroke style on a 24px grid) and helpers to use it
const ICON_NAMES = new Set([...document.querySelectorAll('svg symbol[id^="i-"]')].map(s => s.id.slice(2)));
const ic = (name, cls = '') => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
// a button face: an icon when the set has one, otherwise the text itself (emoji, short labels)
const face = x => ICON_NAMES.has(x) ? ic(x) : `<span class="gl">${x}</span>`;
