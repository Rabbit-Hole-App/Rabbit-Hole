// Offline analysis of section-6 results.jsonl for SIMP-1: no model call, no network.
import { readFileSync } from 'node:fs';
const rows = readFileSync('C:/s/sprint2-evidence/card-numbers/section-6/results.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const fb = JSON.parse(readFileSync('C:/s/sprint2-evidence/card-numbers/section-6/fallback-trace/fallback-cards.json', 'utf8'));
const kindsOf = body => [...String(body || '').matchAll(/```rh-diagram\n(.*)\n```/g)].map(m => { try { return JSON.parse(m[1]).diagram.kind; } catch { return '?'; } });
// class of each fallback card by the saved evidence: matrix-like (token-links/transformation planner kinds; the simplified flow's labels came from rows/columns), tree (gini), flow
const cls = c => c.plannerKind === 'tree' ? 'tree' : c.plannerKind === 'flow' ? 'flow' : 'matrix-like';
const tally = {};
for (const c of fb) { const k = `${c.arm}/${cls(c)}`; tally[k] = (tally[k] || 0) + 1; }
console.log('fallback cards by arm/class', tally);
const moved = c => cls(c) === 'matrix-like';
for (const arm of ['after', 'before']) {
  const cs = fb.filter(c => c.arm === arm);
  console.log(arm, 'fallbacks', cs.length, 'would move to next provider', cs.filter(moved).length, 'rebuilt as tree (stay)', cs.filter(c => cls(c) === 'tree').length, 'flow (stay)', cs.filter(c => cls(c) === 'flow').length);
}
// every run for the five prompts
const prompts = [...new Set(fb.map(c => c.prompt))];
for (const p of prompts) {
  console.log('\n== ' + p);
  for (const arm of ['before', 'after']) {
    const rs = rows.filter(r => r.prompt === p && r.arm === arm);
    const reached2 = rs.filter(r => (r.attempts || []).length > 1);
    const fbk = rs.filter(r => r.visualFallback);
    console.log(arm, 'runs', rs.length, 'visualFallback', fbk.length, 'went to 2nd provider', reached2.length,
      'authors', JSON.stringify(rs.reduce((a, r) => { const k = r.authoredBy?.provider; a[k] = (a[k] || 0) + 1; return a; }, {})));
    for (const r of reached2) console.log('   reached 2nd: idx', r.idx, 'depth', r.depth, 'attempts', JSON.stringify((r.attempts || []).map(a => `${a.provider}:${a.outcome}${a.repairs ? '/r' + a.repairs : ''}`)), 'author', r.authoredBy?.provider, 'kinds', kindsOf(r.body).join(','), 'cost', r.costMicros);
  }
}
// fireworks-authored cost over the whole file
const fw = rows.filter(r => r.authoredBy?.provider === 'fireworks');
const fwCost = fw.map(r => (r.ledger || []).filter(l => l.provider === 'fireworks').reduce((s, l) => s + (l.cost_micros || 0), 0));
console.log('\nfireworks-authored runs', fw.length, 'avg fireworks ledger micros', Math.round(fwCost.reduce((a, b) => a + b, 0) / (fw.length || 1)));
const gemFb = rows.filter(r => r.visualFallback).length;
console.log('runs with visualFallback (all prompts)', gemFb, 'of', rows.length);
