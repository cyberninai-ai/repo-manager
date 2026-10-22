// Reasoning features (FEATURES R1–R3): stances and the consensus map, the decision ledger, claim grounding — across two people
import { team, ok, until, count, axeOn } from './pair.mjs';
const { b, errs, pages: [A, B] } = await team(['Ana', 'Ben'], 'reasontest01');
const v = [];
const ids = await A.evaluate(async () => ({
  price: await commitNode({ kind: 'sticky', x: 0, y: 0, label: 'Ship at $49 only' }),
  fact: await commitNode({ kind: 'sticky', x: 300, y: 0, label: 'Competitor X raised $50M in 2024' }),
  src: await commitNode({ kind: 'card', x: 300, y: 220, label: 'TechNews: Competitor X closes $50M Series B (March 2024)' }),
}));
ok(await until(B, i => S.records.has(i.src), ids), 'notes reach Ben');

// stances: Ana agrees, Ben disagrees → split; Ben changes to agree → converged, and the trend shows it moved
await A.evaluate(i => takeStance([i.price], 'agree'), ids);
await until(B, i => consensus(i.price).c.agree === 1, ids);   // Ben answers Ana's stance: signed before it arrived, his could sort first
await B.evaluate(i => takeStance([i.price], 'disagree', 'Too low for enterprise'), ids);
ok(await until(A, i => consensus(i.price).level === 'split', ids), 'one agree, one disagree: split');
await B.evaluate(i => takeStance([i.price], 'agree'), ids);
ok(await until(A, i => consensus(i.price).level === 'converged', ids), 'Ben changes his stance: converged (latest per person wins)');
ok(await A.evaluate(i => trendText(i.price) === 'disagreement 50% → 0%', ids), 'convergence is measured: disagreement 50% → 0%');
await A.evaluate(() => openPanel('consensus')); await A.waitForTimeout(200);
ok(await A.evaluate(() => /1 of 1/.test(document.querySelector('#px-consensus .fx-body').textContent)), 'consensus panel: 1 of 1 converged');
v.push(...await axeOn(A, '#px-consensus'));

// decisions: recorded with evidence, Ben disagrees with it → flagged; review due; reversed
const dec = await A.evaluate(i => recordDecision({ text: 'Ship pricing at the $49 tier only', on: i.price, evidence: [i.price, i.fact], review: '20200101' }), ids);
ok(await until(B, () => S.D.decisions?.length === 1), 'Ben receives the decision');
ok(await B.evaluate(i => S.D.decisionOf.get(i.price)?.d.text.includes('$49'), ids), 'the decision is attached to the note it is about');
await B.evaluate(c => takeStance([c], 'disagree'), dec); await A.evaluate(c => takeStance([c], 'agree'), dec);
ok(await until(A, c => consensus(c).level === 'split', dec), 'a decision made over 50% disagreement is flagged as split');
ok(await A.evaluate(() => reviewDue(S.D.decisions[0]) && FLOW_CONDITIONS.decisions.test() !== true), 'a past review date makes it due, and flows can require reviews to be done');
await A.evaluate(() => openPanel('decisions')); await A.waitForTimeout(200);
ok(await A.evaluate(() => document.querySelectorAll('#px-decisions .card').length === 1 && /due for review/.test(document.querySelector('#px-decisions').textContent)), 'ledger lists it with the review notice');
v.push(...await axeOn(A, '#px-decisions'));
await A.evaluate(async c => { await publish(await signed('REVIEW', [['I', S.me.id], ['R', c], ['S', 'reverse'], ['M', encTxt('Market moved')], ['W', '0'], ['Z', ++S.lamport], ['T', Date.now()]])); }, dec);
ok(await until(B, () => S.D.decisions[0].status === 'reversed'), 'a signed review reverses it for everyone');
const log = await A.evaluate(() => decisionLog());
ok(/Ship pricing/.test(log) && /reversed/i.test(log) && /Market moved/.test(log), 'decision log carries text, status and the review');

// claims: asserted → evidence (unchecked) → the author’s own check doesn’t count → Ben checks → grounded
await A.evaluate(i => markClaim([i.fact]), ids);
ok(await until(B, i => S.D.claims.get(i.fact)?.state === 'asserted', ids), 'a claim with no evidence reads as asserted');
await A.evaluate(i => addEvidence(i.fact, { ev: i.src, supports: true, note: 'closes $50M Series B (March 2024)' }), ids);
ok(await until(A, i => S.D.claims.get(i.fact)?.state === 'evidenced', ids), 'evidence attached: evidence, unchecked');
ok(await A.evaluate(i => /2 of 2 facts|3 of 3 facts/.test(matchHint(S.D.claims.get(i.fact))), ids), 'match hint finds the claim’s numbers in its evidence');
await A.evaluate(i => checkClaim(i.fact, 'ok'), ids); await A.waitForTimeout(300);
ok(await A.evaluate(i => S.D.claims.get(i.fact).state === 'evidenced', ids), 'the author checking their own claim does not ground it');
ok(await A.evaluate(() => FLOW_CONDITIONS.claims.test() !== true), 'flows can block delivery on ungrounded claims');
await B.evaluate(i => checkClaim(i.fact, 'ok'), ids);
ok(await until(A, i => S.D.claims.get(i.fact)?.state === 'grounded' && S.D.claims.get(i.fact).score === 1, ids), 'an independent check grounds it (score 1.00)');
ok(await A.evaluate(() => FLOW_CONDITIONS.claims.test() === true), 'all claims grounded: the condition passes');
await B.evaluate(async i => { const n = await commitNode({ kind: 'card', x: 600, y: 0, label: 'Their filing says $35M' }); await addEvidence(i.fact, { ev: n, supports: false }); await checkClaim(i.fact, 'no', 'Filing shows $35M'); }, ids);
ok(await until(A, i => S.D.claims.get(i.fact)?.state === 'contradicted', ids), 'counter-evidence plus a negative check: contradicted');
await A.evaluate(() => openPanel('claims')); await A.waitForTimeout(200);
ok(await A.evaluate(() => /Contradicted/.test(document.querySelector('#px-claims').textContent)), 'claims panel shows it');
v.push(...await axeOn(A, '#px-claims'));
// the hub lists the features with live status
await A.evaluate(() => document.getElementById('hubBtn').click()); await A.waitForTimeout(100);
ok(await A.evaluate(() => /Decide/.test(document.getElementById('menu').textContent) && /Claim grounding · 1 unverified/.test(document.getElementById('menu').textContent)), 'Team hub groups features with live status');
v.push(...await axeOn(A, '#menu'));
await A.screenshot({ path: 'tests/out/reason.png' });

console.log(`asserted ${count()} checks`);
console.log('axe', JSON.stringify(v));
console.log('errors', errs);
await b.close();
