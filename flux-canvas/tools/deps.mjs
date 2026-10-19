#!/usr/bin/env node
// Module boundaries (audit A1): finds which module uses which, from the source itself, and enforces the layer rules.
//   node tools/deps.mjs            check: exit 1 on a layer violation or a dependency on a later-loaded module at load time
//   node tools/deps.mjs --write    also regenerate docs/DEPENDENCIES.md
// Modules are classic scripts sharing one scope, so "imports" are the top-level names a file uses that another file declares.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const order = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
const mod = f => f.replace(/^js\//, '').replace(/\.js$/, '');
const layer = f => mod(f).split('/')[0].replace('boot', 'boot');

// Layers, lowest first. A module may use its own layer and the ones below it; reaching up must go through core/hooks.
const RANK = { core: 0, render: 1, model: 2, interaction: 3, ui: 3, features: 3, boot: 4 };

// strip comments and string contents (template literals keep their ${…} expressions)
function code(src){
  let out = '', i = 0; const n = src.length, stack = [];
  while (i < n){
    const c = src[i], d = src[i + 1];
    if (stack.length && stack[stack.length - 1] === '`'){
      if (c === '\\'){ i += 2; continue; }
      if (c === '`'){ stack.pop(); out += ' '; i++; continue; }
      if (c === '$' && d === '{'){ stack.push('{'); out += ' '; i += 2; continue; }
      i++; continue;
    }
    if (c === '/' && d === '/'){ while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*'){ i = src.indexOf('*/', i + 2); i = i < 0 ? n : i + 2; out += ' '; continue; }
    if (c === '"' || c === "'"){ const q = c; i++; while (i < n && src[i] !== q){ if (src[i] === '\\') i++; if (src[i] === '\n') break; i++; } i++; out += ' 0 '; continue; }
    if (c === '`'){ stack.push('`'); out += ' '; i++; continue; }
    if (c === '{' && stack.length){ stack.push('{'); out += c; i++; continue; }
    if (c === '}' && stack.length && stack[stack.length - 1] === '{'){ stack.pop(); out += c; i++; continue; }
    // a regex literal after an operator or keyword: skip it so its contents don't read as names
    if (c === '/' && /[=(,:;!&|?{}\[\n]\s*$|\breturn\s*$/.test(out.slice(-12))){
      i++; let cls = false; while (i < n && (src[i] !== '/' || cls)){ if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; if (src[i] === '\n') break; i++; }
      i++; while (/[a-z]/.test(src[i] || '')) i++; out += ' 0 '; continue;
    }
    out += c; i++;
  }
  return out;
}
// top-level declarations: lines that start a statement at column 0
function topLevel(src){
  const names = new Set(), lines = src.split('\n');
  for (let li = 0; li < lines.length; li++){
    const l = lines[li];
    let m = l.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/) || l.match(/^class\s+([A-Za-z_$][\w$]*)/);
    if (m){ names.add(m[1]); continue; }
    if (!/^(const|let|var)\s/.test(l)) continue;
    // the statement up to its end at depth 0
    let text = '', depth = 0, done = false;
    for (let j = li; j < lines.length && !done; j++){
      for (const ch of lines[j] + '\n'){
        if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--;
        text += ch;
        if (depth === 0 && (ch === ';' || (ch === '\n' && !/[,=(\[{]\s*\n$/.test(text) ))){ done = true; break; }
      }
    }
    text = text.replace(/^(const|let|var)\s+/, '');
    let part = '', dep = 0;
    const decl = s => { const t = s.trim(); const dm = t.match(/^\{([^}]*)\}\s*=/) || t.match(/^\[([^\]]*)\]\s*=/);
      if (dm) for (const x of dm[1].split(',')) { const k = x.split(':').pop().split('=')[0].trim(); if (/^[A-Za-z_$][\w$]*$/.test(k)) names.add(k); }
      else { const k = t.match(/^([A-Za-z_$][\w$]*)/); if (k) names.add(k[1]); } };
    for (const ch of text){
      if ('([{'.includes(ch)) dep++; else if (')]}'.includes(ch)) dep--;
      if (ch === ',' && dep === 0){ decl(part); part = ''; } else part += ch;
    }
    decl(part);
  }
  return names;
}
const files = order.map(f => ({ f, src: fs.readFileSync(path.join(root, f), 'utf8') }));
const owner = new Map();
const dupes = [];
for (const x of files){ x.code = code(x.src); x.decl = topLevel(x.src); for (const name of x.decl){ if (owner.has(name)) dupes.push(`${name} is declared in both ${mod(owner.get(name))} and ${mod(x.f)}`); else owner.set(name, x.f); } }
// names this file declares anywhere (locals shadow globals of the same name)
const ids = list => list.split(',').map(s => s.split(/[:=]/)[s.includes(':') ? 1 : 0].replace(/[{}[\]\s.]/g, '')).filter(Boolean);
const localNames = c => new Set([...c.matchAll(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]).concat(
  [...c.matchAll(/\b(?:const|let|var)\s*[{[]([^}\]=]*)[}\]]/g)].flatMap(m => ids(m[1])),
  [...c.matchAll(/\bfunction\s*[\w$]*\s*\(([^)]*)\)/g)].flatMap(m => ids(m[1])),   // parameters
  [...c.matchAll(/\(([^()]*)\)\s*=>/g)].flatMap(m => ids(m[1])),
  [...c.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)].map(m => m[1])));
const deps = new Map(), problems = [];
for (const x of files){
  const local = localNames(x.code), uses = new Map();
  for (const m of x.code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\b(?!\s*:(?!:))/g)){
    const name = m[1], o = owner.get(name);
    if (!o || o === x.f || local.has(name)) continue;
    if (!uses.has(o)) uses.set(o, new Set()); uses.get(o).add(name);
  }
  deps.set(x.f, uses);
  for (const [o, names] of uses){
    const a = RANK[layer(x.f)], b = RANK[layer(o)];
    if (b > a) problems.push(`${mod(x.f)} (${layer(x.f)}) reaches up into ${mod(o)} (${layer(o)}): ${[...names].join(', ')}`);
  }
}
if (process.argv.includes('--write')){
  const out = ['# Module dependencies', '', 'Generated by `node tools/deps.mjs --write` from the source: each module, the modules whose top-level names it uses, and the names.', '',
    'Layer rule (checked by `npm run check`): **core → render → model → interaction / ui → features → boot**. A module may use its own layer and those below it. Lower layers reach features only through the hooks in `core/hooks.js`.', '',
    '| Module | Uses |', '|---|---|'];
  for (const x of files){ const u = deps.get(x.f); out.push(`| ${mod(x.f)} | ${[...u].map(([o, ns]) => `${mod(o)} (${[...ns].slice(0, 6).join(', ')}${ns.size > 6 ? ', …' : ''})`).join('<br>') || '—'} |`); }
  fs.writeFileSync(path.join(root, 'docs/DEPENDENCIES.md'), out.join('\n') + '\n');
  console.log('wrote docs/DEPENDENCIES.md');
}
problems.push(...dupes);   // one shared scope: a second declaration stops the whole bundle from loading
if (problems.length){ console.log(problems.join('\n')); console.log(`\n${problems.length} layer violation${problems.length > 1 ? 's' : ''}`); process.exit(1); }
console.log(`module boundaries ok · ${files.length} modules`);
