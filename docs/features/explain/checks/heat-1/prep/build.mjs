import fs from 'node:fs';
const rows = fs.readFileSync('C:/s/sprint2-evidence/fallbacks-batch/results.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const pick = rows.filter(r => r.arm === 'after' && [2, 13, 24].includes(r.idx) && /avoid looking ahead/.test(r.prompt));
const fence = b => JSON.parse(/```rh-diagram\n([\s\S]*?)\n```/.exec(b)[1]);
const specs = pick.map(r => fence(r.body));
console.log('cards', pick.map(r => [r.idx, r.depth, r.rep]), 'identical:', specs.every(s => JSON.stringify(s) === JSON.stringify(specs[0])));
fs.writeFileSync('C:/s/heat1-prep/causal-mask-card.json', JSON.stringify(specs[0], null, 2) + '\n');
fs.writeFileSync('C:/s/heat1-prep/causal-mask-card.body.md', pick[0].body);
// the same card, with the diagonal allowed but the cells still all 0 (var-1-bench idx 56 after), for the "second failing shape"
const vb = fs.readFileSync('C:/s/sprint2-evidence/var-1-bench/results.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const r56 = vb.find(r => r.idx === 56 && r.arm === 'after');
fs.writeFileSync('C:/s/heat1-prep/causal-mask-card-diag-allowed-all-zero.json', JSON.stringify({ version: 1, diagram: r56.diagrams[0] }, null, 2) + '\n');
