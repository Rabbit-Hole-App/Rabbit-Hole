// scan a subagent transcript for tool results that look like a refusal/block, and print the tool call before and what came after
import fs from 'node:fs';
const f = process.argv[2];
const recs = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const text = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => x.text ?? (x.content ? text(x.content) : (x.input ? JSON.stringify(x.input) : ''))).join(' ') : '';
const calls = new Map(); const out = [];
recs.forEach((r, i) => {
  const msg = r.message; if (!msg || !Array.isArray(msg.content)) return;
  for (const c of msg.content) {
    if (c.type === 'tool_use') calls.set(c.id, { i, name: c.name, input: JSON.stringify(c.input).slice(0, 400) });
    if (c.type === 'tool_result') {
      const t = text(c.content);
      if (c.is_error || /denied|refus|blocked|not allowed|should return findings|permission|security policy/i.test(t.slice(0, 600))) {
        const call = calls.get(c.tool_use_id);
        out.push({ rec: i, call: call ? `${call.name} ${call.input}` : '?', result: t.slice(0, 500).replace(/\s+/g, ' ') });
      }
    }
  }
});
console.log('records', recs.length, 'flagged results', out.length);
for (const o of out) console.log(`\n[rec ${o.rec}] CALL: ${o.call}\n   RESULT: ${o.result}`);
