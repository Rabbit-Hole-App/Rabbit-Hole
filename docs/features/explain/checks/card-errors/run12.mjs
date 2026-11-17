import fs from 'node:fs';
import { checkCard } from './checks.mjs';
const cards = JSON.parse(fs.readFileSync('cards12-full.json', 'utf8'));
for (const c of cards) {
  const diagrams = [...c.body.matchAll(/```rh-diagram\n([\s\S]*?)```/g)].map(m => JSON.parse(m[1]).diagram);
  const f = checkCard({ body: c.body, diagrams });
  console.log(c.n, c.id, c.depth, c.authoredBy.model.split('/').pop(), '->', f.length ? JSON.stringify(f) : 'no flag');
}
