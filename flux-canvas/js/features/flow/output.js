'use strict';
// @module features/flow/output — Code that shows up on the canvas, and what flows deliver: a live-code node (HTML, or
// JavaScript drawing on a canvas) rendered in place and edited with the canvas updating as you type; a Results node
// that shows what reaches the end of a flow as a list, table, text, cards or a rendered page; and a Code step that runs
// your JavaScript over the items in a sealed worker
// @uses features/flow/engine, features/flow/nodes, features/flow/sandbox, features/data/core, features/data/code, ui/panels
// Live code label:  Bouncing dots         Results label:  Edit decision list
//                   ```js                                 show: list      (list, table, text, cards or page)
//                   ctx.fillRect(…)
//                   ```

/* the Code step */
pipeStep('code', { mode: 'pass', name: 'Run code', blurb: 'Your JavaScript over the items; what it returns flows on', fields: [
  { id: 'text', label: 'Code: the body of a function of items', type: 'textarea', rows: 10, mono: true, value: 'return items.map(i => ({ ...i, text: i.text.toUpperCase() }));',
    hint: 'Each item is { text, f: { field: value }, n }. Return a list, a string or a number. It runs sealed off (no network, no storage) and stops after 2 seconds.' }],
  summary: c => (String(c.text || '').split('\n').find(l => l.trim()) || '…').trim().slice(0, 48),
  async run(items, c){ return sandboxItems(await pipeSandbox(c.text || 'return items', items)); } });
// a flow with code someone else wrote asks first
PIPE_GUARDS.push(async P => trustCode(P.order.map(c => current(c) || S.records.get(c)).filter(e => e?.type === 'NODE' && (e.ek === 'step' && parseStep(e.text).do === 'code'))));

