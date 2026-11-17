import fs from 'node:fs';
const s = JSON.parse(fs.readFileSync('scripts.json','utf8'));
let md = '# Scripts (one call per card, no retry)\n\nProvider: ' + s[0].provider + ', requested model ' + s[0].requestedModel + '\n\n';
for (const r of s) {
  md += `## ${r.n}. ${r.title} (${r.id})\n- Question: ${r.question}\n- Depth: ${r.depthLabel} (source depth field: ${r.depth})\n- Model that answered: ${r.answeredModel} via ${r.provider}\n- Words: ${r.words}; speaking time ${(r.words/170*60).toFixed(0)} s at 170 wpm, ${(r.words/185*60).toFixed(0)} s at 185 wpm\n- Tokens: ${r.usage ? `prompt ${r.usage.prompt_tokens}, completion ${r.usage.completion_tokens} (total ${r.usage.total_tokens})` : 'n/a'}; USD ${r.usd}; finish ${r.finish}; ${r.ms} ms\n\n${r.script ?? 'ERROR: ' + r.error}\n\n`;
}
fs.writeFileSync('scripts.md', md);
