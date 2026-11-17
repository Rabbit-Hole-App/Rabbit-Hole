// Read-only loader: every delivered card in the explain bench runs -> cards-all.json (one entry per card, with its diagram specs parsed).
import fs from 'node:fs';
import crypto from 'node:crypto';
const B = 'C:/s/spec/benchmarks/explain-bench';
const walk = (d, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) walk(p, o); else if (/\/cards\/[^/]+\.json$/.test(p)) o.push(p); } return o; };
const out = [];
for (const f of walk(B)) {
  let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
  const b = j.response?.block; if (!b?.body) continue;
  const fences = [...b.body.matchAll(/```rh-diagram\n([\s\S]*?)```/g)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
  const run = f.slice(B.length + 1).split('/')[0], easy = f.includes('/easy-set/');
  out.push({ file: f.slice(B.length + 1), run, id: j.row?.id, depth: b.depth ?? j.row?.depth, prompt: j.row?.prompt, provider: b.authoredBy?.provider ?? j.row?.authoredBy?.provider ?? null, model: b.authoredBy?.model ?? j.row?.authoredBy?.model ?? null,
    planner: j.row?.canvas?.plan?.planner ?? j.row?.profile ?? null, profile: j.row?.profile ?? j.response?.profile ?? null, title: b.title, body: b.body,
    hash: crypto.createHash('sha1').update(b.body).digest('hex').slice(0, 12), diagrams: fences.map(x => x.diagram ?? x) , kinds: fences.map(x => (x.diagram ?? x).kind) });
}
fs.writeFileSync('C:/s/sprint2-evidence/card-errors/cards-all.json', JSON.stringify(out));
const u = new Map(out.map(c => [c.hash, c]));
console.log('delivered', out.length, 'unique bodies', u.size);
const bk = {}; for (const c of u.values()) for (const k of new Set(c.kinds)) bk[k] = (bk[k] || 0) + 1;
console.log('unique cards by kind', bk);
const bm = {}; for (const c of u.values()) bm[(c.provider || '?') + '/' + (c.model || '?')] = (bm[(c.provider || '?') + '/' + (c.model || '?')] || 0) + 1; console.log(bm);
const pr = {}; for (const c of out) pr[JSON.stringify(c.profile)?.slice(0,100)] = (pr[JSON.stringify(c.profile)?.slice(0,100)]||0)+1; console.log(Object.entries(pr).sort((a,b)=>b[1]-a[1]).slice(0,6));
