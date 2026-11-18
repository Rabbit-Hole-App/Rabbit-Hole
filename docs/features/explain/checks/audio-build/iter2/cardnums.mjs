import fs from 'node:fs';
import { splitCard, dataNumbers, cardDataNumbers } from '../../../audio-build-2/packages/control-plane/src/explanation-audio-script.js';
const cards = JSON.parse(fs.readFileSync('C:/s/sprint2-evidence/aud-2/cards.json', 'utf8'));
const rows = fs.readFileSync('results2.jsonl', 'utf8').trim().split('\n').map(JSON.parse), raws = fs.readFileSync('raw2.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const out = [];
for (const c of cards) {
  const j = JSON.parse(fs.readFileSync('C:/s/spec/benchmarks/explain-bench/' + c.source + c.id + '.json', 'utf8')), b = j.response.block, q = j.row.prompt, p = splitCard(b.body);
  const prose = [...cardDataNumbers(p.prose)], title = [...cardDataNumbers(b.title, q)], visual = [...cardDataNumbers(p.visualText)];
  const mine = rows.filter(r => r.card === c.id && r.depth === (b.depth === 'overview' ? 'overview' : b.depth) || r.card === c.id);
  // how often the FIRST answer spoke any card data number, and any prose number
  const firsts = raws.filter(r => r.card === c.id).map(r => { try { return JSON.parse(r.raw[0]).script; } catch { return ''; } });
  const spoke = set => firsts.filter(s => dataNumbers(s).some(n => set.has(n))).length;
  out.push({ card: c.id, depth: b.depth, proseNums: prose.length, titleQNums: title.length, visualNums: visual.length, firstScripts: firsts.length,
    spokeAny: spoke(new Set([...prose, ...title, ...visual])), spokeProse: spoke(new Set(prose)), proseList: prose.slice(0, 8).join(' '), visualSample: visual.filter(n => !prose.includes(n)).slice(0, 6).join(' ') });
}
console.table(out);
fs.writeFileSync('cardnums.json', JSON.stringify(out, null, 1));
