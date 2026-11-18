// shared loader: 72 rows joined with their first-answer script/transcript and card parts (read-only on everything else).
// results2.jsonl and raw2.jsonl hold two interleaved passes (each card/depth/run key twice, written by concurrent processes), so rows are joined on key + call count + a readable raw answer whose
// script has check.firstRawWords words. check.first* is the first answer of the step that was finally scored: when Gemini's re-ask came back unreadable the chain went on to Fireworks, whose
// first answer is the scored one (so the scored first answer is not always raw[0]).
import fs from 'node:fs';
import { splitCard, cardNumbers, cardDataNumbers, wordCount } from '../../../../audio-build-2/packages/control-plane/src/explanation-audio-script.js';
const I = 'C:/s/sprint2-evidence/audio-build/iter2/';
const cards = JSON.parse(fs.readFileSync('C:/s/sprint2-evidence/aud-2/cards.json', 'utf8'));
const results = fs.readFileSync(I + 'results2.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const parse = s => { try { const p = JSON.parse(s); return typeof p?.script === 'string' ? p : null; } catch { return null; } };
const raws = fs.readFileSync(I + 'raw2.jsonl', 'utf8').trim().split('\n').map(JSON.parse).map(w => ({ ...w, answers: w.raw.map(parse), used: false }));
export const cardParts = cards.map(c => {
  const j = JSON.parse(fs.readFileSync('C:/s/spec/benchmarks/explain-bench/' + c.source + c.id + '.json', 'utf8')), b = j.response.block, question = j.row.prompt, p = splitCard(b.body);
  return { id: c.id, depth: b.depth, title: b.title, question, ...p, allowed: cardNumbers(p.prose, p.visualText, b.title, question), cardData: cardDataNumbers(p.prose, p.visualText, b.title, question) };
});
export const rows = results.map((r, i) => {
  const hit = x => x.answers.findIndex((a, k) => a && wordCount(a.script) === r.check.firstRawWords && (k === 0 || r.providers[k] !== r.providers[k - 1]));
  const w = raws.find(x => !x.used && x.card === r.card && x.depth === r.depth && x.run === r.run && x.raw.length === r.calls && hit(x) >= 0);
  if (!w) throw new Error('unjoined row ' + i); w.used = true;
  const k = hit(w), a = w.answers[k];
  // every readable first answer of a step (first call of each provider group): the scored one plus an earlier Gemini one that was replaced when its re-ask came back unreadable
  const stepFirsts = w.answers.map((x, j) => ({ j, x, provider: r.providers[j] })).filter(({ j, x }) => x && (j === 0 || r.providers[j] !== r.providers[j - 1]));
  return { i, ...r, card: cardParts[r.cardIndex], cardId: r.card, script: a.script, transcript: a.transcript ?? '', scoredIndex: k, stepFirsts };
});
