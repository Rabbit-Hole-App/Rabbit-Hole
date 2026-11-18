// Builds plan.json: the distinct (prompt, canonical depth) pairs of the card-errors audit's numeric cells, the 15 flagged cards' pairs (repeats), and new box-plot prompts.
import fs from 'node:fs';
const A = 'C:/s/sprint2-evidence/card-errors/';
const ALIAS = { overview: 'brief', standard: 'balanced', deep: 'detailed' }, canon = d => ALIAS[d] || d;
const rows = JSON.parse(fs.readFileSync(A + 'survey-rows.json')), cards = JSON.parse(fs.readFileSync(A + 'cards-all.json'));
const byFile = new Map(cards.map(c => [c.file, c]));
const pairs = new Map(); // key prompt|depth
for (const r of rows.filter(r => r.hasNumeric)) {
  const c = byFile.get(r.file), k = `${c.prompt}|${canon(c.depth)}`;
  const p = pairs.get(k) ?? { prompt: c.prompt, depth: canon(c.depth), ids: new Set(), cardsBefore: 0, flaggedBefore: 0, models: {}, numericKinds: new Set() };
  p.ids.add(r.id); p.cardsBefore++; if (r.flags.length) p.flaggedBefore++; p.models[r.model] = (p.models[r.model] || 0) + 1; r.numericKinds.forEach(x => p.numericKinds.add(x)); pairs.set(k, p);
}
// flagged cards (flags.csv): same prompt|depth pairs
const csv = fs.readFileSync(A + 'flags.csv', 'utf8').trim().split('\n').slice(1);
const flaggedFiles = csv.map(l => l.match(/,([^,]+\.json)$/)?.[1]).filter(Boolean);
const flaggedPairs = new Map();
for (const f of flaggedFiles) { const c = byFile.get(f); const k = `${c.prompt}|${canon(c.depth)}`; flaggedPairs.set(k, (flaggedPairs.get(k) || 0) + 1); }
const BOX = [
  'How do IQR fences flag outliers in a box plot? Use the data 3, 5, 6, 7, 8, 9, 11, 12, 40.',
  'Show a box plot of exam scores 52, 55, 61, 64, 67, 70, 72, 75, 78, 98 and explain which score is an outlier.',
  'How do I read a box plot of delivery times 12, 15, 17, 18, 20, 22, 24, 25, 60 minutes?',
  'Compare the spread of two classes with box plots: class A scored 60, 65, 70, 75, 80, 85, 90 and class B scored 40, 70, 72, 74, 76, 78, 100.',
  'Explain quartiles, the median and whiskers on a box plot of salaries 30, 32, 35, 38, 40, 45, 48, 52, 150 (in thousands).',
  'What does the 1.5 x IQR rule do to a box plot of response times 80, 85, 90, 92, 95, 99, 104, 110, 300 ms?',
];
const main = [...pairs.values()].map(p => ({ set: 'audit', prompt: p.prompt, depth: p.depth, ids: [...p.ids], cardsBefore: p.cardsBefore, flaggedBefore: p.flaggedBefore, models: p.models, numericKinds: [...p.numericKinds] }));
const box = BOX.flatMap((prompt, i) => ['brief', 'balanced', 'detailed'].flatMap(depth => [1, 2, 3].map(rep => ({ set: 'box', prompt, depth, rep, boxId: i + 1 }))));
const rep = [...flaggedPairs.keys()].flatMap(k => { const [prompt, depth] = k.split('|'); return [2, 3].map(r => ({ set: 'flag-repeat', prompt, depth, rep: r })); });
const plan = { mainPairs: main, flaggedPairs: [...flaggedPairs].map(([k, n]) => ({ prompt: k.split('|')[0], depth: k.split('|')[1], flaggedCards: n })), box, repeats: rep };
fs.writeFileSync('plan-parts.json', JSON.stringify(plan, null, 1));
console.log('audit pairs', main.length, 'flagged cards', flaggedFiles.length, 'flagged pairs', flaggedPairs.size, 'box', box.length, 'repeats', rep.length, 'total', main.length + box.length + rep.length);
