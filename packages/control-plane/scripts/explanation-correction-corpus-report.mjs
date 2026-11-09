// Offline report (no model call, no behaviour change): run the 55 rejected/corrected spec pairs of the correction corpus
// (packages/web/src/tutor-diagrams/correction-corpus*.fixtures.mjs, Codex set 4) through the server's own corrections
// (correctDiagrams in learn-primitives.js: correctedFlow, correctedTimeline, correctedMatrix, correctedFields) and group the outcomes by rule.
// The corpus is the spec for extending those corrections; nothing here changes them.
// Usage: node packages/control-plane/scripts/explanation-correction-corpus-report.mjs [--json out.json]
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { correctDiagrams } from '../src/learn-primitives.js';
import { tutorDiagramVisibleText } from '../../web/src/tutor-diagrams/spec.js';
import { correctionCorpus } from '../../web/src/tutor-diagrams/correction-corpus.fixtures.mjs';
import { additionalCorrections } from '../../web/src/tutor-diagrams/correction-corpus-extra.fixtures.mjs';

export function runCorpus(pairs = [...correctionCorpus, ...additionalCorrections]) {
  return pairs.map(({ id, broken, corrected, keeps, fields, message }) => {
    const rule = message.source;
    const { md, corrections } = correctDiagrams(`\`\`\`rh-diagram\n${JSON.stringify(broken)}\n\`\`\``);
    const kinds = Object.keys(corrections), body = md.split('\n').slice(1, -1).join('\n');
    if (!kinds.length) return { id, rule, outcome: 'not corrected', kinds };
    let ours; try { ours = JSON.parse(body); } catch { return { id, rule, outcome: 'not corrected', kinds }; }
    if (isDeepStrictEqual(ours, corrected)) return { id, rule, outcome: 'identical', kinds };
    const visible = tutorDiagramVisibleText(ours).filter(Boolean).join('\n');
    const lost = keeps.filter(text => !visible.includes(text));
    const wrong = fields.filter(([path, expected]) => !isDeepStrictEqual(path.reduce((v, k) => v?.[k], ours.diagram), expected));
    return { id, rule, outcome: lost.length || wrong.length ? 'loses information' : 'different, keeps the same information', kinds, lost, wrongFields: wrong.map(([p]) => p.join('.')) };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = runCorpus(), counts = {};
  for (const r of rows) counts[r.outcome] = (counts[r.outcome] || 0) + 1;
  console.log(rows.length, 'pairs', JSON.stringify(counts));
  for (const r of rows) console.log(`${r.outcome.padEnd(40)} ${r.id.padEnd(44)} /${r.rule}/  [${r.kinds.join(', ')}]${r.lost?.length ? ` lost=${JSON.stringify(r.lost)}` : ''}${r.wrongFields?.length ? ` wrong=${r.wrongFields}` : ''}`);
  const i = process.argv.indexOf('--json'); if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(rows, null, 1));
}
