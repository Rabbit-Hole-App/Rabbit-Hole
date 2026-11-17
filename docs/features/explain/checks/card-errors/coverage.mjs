import fs from 'node:fs';
import { mathEquations, arithmeticFlags, proseOf } from './checks.mjs';
const all = JSON.parse(fs.readFileSync('cards-all.json', 'utf8')); const seen = new Set(); let cards = 0, withEq = 0, eqs = 0, flagged = 0, imprecise = 0;
const textOf = c => [proseOf(c.body), ...c.diagrams.map(d => JSON.stringify(d))].join(' ');
let evaluated = 0;
for (const c of all) { if (seen.has(c.hash)) continue; seen.add(c.hash); cards++; const t = proseOf(c.body).replace(/\n+/g, ' ');
  const e = mathEquations(t).filter(x => x.terms.some(s => /[+*/^]|\d\s*-\s*\d|exp|sqrt/.test(s))); if (e.length) withEq++; eqs += e.length;
  const f = arithmeticFlags(t); evaluated += 0; flagged += f.filter(x => x.type === 'wrong').length; imprecise += f.filter(x => x.type === 'imprecise').length; }
console.log({ cards, cardsWithArithmeticEquation: withEq, equations: eqs, wrong: flagged, imprecise });
