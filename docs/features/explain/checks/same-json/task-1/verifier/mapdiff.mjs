import { execFileSync } from 'node:child_process';
const get = rev => JSON.parse(execFileSync('git', ['-C', 'C:/s/sj-text', 'show', `${rev}:scripts/ci/check-map.json`], { encoding: 'utf8', maxBuffer: 1 << 28 }));
const a = get('b29b6bdd7'), b = get('HEAD');
for (const top of new Set([...Object.keys(a), ...Object.keys(b)])) {
  const x = a[top], y = b[top];
  if (JSON.stringify(x) === JSON.stringify(y)) continue;
  console.log('section changed:', top);
  if (Array.isArray(x)) { console.log('  array diff', JSON.stringify(x.filter(v => !y.includes(v))), JSON.stringify(y.filter(v => !x.includes(v)))); continue; }
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (JSON.stringify(x[k]) === JSON.stringify(y[k])) continue;
    if (!(k in x)) console.log('  ADDED row', k, '->', y[k].length, 'entries');
    else if (!(k in y)) console.log('  REMOVED row', k);
    else console.log('  row', k, 'removed entries', JSON.stringify(x[k].filter(v => !y[k].includes(v))), 'added entries', JSON.stringify(y[k].filter(v => !x[k].includes(v))), 'order kept', JSON.stringify(y[k].filter(v => x[k].includes(v))) === JSON.stringify(x[k]));
  }
}
