// Flux Canvas build: inline the modular source (index.html + css/ + js/) into one self-contained page.
//   node tools/build.mjs            → ../flux-canvas.html (the file people download and open anywhere)
//   node tools/build.mjs --check    → exit 1 if the committed bundle is out of date
// No dependencies. Order comes from index.html: <link> tags become one <style>, <script src> tags one <script>.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, '..', 'flux-canvas.html');
const read = p => readFileSync(resolve(root, p), 'utf8');
// a module's own header (@module / @uses / 'use strict') is for readers of the source, not the bundle
const strip = (text, css) => {
  const lines = text.replace(/\n$/, '').split('\n');
  while (lines.length && (css ? /^\/\* @module /.test(lines[0]) : /^('use strict';|\/\/ @module |\/\/ @uses )/.test(lines[0]))) lines.shift();
  return lines.join('\n');
};

const src = read('index.html').split('\n');
const html = [], css = [], js = [];
let cssAt = -1, jsAt = -1;
for (const l of src){
  const link = l.match(/^<link rel="stylesheet" href="([^"]+)">$/), script = l.match(/^<script src="([^"]+)"><\/script>$/);
  if (link){ if (cssAt < 0){ cssAt = html.length; html.push(null); } css.push(strip(read(link[1]), true)); continue; }
  if (script){ if (jsAt < 0){ jsAt = html.length; html.push(null); } js.push(strip(read(script[1]), false)); continue; }
  if (/^<!-- (Flux Canvas · modular|load order)/.test(l)) continue;
  html.push(l);
}
if (cssAt < 0 || jsAt < 0) throw new Error('index.html has no stylesheet or script tags');
html[cssAt] = `<style>\n${css.join('\n')}\n</style>`;
// a literal "</script" inside the code (HTML a feature writes into a frame) would end the inlined script early
html[jsAt] = `<script>\n'use strict';\n${js.join('\n').replace(/<\/script/gi, '<\\/script')}\n</script>`;
const bundle = html.join('\n');

if (process.argv.includes('--check')){
  const cur = readFileSync(out, 'utf8');
  if (cur !== bundle){ console.error('flux-canvas.html is out of date: run `node tools/build.mjs`'); process.exit(1); }
  console.log('flux-canvas.html is up to date');
} else {
  writeFileSync(out, bundle);
  console.log(`wrote ${out} · ${(bundle.length / 1024).toFixed(1)} KB · ${css.length} css + ${js.length} js modules`);
}
