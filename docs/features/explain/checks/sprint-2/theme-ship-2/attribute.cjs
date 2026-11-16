// first failing commit per test (true commit order from git; JSON key order is not commit order for all-digit shas)
const { execFileSync } = require('child_process');
const r = require('./bisect-results.json');
const order = ['74c4f68ae', ...execFileSync('git', ['-C', 'C:/s/teaching-palette', 'log', '--reverse', '--format=%h', '74c4f68ae..9d1bf9aa3'], { encoding: 'utf8' }).trim().split('\n')];
const done = order.filter(c => r[c]);
const first = {};
for (const n of new Set(done.flatMap(c => r[c]))) { const i = done.findIndex(c => r[c].includes(n)); first[n] = { commit: done[i], base: i === 0, stillFailsAtLast: r[done.at(-1)].includes(n) }; }
const subj = c => execFileSync('git', ['-C', 'C:/s/teaching-palette', 'log', '-1', '--format=%s', c], { encoding: 'utf8' }).trim().slice(0, 70);
console.log('commits run', done.length, 'of', order.length, '| failing at the last run commit', r[done.at(-1)].length);
for (const [n, f] of Object.entries(first).sort((a, b) => order.indexOf(a[1].commit) - order.indexOf(b[1].commit))) console.log(f.commit.padEnd(10), f.base ? 'BASE' : '    ', f.stillFailsAtLast ? 'still' : 'fixed-later', n.slice(0, 120), '|', subj(f.commit));
