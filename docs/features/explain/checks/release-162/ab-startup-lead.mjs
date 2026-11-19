// A/B startup: bundles A (before) and B (after), N alternating runs each through `wrangler check startup`; prints total and ACTIVE ms (total minus the (idle) self time) per run.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const [A, B, N = '3', cwd = 'C:/s/r162-int/packages/web', tag = 'lead'] = process.argv.slice(2);
const WR = 'C:/s/r162-int/node_modules/wrangler/bin/wrangler.js';
const OUT = 'C:/s/spec/startup/';
const measure = (bundle, name) => {
  const prof = `${OUT}${tag}-${name}.cpuprofile`;
  const r = spawnSync(process.execPath, [WR, 'check', 'startup', '--worker', bundle, '--outfile', prof], { cwd, encoding: 'utf8' });
  if (!fs.existsSync(prof)) throw new Error('no profile: ' + (r.stderr || r.stdout).slice(-200));
  const p = JSON.parse(fs.readFileSync(prof, 'utf8'));
  const self = new Map(); const dt = p.timeDeltas; p.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)));
  let total = 0, idle = 0;
  for (const n of p.nodes) { const us = self.get(n.id) || 0; total += us; if (n.callFrame.functionName === '(idle)') idle += us; }
  return { total: total / 1000, idle: idle / 1000, active: (total - idle) / 1000, prof };
};
const rows = { A: [], B: [] };
for (let i = 1; i <= Number(N); i++) {
  for (const [k, b] of [['A', A], ['B', B]]) { const m = measure(b, `${k}${i}`); rows[k].push(m); console.log(`${k} run ${i}: total ${m.total.toFixed(0)} ms, idle ${m.idle.toFixed(0)} ms, ACTIVE ${m.active.toFixed(0)} ms`); }
}
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const k of ['A', 'B']) console.log(`${k}: active ms ${rows[k].map(r => r.active.toFixed(0)).join(', ')}; median ${med(rows[k].map(r => r.active)).toFixed(0)}`);
fs.writeFileSync(`${OUT}${tag}-result.json`, JSON.stringify(rows, null, 1));
