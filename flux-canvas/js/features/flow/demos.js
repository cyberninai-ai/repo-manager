'use strict';
// @module features/flow/demos — Flows to drop in: ready-to-run examples for writing, coding, design, video, marketing,
// research, product and meetings, placed in a free spot on the canvas you're on. Each runs as it is with the built-in
// responders and runs better with AI connected; each is ordinary nodes, so it can be changed like anything else.
// @uses features/flow/engine, features/flow/nodes, features/flow/output, features/data/table, features/data/code
// A demo is a list of nodes [key, kind, x, y, label, parent key?, { color, W, H }?] and connectors [from key, to key].
const FLOW_DEMOS = [];
const DEMO_CATS = [['writing', 'Writing'], ['coding', 'Coding'], ['design', 'Design'], ['video', 'Video editing'], ['marketing', 'Marketing'], ['research', 'Research'], ['product', 'Product'], ['meetings', 'Meetings']];
const demoStep = (title, cfg) => stepText(title, cfg);
const demoX = k => k * 340;   // steps sit in a row, one every 340 units
FLOW_DEMOS.push(
  { id: 'blog', cat: 'writing', name: 'Blog post: outline to draft', blurb: 'Sections become headings, then a draft (AI writes it when connected)', nodes: [
    ['f', 'flow', 0, 0, flowText('Blog post', ['Why changes should be signed', 'What a signed canvas lets you prove', 'How teams use it day to day', 'Where to start'])],
    ['s1', 'step', demoX(1), 0, demoStep('Headings', { do: 'template', text: '## {{text}}' }), 'f'],
    ['s2', 'step', demoX(2), 0, demoStep('One outline', { do: 'join', with: 'lines' }), 's1'],
    ['s3', 'step', demoX(3), 0, demoStep('Draft it', { do: 'ask', prompt: 'Write a 400-word blog post with these sections, plain and practical:\n{{all}}', as: 'text', using: 'auto' }), 's2'],
    ['r', 'results', demoX(4), 0, resultsText('Draft', 'text'), 's3']] },
  { id: 'edit', cat: 'writing', name: 'Editing pass: long sentences', blurb: 'Splits a draft into sentences and lists the ones over 20 words', nodes: [
    ['f', 'flow', 0, 0, flowText('Editing pass', [])],
    ['n', 'sticky', 0, 150, 'We built the canvas so that every change anyone makes is signed with their key and stored as a record, which means that months later you can still prove who changed what and when, without trusting a server. It is simple. Try it with your team this week, and tell us what breaks.', null, { W: 300, H: 220 }],
    ['s1', 'step', demoX(1), 0, demoStep('Sentences', { do: 'split', by: 'sentences' }), 'f'],
    ['s2', 'step', demoX(2), 0, demoStep('Over 20 words', { do: 'code', text: 'return items\n  .map(i => ({ ...i, n: i.text.split(/\\s+/).length }))\n  .filter(i => i.n > 20)\n  .map(i => ({ ...i, text: `${i.n} words: ${i.text}` }));' }), 's1'],
    ['r', 'results', demoX(3), 0, resultsText('Sentences to shorten', 'list'), 's2']], arrows: [['n', 's1']] },
  { id: 'landing', cat: 'coding', name: 'Landing page builder', blurb: 'A table of sections, code that writes the HTML, and the page rendered on the canvas', nodes: [
    ['f', 'flow', 0, 0, flowText('Landing page', [])],
    ['t', 'table', 0, 150, tableText('Sections', ['Heading', 'Text'], [['Every change, signed', 'A canvas where each edit carries its author’s signature.'], ['Work together live', 'Peer to peer, no server needed.'], ['Prove what was approved', 'Deliver a version and get a proof anyone can check.']])],
    ['s1', 'step', demoX(1), 0, demoStep('Write the HTML', { do: 'code', text: 'const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));\nconst css = "body{font-family:system-ui;margin:0;color:#1d2129}header{background:#5b54e8;color:#fff;padding:28px}section{padding:16px 28px;border-bottom:1px solid #eee}h2{margin:0 0 4px;font-size:18px}p{margin:0;color:#555}";\nreturn `<style>${css}</style><header><h1>Flux Canvas</h1></header>` + items.map(i => `<section><h2>${esc(i.f.Heading)}</h2><p>${esc(i.f.Text)}</p></section>`).join("");' }), 'f'],
    ['r', 'results', demoX(2), 0, resultsText('Preview', 'page'), 's1', { W: 420, H: 360 }]], arrows: [['t', 's1']] },
  { id: 'tests', cat: 'coding', name: 'Spec to test plan', blurb: 'High-priority requirements become test cases on a checklist', nodes: [
    ['f', 'flow', 0, 0, flowText('Test plan', [])],
    ['t', 'table', 0, 150, tableText('Spec', ['Requirement', 'Priority'], [['user can sign up with email', 'High'], ['user can reset a password', 'High'], ['admin can export users', 'Low'], ['session expires after 30 days', 'High']])],
    ['s1', 'step', demoX(1), 0, demoStep('High priority', { do: 'filter', where: 'Priority = High' }), 'f'],
    ['s2', 'step', demoX(2), 0, demoStep('As test names', { do: 'template', text: 'it(\'{{Requirement}}\')' }), 's1'],
    ['s3', 'step', demoX(3), 0, demoStep('Onto the checklist', { do: 'items', into: 'Test cases' }), 's2'],
    ['c', 'checklist', demoX(4), 0, checklistText('Test cases', [])]], arrows: [['t', 's1']] },
  { id: 'sketch', cat: 'coding', name: 'Live code sketches', blurb: 'Two pieces of code running on the canvas: an animation and a small app', nodes: [
    ['a', 'live', 0, 0, codeText('Bouncing dots', 'js', LIVE_SAMPLE), null, { W: 420, H: 300 }],
    ['b', 'live', 460, 0, codeText('Counter', 'html', '<style>body{display:grid;place-items:center;height:100vh;font-family:system-ui}button{font-size:18px;padding:10px 18px;border-radius:10px;border:0;background:#5b54e8;color:#fff}</style>\n<div><p id="n">Clicked 0 times</p><button id="b">Click me</button></div>\n<script>let n = 0; document.getElementById("b").onclick = () => document.getElementById("n").textContent = `Clicked ${++n} times`;<\/script>'), null, { W: 320, H: 300 }]] },
  { id: 'palette', cat: 'design', name: 'Palette from brand colours', blurb: 'Brand colours in a table become swatches with tints, rendered as a page', nodes: [
    ['f', 'flow', 0, 0, flowText('Palette', [])],
    ['t', 'table', 0, 150, tableText('Brand colours', ['Name', 'Hex'], [['Indigo', '#5b54e8'], ['Coral', '#e8590c'], ['Mint', '#2f9e44'], ['Ink', '#1d2129']])],
    ['s1', 'step', demoX(1), 0, demoStep('Swatches', { do: 'code', text: 'const mix = (h, t) => { const n = parseInt(h.slice(1), 16), c = [n >> 16, n >> 8 & 255, n & 255].map(v => Math.round(v + (255 - v) * t)); return `rgb(${c})`; };\nreturn "<style>body{font-family:system-ui;margin:12px}.row{display:flex;gap:6px;margin-bottom:10px;align-items:center}.s{width:44px;height:44px;border-radius:8px}b{width:70px;font-size:13px}</style>" +\n  items.map(i => `<div class=row><b>${i.f.Name}</b>${[0, .25, .5, .75].map(t => `<div class=s style="background:${mix(i.f.Hex, t)}"></div>`).join("")}</div>`).join("");' }), 'f'],
    ['r', 'results', demoX(2), 0, resultsText('Palette', 'page'), 's1', { W: 380, H: 300 }]], arrows: [['t', 's1']] },
  { id: 'critique', cat: 'design', name: 'Design critique to ideas', blurb: 'Feedback notes, split and de-duplicated, spark ideas onto new notes', nodes: [
    ['f', 'flow', 0, 0, flowText('Critique', [])],
    ['n1', 'sticky', 0, 150, 'Navigation is hard to find\nToo many colours on the home page', null, { color: 'pink' }],
    ['n2', 'sticky', 190, 150, 'Buttons look disabled\nNavigation is hard to find', null, { color: 'pink' }],
    ['s1', 'step', demoX(1), 0, demoStep('One per line', { do: 'split', by: 'lines' }), 'f'],
    ['s2', 'step', demoX(2), 0, demoStep('No repeats', { do: 'unique' }), 's1'],
    ['s3', 'step', demoX(3), 0, demoStep('Ideas', { do: 'ideas', count: '1', using: 'auto' }), 's2'],
    ['s4', 'step', demoX(4), 0, demoStep('On notes', { do: 'notes', color: 'violet', max: '8' }), 's3']], arrows: [['n1', 's1'], ['n2', 's1']] },
  { id: 'edl', cat: 'video', name: 'Edit decision list', blurb: 'Rated clips in, the best in order with running timecodes out', nodes: [
    ['f', 'flow', 0, 0, flowText('Rough cut', [])],
    ['t', 'table', 0, 150, tableText('Footage', ['Clip', 'Seconds', 'Rating'], [['Opening drone shot', '8', '5'], ['Interview A, take 2', '24', '4'], ['B-roll office', '12', '2'], ['Interview B, take 1', '18', '5'], ['Product close-up', '6', '4']])],
    ['s1', 'step', demoX(1), 0, demoStep('Rated 4 or more', { do: 'filter', where: 'Rating >= 4' }), 'f'],
    ['s2', 'step', demoX(2), 0, demoStep('Best first', { do: 'sort', by: 'Rating', order: 'desc' }), 's1'],
    ['s3', 'step', demoX(3), 0, demoStep('Timecodes', { do: 'code', text: 'let t = 0;\nconst tc = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;\nreturn items.map(i => { const len = Number(i.f.Seconds) || 0, from = t; t += len;\n  return { text: `${tc(from)} to ${tc(t)}  ${i.text}`, f: { In: tc(from), Out: tc(t), Clip: i.text }, n: len }; });' }), 's2'],
    ['r', 'results', demoX(4), 0, resultsText('Edit decision list', 'table'), 's3']], arrows: [['t', 's1']] },
  { id: 'shots', cat: 'video', name: 'Script to shot list', blurb: 'A script becomes numbered shots with a time estimate for each', nodes: [
    ['f', 'flow', 0, 0, flowText('Shot list', [])],
    ['n', 'sticky', 0, 150, 'A team opens a blank canvas. Ana sketches the plan. Ben joins from his phone and adds three ideas. They vote, decide, and ship it before lunch.', null, { W: 300, H: 200 }],
    ['s1', 'step', demoX(1), 0, demoStep('Sentences', { do: 'split', by: 'sentences' }), 'f'],
    ['s2', 'step', demoX(2), 0, demoStep('Number and time them', { do: 'code', text: 'return items.map((i, k) => {\n  const secs = Math.max(2, Math.round(i.text.split(/\\s+/).length / 2.5));\n  return { text: `Shot ${k + 1}, ${secs}s: ${i.text}`, f: { Shot: String(k + 1), Seconds: String(secs), Action: i.text }, n: secs };\n});' }), 's1'],
    ['r', 'results', demoX(3), 0, resultsText('Shots', 'table'), 's2']], arrows: [['n', 's1']] },
  { id: 'launch', cat: 'marketing', name: 'Launch posts', blurb: 'Features and benefits become post drafts on notes (AI writes them when connected)', nodes: [
    ['f', 'flow', 0, 0, flowText('Launch posts', [])],
    ['t', 'table', 0, 150, tableText('Features', ['Feature', 'Benefit'], [['Signed changes', 'prove who did what'], ['Live together', 'no server to set up'], ['Flows', 'turn ideas into results in one click']])],
    ['s1', 'step', demoX(1), 0, demoStep('Feature and benefit', { do: 'template', text: '{{Feature}}: {{Benefit}}' }), 'f'],
    ['s2', 'step', demoX(2), 0, demoStep('Write posts', { do: 'ask', prompt: 'Write one short launch post per line, one for each:\n{{all}}', as: 'list', using: 'auto' }), 's1'],
    ['s3', 'step', demoX(3), 0, demoStep('On notes', { do: 'notes', color: 'blue', max: '6' }), 's2']], arrows: [['t', 's1']] },
  { id: 'synthesis', cat: 'research', name: 'Interview synthesis', blurb: 'Tagged quotes grouped into themes, counted and ranked', nodes: [
    ['f', 'flow', 0, 0, flowText('Synthesis', [])],
    ['t', 'table', 0, 150, tableText('Quotes', ['Quote', 'Theme'], [['I never know who changed the plan', 'Trust'], ['Setting up the tool took a day', 'Onboarding'], ['We argue about what was agreed', 'Trust'], ['I gave up during signup', 'Onboarding'], ['Exports are fine', 'Export'], ['Approvals get lost in chat', 'Trust']])],
    ['s1', 'step', demoX(1), 0, demoStep('Group by theme', { do: 'code', text: 'const g = {};\nfor (const i of items) (g[i.f.Theme] ||= []).push(i.text);\nreturn Object.entries(g).sort((a, b) => b[1].length - a[1].length)\n  .map(([theme, qs]) => ({ text: theme, f: { Theme: theme, Quotes: String(qs.length), Example: qs[0] }, n: qs.length }));' }), 'f'],
    ['r', 'results', demoX(2), 0, resultsText('Themes', 'table'), 's1', { W: 420, H: 240 }]], arrows: [['t', 's1']] },
  { id: 'rice', cat: 'product', name: 'Prioritise with RICE', blurb: 'Reach, impact, confidence and effort scored; the top three go to the next sprint', nodes: [
    ['f', 'flow', 0, 0, flowText('Prioritise', [])],
    ['t', 'table', 0, 150, tableText('Ideas', ['Idea', 'Reach', 'Impact', 'Confidence', 'Effort'], [['Shorter signup', '800', '2', '80', '2'], ['Dark mode', '300', '1', '90', '3'], ['Templates gallery', '600', '2', '70', '4'], ['Offline mode', '200', '3', '50', '8'], ['Slack alerts', '500', '1', '80', '1']])],
    ['s1', 'step', demoX(1), 0, demoStep('RICE score', { do: 'code', text: 'return items.map(i => {\n  const f = i.f, score = Math.round(f.Reach * f.Impact * f.Confidence / 100 / f.Effort);\n  return { ...i, text: `${i.text} (RICE ${score})`, f: { ...f, RICE: String(score) }, n: score };\n});' }), 'f'],
    ['s2', 'step', demoX(2), 0, demoStep('Highest first', { do: 'sort', by: 'RICE', order: 'desc' }), 's1'],
    ['s3', 'step', demoX(3), 0, demoStep('Top three', { do: 'take', count: '3' }), 's2'],
    ['s4', 'step', demoX(4), 0, demoStep('Into the sprint', { do: 'items', into: 'Next sprint' }), 's3'],
    ['c', 'checklist', demoX(5), 0, checklistText('Next sprint', [])]], arrows: [['t', 's1']] },
  { id: 'actions', cat: 'meetings', name: 'Meeting notes to actions', blurb: 'Lines that start with “Action:” become a checklist', nodes: [
    ['f', 'flow', 0, 0, flowText('Actions', [])],
    ['n', 'sticky', 0, 150, 'Decision: ship on the 15th\nAction: Ana drafts the announcement\nAction: Ben fixes the signup bug\nNote: pricing stays the same\nAction: Chen books the demo', null, { W: 300, H: 200 }],
    ['s1', 'step', demoX(1), 0, demoStep('Lines', { do: 'split', by: 'lines' }), 'f'],
    ['s2', 'step', demoX(2), 0, demoStep('Actions only', { do: 'filter', where: 'text contains action:' }), 's1'],
    ['s3', 'step', demoX(3), 0, demoStep('Tidy', { do: 'code', text: 'return items.map(i => i.text.replace(/^action:\\s*/i, ""));' }), 's2'],
    ['s4', 'step', demoX(4), 0, demoStep('Onto the list', { do: 'items', into: 'Action items' }), 's3'],
    ['c', 'checklist', demoX(5), 0, checklistText('Action items', [])]], arrows: [['n', 's1']] },
);
// the box a demo will take, before anything is signed
function demoBox(d){ let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [, kind, x, y, label, , o] of d.nodes){ const L = nodeLayout(kind, label, o?.W || 0, o?.H || 0); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + L.w); y1 = Math.max(y1, y + L.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
// somewhere free: where you're looking if it's empty, otherwise below everything already on the canvas
function demoSpot(bb){
  const c = viewCenter(), at = { x: Math.round(c.x - bb.w / 2), y: Math.round(c.y - bb.h / 2) }, r = { x: at.x - 40, y: at.y - 40, w: bb.w + 80, h: bb.h + 80 };
  const boxes = S.D.els.filter(e => visible(e) && !S.D.hidden.has(e.cid) && e.type !== 'ARROW').map(box).filter(Boolean);
  if (!boxes.some(b => b.x < r.x + r.w && r.x < b.x + b.w && b.y < r.y + r.h && r.y < b.y + b.h)) return at;
  return { x: Math.round(Math.min(...boxes.map(b => b.x))), y: Math.round(Math.max(...boxes.map(b => b.y + b.h)) + 160) };
}
async function dropDemo(id){
  const d = FLOW_DEMOS.find(x => x.id === id); if (!d) return null; closeMenu(false);
  const bb = demoBox(d), at = demoSpot(bb), keys = new Map(), made = [];
  await bulk(async () => {
    for (const [k, kind, x, y, label, parent, o] of d.nodes){
      const cid = await commitNode({ kind, x: at.x + x - bb.x, y: at.y + y - bb.y, label, parent: parent ? keys.get(parent) : null, color: o?.color || 'ink', W: o?.W || 0, H: o?.H || 0 });
      if (cid){ keys.set(k, cid); made.push(cid); }
    }
  });
  await new Promise(r => setTimeout(r, 0));
  for (const [a, b] of d.arrows || []){ const A = current(keys.get(a)), B = current(keys.get(b)); if (A && B){ const c = await commitArrow(A, B); if (c) made.push(c); } }
  await new Promise(r => setTimeout(r, 0));
  // show all of it
  const z = Math.max(.25, Math.min(1, (innerWidth - 120) / (bb.w + 120), (innerHeight - 220) / (bb.h + 120)));
  S.view = { zoom: z, x: at.x + bb.w / 2 - innerWidth / 2 / z, y: at.y + bb.h / 2 - innerHeight / 2 / z };
  const flow = d.nodes.find(n => n[1] === 'flow');
  S.sel = new Set(flow ? [current(keys.get(flow[0]))?.cid].filter(Boolean) : made.slice(0, 1)); dirty = true;
  toast(`${d.name} dropped in.${flow ? ' Press ▶ Run on the flow.' : ''}`); say(`${d.name}: ${d.blurb}. ${flow ? 'The flow is selected; press its Run button to run it.' : ''}`);
  return { keys, made };
}
// the gallery: Data → Flow templates, the Flows panel, and the palette
function demoMenu(){
  const items = [];
  for (const [cat, title] of DEMO_CATS){ const ds = FLOW_DEMOS.filter(d => d.cat === cat); if (!ds.length) continue; items.push({ head: title }); for (const d of ds) items.push({ label: d.name, sub: d.blurb, icon: d.nodes.some(n => n[1] === 'live') ? 'code' : 'pipe', run: () => dropDemo(d.id) }); }
  openMenu(dataBtn, items, null, 'hub data');
}
DATA_MENU_EXTRA.push({ menu: 'flow', label: 'Flow templates…', sub: 'Ready-to-run flows for writing, coding, design, video and more', icon: 'hub', run: demoMenu });
PALETTE_HOOKS.push(add => { for (const d of FLOW_DEMOS) add('data', `Drop in flow: ${d.name}`, () => dropDemo(d.id)); });
