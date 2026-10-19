'use strict';
// @module features/flows — Composable approvals: an approval flow is a signed record that sets the rules a delivery must meet:
// groups of people with their own thresholds (Engineering 2 of 3, Legal 1 of 1), an optional order (Legal signs only after
// Engineering), conditions on the canvas itself (every claim grounded, every task done, no split decision, a ritual closed), and
// an escalation flow that applies when a group stalls. A delivery names its flow; every peer evaluates it the same way.
// @uses features/work (DELIVERY_HOOKS), FLOW_CONDITIONS from other features, ui/panels, ui/form
// FLOW-I-R-{nonce}-M-{name}-G-{group~need~key+key… _ …}-Q-{1 in order|0}-C-{condition _ …|0}-E-{escalation flow|0}-D-{after hours|0}-Z-T-SIG
registerRecord('FLOW', { parse(r, f){ if (!f.R || !f.G) throw Error('flow'); r.name = decTxt(f.M || 'Approval flow');
  r.groups = f.G.split('_').filter(Boolean).map(g => { const [n, need, ks] = g.split('~'); const members = (ks || '').split('+').filter(Boolean); return { name: decTxt(n || ''), need: Math.max(1, Math.min(members.length || 1, +need || 1)), members }; }).filter(g => g.members.length);
  if (!r.groups.length) throw Error('flow'); r.ordered = f.Q === '1'; r.conds = f.C && f.C !== '0' ? f.C.split('_').filter(Boolean) : []; r.esc = f.E && f.E !== '0' ? f.E : null; r.after = Math.max(0, +f.D || 0); }, inherit: true });
PERM_OF.FLOW = 'draw';
FLOW_CONDITIONS.tasks = { label: 'Every task is done', test: () => { const n = [...(S.D.tasks?.values() || [])].filter(t => t.status !== 'done').length; return n ? `${plural(n, 'task')} not done` : true; } };
FLOW_CONDITIONS.signoff = { label: 'An audit was signed off', test: () => [...S.records.values()].some(r => r.type === 'SIGNOFF' && !S.D.hidden.has(r.cid)) || 'no audit sign-off yet' };

// a flow against a delivery's approvals: each group's valid signatures, in order when the flow says so
function evalFlow(flow, x){
  const votes = [...x.votes.values()].filter(a => a.ok && a.root === x.d.root).sort(byZ);
  let gate = -Infinity; const groups = [];
  for (const g of flow.groups){
    const valid = votes.filter(a => g.members.some(m => samePerson(m, a.author)) && (!flow.ordered || a.z > gate));
    const done = valid.length >= g.need;
    groups.push({ g, valid, done, waiting: flow.ordered && gate === Infinity });
    gate = !flow.ordered ? gate : done ? valid[g.need - 1].z : Infinity;
  }
  const conds = flow.conds.map(id => ({ id, c: FLOW_CONDITIONS[id], r: FLOW_CONDITIONS[id] ? FLOW_CONDITIONS[id].test(S.D) : `unknown condition ${id}` }));
  return { groups, conds, done: groups.every(g => g.done) && conds.every(c => c.r === true) };
}
DELIVERY_HOOKS.evaluate.push(x => {
  if (!x.d.flow) return;
  const flow = S.records.get(x.d.flow);
  if (!flow || flow.type !== 'FLOW' || S.D.hidden.has(flow.cid)){ x.done = false; x.blockers.push('Its approval flow isn’t on this canvas'); return; }
  let ev = evalFlow(flow, x), via = flow;
  const up = flow.esc && S.records.get(flow.esc);
  if (!ev.done && up?.type === 'FLOW' && Date.now() > x.d.t + flow.after * 36e5){ const e2 = evalFlow(up, x); if (e2.done){ ev = e2; via = up; } else x.blockers.push(`Escalated to “${up.name}”`); }
  x.flow = { flow: via, ...ev };
  x.done = ev.done;
  x.label = ev.groups.map(g => `${g.g.name} ${Math.min(g.valid.length, g.g.need)}/${g.g.need}`).join(' · ');
  for (const g of ev.groups) if (!g.done && g.waiting) x.blockers.push(`${g.g.name} signs after ${ev.groups[ev.groups.indexOf(g) - 1].g.name}`);
  for (const c of ev.conds) if (c.r !== true) x.blockers.push(`${c.c?.label || c.id}: ${c.r}`);
});
DELIVERY_HOOKS.row.push(x => x.flow ? `<div class="wk-ap">${x.flow.groups.map(g => `<span class="chip ${g.done ? 'yes' : ''}">${esc(g.g.name)} ${Math.min(g.valid.length, g.g.need)}/${g.g.need}${g.done ? ' ✓' : ''}</span>`).join('')}${x.flow.conds.map(c => `<span class="chip ${c.r === true ? 'yes' : 'no'}">${esc(c.c?.label || c.id)}${c.r === true ? ' ✓' : ''}</span>`).join('')}</div><small class="wk-note">Flow: ${esc(x.flow.flow.name)}${x.flow.flow.ordered ? ' · in order' : ''}</small>` : '');
DELIVERY_HOOKS.proof.push((x, out) => {
  if (!x.flow) return;
  out.push('', `## Approval flow — ${x.flow.flow.name}`, '', `- **Rule record:** \`${x.flow.flow.cid}\`${x.flow.flow.ordered ? ' · groups sign in order' : ''}`,
    ...x.flow.groups.map(g => `- **${g.g.name}** ${Math.min(g.valid.length, g.g.need)} of ${g.g.need} needed${g.done ? ' ✓' : ''}: ${g.valid.map(a => `${short(a.author)} (${new Date(a.t).toLocaleString()})`).join(', ') || 'none yet'}`),
    ...x.flow.conds.map(c => `- **Condition:** ${c.c?.label || c.id} — ${c.r === true ? 'met' : c.r}`));
});
DELIVERY_HOOKS.choices.push(() => flowsHere().map(f => ({ label: `Use the approval flow “${f.name}”`, icon: 'shield', value: { approvers: [...new Set(f.groups.flatMap(g => g.members))], quorum: f.groups.reduce((a, g) => a + g.need, 0), flow: f.cid } })));
const flowsHere = () => [...S.records.values()].filter(r => r.type === 'FLOW' && !S.D.hidden.has(r.cid)).sort(byZ);

