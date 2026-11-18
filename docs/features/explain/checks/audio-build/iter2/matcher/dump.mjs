import { rows, cardParts } from './load.mjs';
import { spokenNumbers, dataNumbers, sentencesOf } from '../../../../audio-build-2/packages/control-plane/src/explanation-audio-script.js';
const G = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|point|percent|per cent|half|halves|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?|minus|negative|plus|times|twice|thrice|double|triple|dozen|couple|pair|once|first|second|third|fourth|fifth|oh|naught|nought|zeroth|\d+)\b|%/gi;
const wanted = process.argv[2] ? new Set(process.argv[2].split(',').map(Number)) : null;
for (const r of rows) {
  if (wanted && !wanted.has(r.i)) continue;
  console.log(`\n### row ${r.i} ${r.cardId} ${r.depth} run${r.run} failed=${JSON.stringify(r.check.firstFailed ?? r.check.failed)} removed=${r.removed} raw=${r.check.firstRawWords} strip=${r.check.firstStrippedWords} cardData=${[...r.card.cardData].slice(0,12).join(' ')}`);
  for (const s of sentencesOf(r.script)) if (G.test(s)) { G.lastIndex = 0; console.log(`  [${s.match(G).join('|')}] spoken=${JSON.stringify(spokenNumbers(s))} data=${JSON.stringify(dataNumbers(s))} :: ${s.slice(0,200)}`); }
}
