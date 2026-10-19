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
const files = readdirSync(here).filter(f => f.endsWith('.mjs') && !['env.mjs', 'run.mjs'].includes(f) && (!only.length || only.includes(f.replace('.mjs', ''))));
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
let failed = 0;
console.log(`target: ${process.env.FLUX_URL || (process.env.FLUX_TARGET === 'source' ? 'source (index.html)' : 'bundle (flux-canvas.html)')}`);
for (const f of files){
  const { code, out } = await run(f);
  const problems = [];
  if (code !== 0) problems.push(`exit ${code}`);
  if (/TIMEOUT/.test(out)) problems.push('timeout');
  for (const m of out.matchAll(/^errors (\[[\s\S]*?\])\s*$/gm)) if (m[1].replace(/\s/g, '') !== '[]') problems.push('page errors: ' + m[1].replace(/\s+/g, ' ').slice(0, 300));
  for (const m of out.matchAll(/^axe\b(.*)$/gm)){ const res = m[1].match(/(\[.*\]|clean)\s*$/); if (!res || !/^(\[\]|clean)$/.test(res[1])) problems.push('axe:' + m[1].slice(0, 300)); }
  if (problems.length){ failed++; console.log(`✗ ${f}\n  ${problems.join('\n  ')}\n${out.split('\n').map(l => '    ' + l).join('\n')}`); }
  else console.log(`✓ ${f}`);
}
console.log(failed ? `\n${failed} of ${files.length} failed` : `\nall ${files.length} passed`);
process.exit(failed ? 1 : 0);   // also stops the server
