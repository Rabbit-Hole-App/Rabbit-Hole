import fs from 'node:fs';
import { splitCard, cardNumbers, spokenNumbers, sentencesOf } from '../../../audio-build/packages/control-plane/src/explanation-audio-script.js';
const cards = JSON.parse(fs.readFileSync('C:/s/sprint2-evidence/aud-2/cards.json','utf8'));
const raws = fs.readFileSync('raw.jsonl','utf8').trim().split('\n').map(JSON.parse);
for (const w of raws) { if (w.arm !== (process.argv[2]||'gemini')) continue; const c = cards.find(c => c.id===w.card && (c.depth==='deep'?'detailed':c.depth==='overview'?'brief':c.depth)===w.depth);
 const fj = JSON.parse(fs.readFileSync('C:/s/spec/benchmarks/explain-bench/'+c.source+c.id+'.json','utf8')); const b=fj.response.block, p=splitCard(b.body); const allowed=cardNumbers(p.prose,p.visualText,b.title,fj.row.prompt);
 let j; try{j=JSON.parse(w.raw)}catch{continue}
 for (const s of sentencesOf(j.script)) { const o=spokenNumbers(s).filter(n=>!allowed.has(n)); const sym=/[=+*\/^<>\[\]%\u00d7\u00f7\$~]/.test(s); if(o.length||sym) console.log(w.card, w.depth, 'r'+w.run, sym?'SYM':'NUM '+o.join('|'), '::', s.slice(0,230)); } }