async function flowForm(){
  const ppl = people(), conds = Object.entries(FLOW_CONDITIONS);
  const v = await formDialog('New approval flow', [
    { id: 'name', label: 'Name', type: 'text', value: 'Launch approval' },
    ...[1, 2, 3].flatMap(i => [{ id: `g${i}`, label: `Group ${i} name`, type: 'text', value: ['Engineering', 'Legal', ''][i - 1], hint: i === 3 ? 'Leave a name empty to skip that group.' : '' },
      { id: `p${i}`, label: `Group ${i} people`, type: 'people', value: [], options: ppl }, { id: `n${i}`, label: `Group ${i}: signatures needed`, type: 'number', value: 1, min: 1 }]),
    { id: 'ordered', label: 'Order', type: 'select', value: '0', options: [['0', 'Groups sign in any order'], ['1', 'Groups sign in the order above']] },
    { id: 'conds', label: 'The canvas must also have', type: 'checks', value: [], options: conds.map(([k, c]) => [k, c.label]) },
    ...(flowsHere().length ? [{ id: 'esc', label: 'If it stalls, also accept', type: 'select', value: '', options: [['', 'No escalation'], ...flowsHere().map(f => [f.cid, f.name])] }, { id: 'after', label: 'Escalate after (hours)', type: 'number', value: 48, min: 1 }] : []),
  ], { ok: 'Sign the flow', why: 'A flow is a signed rule. Deliveries that use it are approved only when every group and condition is met.' });
  if (!v) return;
  const groups = [1, 2, 3].map(i => ({ name: v[`g${i}`].trim(), members: v[`p${i}`], need: Math.max(1, Math.min(v[`p${i}`].length, v[`n${i}`] || 1)) })).filter(g => g.name && g.members.length);
  if (!groups.length){ toast('A flow needs at least one group with people in it.'); return; }
  await publish(await signed('FLOW', [['I', S.me.id], ['R', b32(crypto.getRandomValues(new Uint8Array(6)))], ['M', encTxt(v.name.trim() || 'Approval flow')],
    ['G', groups.map(g => `${encTxt(g.name)}~${g.need}~${g.members.join('+')}`).join('_')], ['Q', v.ordered], ['C', v.conds.length ? v.conds.join('_') : '0'], ['E', v.esc || '0'], ['D', v.esc ? v.after || 48 : 0], ['Z', ++S.lamport], ['T', Date.now()]]));
  toast('Approval flow signed. Choose it when you deliver.');
}
registerPanel({
  id: 'flows', title: 'Approval flows', blurb: 'Signed rules for approving a delivery: groups with thresholds, an order, conditions on the canvas, escalation.',
  paint(body){
    const fs = flowsHere();
    body.innerHTML = `<div class="acts"><button class="btn primary" data-new data-autofocus>${ic('shield')}New approval flow…</button></div>
      ${fs.length ? `<ul class="plain">${fs.map(f => `<li class="card"><div class="hd"><b>${esc(f.name)}</b>${f.ordered ? '<span class="pill">In order</span>' : ''}</div>
        ${f.groups.map((g, i) => `<div class="row2"><span class="pill acc">${f.ordered ? i + 1 + '. ' : ''}${esc(g.name)} ${g.need} of ${g.members.length}</span><small>${g.members.map(m => esc(whoName(m))).join(', ')}</small></div>`).join('')}
        ${f.conds.length ? `<small>Also needs: ${f.conds.map(c => esc(FLOW_CONDITIONS[c]?.label || c)).join('; ')}</small>` : ''}
        ${f.esc ? `<small>Escalates to “${esc(S.records.get(f.esc)?.name || '?')}” after ${f.after} h</small>` : ''}<small>by ${esc(whoName(f.author))} · ${when(f.t)}</small></li>`).join('')}</ul>`
      : '<p class="empty">No flows yet. Without one, a delivery is approved by a simple quorum of the people you name.</p>'}`;
  },
  click(e, b){ if (b.hasAttribute('data-new')) flowForm(); },
});
registerFeature({ id: 'flows', name: 'Approval flows', group: 'deliver', icon: 'shield', records: ['FLOW'],
  blurb: 'Governance as a record: groups, thresholds, order, conditions on the canvas, escalation', open: () => openPanel('flows') });
