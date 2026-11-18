// false positives on the 12 cards' prose + question: every mention the prototype reads (with context), and how many not-a-number tokens it correctly leaves alone.
import { cardParts } from './load.mjs';
import { mentions } from './parser-prototype.mjs';
let total = 0; const hits = [];
for (const c of cardParts) {
  const text = c.prose + '\n' + c.question;
  for (const m of mentions(text)) { total++; hits.push(`${c.id.slice(0, 14).padEnd(14)} ${m.kind.padEnd(8)} ${m.text.padEnd(8)} | ${text.slice(Math.max(0, m.span[0] - 28), m.span[1] + 22).replace(/\s+/g, ' ')}`); }
}
console.log(hits.join('\n')); console.log('mentions:', total);
const NOT = { 'lone one': /\bone\b/gi, ordinal: /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi, point: /\bpoints?\b/gi, 'half/quarter': /\b(half|halves|quarters?)\b/gi, 'times/once/twice/double': /\b(times|once|twice|double|triple)\b/gi, 'hundreds/thousands': /\b(hundreds|thousands|millions)\b/gi };
const all = cardParts.map(c => c.prose + '\n' + c.question).join('\n');
for (const [k, re] of Object.entries(NOT)) console.log(k.padEnd(26), 'tokens in card text:', (all.match(re) || []).length);
