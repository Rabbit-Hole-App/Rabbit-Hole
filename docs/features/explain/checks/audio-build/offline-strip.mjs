// Offline: the shipped number check run over the AUD-2 trial scripts (real model outputs, no new call). Shows what the owner's rule removes from scripts written by the v1.1 / V6 prompts.
import fs from 'node:fs';
import { splitCard, cardNumbers, stripUnsafe, sentencesOf, wordCount, spokenNumbers } from '../../audio-build/packages/control-plane/src/explanation-audio-script.js';
const B = 'C:/s/spec/benchmarks/explain-bench/';
const SMOKE = B + '2026-11-14T125715-145-smoke-rerun-71415b6b8/raw/smoke-r1/cards/', D116 = B + '2026-11-08T205831-baseline-3x-on-shipped-116-9d645b8f6/raw/';
const picks = { 'precision-recall': [D116 + 'correct-svg-r1-overview/cards/'], 'tcp-handshake': [D116 + 'correct-svg-r1-overview/cards/'], 'roman-empire': [D116 + 'correct-svg-r1-overview/cards/'], 'gradient-descent': [D116 + 'correct-svg-r1-overview/cards/', D116 + 'correct-svg-r1-deep/cards/'],
  'ml-trees-bootstrap-coverage': [SMOKE], 'ref-box-plot-iqr-fences': [SMOKE], 'four-stroke': [SMOKE], 'public-key-encryption': [SMOKE], softmax: [D116 + 'correct-svg-r1-deep/cards/'], bst: [D116 + 'correct-svg-r1-deep/cards/'], 'water-cycle': [D116 + 'correct-svg-r1-deep/cards/'] };
const load = (id, depth) => { const dirs = picks[id]; for (const d of dirs) { const f = d + id + '.json'; if (fs.existsSync(f)) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (id !== 'gradient-descent' || (depth === 'Brief') === d.includes('overview')) return j; } } return null; };
const rows = [];
for (const [file, label] of [['variants-v6.json', 'Gemini V6'], ['variants-v5.json', null]]) {
  const data = JSON.parse(fs.readFileSync('../aud-2/' + file, 'utf8'));
  for (const r of data) {
    const j = load(r.id, r.depthLabel); if (!j || !r.script) continue;
    const parts = splitCard(j.response.block.body), allowed = cardNumbers(parts.prose, parts.visualText, j.response.block.title, j.row.prompt);
    const out = stripUnsafe(r.script, r.script, allowed), total = sentencesOf(r.script).length;
    const bad = sentencesOf(r.script).filter(s => spokenNumbers(s).some(n => !allowed.has(n)));
    rows.push({ variant: `${r.provider} ${r.variant}`, id: r.id, depth: r.depthLabel, sentences: total, removed: out.removed, wordsBefore: wordCount(r.script), wordsAfter: wordCount(out.script), sample: bad[0]?.slice(0, 90) || '' });
  }
}
const groups = {};
for (const r of rows) (groups[r.variant] ||= []).push(r);
for (const [g, list] of Object.entries(groups)) {
  const withRemoval = list.filter(r => r.removed > 0).length, avg = k => (list.reduce((a, r) => a + r[k], 0) / list.length).toFixed(1);
  console.log(`${g}: ${list.length} scripts, ${withRemoval} lose at least one sentence, mean removed ${avg('removed')} of ${avg('sentences')}, words ${avg('wordsBefore')} -> ${avg('wordsAfter')}`);
}
fs.writeFileSync('offline-strip.json', JSON.stringify(rows, null, 1));
for (const r of rows.filter(r => r.variant === 'gemini V6')) console.log(`  ${r.id} ${r.depth}: ${r.removed}/${r.sentences} removed, ${r.wordsBefore} -> ${r.wordsAfter} words${r.sample ? ` | "${r.sample}"` : ''}`);