/* the Results node */
const RESULT_SHOW = [['list', 'A list'], ['table', 'A table of the fields'], ['text', 'Text'], ['cards', 'Cards'], ['page', 'A page (the items as HTML)']];
function parseResults(text){ const ls = String(text).split('\n').map(l => l.trim()), m = ls.map(l => l.match(/^show\s*:\s*(\w+)/i)).find(Boolean); return { title: (ls.find(l => l && !/^show\s*:/i.test(l)) || 'Results').slice(0, 120), show: m && RESULT_SHOW.some(([k]) => k === m[1].toLowerCase()) ? m[1].toLowerCase() : 'list' }; }
const resultsText = (title, show) => `${title}\nshow: ${show}`;
const resultsOut = el => pipeOut(el)?.out || [];
function resultsFields(items){ const ks = []; for (const i of items.slice(0, 50)) for (const k of Object.keys(i.f || {})) if (!ks.includes(k) && ks.length < 5) ks.push(k); return ks; }
registerDataKind('results', {
  name: 'Results', icon: 'list', glyph: '☰', menu: 'flow', blurb: 'Shows what reaches the end of a flow: a list, table, text, cards or a page', min: [300, 180],
  label: resultsText('Results', 'list'),
  layout(){ return { w: 380, h: 280 }; },
  draw(b, L, { el, accent }){
    if (!el) return;
    const R = parseResults(el.text), o = pipeOut(el), items = o?.out || [], y0 = b.y + 36;
    dataCard(b, accent); dataHead(b, R.title, 'RESULTS', o ? plural(items.length, 'item') : '');
    if (!o){ fitText('Connect it at the end of a flow, then run the flow', b.x + 12, y0 + 22, b.w - 24, `500 12.5px ${FONTS.sans}`, TH.muted); return; }
    if (o.state === 'run'){ fitText('Working…', b.x + 12, y0 + 22, b.w - 24, `500 12.5px ${FONTS.sans}`, TH.accent); return; }
    if (!items.length){ fitText('Nothing reached it in the last run', b.x + 12, y0 + 22, b.w - 24, `500 12.5px ${FONTS.sans}`, TH.muted); return; }
    const bottom = b.y + b.h - 22;
    ctx.save(); ctx.beginPath(); ctx.rect(b.x + 1, y0 + 1, b.w - 2, b.h - 38); ctx.clip();
    if (R.show === 'page'){ if (!resultsTrusted(el, o)){ rr(ctx, b.x + b.w / 2 - 110, y0 + 40, 220, 30, 15); ctx.fillStyle = TH.accent; ctx.fill(); fitText(`▶ Show the page from ${whoName(o.run.author)}’s run`, b.x + b.w / 2, y0 + 55, 210, `600 12px ${FONTS.sans}`, '#fff', 'center'); } }
    else if (R.show === 'table'){
      const ks = resultsFields(items), cols = ks.length ? ks : ['text'], cw = (b.w - 24) / cols.length;
      ctx.fillStyle = TH.panel2 || TH.paper; ctx.fillRect(b.x + 1, y0, b.w - 2, 26);
      cols.forEach((k, j) => fitText(k, b.x + 12 + j * cw, y0 + 13, cw - 8, `600 11.5px ${FONTS.sans}`, TH.muted));
      items.forEach((it, i) => { const y = y0 + 26 + i * 24; if (y > bottom) return; ctx.beginPath(); ctx.moveTo(b.x + 1, y); ctx.lineTo(b.x + b.w - 1, y); ctx.strokeStyle = TH.line2 || TH.line; ctx.lineWidth = 1; ctx.stroke();
        cols.forEach((k, j) => fitText(k === 'text' ? it.text : pipeField(it, k) ?? '', b.x + 12 + j * cw, y + 12, cw - 8, `400 12.5px ${FONTS.sans}`, TH.ink)); });
    } else if (R.show === 'text'){
      mctx.font = `400 13px ${FONTS.sans}`; let y = y0 + 18;
      for (const it of items){ for (const line of wrapLines(it.text, b.w - 28)){ if (y > bottom) break; fitText(line, b.x + 14, y, b.w - 28, `400 13px ${FONTS.sans}`, TH.ink); y += 18; } y += 8; }
    } else if (R.show === 'cards'){
      const cw = 160, ch = 70, per = Math.max(1, Math.floor((b.w - 16) / (cw + 8)));
      items.forEach((it, i) => { const x = b.x + 10 + (i % per) * (cw + 8), y = y0 + 10 + Math.floor(i / per) * (ch + 8); if (y + ch > b.y + b.h - 4) return;
        rr(ctx, x, y, cw, ch, 8); ctx.fillStyle = tint(accent || TH.accent, .08); ctx.fill(); ctx.strokeStyle = TH.line2 || TH.line; ctx.stroke();
        mctx.font = `500 12px ${FONTS.sans}`; wrapLines(it.text, cw - 16).slice(0, 3).forEach((l, k) => fitText(l, x + 8, y + 14 + k * 17, cw - 16, `500 12px ${FONTS.sans}`, TH.ink)); });
    } else items.forEach((it, i) => { const y = y0 + 16 + i * 20; if (y > bottom) return; fitText((items.length > 1 ? '• ' : '') + it.text.replace(/\s+/g, ' '), b.x + 12, y, b.w - 24, `400 13px ${FONTS.sans}`, TH.ink); });
    ctx.restore();
    fitText(o.run ? `From ${samePerson(o.run.author, S.me?.id) ? 'your' : whoName(o.run.author) + '’s'} run, ${when(o.run.t)}` : 'Just now', b.x + 12, b.y + b.h - 12, b.w - 24, `500 11px ${FONTS.sans}`, TH.muted);
  },
  hit(el, w, b){ const o = pipeOut(el); return parseResults(el.text).show === 'page' && o?.out?.length && !resultsTrusted(el, o) && w.y > b.y + 36 ? { act: 'trust', press: true } : null; },
  press(el){ const o = pipeOut(el); if (o?.run) CODE_OK.add('run:' + o.run.cid); dirty = true; },
  others: 'It shows the last run of the flow it ends. Only its author changes how it shows it.',
  async form(el){
    const R = el ? parseResults(el.text) : null;
    const v = await formDialog(el ? 'Edit results' : 'New results', [{ id: 'title', label: 'Name', type: 'text', value: R ? R.title : 'Results' },
      { id: 'show', label: 'Show them as', type: 'select', value: R?.show || 'list', options: RESULT_SHOW, hint: 'A page renders the items as HTML in a sealed frame: a flow that writes a web page shows it here.' }],
      { ok: el ? 'Sign the new version' : 'Add results', why: 'Connect it at the end of a flow: it shows what arrives each time the flow runs.' });
    return v ? resultsText(v.title.trim() || 'Results', v.show) : null;
  },
  describe(el){ const items = resultsOut(el); return items.length ? `${plural(items.length, 'item')}: ${items.slice(0, 5).map(i => i.text.slice(0, 60)).join('; ')}` : 'nothing yet; it shows what reaches the end of a flow'; },
  lines(el){ return resultsOut(el).slice(0, 30).map(i => i.text.replace(/\s+/g, ' ')); },
});
// a page from your own run, or from a run you chose to show
const resultsTrusted = (el, o) => !o?.run || o.live || samePerson(o.run.author, S.me?.id) || CODE_OK.has('run:' + o.run.cid);
LIVE_SOURCES.push(el => {
  if (el.ek !== 'results' || parseResults(el.text).show !== 'page') return null;
  const o = pipeOut(el); if (!o?.out?.length || o.state === 'run' || !resultsTrusted(el, o)) return null;
  const b = box(el); return { lang: 'html', code: o.out.map(i => i.text).join('\n'), area: { x: 1, y: 37, w: b.w - 2, h: b.h - 54 } };
});

