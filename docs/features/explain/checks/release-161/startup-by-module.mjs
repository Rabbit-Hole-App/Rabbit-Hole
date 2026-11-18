// attribute a wrangler startup cpuprofile to modules of the bundle: self time per `// path` marker section (esbuild marks each module), plus inclusive time of the biggest __init calls
import fs from 'node:fs';
const [bundle, profile] = process.argv.slice(2);
const lines = fs.readFileSync(bundle, 'utf8').split('\n');
const marks = []; // [lineNo (0-based), name]
lines.forEach((l, i) => { const m = l.match(/^\/\/ (\S+\.(?:js|jsx|mjs|ts|json|css))$/); if (m) marks.push([i, m[1]]); });
const moduleOf = line => { let lo = 0, hi = marks.length - 1, ans = null; while (lo <= hi) { const mid = (lo + hi) >> 1; if (marks[mid][0] <= line) { ans = marks[mid][1]; lo = mid + 1; } else hi = mid - 1; } return ans; };
const prof = JSON.parse(fs.readFileSync(profile, 'utf8'));
const nodes = new Map(prof.nodes.map(n => [n.id, n]));
const self = new Map(); // node id -> us
const dt = prof.timeDeltas; prof.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)));
const byMod = new Map(); let total = 0;
for (const [id, us] of self) {
  const n = nodes.get(id); const cf = n.callFrame; total += us;
  const name = cf.functionName === '(idle)' || cf.functionName === '(program)' || cf.functionName === '(garbage collector)' ? cf.functionName : (cf.lineNumber >= 0 && cf.url ? (moduleOf(cf.lineNumber) || 'unknown') : 'native');
  byMod.set(name, (byMod.get(name) || 0) + us);
}
const rows = [...byMod].sort((a, b) => b[1] - a[1]).slice(0, 30);
console.log(`total ${(total / 1000).toFixed(0)} ms; self time by module (top 30):`);
for (const [m, us] of rows) console.log(`${(us / 1000).toFixed(1).padStart(7)} ms  ${m}`);
// inclusive time per node of the heaviest top-level init children
const children = new Map(); for (const n of prof.nodes) children.set(n.id, n.children || []);
const incl = new Map(); const inc = id => { if (incl.has(id)) return incl.get(id); let t = self.get(id) || 0; for (const c of children.get(id)) t += inc(c); incl.set(id, t); return t; };
const root = prof.nodes[0].id; inc(root);
const heavy = prof.nodes.map(n => [n, incl.get(n.id)]).filter(([n]) => n.callFrame.functionName && !/^\(/.test(n.callFrame.functionName)).sort((a, b) => b[1] - a[1]).slice(0, 14);
console.log('\nheaviest inclusive frames:');
for (const [n, us] of heavy) console.log(`${(us / 1000).toFixed(1).padStart(7)} ms  ${n.callFrame.functionName} @ line ${n.callFrame.lineNumber + 1} (${moduleOf(n.callFrame.lineNumber) || '?'})`);
