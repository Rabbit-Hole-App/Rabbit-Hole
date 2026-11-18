// derives run2.mjs from run.mjs: settled-cost stop line (prior runs included) and fail-fast on three consecutive Gemini provider_error first attempts
import fs from 'node:fs';
let s = fs.readFileSync('run.mjs', 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 60)); s = s.replace(a, () => b); };
rep("const spentSoFar = () => lines().reduce((s, l) => s + JSON.parse(l).costMicrosUpper, 0);",
`// resume run (Gemini topped up): the stop line counts SETTLED cost only (a failed call counts at its settled cost, 0), earlier runs included; three consecutive Gemini provider_error first attempts stop the run (exit 4)
const PRIOR = fs.existsSync('results.jsonl') ? fs.readFileSync('results.jsonl', 'utf8').split('\\n').filter(Boolean).reduce((s, l) => s + (JSON.parse(l).costMicros || 0) + PLANNER_EST_MICROS, 0) : 0;
const spentSoFar = () => PRIOR + lines().reduce((s, l) => s + (JSON.parse(l).costMicros || 0) + PLANNER_EST_MICROS, 0);
let consecutiveGeminiFail = 0;`);
rep("    fs.appendFileSync(a.out, JSON.stringify(rec) + '\\n');\n",
`    fs.appendFileSync(a.out, JSON.stringify(rec) + '\\n');
    const first = rec.attempts?.[0]; consecutiveGeminiFail = first?.provider === 'google' && first?.outcome === 'provider_error' ? consecutiveGeminiFail + 1 : 0;
    if (consecutiveGeminiFail >= 3) { console.log('STOP: three consecutive Gemini provider_error first attempts (credits or outage): not burning the plan on the fallback'); process.exit(4); }
`);
rep('running total upper bound US$', 'running SETTLED total (earlier runs included) US$');
fs.writeFileSync('run2.mjs', s);
console.log('run2.mjs written');
