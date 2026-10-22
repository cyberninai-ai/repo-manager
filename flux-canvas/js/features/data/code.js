'use strict';
// @module features/data/code — A code snippet: fixed-width, line numbers, light syntax colours, its language on the tag.
// Copy it with C on the selection like any text; the label is a fenced block, so it pastes into docs as is.
// @uses features/data/core
// label:  Retry with backoff      (a title, optional)
//         ```js
//         for (let i = 0; i < 5; i++) …
//         ```
const CODE = { lh: 18, font: 12.5, max: 80 };
const CODE_LANGS = [['js', 'JavaScript'], ['ts', 'TypeScript'], ['py', 'Python'], ['sql', 'SQL'], ['json', 'JSON'], ['html', 'HTML'], ['css', 'CSS'], ['sh', 'Shell'], ['go', 'Go'], ['rust', 'Rust'], ['text', 'Plain text']];
const CODE_KW = new Set('const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this null undefined true false def lambda pass yield with as elif not and or is None True False select insert update delete where join left right inner outer on group by order limit create table values into fn pub struct impl enum match mut use func package type interface go defer chan map range'.split(' '));
function parseCode(text){
  const lines = String(text).split('\n'); let title = '', lang = 'text', i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && !lines[i].startsWith('```')){ title = lines[i].trim().slice(0, 120); i++; }
  let body = lines.slice(i);
  if (body[0]?.startsWith('```')){ lang = body[0].slice(3).trim().toLowerCase().slice(0, 12) || 'text'; body = body.slice(1); const end = body.findIndex(l => l.startsWith('```')); if (end >= 0) body = body.slice(0, end); }
  while (body.length && !body.at(-1).trim()) body.pop();
  return { title, lang, lines: body.map(l => l.replace(/\t/g, '  ')) };
}
const codeText = (title, lang, code) => [...(title ? [title] : []), '```' + lang, code.replace(/```/g, 'ˋˋˋ'), '```'].join('\n');
// a line in coloured pieces: comments, strings, numbers, keywords, the rest
function codeTokens(line, lang){
  const out = [], re = /(\/\/.*$|#.*$|--.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`[^`]*`?)|(\b\d[\d_.]*\b)|([A-Za-z_]\w*)|(\s+|.)/g; let m;
  while ((m = re.exec(line))){
    const [t] = m;
    if (m[1] && !(m[1][0] === '#' && !['py', 'sh', 'text'].includes(lang)) && !(m[1].startsWith('--') && lang !== 'sql')) { out.push([t, 'c']); continue; }
    out.push([t, m[2] ? 's' : m[3] ? 'n' : m[4] && CODE_KW.has(lang === 'sql' ? m[4].toLowerCase() : m[4]) ? 'k' : '']);
  }
  return out;
}
registerDataKind('code', {
  name: 'Code', icon: 'code', glyph: '‹›', blurb: 'A snippet with line numbers and colours, in a fixed-width font', min: [280, 90],
  label: codeText('', 'js', '// code'),
  layout(text){ const C = parseCode(text), n = Math.min(C.lines.length, CODE.max); mctx.font = `400 ${CODE.font}px ${FONTS.mono}`;
    return { w: Math.min(680, Math.max(300, 48 + Math.max(0, ...C.lines.slice(0, CODE.max).map(l => mctx.measureText(l).width)) + 20)), h: 36 + 12 + Math.max(1, n) * CODE.lh + (C.lines.length > CODE.max ? CODE.lh : 0) + 10 }; },
  draw(b, L, { el, accent }){
    if (!el) return;
    const C = parseCode(el.text), lang = CODE_LANGS.find(([k]) => k === C.lang)?.[1] || C.lang;
    dataCard(b, accent); dataHead(b, C.title || lang, 'CODE', C.title ? lang : plural(C.lines.length, 'line'));
    const top = b.y + 36; ctx.save(); ctx.beginPath(); ctx.rect(b.x + 1, top + 1, b.w - 2, b.h - 38); ctx.clip();
    ctx.fillStyle = TH.panel2 || TH.paper; ctx.fillRect(b.x + 1, top, 40, b.h - 37);
    const col = { c: TH.muted, s: TH.green, n: TH.amber, k: accent || TH.accent, '': TH.ink };
    C.lines.slice(0, CODE.max).forEach((line, i) => {
      const y = top + 12 + i * CODE.lh + CODE.lh / 2; if (y > b.y + b.h) return;
      ctx.font = `400 11px ${FONTS.mono}`; ctx.fillStyle = TH.faint || TH.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), b.x + 32, y + .5);
      ctx.textAlign = 'left'; let x = b.x + 50;
      for (const [t, k] of codeTokens(line, C.lang)){ ctx.font = `${k === 'c' ? 'italic ' : ''}${k === 'k' ? 600 : 400} ${CODE.font}px ${FONTS.mono}`; ctx.fillStyle = col[k]; ctx.fillText(t, x, y + .5); x += ctx.measureText(t).width; if (x > b.x + b.w) break; }
    });
    if (C.lines.length > CODE.max) fitText(`… ${plural(C.lines.length - CODE.max, 'more line')}`, b.x + 50, top + 12 + CODE.max * CODE.lh + CODE.lh / 2, b.w - 60, `500 11.5px ${FONTS.sans}`, TH.muted);
    ctx.restore();
  },
  others: 'Only its author changes the code. Copy it (⌘C) or comment on a line (M).',
  async form(el){
    const C = el ? parseCode(el.text) : null;
    const v = await formDialog(el ? 'Edit code' : 'New code snippet', [
      { id: 'title', label: 'Title (optional)', type: 'text', value: C?.title || '', half: true },
      { id: 'lang', label: 'Language', type: 'select', value: C?.lang && CODE_LANGS.some(([k]) => k === C.lang) ? C.lang : 'js', options: CODE_LANGS, half: true },
      { id: 'code', label: 'Code', type: 'textarea', rows: 12, mono: true, value: C ? C.lines.join('\n') : 'async function retry(fn, tries = 5){\n  for (let i = 0; i < tries; i++){\n    try { return await fn(); }\n    catch (e){ await sleep(2 ** i * 100); }\n  }\n  throw new Error(\'gave up\');\n}' },
    ], { ok: el ? 'Sign the new version' : 'Add code', why: 'Signed like everything else: the snippet people approved is the snippet that ships.' });
    if (!v) return null;
    return codeText(v.title.trim(), v.lang, v.code.replace(/\s+$/, ''));
  },
  title: text => parseCode(text).title || (CODE_LANGS.find(([k]) => k === parseCode(text).lang)?.[1] ?? 'Code'),
  describe(el){ const C = parseCode(el.text); return `${plural(C.lines.length, 'line')} of ${CODE_LANGS.find(([k]) => k === C.lang)?.[1] || C.lang}${C.lines[0] ? `, starting “${C.lines[0].trim().slice(0, 60)}”` : ''}`; },
  lines(el){ return parseCode(el.text).lines; },
});
