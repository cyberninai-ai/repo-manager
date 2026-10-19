// Runs every browser test and fails on page errors or accessibility violations.
//   node tests/run.mjs [name …]          bundle (../flux-canvas.html)
//   FLUX_TARGET=source node tests/run.mjs modular source (index.html + css/ + js/)
// Each test prints what it checked; screenshots and SVGs land in tests/out/.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const files = readdirSync(here).filter(f => f.endsWith('.mjs') && !['env.mjs', 'run.mjs', 'pair.mjs'].includes(f) && (!only.length || only.includes(f.replace('.mjs', ''))));
// the sandbox test embeds the bundle as srcdoc, so it always targets the bundle
const run = f => new Promise(res => {
  const p = spawn(process.execPath, [path.join(here, f)], { env: process.env });
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  const t = setTimeout(() => { p.kill('SIGKILL'); out += '\nTIMEOUT'; }, 150000);
  p.on('close', code => { clearTimeout(t); res({ f, code, out }); });
});
// the modular source is served over http, as in development (file:// blocks the stylesheet reads axe-core does)
if (process.env.FLUX_TARGET === 'source' && !process.env.FLUX_URL){
  const root = path.resolve(here, '..'), types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
  const server = http.createServer(async (req, res) => {
    if (req.url === '/favicon.ico'){ res.writeHead(204).end(); return; }
    const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(root)){ res.writeHead(403).end(); return; }
    let body; try { body = await readFile(p); } catch { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }).end(body);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  process.env.FLUX_URL = `http://127.0.0.1:${server.address().port}/index.html`;
  process.on('exit', () => server.close());
}
// Golden output (audit T1): the older suites print what they observe; that output, with keys, CIDs, times and canvas ids
// normalised away, must match tests/snapshots/<suite>.txt. UPDATE_SNAPSHOTS=1 rewrites them after an intended change.
// Suites that assert for themselves ("asserted N checks") are not snapshotted.
const snapDir = path.join(here, 'snapshots');
const normalize = out => out.split('\n').filter(l => !/^(target:|axe|errors)/.test(l)).join('\n')
  .replace(/\bbafk[a-z2-7]{20,}/g, '<cid>').replace(/\b(ed|ec)[1-9A-HJ-NP-Za-km-z]{20,}/g, '<key>')
  .replace(/\b1[6-9]\d{11}\b/g, '<time>').replace(/\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}( ?[AP]M)?/g, '<date>')
  .replace(/\bo[a-z2-7]{15}\b/g, '<canvas>').replace(/(author |you · |\bby )[1-9A-HJ-NP-Za-km-z]{6}\b/g, '$1<k>')
  .replace(/'[1-9A-HJ-NP-Za-km-z]{6}'/g, "'<k>'").replace(/\b(bytes|size) \d+/g, '$1 <n>').replace(/\b\d+(\.\d+)? ?(KB|B)\b/g, '<n> $2')
  .replace(/[ \t]+$/gm, '').trim() + '\n';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
let failed = 0;
console.log(`target: ${process.env.FLUX_URL || (process.env.FLUX_TARGET === 'source' ? 'source (index.html)' : 'bundle (flux-canvas.html)')}`);
for (const f of files){
  const { code, out } = await run(f);
  const problems = [];
  if (code !== 0) problems.push(`exit ${code}`);
  if (/TIMEOUT/.test(out)) problems.push('timeout');
  for (const m of out.matchAll(/^errors (\[[\s\S]*?\])\s*$/gm)) if (m[1].replace(/\s/g, '') !== '[]') problems.push('page errors: ' + m[1].replace(/\s+/g, ' ').slice(0, 300));
  for (const m of out.matchAll(/^axe\b(.*)$/gm)){ const res = m[1].match(/(\[.*\]|clean)\s*$/); if (!res || !/^(\[\]|clean)$/.test(res[1])) problems.push('axe:' + m[1].slice(0, 300)); }
  if (!/asserted \d+ checks/.test(out) && !problems.length && !/^perf\b/m.test(out)){
    const snap = path.join(snapDir, f.replace('.mjs', '.txt')), got = normalize(out);
    if (process.env.UPDATE_SNAPSHOTS || !existsSync(snap)){ mkdirSync(snapDir, { recursive: true }); writeFileSync(snap, got); }
    else if (readFileSync(snap, 'utf8') !== got){
      const want = readFileSync(snap, 'utf8').split('\n'), have = got.split('\n'), diff = [];
      for (let i = 0; i < Math.max(want.length, have.length); i++) if (want[i] !== have[i]) diff.push(`line ${i + 1}\n      want: ${want[i] ?? '(none)'}\n      got:  ${have[i] ?? '(none)'}`);
      problems.push('output differs from tests/snapshots/' + path.basename(snap) + '\n    ' + diff.slice(0, 8).join('\n    '));
    }
  }
  if (problems.length){ failed++; console.log(`✗ ${f}\n  ${problems.join('\n  ')}\n${out.split('\n').map(l => '    ' + l).join('\n')}`); }
  else console.log(`✓ ${f}`);
}
console.log(failed ? `\n${failed} of ${files.length} failed` : `\nall ${files.length} passed`);
process.exit(failed ? 1 : 0);   // also stops the server
