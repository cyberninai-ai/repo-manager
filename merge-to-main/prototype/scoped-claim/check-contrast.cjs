#!/usr/bin/env node
// Contrast gate for the Scoped Claim Authorization tokens, light and dark.
// Mirrors what defxn's tests/theme-color-contrast.cjs must enforce for this
// component: every foreground/background pair the modal actually renders.
//
//   node prototype/scoped-claim/check-contrast.cjs
//
// Exits 1 if any pair fails.
'use strict';
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'tokens.css'), 'utf8');

function parseBlock(selector) {
  const start = css.indexOf(selector + ' {');
  if (start < 0) throw new Error('missing block ' + selector);
  const body = css.slice(start, css.indexOf('}', start));
  const out = {};
  for (const m of body.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}

const dark = parseBlock(':root');
const light = { ...dark, ...parseBlock(':root[data-theme="light"]') };

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [foreground, background, minimum, why]
const TEXT = 4.5;
const UI = 3;
const pairs = [];
for (const bg of ['surface', 'raised', 'canvas']) {
  pairs.push(['text', bg, TEXT, 'field values, body copy']);
  pairs.push(['text-muted', bg, TEXT, 'field labels (mono uppercase, small)']);
}
for (const fg of ['primary', 'trust', 'warning', 'danger']) {
  for (const bg of ['surface', 'raised']) pairs.push([fg, bg, TEXT, 'status text, action verb, badges']);
}
pairs.push(['on-primary', 'primary', TEXT, 'Sign button label']);
pairs.push(['primary', 'surface', UI, 'focus ring']);
pairs.push(['danger', 'surface', UI, 'expired / error rule']);

let failed = 0;
for (const [theme, t] of [['dark', dark], ['light', light]]) {
  console.log(`\n${theme}`);
  for (const [fg, bg, min, why] of pairs) {
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1 >= ${min}  --${fg} on --${bg}  (${why})`);
  }
}
console.log(failed ? `\n${failed} pair(s) failed` : '\nall pairs pass');
process.exit(failed ? 1 : 0);