/* the live-code node: write code, and it runs on the canvas */
const LIVE_DRAFT = new Map();   // root → { title, lang, code } typed in the editor, not signed yet: only this browser shows it
const LIVE_LANGS = [['html', 'HTML, CSS and JavaScript'], ['js', 'JavaScript drawing on a canvas (canvas, ctx)']];
const liveCode = el => { const C = parseCode(el.text), d = LIVE_DRAFT.get(dataRoot(el)); return d || { title: C.title, lang: C.lang === 'js' ? 'js' : 'html', code: C.lines.join('\n') }; };
const LIVE_SAMPLE = `// canvas and ctx are ready; the frame is the node's size
const dots = Array.from({ length: 24 }, (_, i) => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: Math.cos(i) * 2, vy: Math.sin(i * 1.7) * 2, r: 6 + i % 5 * 2 }));
function frame(){
  ctx.fillStyle = '#f7f7fb'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const d of dots){
    d.x += d.vx; d.y += d.vy;
    if (d.x < d.r || d.x > canvas.width - d.r) d.vx *= -1;
    if (d.y < d.r || d.y > canvas.height - d.r) d.vy *= -1;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fillStyle = \`hsl(\${d.r * 18} 70% 60%)\`; ctx.fill();
  }
  requestAnimationFrame(frame);
}
frame();`;
registerDataKind('live', {
  name: 'Live code', icon: 'code', glyph: '⟨⟩', menu: 'flow', blurb: 'Write HTML or JavaScript and see it run right on the canvas', min: [260, 160],
  label: codeText('Live code', 'js', LIVE_SAMPLE),
  layout(){ return { w: 420, h: 300 }; },
  draw(b, L, { el, accent }){
    if (!el) return;
    const C = liveCode(el), draft = LIVE_DRAFT.has(dataRoot(el));
    dataCard(b, accent || (draft ? TH.amber : null)); dataHead(b, C.title || 'Live code', 'LIVE CODE', draft ? 'unsigned changes' : C.lang === 'js' ? 'JavaScript' : 'HTML', draft ? TH.amber : TH.accent);
    if (!codeTrusted(el)){ rr(ctx, b.x + b.w / 2 - 100, b.y + b.h / 2 - 15, 200, 30, 15); ctx.fillStyle = TH.accent; ctx.fill(); fitText(`▶ Run code by ${whoName(el.author)}`, b.x + b.w / 2, b.y + b.h / 2, 190, `600 12px ${FONTS.sans}`, '#fff', 'center');
      fitText('It runs sealed off: no network, nothing of yours', b.x + b.w / 2, b.y + b.h / 2 + 30, b.w - 24, `500 11.5px ${FONTS.sans}`, TH.muted, 'center'); }
    else { ctx.fillStyle = TH.panel2 || TH.paper; ctx.fillRect(b.x + 1, b.y + 37, b.w - 2, b.h - 38); fitText('Loading…', b.x + 12, b.y + 56, b.w - 24, `500 12px ${FONTS.sans}`, TH.muted); }
  },
  hit(el, w, b){ return w.y > b.y + 36 ? { act: codeTrusted(el) ? 'body' : 'trust', press: !codeTrusted(el) } : null; },
  press(el){ CODE_OK.add(dataRoot(el)); dirty = true; say(`Running the code by ${whoName(el.author)}.`); },
  edit(el){ if (el.author !== S.me.id){ if (!codeTrusted(el)){ CODE_OK.add(dataRoot(el)); dirty = true; } else toast('Only its author changes this code. Comment on it (M).'); return true; } openLive(el); return true; },
  insert: async () => { closeMenu(false); const c = viewCenter(), cid = await commitNode({ kind: 'live', x: c.x - 210, y: c.y - 150, label: codeText('Live code', 'js', LIVE_SAMPLE) }); if (cid){ S.sel = new Set([cid]); openLive(current(cid)); } return cid; },
  async form(el){ openLive(el); return null; },
  title: text => parseCode(text).title || 'Live code',
  describe(el){ const C = liveCode(el); return `${C.lang === 'js' ? 'JavaScript drawing on a canvas' : 'HTML'}, ${plural(C.code.split('\n').length, 'line')}, rendered in place${codeTrusted(el) ? '' : `; written by ${whoName(el.author)}, press Run to run it`}`; },
  lines(el){ return liveCode(el).code.split('\n'); },
});
LIVE_SOURCES.push(el => { if (el.ek !== 'live' || !codeTrusted(el)) return null; const C = liveCode(el), b = box(el); return { lang: C.lang, code: C.code, area: { x: 1, y: 37, w: b.w - 2, h: b.h - 38 } }; });

