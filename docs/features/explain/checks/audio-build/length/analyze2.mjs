import fs from 'node:fs';
const r = fs.readFileSync('results.jsonl','utf8').trim().split('\n').map(JSON.parse);
const med = a => { const s=[...a].sort((x,y)=>x-y); const m=s.length>>1; return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2); };
const TS = { brief:[180,240], balanced:[240,300], detailed:[300,360] }, TG={ brief:[190,240], balanced:[260,320], detailed:[320,380]};
const a = x => x.afterWords + (x.strippedDetail||[]).filter(s=>s.saveableByOneToTen).reduce((t,s)=>t+s.words,0);
const rows=[];
for (const arm of ['gemini','fireworks']) for (const d of ['brief','balanced','detailed']) {
  const g = r.filter(x=>x.arm===arm && x.depth===d), lo=TS[d][0];
  const f=v=>[med(v),Math.min(...v),Math.max(...v)].join('/');
  const sS=g.reduce((t,x)=>t+x.strippedSentences,0), sT=g.reduce((t,x)=>t+x.rawSentences,0);
  const sav=g.reduce((t,x)=>t+(x.strippedDetail||[]).filter(s=>s.saveableByOneToTen).length,0);
  const prArm=TG[d][0] , loArm = arm==='gemini'?TG[d][0]:TS[d][0];
  console.log(`| ${arm} | ${d} | ${g.length} | ${f(g.map(x=>x.rawWords))} | ${f(g.map(x=>x.afterWords))} | ${med(g.map(x=>x.secondsEstimate))} | ${g.filter(x=>x.strippedSentences>0).length}/${g.length} | ${sS}/${sT} (${(100*sS/sT).toFixed(1)}%) | ${g.filter(x=>x.rawWords>=lo).length}/${g.length} | ${g.filter(x=>x.afterWords>=lo).length}/${g.length} | (a) after med ${med(g.map(a))}, saved sentences ${sav}, >=lo ${g.filter(x=>a(x)>=lo).length}/${g.length} |`);
}
for (const arm of ['gemini','fireworks']) { const s=r.filter(x=>x.arm===arm).flatMap(x=>x.strippedDetail||[]); const by={}; for(const x of s)by[x.reason]=(by[x.reason]||0)+1; console.log(arm,'sentences',r.filter(x=>x.arm===arm).reduce((t,x)=>t+x.rawSentences,0),'stripped',s.length,JSON.stringify(by),'saveable(a)',s.filter(x=>x.saveableByOneToTen).length); }
for (const arm of ['gemini','fireworks']) for (const d of ['brief','balanced','detailed']) { const g=r.filter(x=>x.arm===arm&&x.depth===d); const lo=TS[d][0]; console.log('below',lo,arm,d,'raw',g.filter(x=>x.rawWords<lo).length,'after',g.filter(x=>x.afterWords<lo).length,'strip-caused',g.filter(x=>x.rawWords>=lo&&x.afterWords<lo).length,'/',g.length, 'mean raw gap to lo among short', (g.filter(x=>x.rawWords<lo).reduce((t,x)=>t+lo-x.rawWords,0)/Math.max(1,g.filter(x=>x.rawWords<lo).length)).toFixed(0)); }
const P={google:[0.3,2.5],fireworks:[0.15,0.6]}; const byArm={};let tot=0,tin=0,tout=0; for(const x of r){const u=x.usage||{};const p=P[x.providerUsed];const c=((u.prompt_tokens||0)*p[0]+(u.completion_tokens||0)*p[1])/1e6;tot+=c;byArm[x.arm]=(byArm[x.arm]||0)+c;tin+=u.prompt_tokens||0;tout+=u.completion_tokens||0;} console.log('cost',tot.toFixed(4),JSON.stringify(byArm),tin,tout,'calls',r.length);
console.log('ms med gemini',med(r.filter(x=>x.arm==='gemini').map(x=>x.ms)),'fireworks',med(r.filter(x=>x.arm==='fireworks').map(x=>x.ms)));
console.log('gemini raw words/ completion tokens', r.filter(x=>x.arm==='gemini').slice(0,3).map(x=>x.rawWords+'w/'+x.usage?.completion_tokens+'t').join(' '));
