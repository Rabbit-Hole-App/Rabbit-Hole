import fs from 'node:fs';
import path from 'node:path';
const blob = 'C:/s/spec/owner-local/persist/local/v3/r2/rabbit-hole-dev-learn-media/blobs/2054fe888174e9006857e1fbc21934aa858a7d384787c6de6b40ef9b61425a04000001a1f121519e';
const q = JSON.parse(fs.readFileSync(blob, 'utf8')).request.args.toLowerCase().replace(/\?$/, '');
const needle = q.slice(0, 40);
const roots = ['C:/s/sprint2-evidence', 'C:/s/spec/benchmarks', 'C:/s/film-evidence/docs/features/explain/checks'];
const exts = ['.json', '.jsonl', '.md', '.txt', '.mjs'];
const hits = [];
const walk = d => {
  let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name === 'node_modules' || e.name === '.git') continue; walk(p); continue; }
    if (!exts.some(x => e.name.endsWith(x))) continue;
    try { const st = fs.statSync(p); if (st.size > 80e6) continue; const t = fs.readFileSync(p, 'utf8'); if (t.toLowerCase().includes(needle)) hits.push([p.split('\\').join('/'), st.size, t]); } catch { /* unreadable */ }
  }
};
for (const r of roots) walk(r);
console.log('needle length', needle.length, 'files containing the question:', hits.length);
for (const [p, s, t] of hits.slice(0, 20)) {
  const i = t.toLowerCase().indexOf(needle), around = t.slice(Math.max(0, i - 1500), i + 2500);
  const vt = [...around.matchAll(/"visualType"\s*:\s*"?([a-z-]+)/g)].map(m => m[1]).slice(0, 4).join(',');
  const pk = [...around.matchAll(/"plannerKind"\s*:\s*"?([a-z-]+)/g)].map(m => m[1]).slice(0, 4).join(',');
  console.log(s, p, '| visualType near:', vt || '-', '| plannerKind near:', pk || '-');
}