/* the editor: type, and the node on the canvas runs what you typed; sign to share it */
const LIVE_ED = { root: null };
const liveTarget = () => LIVE_ED.root && S.D.els.find(e => e.type === 'NODE' && e.ek === 'live' && !S.D.superseded.has(e.cid) && dataRoot(e) === LIVE_ED.root);
function openLive(el){ LIVE_ED.root = dataRoot(el); S.sel = new Set([el.cid]); ensureVisible(el); openPanel('livecode'); setTimeout(() => document.querySelector('#px-livecode textarea')?.focus(), 30); }
registerPanel({
  id: 'livecode', title: 'Live code', blurb: 'Type and the node on the canvas runs it. Only you see changes until you sign them.',
  paint(body){
    const el = liveTarget(); if (!el){ body.innerHTML = '<p class="empty">Double-click a live-code node to edit it, or add one: Data → Live code.</p>'; return; }
    const C = liveCode(el), draft = LIVE_DRAFT.has(dataRoot(el));
    body.innerHTML = `<div class="row2"><label class="muted" for="lcT">Name</label><input id="lcT" data-k="lt" class="grow" value="${esc(C.title)}">
      <label class="muted" for="lcL">Language</label><select id="lcL" data-k="ll">${LIVE_LANGS.map(([k, n]) => `<option value="${k}"${k === C.lang ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <textarea id="lcC" data-k="lc" class="lc-code" rows="20" spellcheck="false" aria-label="Code">${esc(C.code)}</textarea>
      <p class="muted">${C.lang === 'js' ? '<code>canvas</code> and <code>ctx</code> are ready, sized to the node.' : 'A whole page: HTML, &lt;style&gt; and &lt;script&gt;.'} It runs in a sealed frame with no network. Resize the node to give it room.</p>
      <div class="acts"><button class="btn primary" data-save${draft ? '' : ' disabled'}>Sign this version</button><button class="btn" data-discard${draft ? '' : ' disabled'}>Discard changes</button><span class="pill ${draft ? 'warn' : 'good'}">${draft ? 'Unsigned changes' : 'Signed'}</span></div>`;
  },
  async click(e, b){
    const el = liveTarget(); if (!el) return;
    if (b.hasAttribute('data-discard')){ LIVE_DRAFT.delete(dataRoot(el)); paintPanel('livecode'); const t = $('lcC'); if (t) t.value = liveCode(el).code; dirty = true; return; }
    if (b.hasAttribute('data-save')){ const d = LIVE_DRAFT.get(dataRoot(el)); if (!d) return; const cid = await dataSave(el, codeText(d.title.trim() || 'Live code', d.lang, d.code)); if (cid){ LIVE_DRAFT.delete(dataRoot(el)); toast('Signed: everyone sees this version now.'); } paintPanel('livecode'); }
  },
});
let liveT = 0;
PANELS.get('livecode').el.addEventListener('input', () => {
  const el = liveTarget(); if (!el) return;
  clearTimeout(liveT); liveT = setTimeout(() => {
    const d = { title: $('lcT')?.value ?? '', lang: $('lcL')?.value === 'js' ? 'js' : 'html', code: $('lcC')?.value ?? '' }, C = parseCode(el.text);
    if (d.code === C.lines.join('\n') && d.lang === (C.lang === 'js' ? 'js' : 'html') && d.title === C.title) LIVE_DRAFT.delete(dataRoot(el)); else LIVE_DRAFT.set(dataRoot(el), d);
    dirty = true; const s = document.querySelector('#px-livecode .pill'); if (s){ s.className = `pill ${LIVE_DRAFT.has(dataRoot(el)) ? 'warn' : 'good'}`; s.textContent = LIVE_DRAFT.has(dataRoot(el)) ? 'Unsigned changes' : 'Signed'; }
    document.querySelectorAll('#px-livecode [data-save],#px-livecode [data-discard]').forEach(x => x.disabled = !LIVE_DRAFT.has(dataRoot(el)));
  }, 150);
});
PANELS.get('livecode').el.addEventListener('change', () => PANELS.get('livecode').el.dispatchEvent(new Event('input')));
